import os
import json
import numpy as np
from sklearn.decomposition import PCA

# Paths
ROOT_DIR = "/Users/jhave/VIBE_Coding/audio-hub/2026-exp"
DATA_DIR = os.path.join(ROOT_DIR, "public/data/v2")
WINDOWS_BIN = os.path.join(DATA_DIR, "windows.bin")
INDEX_PATH = os.path.join(DATA_DIR, "windows-index.json")
SHAPES_JSON = os.path.join(DATA_DIR, "shapes.json")

def main():
    if not os.path.exists(WINDOWS_BIN) or not os.path.exists(INDEX_PATH):
        print("Error: Step 1 output files (windows.bin, windows-index.json) are missing.")
        return
        
    # Load index
    with open(INDEX_PATH, "r") as f:
        index_data = json.load(f)
    tracks_index = index_data.get("tracks", [])
    
    # Read windows.bin as float16, convert to float32
    print(f"Reading windows from {WINDOWS_BIN}...")
    windows = np.fromfile(WINDOWS_BIN, dtype=np.float16).reshape(-1, 512).astype(np.float32)
    total_windows = len(windows)
    print(f"Loaded {total_windows} windows.")
    
    # 1. Mean-center all windows globally
    print("Globally mean-centering and re-normalizing windows...")
    grand_mean = np.mean(windows, axis=0) # shape (512,)
    centered = windows - grand_mean
    norms = np.linalg.norm(centered, axis=1, keepdims=True)
    renormalized = centered / (norms + 1e-9)
    
    # 2. Fit PCA (n_components=3) on the renormalized windows
    print("Fitting PCA on renormalized windows...")
    pca = PCA(n_components=3)
    projected = pca.fit_transform(renormalized) # shape (total_windows, 3)
    
    # Compute resampled trajectories for all tracks
    trajectories = [] # List of shape (16, 3) per track
    journey_lengths = []
    spreads = []
    novelties = []
    
    for idx, track in enumerate(tracks_index):
        track_id = track["trackId"]
        offset = track["offset"]
        count = track["count"]
        
        track_windows = renormalized[offset : offset + count]
        track_projected = projected[offset : offset + count]
        
        # Journey length
        if count > 1:
            diffs = track_windows[1:] - track_windows[:-1]
            journey = float(np.sum(np.linalg.norm(diffs, axis=1)))
        else:
            journey = 0.0
            
        # Spread
        if count > 0:
            centroid = np.mean(track_windows, axis=0)
            dists_from_centroid = np.linalg.norm(track_windows - centroid, axis=1)
            spread = float(np.mean(dists_from_centroid))
        else:
            spread = 0.0
            
        # Novelty count (scene changes)
        novelty = 0
        if count - 1 >= 3:
            diffs = track_windows[1:] - track_windows[:-1]
            step_dists = np.linalg.norm(diffs, axis=1)
            mu = np.mean(step_dists)
            sigma = np.std(step_dists)
            threshold = mu + 2.0 * sigma
            
            for i in range(len(step_dists)):
                if step_dists[i] > threshold:
                    # Check if local maximum
                    left_ok = (i == 0 or step_dists[i] > step_dists[i-1])
                    right_ok = (i == len(step_dists)-1 or step_dists[i] > step_dists[i+1])
                    if left_ok and right_ok:
                        novelty += 1
                        
        journey_lengths.append(journey)
        spreads.append(spread)
        novelties.append(novelty)
        
        # Resample trajectory to 16 points
        if count > 1:
            old_t = np.linspace(0, 1, count)
            new_t = np.linspace(0, 1, 16)
            resampled = np.zeros((16, 3))
            for d in range(3):
                resampled[:, d] = np.interp(new_t, old_t, track_projected[:, d])
        elif count == 1:
            resampled = np.repeat(track_projected, 16, axis=0)
        else:
            resampled = np.zeros((16, 3))
            
        trajectories.append(resampled)
        
    # 3. Quantize trajectories over the global range
    # Find R = max(abs(coord)) across all tracks and all three dimensions combined
    all_coords = np.array(trajectories) # shape (num_tracks, 16, 3)
    R = float(np.max(np.abs(all_coords)))
    print(f"Global PCA coordinate absolute maximum range R = {R}")
    
    # Quantize to int8: round(coord / R * 127) clipped to [-127, 127]
    quantized_tracks = []
    for idx, track in enumerate(tracks_index):
        track_id = track["trackId"]
        resampled = trajectories[idx]
        
        if R > 1e-9:
            q_traj = np.round(resampled / R * 127)
            q_traj = np.clip(q_traj, -127, 127).astype(int)
        else:
            q_traj = np.zeros((16, 3), dtype=int)
            
        # Flatten to 48 integers
        traj_flat = [int(x) for x in q_traj.flatten()]
        
        quantized_tracks.append({
            "trackId": track_id,
            "traj": traj_flat,
            "journey": round(journey_lengths[idx], 5),
            "spread": round(spreads[idx], 5),
            "novelty": novelties[idx]
        })
        
    # Format PCA basis and mean to 5 decimals
    pca_components = [
        [round(float(x), 5) for x in comp]
        for comp in pca.components_
    ]
    pca_mean = [round(float(x), 5) for x in pca.mean_]
    
    shapes_payload = {
        "pcaRange": round(R, 5),
        "pcaComponents": pca_components,
        "pcaMean": pca_mean,
        "tracks": quantized_tracks
    }
    
    with open(SHAPES_JSON, "w") as f:
        json.dump(shapes_payload, f, indent=2)
    print(f"Saved shapes.json to {SHAPES_JSON}")
    print("Step 6 Complete!")

if __name__ == "__main__":
    main()
