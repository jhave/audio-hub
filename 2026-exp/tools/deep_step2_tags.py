import os
import json
import torch
import numpy as np
from transformers import ClapProcessor, ClapModel

# Paths
ROOT_DIR = "/Users/jhave/VIBE_Coding/audio-hub/2026-exp"
DATA_DIR = os.path.join(ROOT_DIR, "public/data/v2")
INDEX_PATH = os.path.join(DATA_DIR, "windows-index.json")
WINDOWS_BIN = os.path.join(DATA_DIR, "windows.bin")

TAG_PROBES_JSON = os.path.join(DATA_DIR, "tag-probes.json")
TAGS_WINDOWS_BIN = os.path.join(DATA_DIR, "tags-windows.bin")
TAGS_TRACKS_JSON = os.path.join(DATA_DIR, "tags-tracks.json")

# Probe vocabulary
probes = [
    # instruments
    "piano", "acoustic guitar", "electric guitar", "cello", "violin", "harp", 
    "sousaphone/brass", "flute", "saxophone", "drum kit", "808 sub-bass", 
    "synthesizer pad", "plucked strings", "sitar", "oud", "kalimba", "marimba", 
    "church organ", "accordion", "music box", "tape hiss and vinyl crackle", 
    "field recordings",
    # voice
    "male vocals", "female vocals", "choir", "whispered vocals", "spoken word", 
    "vocalese without words", "rap vocals", "no vocals instrumental",
    # rhythm
    "four-on-the-floor kick drum", "breakbeat", "syncopated rhythm", 
    "half-time groove", "rubato free tempo", "driving fast tempo", 
    "slow ambient pulse", "glitchy stuttering rhythm",
    # genre/texture
    "ambient drone", "folktronica", "jazz improvisation", "techno", 
    "shoegaze wall of sound", "trap hi-hats", "orchestral strings", "chamber music", 
    "lo-fi bedroom production", "psychedelic rock", "dub reggae", "thrash metal", 
    "new age meditation", "musique concrete", "chiptune", "gospel", "tango", 
    "bossa nova", "gamelan", "west african percussion", "celtic folk", "drone metal", 
    "idm braindance", "vaporwave", "post-rock crescendo",
    # mood/dynamics
    "gentle and intimate", "euphoric and soaring", "melancholy", 
    "aggressive and distorted", "playful and quirky", "solemn and sacred", 
    "tense and anxious", "warm and cozy", "cold and austere", "triumphant", 
    "mysterious", "danceable groove"
]

print(f"Loaded {len(probes)} text probes.")

# Load CLAP Model for text embedding
device = "cpu"
print("Loading CLAP model for text feature extraction...")
processor = ClapProcessor.from_pretrained("laion/larger_clap_music")
model = ClapModel.from_pretrained("laion/larger_clap_music")
model.to(device)
model.eval()

# Embed text probes
print("Embedding text probes...")
prefixed_probes = [f"the sound of {p}" for p in probes]
inputs = processor(text=prefixed_probes, return_tensors="pt", padding=True)
inputs = {k: v.to(device) for k, v in inputs.items()}

with torch.no_grad():
    text_outputs = model.get_text_features(**inputs)
    text_embeds = text_outputs.pooler_output.cpu().numpy()
    # L2-normalize
    norms = np.linalg.norm(text_embeds, axis=1, keepdims=True)
    text_embeds = text_embeds / (norms + 1e-9)

print(f"Text embeddings shape: {text_embeds.shape} (L2-normalized)")

# Save tag-probes.json
with open(TAG_PROBES_JSON, "w") as f:
    json.dump(probes, f, indent=2)
print(f"Saved {TAG_PROBES_JSON}")

# Check if windows.bin and windows-index.json exist
if not os.path.exists(WINDOWS_BIN) or not os.path.exists(INDEX_PATH):
    print("Error: Step 1 output files (windows.bin, windows-index.json) are missing.")
    exit(1)

# Load windows-index.json
with open(INDEX_PATH, "r") as f:
    index_data = json.load(f)
tracks_index = index_data.get("tracks", [])

# Read all windows from windows.bin as float16, convert to float32
print(f"Reading window embeddings from {WINDOWS_BIN}...")
window_data = np.fromfile(WINDOWS_BIN, dtype=np.float16).reshape(-1, 512).astype(np.float32)
total_windows = len(window_data)
print(f"Loaded {total_windows} window vectors.")

# Calculate dot products against text probes
# Shape: (total_windows, 75)
print("Computing window-level similarity scores...")
scores = np.dot(window_data, text_embeds.T)

# Scale to int8: round(score * 400) clipped to [-127, 127]
scale = 400
scaled_windows = np.round(scores * scale)
scaled_windows = np.clip(scaled_windows, -127, 127).astype(np.int8)

# Write tags-windows.bin
print(f"Writing window tag scores to {TAGS_WINDOWS_BIN}...")
with open(TAGS_WINDOWS_BIN, "wb") as f:
    f.write(scaled_windows.tobytes())

# Compute track-level mean scores
print("Computing track-level mean scores...")
tracks_scores_output = []

for track in tracks_index:
    track_id = track["trackId"]
    offset = track["offset"]
    count = track["count"]
    
    if count > 0:
        track_slice = scores[offset : offset + count]
        mean_scores = np.mean(track_slice, axis=0) # shape (75,)
        scaled_mean = np.round(mean_scores * scale)
        scaled_mean = np.clip(scaled_mean, -127, 127).astype(np.int8)
        # Convert to standard Python int list
        int_scores = [int(x) for x in scaled_mean]
    else:
        # Default empty array if no windows
        int_scores = [0] * len(probes)
        
    tracks_scores_output.append({
        "trackId": track_id,
        "scores": int_scores
    })

# Save tags-tracks.json
tags_tracks_payload = {
    "scale": scale,
    "tracks": tracks_scores_output
}
with open(TAGS_TRACKS_JSON, "w") as f:
    json.dump(tags_tracks_payload, f, indent=2)
print(f"Saved {TAGS_TRACKS_JSON}")

# Update windows-index.json
index_data["tagsWindows"] = {
    "dtype": "int8",
    "dim": len(probes),
    "scale": scale
}
with open(INDEX_PATH, "w") as f:
    json.dump(index_data, f, indent=2)
print(f"Updated {INDEX_PATH} with tagsWindows info.")

print("Step 2 Complete!")
