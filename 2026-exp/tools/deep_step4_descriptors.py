import os
import json
import librosa
import numpy as np

# Paths
ROOT_DIR = "/Users/jhave/VIBE_Coding/audio-hub/2026-exp"
DATA_DIR = os.path.join(ROOT_DIR, "public/data/v2")
TRACKS_JSON = os.path.join(ROOT_DIR, "public/data/ALL_tracks.json")
INDEX_PATH = os.path.join(DATA_DIR, "windows-index.json")
DESCRIPTORS_JSON = os.path.join(DATA_DIR, "descriptors.json")
CURVES_BIN = os.path.join(DATA_DIR, "curves.bin")

def estimate_key_from_chroma_mean(chroma_mean):
    # K-S profiles
    major_profile = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
    minor_profile = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])
    
    pitch_classes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
    
    # Normalize chroma_mean
    chroma_mean_std = np.std(chroma_mean)
    if chroma_mean_std > 1e-9:
        chroma_mean = (chroma_mean - np.mean(chroma_mean)) / chroma_mean_std
    else:
        chroma_mean = chroma_mean - np.mean(chroma_mean)
        
    best_key = "C major"
    best_corr = 0.0
    
    for i in range(12):
        maj_shifted = np.roll(major_profile, i)
        min_shifted = np.roll(minor_profile, i)
        
        maj_shifted_std = np.std(maj_shifted)
        min_shifted_std = np.std(min_shifted)
        
        maj_shifted = (maj_shifted - np.mean(maj_shifted)) / (maj_shifted_std + 1e-9)
        min_shifted = (min_shifted - np.mean(min_shifted)) / (min_shifted_std + 1e-9)
        
        corr_maj = np.corrcoef(chroma_mean, maj_shifted)[0, 1]
        corr_min = np.corrcoef(chroma_mean, min_shifted)[0, 1]
        
        if corr_maj > best_corr:
            best_corr = corr_maj
            best_key = f'{pitch_classes[i]} major'
            
        if corr_min > best_corr:
            best_corr = corr_min
            best_key = f'{pitch_classes[i]} minor'
            
    return best_key, float(best_corr)


