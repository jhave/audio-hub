# Compatibility hotfixes for Python 3.10+ and NumPy 2.0+
import collections
import collections.abc
collections.MutableSequence = collections.abc.MutableSequence

import numpy as np
np.float = float
np.int = int
np.complex = complex

import os
import sys
import json
import time
import shutil
import subprocess
import torch
import torchaudio
import librosa
import torchcrepe
import madmom

# CONFIGURATION
HERE = os.path.dirname(os.path.abspath(__file__))
WORKSPACE_ROOT = os.path.dirname(HERE)
AUDIO_DIR = os.path.join(WORKSPACE_ROOT, "public/audio") # Or correct audio directory path
TRACKS_JSON = os.path.join(WORKSPACE_ROOT, "public/data/ALL_tracks.json")
OUTPUT_JSON = os.path.join(WORKSPACE_ROOT, "public/data/v3/descriptors_stems.json")
TEMP_STEMS_DIR = os.path.join(WORKSPACE_ROOT, ".audio-work/temp_stems")

DEVICE = "mps" if torch.backends.mps.is_available() else "cpu"
BATCH_SIZE = 20

os.makedirs(TEMP_STEMS_DIR, exist_ok=True)
os.makedirs(os.path.dirname(OUTPUT_JSON), exist_ok=True)

print(f"Using device: {DEVICE}")
print(f"Batch size: {BATCH_SIZE}")

# Helper to find track mp3 path
def get_track_audio_path(track):
    if "file" in track:
        return os.path.abspath(os.path.join(WORKSPACE_ROOT, "..", track["file"]))
    return None

def analyze_vocal_stem(vocal_path):
    try:
        # Load native and resample using pure numpy to bypass all soxr memory bugs
        y, sr = librosa.load(vocal_path, sr=None)
        duration = len(y) / sr
        if duration < 5:
            return 0.0, 0.0, 0.0 # too short
            
        num_samples_16k = int(len(y) * 16000 / sr)
        y_16k = np.interp(
            np.linspace(0, len(y) - 1, num_samples_16k),
            np.arange(len(y)),
            y
        ).astype(np.float32)
        
        audio_16k = torch.from_numpy(y_16k).unsqueeze(0)
        
        # Calculate vocal density using RMS threshold
        frame_length = int(0.02 * 16000) # 20ms frames
        hop_length = int(0.01 * 16000) # 10ms frames
        rms_frames = []
        for i in range(0, audio_16k.shape[1] - frame_length, hop_length):
            frame = audio_16k[0, i:i+frame_length]
            rms_frames.append(torch.sqrt(torch.mean(frame**2)).item())
            
        rms_arr = np.array(rms_frames)
        vocal_threshold = 0.015
        vocal_density = float(np.mean(rms_arr > vocal_threshold))
        
        # Run Crepe on MPS for pitch SD and vibrato
        # Predict every 10ms (hop 160 samples at 16kHz)
        f0, pd = torchcrepe.predict(
            audio_16k.to(DEVICE),
            16000,
            hop_length=160,
            fmin=50,
            fmax=600,
            device=DEVICE,
            decoder=torchcrepe.decode.viterbi,
            batch_size=1024
        )
        f0 = f0.cpu().numpy()
        pd = pd.cpu().numpy()
        
        # Filter voiced frames using confidence threshold
        voiced = f0[pd > 0.5]
        if len(voiced) < 10:
            return vocal_density, 0.0, 0.0
            
        voiced_cents = 1200 * np.log2(voiced / 10.0)
        vocal_range_sd = float(np.std(voiced_cents))
        
        # Simple Vibrato rate estimate via FFT on voiced pitch variations
        detrended_f0 = voiced - np.mean(voiced)
        if len(detrended_f0) > 64:
            fft_vals = np.abs(np.fft.rfft(detrended_f0))
            freqs = np.fft.rfftfreq(len(detrended_f0), d=0.01)
            # Focus on vibrato range: 4Hz to 8Hz
            vibrato_mask = (freqs >= 4.0) & (freqs <= 8.0)
            if np.any(vibrato_mask):
                vibrato_index = float(np.max(fft_vals[vibrato_mask]))
            else:
                vibrato_index = 0.0
        else:
            vibrato_index = 0.0
            
        return vocal_density, vocal_range_sd, vibrato_index
    except Exception as e:
        print(f"Error in vocal analysis: {e}")
        return 0.0, 0.0, 0.0

