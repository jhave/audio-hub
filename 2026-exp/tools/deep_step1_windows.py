import os
import json
import subprocess
import tempfile
import torch
import numpy as np
import soundfile as sf
from transformers import ClapProcessor, ClapModel

# Paths
ROOT_DIR = "/Users/jhave/VIBE_Coding/audio-hub/2026-exp"
DATA_DIR = os.path.join(ROOT_DIR, "public/data/v2")
WORK_DIR = os.path.join(ROOT_DIR, ".audio-work")
TRACKS_JSON = os.path.join(ROOT_DIR, "public/data/ALL_tracks.json")
PROGRESS_JSON = os.path.join(WORK_DIR, "progress_step1.json")
BIN_PATH = os.path.join(DATA_DIR, "windows.bin")
INDEX_PATH = os.path.join(DATA_DIR, "windows-index.json")

os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(WORK_DIR, exist_ok=True)

# Device configuration
device = "cpu"
print(f"Using device: {device}")

# Load CLAP Model
print("Loading CLAP model...")
processor = ClapProcessor.from_pretrained("laion/larger_clap_music")
model = ClapModel.from_pretrained("laion/larger_clap_music")
model.to(device)
model.eval()

# Load track metadata
with open(TRACKS_JSON, "r") as f:
    tracks = json.load(f)
print(f"Loaded {len(tracks)} tracks from metadata.")

# Load progress if exists
start_idx = 0
total_windows = 0
index_tracks = []
failures = []

if os.path.exists(PROGRESS_JSON):
    try:
        with open(PROGRESS_JSON, "r") as f:
            progress = json.load(f)
        start_idx = progress["last_index"] + 1
        total_windows = progress["total_windows"]
        index_tracks = progress["index_tracks"]
        failures = progress.get("failures", [])
        print(f"Resuming from track index {start_idx} (already processed {total_windows} windows).")
        
        # Truncate windows.bin to match total_windows
        if os.path.exists(BIN_PATH):
            expected_size = total_windows * 512 * 2
            actual_size = os.path.getsize(BIN_PATH)
            if actual_size > expected_size:
                print(f"Truncating windows.bin from {actual_size} to {expected_size} bytes.")
                with open(BIN_PATH, "r+b") as fbin:
                    fbin.truncate(expected_size)
                    fbin.flush()
                    os.fsync(fbin.fileno())
    except Exception as e:
        print(f"Failed to load progress.json ({e}). Starting from scratch.")
        start_idx = 0
        total_windows = 0
        index_tracks = []
        failures = []

# Open windows.bin
mode = "ab" if start_idx > 0 else "wb"
fbin = open(BIN_PATH, mode)

