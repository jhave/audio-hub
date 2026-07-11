"""Librosa descriptors for the 56 playlist exemplars (audio-hub / 171exp).
Computes tempo, spectral centroid, rms energy, onset rate, and spectral flatness."""
import json, os
import numpy as np
import librosa

HERE = os.path.dirname(os.path.abspath(__file__))
EXCERPTS = os.path.join(HERE, "../.audio-work/excerpts")
EXEMPLARS = os.path.join(HERE, "../public/data/exemplars.json")
OUT = os.path.join(HERE, "../public/data/exemplar-descriptors.json")

exemplars = json.load(open(EXEMPLARS))
out = []

for idx, ex in enumerate(exemplars):
    wav_path = os.path.join(EXCERPTS, f"{idx:02d}.wav")
    y, sr = librosa.load(wav_path, sr=22050, mono=True)
    dur = len(y) / sr

    # Compute features
    tempo_array, _ = librosa.beat.beat_track(y=y, sr=sr)
    tempo = float(tempo_array.item())
    
    centroid = float(np.mean(librosa.feature.spectral_centroid(y=y, sr=sr)).item())
    rms = float(np.mean(librosa.feature.rms(y=y)).item())
    
    onsets = librosa.onset.onset_detect(y=y, sr=sr)
    onset_rate = len(onsets) / dur
    
    flatness = float(np.mean(librosa.feature.spectral_flatness(y=y)).item())

    # Build descriptor object with values rounded to 3 decimals
    desc = {
        "albumId": ex["albumId"],
        "tempo": round(tempo, 3),
        "centroid": round(centroid, 3),
        "rms": round(rms, 3),
        "onsetRate": round(onset_rate, 3),
        "flatness": round(flatness, 3)
    }
    out.append(desc)
    print(f"{idx:02d} ok  {ex['albumTitle'][:30]:<30}  tempo={desc['tempo']:.1f}  centroid={desc['centroid']:.1f}  rms={desc['rms']:.3f}")

json.dump(out, open(OUT, "w"))
print(f"wrote {OUT}: {len(out)} descriptors")