def main():
    if not os.path.exists(TRACKS_JSON) or not os.path.exists(INDEX_PATH):
        print("Error: Required input files (ALL_tracks.json, windows-index.json) are missing.")
        return
        
    with open(TRACKS_JSON, "r") as f:
        tracks = json.load(f)
        
    with open(INDEX_PATH, "r") as f:
        index_data = json.load(f)
        
    track_counts = {t["trackId"]: t["count"] for t in index_data["tracks"]}
    
    descriptors_output = []
    tempo_block_data = []
    rms_block_data = []
    
    total_tracks = len(tracks)
    
    for idx, track in enumerate(tracks):
        track_id = track["trackId"]
        rel_file = track["file"]
        abs_file = os.path.abspath(os.path.join(ROOT_DIR, "..", rel_file))
        
        count = track_counts.get(track_id, 0)
        print(f"[{idx+1}/{total_tracks}] Processing descriptors for {track_id} (count={count})...")
        
        # Fallback values
        desc = {
            "trackId": track_id,
            "tempo": 120.0,
            "tempoDrift": 0.0,
            "tempoJumps": 0,
            "key": "C major",
            "keyStrength": 0.0,
            "keySegments": [],
            "modulations": 0,
            "onsetRate": 0.0,
            "rms": 0.0,
            "rmsStd": 0.0,
            "rmsMax": 0.0,
            "centroid": 0.0,
            "flatness": 0.0,
            "sections": [],
            "sectionCount": 1,
            "introLen": 0.0,
            "dropAt": None,
            "bounce": 0.0,
            "melodicComplexity": 0.0
        }
        
        track_tempo_curve = []
        track_rms_curve = []
        
        if count == 0 or not os.path.exists(abs_file):
            print(f"  Skipping descriptors (no windows or file missing)")
            descriptors_output.append(desc)
            # Append empty placeholders to curves if count > 0 (should not happen if count == 0)
            continue
            
        try:
            # Load full track at 22050 Hz
            y, sr = librosa.load(abs_file, sr=22050, mono=True)
            duration = len(y) / sr
            
            # 1. Global Tempo & Tempo Curve
            tempo_array, beats = librosa.beat.beat_track(y=y, sr=sr)
            global_tempo = float(tempo_array.item())
            desc["tempo"] = round(global_tempo, 3)
            
            # Local tempo curve via librosa.feature.tempo
            tc = librosa.feature.tempo(y=y, sr=sr, aggregate=None)
            hop_len = 512
            # Downsample to 1 value per 10s (align with windows count)
            tempo_curve_vals = []
            for i in range(count):
                start_frame = int(i * 10 * sr / hop_len)
                end_frame = int((i+1) * 10 * sr / hop_len)
                segment = tc[start_frame:end_frame]
                if len(segment) > 0:
                    tempo_curve_vals.append(float(np.mean(segment)))
                else:
                    tempo_curve_vals.append(global_tempo)
            
            desc["tempoDrift"] = round(float(np.std(tempo_curve_vals)), 3) if len(tempo_curve_vals) > 0 else 0.0
            
            # Calculate jumps
            jumps = 0
            for i in range(len(tempo_curve_vals) - 1):
                if abs(tempo_curve_vals[i+1] - tempo_curve_vals[i]) > 10.0:
                    jumps += 1
            desc["tempoJumps"] = jumps
            
            # Precompute chroma once for key estimation, segments, and SSM structure
            try:
                track_chroma = librosa.feature.chroma_cqt(y=y, sr=sr, hop_length=512)
            except Exception:
                try:
                    track_chroma = librosa.feature.chroma_stft(y=y, sr=sr, hop_length=512)
                except Exception:
                    track_chroma = np.ones((12, max(1, len(y)//512))) / 12.0

            # 2. Key, Key Segments, Modulations
            global_chroma_mean = np.mean(track_chroma, axis=1)
            global_key, global_key_strength = estimate_key_from_chroma_mean(global_chroma_mean)
            desc["key"] = global_key
            desc["keyStrength"] = round(global_key_strength, 3)
            
            num_frames = track_chroma.shape[1]
            frames_per_sec = sr / 512.0
            frames_per_30s = int(30.0 * frames_per_sec)
            num_segments = int(np.ceil(num_frames / frames_per_30s))
            key_segments = []
            for s_idx in range(num_segments):
                start_frame = s_idx * frames_per_30s
                end_frame = min(num_frames, (s_idx + 1) * frames_per_30s)
                if end_frame - start_frame >= int(3.0 * frames_per_sec):
                    seg_chroma = track_chroma[:, start_frame:end_frame]
                    seg_chroma_mean = np.mean(seg_chroma, axis=1)
                    k_seg, _ = estimate_key_from_chroma_mean(seg_chroma_mean)
                    key_segments.append(k_seg)
                else:
                    if len(key_segments) > 0:
                        key_segments.append(key_segments[-1])
                    else:
                        key_segments.append(global_key)
            desc["keySegments"] = key_segments
            
            modulations = 0
            for s_idx in range(len(key_segments) - 1):
                if key_segments[s_idx+1] != key_segments[s_idx]:
                    modulations += 1
            desc["modulations"] = modulations
            
            # 3. Onset Rate, RMS, Centroid, Flatness
            try:
                onsets = librosa.onset.onset_detect(y=y, sr=sr)
                onset_rate = len(onsets) / duration
            except Exception:
                onsets = np.array([])
                onset_rate = 0.0
            desc["onsetRate"] = round(onset_rate, 3)
            
            rms_frames = librosa.feature.rms(y=y)[0]
            desc["rms"] = round(float(np.mean(rms_frames)), 3)
            desc["rmsStd"] = round(float(np.std(rms_frames)), 3)
            
            rms_max = float(np.max(rms_frames)) if len(rms_frames) > 0 else 0.0
            desc["rmsMax"] = round(rms_max, 3)
            
            centroid_frames = librosa.feature.spectral_centroid(y=y, sr=sr)[0]
            desc["centroid"] = round(float(np.mean(centroid_frames)), 3)
            
            flatness_frames = librosa.feature.spectral_flatness(y=y)[0]
            desc["flatness"] = round(float(np.mean(flatness_frames)), 3)
            
            # 4. Structure: novelty curve, sections
            sections = []
            if len(beats) > 10:
                try:
                    mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=13)
                    chroma = track_chroma
                    features = np.vstack([mfcc, chroma])
                    sync_features = librosa.util.sync(features, beats)
                    norm_features = sync_features / (np.linalg.norm(sync_features, axis=0, keepdims=True) + 1e-9)
                    ssm = np.dot(norm_features.T, norm_features)
                    
                    k = 4
                    kernel = np.ones((2*k, 2*k))
                    kernel[:k, k:] = -1
                    kernel[k:, :k] = -1
                    
                    novelty = np.zeros(len(beats))
                    for t in range(k, len(beats) - k):
                        patch = ssm[t-k:t+k, t-k:t+k]
                        novelty[t] = np.sum(patch * kernel)
                        
                    peaks = []
                    thresh = np.mean(novelty) + 1.0 * np.std(novelty)
                    for t in range(k + 1, len(beats) - k - 1):
                        if novelty[t] > thresh and novelty[t] > novelty[t-1] and novelty[t] > novelty[t+1]:
                            if len(peaks) == 0 or t - peaks[-1] > 8:
                                peaks.append(t)
                    sections_beats = librosa.frames_to_time(beats[peaks], sr=sr)
                    sections = [round(float(x), 3) for x in sections_beats]
                except Exception as e:
                    print(f"  SSM structure analysis failed: {e}")
            
            desc["sections"] = sections
            desc["sectionCount"] = len(sections) + 1
            
            # IntroLen (time until first boundary OR first sustained beat-dense region)
            first_boundary = sections[0] if len(sections) > 0 else duration
            # Sustained beats = >= 4 consecutive seconds with onset rate > 0.5 * median onset rate
            # Calculate local rates in 4s windows with 0.5s hop
            hops = np.arange(0, max(0.5, duration - 4.0), 0.5)
            local_rates = []
            for t in hops:
                c_onsets = np.sum((librosa.frames_to_time(onsets, sr=sr) >= t) & 
                                  (librosa.frames_to_time(onsets, sr=sr) < t + 4.0))
                local_rates.append(c_onsets / 4.0)
                
            if len(local_rates) > 0:
                median_rate = np.median(local_rates)
                threshold = 0.5 * median_rate
                
                first_sustained_time = None
                for s_idx, rate in enumerate(local_rates):
                    if rate > threshold:
                        first_sustained_time = hops[s_idx]
                        break
                if first_sustained_time is not None:
                    desc["introLen"] = round(float(min(first_boundary, first_sustained_time)), 3)
                else:
                    desc["introLen"] = round(float(first_boundary), 3)
            else:
                desc["introLen"] = round(float(first_boundary), 3)
                
            # DropAt (adjacent 5s frames positive jump > 1.5 * rms std)
            frame_len_5s = 5 * sr
            num_5s_frames = len(y) // frame_len_5s
            rms_5s = []
            for j in range(num_5s_frames):
                chunk = y[j * frame_len_5s : (j + 1) * frame_len_5s]
                rms_5s.append(np.sqrt(np.mean(chunk**2)))
            rms_5s = np.array(rms_5s)
            jumps = rms_5s[1:] - rms_5s[:-1]
            
            drop_at = None
            if len(jumps) > 0:
                max_jump_idx = np.argmax(jumps)
                max_jump = jumps[max_jump_idx]
                if max_jump > 1.5 * desc["rmsStd"]:
                    drop_at = float(round((max_jump_idx + 1) * 5.0, 3))
            desc["dropAt"] = drop_at
            
            # 5. Bounce
            stft = np.abs(librosa.stft(y, hop_length=512))
            freqs = librosa.fft_frequencies(sr=sr)
            low_band_bins = freqs < 150
            low_band_env = np.sum(stft[low_band_bins, :], axis=0)
            low_band_env = low_band_env - np.mean(low_band_env)
            
            beat_period_sec = 60.0 / global_tempo
            beat_period_frames = int(round(beat_period_sec * sr / 512))
            
            ac = librosa.autocorrelate(low_band_env)
            ac_norm = ac / ac[0] if ac[0] > 1e-9 else ac
            
            min_lag = int(0.8 * beat_period_frames)
            max_lag = int(1.2 * beat_period_frames)
            min_lag = max(0, min(min_lag, len(ac_norm) - 1))
            max_lag = max(0, min(max_lag, len(ac_norm)))
            
            if min_lag < max_lag:
                desc["bounce"] = round(float(np.max(ac_norm[min_lag:max_lag])), 3)
            else:
                desc["bounce"] = 0.0
                
            # 6. Melodic Complexity
            dominant_pitch = np.argmax(chroma, axis=0) if 'chroma' in locals() else np.zeros(len(y)//512, dtype=int)
            T = np.zeros((12, 12))
            for t in range(len(dominant_pitch) - 1):
                state_from = dominant_pitch[t]
                state_to = dominant_pitch[t+1]
                T[state_from, state_to] += 1
                
            entropies = []
            for i in range(12):
                row_sum = np.sum(T[i, :])
                if row_sum > 0:
                    p = T[i, :] / row_sum
                    p = p[p > 0]
                    ent = -np.sum(p * np.log2(p))
                    entropies.append(ent)
                else:
                    entropies.append(np.log2(12))
            desc["melodicComplexity"] = round(float(np.mean(entropies) / np.log2(12)), 3)
            
            # 7. Extract window-level curves data
            # Compute RMS for each 10s window (at 22050 Hz)
            win_len_22k = 10 * sr
            rms_windows = []
            for i in range(count):
                chunk_22k = y[i * win_len_22k : (i+1) * win_len_22k]
                if len(chunk_22k) > 0:
                    rms_windows.append(np.sqrt(np.mean(chunk_22k**2)))
                else:
                    rms_windows.append(0.0)
            
            # Normalize RMS windows by track max
            rms_track_max = max(rms_windows) if len(rms_windows) > 0 else 0.0
            
            for i in range(count):
                # tempoCurve: uint8, round(BPM) clipped to [0, 255]
                t_val = int(np.clip(np.round(tempo_curve_vals[i]), 0, 255))
                track_tempo_curve.append(t_val)
                
                # rmsCurve: int8, round(rms_window / rms_track_max * 127) clipped to [0, 127]
                if rms_track_max > 1e-9:
                    r_val = int(np.clip(np.round(rms_windows[i] / rms_track_max * 127), 0, 127))
                else:
                    r_val = 0
                track_rms_curve.append(r_val)
                
            print(f"  Successfully extracted descriptors. Tempo={desc['tempo']}, Key={desc['key']}, Modulations={desc['modulations']}")
        except Exception as e:
            print(f"  Failed to compute descriptors for {track_id}: {e}")
            # Pad curves with zeros to maintain alignment
            track_tempo_curve = [0] * count
            track_rms_curve = [0] * count
            
        descriptors_output.append(desc)
        tempo_block_data.extend(track_tempo_curve)
        rms_block_data.extend(track_rms_curve)
        
    # Save descriptors.json
    with open(DESCRIPTORS_JSON, "w") as f:
        json.load(open(TRACKS_JSON)) # sanity test
        json.dump(descriptors_output, f, indent=2)
    print(f"Saved descriptors to {DESCRIPTORS_JSON}")
    
    # Save curves.bin
    print(f"Writing curves.bin to {CURVES_BIN}...")
    with open(CURVES_BIN, "wb") as f:
        f.write(np.array(tempo_block_data, dtype=np.uint8).tobytes())
        f.write(np.array(rms_block_data, dtype=np.int8).tobytes())
        
    # Update windows-index.json with block map
    total_windows = len(tempo_block_data)
    index_data["curves"] = {
        "tempo": { "offsetBytes": 0, "bytesPerWindow": 1, "dtype": "uint8" },
        "rms":   { "offsetBytes": total_windows, "bytesPerWindow": 1, "dtype": "int8" }
    }
    with open(INDEX_PATH, "w") as f:
        json.dump(index_data, f, indent=2)
    print(f"Updated {INDEX_PATH} with curves layout info.")
    print("Step 4 Complete!")

if __name__ == "__main__":
    main()