def analyze_drum_stem(drum_path):
    try:
        # Load drum stem for madmom beat tracking
        proc = madmom.features.beats.RNNBeatProcessor()
        act = proc(drum_path)
        dbn = madmom.features.beats.DBNBeatTrackingProcessor(fps=100)
        beats = dbn(act)
        
        if len(beats) < 4:
            return 100.0, 0.0 # default
            
        # Estimate Tempo (BPM)
        intervals = np.diff(beats)
        median_interval = np.median(intervals)
        estimated_tempo = float(60.0 / median_interval)
        
        # Calculate Micro-timing Syncopation Index (Groove / Swing)
        # Standard deviation of onset timing deviations from a steady grid
        expected_intervals = np.round(intervals / median_interval) * median_interval
        expected_intervals = np.maximum(expected_intervals, 0.1) # safety
        offsets = intervals - expected_intervals
        swing_index = float(np.std(offsets))
        
        return estimated_tempo, swing_index
    except Exception as e:
        print(f"Error in drum analysis: {e}")
        return 100.0, 0.0

def process_track(track):
    audio_path = get_track_audio_path(track)
    if not audio_path:
        print(f"Warning: Audio file missing for {track['trackId']}")
        return None
        
    track_id = track["trackId"]
    file_base, _ = os.path.splitext(os.path.basename(audio_path))
    track_dir = os.path.join(TEMP_STEMS_DIR, "htdemucs", file_base)
    
    # 1. Run Demucs
    cmd = [
        sys.executable, "-m", "demucs",
        "--device", DEVICE,
        "--mp3",
        "--mp3-bitrate", "320",
        "-o", TEMP_STEMS_DIR,
        audio_path
    ]
    
    # Run and capture errors
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        print(f"  Demucs separation failed for {track_id} (code {res.returncode}):")
        print(f"  Stderr: {res.stderr}")
        print(f"  Stdout: {res.stdout}")
    
    vocals_path = os.path.join(track_dir, "vocals.mp3")
    drums_path = os.path.join(track_dir, "drums.mp3")
    bass_path = os.path.join(track_dir, "bass.mp3")
    other_path = os.path.join(track_dir, "other.mp3")
    
    if not os.path.exists(vocals_path) or not os.path.exists(drums_path):
        print(f"Error: Demucs output stems missing for {track_id}")
        # Clean folder anyway
        if os.path.exists(track_dir):
            shutil.rmtree(track_dir)
        return None
        
    # 2. Extract features
    vocal_density, vocal_range_sd, vibrato_index = analyze_vocal_stem(vocals_path)
    tempo, swing_index = analyze_drum_stem(drums_path)
    
    # 3. Clean up track stems immediately
    shutil.rmtree(track_dir)
    
    return {
        "trackId": track_id,
        "tempo_rnn": round(tempo, 2),
        "swing_index": round(swing_index, 4),
        "vocal_density": round(vocal_density, 3),
        "vocal_range_sd": round(vocal_range_sd, 2),
        "vibrato_index": round(vibrato_index, 3)
    }

def main():
    if not os.path.exists(TRACKS_JSON):
        print(f"Error: {TRACKS_JSON} not found!")
        return
        
    with open(TRACKS_JSON, "r") as f:
        tracks = json.load(f)
        
    print(f"Loaded {len(tracks)} canonical tracks.")
    
    results = {}
    if os.path.exists(OUTPUT_JSON):
        try:
            with open(OUTPUT_JSON, "r") as f:
                results = json.load(f)
            print(f"Loaded {len(results)} existing track results from cache.")
        except Exception as e:
            print(f"Warning: Could not parse output json cache: {e}")
            
    # Process in batches of 20
    pending = [t for t in tracks if t["trackId"] not in results]
    print(f"Pending tracks to process: {len(pending)}")
    
    for i in range(0, len(pending), BATCH_SIZE):
        batch = pending[i : i + BATCH_SIZE]
        print(f"\nProcessing batch {i // BATCH_SIZE + 1} ({len(batch)} tracks)...")
        
        batch_results = []
        for track in batch:
            print(f"  Separating & Analyzing: {track.get('trackTitle', track['trackId'])}...")
            res = process_track(track)
            if res:
                results[res["trackId"]] = res
                batch_results.append(res)
                
        # Save cache at the end of each batch
        with open(OUTPUT_JSON, "w") as f:
            json.dump(results, f, indent=2)
        print(f"Batch saved. Cache updated to {len(results)} tracks.")
        
    print("\nPhase C Stems Feature Extraction completed successfully!")

if __name__ == "__main__":
    main()