try:
    for idx in range(start_idx, len(tracks)):
        track = tracks[idx]
        track_id = track["trackId"]
        rel_file = track["file"]
        abs_file = os.path.abspath(os.path.join(ROOT_DIR, "..", rel_file))
        
        print(f"[{idx+1}/{len(tracks)}] Processing {track_id}...")
        
        # Check if file exists
        if not os.path.exists(abs_file):
            print(f"File not found: {abs_file}")
            failures.append({"trackId": track_id, "error": "file_not_found"})
            index_tracks.append({"trackId": track_id, "offset": total_windows, "count": 0})
            continue
            
        # Convert to temp WAV (48 kHz mono) using ffmpeg
        temp_wav = os.path.join(WORK_DIR, f"temp_{idx}.wav")
        cmd = [
            "ffmpeg", "-y", "-i", abs_file,
            "-ac", "1", "-ar", "48000",
            "-f", "wav", temp_wav
        ]
        
        try:
            # Suppress output to clean up logs
            subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
        except Exception as e:
            print(f"FFmpeg failed for {track_id}: {e}")
            failures.append({"trackId": track_id, "error": f"ffmpeg_failed: {str(e)}"})
            index_tracks.append({"trackId": track_id, "offset": total_windows, "count": 0})
            if os.path.exists(temp_wav):
                os.remove(temp_wav)
            continue
            
        # Read the WAV file
        try:
            data, sr = sf.read(temp_wav)
        except Exception as e:
            print(f"Failed to read temp wav for {track_id}: {e}")
            failures.append({"trackId": track_id, "error": f"read_wav_failed: {str(e)}"})
            index_tracks.append({"trackId": track_id, "offset": total_windows, "count": 0})
            if os.path.exists(temp_wav):
                os.remove(temp_wav)
            continue
        finally:
            if os.path.exists(temp_wav):
                os.remove(temp_wav)
                
        # Split into 10s windows with 10s hop (480,000 samples)
        WIN = 10 * 48000
        chunks = [data[i : i + WIN] for i in range(0, len(data), WIN)]
        
        # Filter chunks: drop shorter than 3s, pad shorter than 10s
        valid_chunks = []
        for chunk in chunks:
            if len(chunk) >= 3 * 48000:
                if len(chunk) < WIN:
                    chunk = np.pad(chunk, (0, WIN - len(chunk)), "constant")
                valid_chunks.append(chunk)
                
        count = len(valid_chunks)
        print(f"  Extracted {count} valid windows.")
        
        if count > 0:
            # Infer embeddings
            try:
                # Process in batches of 16 to be safe with RAM/CPU load
                batch_size = 16
                track_embeds = []
                for b_start in range(0, count, batch_size):
                    b_chunks = valid_chunks[b_start : b_start + batch_size]
                    inputs = processor(audio=b_chunks, return_tensors="pt", sampling_rate=48000)
                    inputs = {k: v.to(device) for k, v in inputs.items()}
                    with torch.no_grad():
                        outputs = model.get_audio_features(**inputs)
                        embeds = outputs.pooler_output.cpu().numpy()
                        # Explicit L2 normalization
                        norms = np.linalg.norm(embeds, axis=1, keepdims=True)
                        embeds = embeds / (norms + 1e-9)
                        track_embeds.append(embeds)
                
                track_embeds = np.vstack(track_embeds)
                # Write to binary as float16 little-endian
                fbin.write(track_embeds.astype(np.float16).tobytes())
                
                index_tracks.append({"trackId": track_id, "offset": total_windows, "count": count})
                total_windows += count
            except Exception as e:
                print(f"CLAP inference failed for {track_id}: {e}")
                failures.append({"trackId": track_id, "error": f"inference_failed: {str(e)}"})
                index_tracks.append({"trackId": track_id, "offset": total_windows, "count": 0})
        else:
            index_tracks.append({"trackId": track_id, "offset": total_windows, "count": 0})
            
        # Checkpoint and save progress every 25 tracks
        if (idx + 1) % 25 == 0 or (idx + 1) == len(tracks):
            print(f"Checkpointing at index {idx}...")
            fbin.flush()
            os.fsync(fbin.fileno())
            
            # Save progress JSON
            progress_payload = {
                "last_index": idx,
                "total_windows": total_windows,
                "index_tracks": index_tracks,
                "failures": failures
            }
            tmp_progress = PROGRESS_JSON + ".tmp"
            with open(tmp_progress, "w") as f_prog:
                json.dump(progress_payload, f_prog, indent=2)
            os.replace(tmp_progress, PROGRESS_JSON)
            
            # Save index JSON
            index_payload = {
                "dim": 512,
                "dtype": "float16",
                "tracks": index_tracks
            }
            tmp_index = INDEX_PATH + ".tmp"
            with open(tmp_index, "w") as f_idx:
                json.dump(index_payload, f_idx, indent=2)
            os.replace(tmp_index, INDEX_PATH)

finally:
    fbin.close()

# Final save
index_payload = {
    "dim": 512,
    "dtype": "float16",
    "tracks": index_tracks
}
with open(INDEX_PATH, "w") as f_idx:
    json.dump(index_payload, f_idx, indent=2)

print("Step 1 Complete!")
print(f"Total windows processed: {total_windows}")
print(f"Total failures: {len(failures)}")
if failures:
    print("Failures:")
    for f in failures:
        print(f"  {f['trackId']}: {f['error']}")
