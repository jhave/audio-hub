"""CLAP embeddings for the 56 playlist exemplars (audio-hub / 171exp).
Windows each 60s excerpt into 10s chunks, embeds each chunk with
laion/larger_clap_music, L2-normalizes, mean-pools, re-normalizes."""
import json, os
import numpy as np
import soundfile as sf
import torch
from transformers import ClapModel, ClapProcessor

HERE = os.path.dirname(os.path.abspath(__file__))
EXCERPTS = os.path.join(HERE, "../.audio-work/excerpts")
EXEMPLARS = os.path.join(HERE, "../public/data/exemplars.json")
OUT = os.path.join(HERE, "../public/data/exemplar-embeddings.json")
SR = 48000
WIN = 10 * SR

model = ClapModel.from_pretrained("laion/larger_clap_music")
processor = ClapProcessor.from_pretrained("laion/larger_clap_music")
model.eval()

exemplars = json.load(open(EXEMPLARS))
out = []
with torch.no_grad():
    for idx, ex in enumerate(exemplars):
        wav, sr = sf.read(os.path.join(EXCERPTS, f"{idx:02d}.wav"))
        assert sr == SR, f"{idx}: expected 48kHz, got {sr}"
        chunks = [wav[i:i+WIN] for i in range(0, max(1, len(wav)-WIN+1), WIN)]
        chunks = [c for c in chunks if len(c) >= 3 * SR] or [wav]
        vecs = []
        for c in chunks:
            inputs = processor(audio=c, sampling_rate=SR, return_tensors="pt")
            v = model.get_audio_features(**inputs).pooler_output[0].numpy()
            vecs.append(v / (np.linalg.norm(v) + 1e-9))
        m = np.mean(vecs, axis=0)
        m = m / (np.linalg.norm(m) + 1e-9)
        out.append({"albumId": ex["albumId"], "trackId": ex["trackId"],
                    "vec": [round(float(x), 5) for x in m]})
        print(f"{idx:02d} ok  {ex['albumTitle'][:40]}  ({len(chunks)} windows)")

json.dump(out, open(OUT, "w"))
print(f"wrote {OUT}: {len(out)} embeddings, dim={len(out[0]['vec'])}")
