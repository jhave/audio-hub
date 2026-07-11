# PLAN: Audio-Based Topology for 171exp (Grunt-Work Spec)

**Audience of this document:** an executor (human or LLM) doing data
preparation ONLY. No design decisions are yours to make. Follow the spec,
run the checks, deliver the files. Phase B (layout + interface) happens in
a separate session and is NOT your job.

**Goal:** replace the current text-embedding map with an **audio-based**
one. Each of the 56 playlists (album folders) gets one *exemplar* track; a
ot 60-second excerpt of each exemplar is embedded with CLAP; those 56
vectors will anchor a map of "islands" where geography = how the music
actually sounds.

---

## Context (all paths relative to repo root `audio-hub/`)

- Audio lives in `2026-site/public/audio/<Album Name [date]>/*.mp3`
  (56 folders, 746 tracks).
- Track/album metadata: `2026-site/public/audio/albums.meta.json`
  — `albums[]`, each with `id` (folder name), `title`, `prompt`, `tracks[]`;
  each track has `id` (`<folder>::<filename>`), `src`, `filename`,
  `durationSec`, `data.title`.
- Starred/published titles: `2026-exp/public/data/favorites.json`
  — array of `{ id, title, sources[] }` (Suno titles; ~61 entries; they
  match local titles only after normalization, and only ~27 albums have one).
- Work in `2026-exp/`. Node ≥ 22 and Python 3 are available.
- **Do NOT modify anything in `2026-exp/src/` or `2026-site/`. Do NOT
  commit audio excerpts or model caches. Intermediates go in
  `2026-exp/.audio-work/` (gitignored — add the gitignore entry).**

---

## Step 1 — Select exemplars → `2026-exp/public/data/exemplars.json`

For each album in `albums.meta.json` (in order):

1. Normalize titles for matching (both sides):
   lowercase → strip `(N)` counters at end → strip all `[...]` bracket
   chunks → strip punctuation `.!?,;:'"` → collapse whitespace → trim.
2. Exemplar = first track in the album whose normalized `data.title`
   equals a normalized `favorites.json` title. Record `"via": "starred"`.
3. If no match: exemplar = the album's first track (manifest order).
   Record `"via": "first"`.

Output schema (JSON array, one entry per album, same order as manifest):

```json
[
  {
    "albumId": "Doubt Manifesto [July 7, 2026]",
    "albumTitle": "Doubt Manifesto",
    "trackId": "Doubt Manifesto [July 7, 2026]::Doubt Manifesto 1.mp3",
    "file": "2026-site/public/audio/Doubt Manifesto [July 7, 2026]/Doubt Manifesto 1.mp3",
    "trackTitle": "Doubt Manifesto 1",
    "durationSec": 114,
    "via": "starred"
  }
]
```

**Check 1:** exactly 56 entries; report the count of `"via": "starred"`
(expect roughly 25–30). Every `file` must exist on disk (verify!).

## Step 2 — Cut excerpts (ffmpeg) → `2026-exp/.audio-work/excerpts/`

For each exemplar, cut a **60-second mono 48 kHz WAV**, starting at 25% of
the track's duration (clamped so the excerpt fits; if the track is shorter
than 60 s, take the whole track):

```
start = max(0, min(durationSec * 0.25, durationSec - 60))
ffmpeg -y -ss {start} -t 60 -i {file} -ac 1 -ar 48000 "excerpts/{index:02d}.wav"
```

`{index}` = position in exemplars.json (00–55). If ffmpeg is missing:
`brew install ffmpeg`.

**Check 2:** 56 WAVs, each 48 kHz mono, each ≥ 20 s (report any shorter).

## Step 3 — CLAP embeddings → `2026-exp/public/data/exemplar-embeddings.json`

Create a venv and run the script below (CPU is fine; the model download is
~2 GB on first run; total embed time for 56 clips ≈ a few minutes).

```bash
cd 2026-exp && python3 -m venv .audio-work/venv
.audio-work/venv/bin/pip install torch transformers librosa soundfile numpy
.audio-work/venv/bin/python tools/embed_clap.py
```

Save this as `2026-exp/tools/embed_clap.py` exactly:

```python
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
            inputs = processor(audios=c, sampling_rate=SR, return_tensors="pt")
            v = model.get_audio_features(**inputs)[0].numpy()
            vecs.append(v / (np.linalg.norm(v) + 1e-9))
        m = np.mean(vecs, axis=0)
        m = m / (np.linalg.norm(m) + 1e-9)
        out.append({"albumId": ex["albumId"], "trackId": ex["trackId"],
                    "vec": [round(float(x), 5) for x in m]})
        print(f"{idx:02d} ok  {ex['albumTitle'][:40]}  ({len(chunks)} windows)")

json.dump(out, open(OUT, "w"))
print(f"wrote {OUT}: {len(out)} embeddings, dim={len(out[0]['vec'])}")
```

**Check 3:** 56 entries, `dim=512`, no NaNs
(`python -c "import json,math;d=json.load(open('public/data/exemplar-embeddings.json'));assert len(d)==56;assert not any(math.isnan(x) for e in d for x in e['vec']);print('ok')"`).

## Step 4 — Librosa descriptors → `2026-exp/public/data/exemplar-descriptors.json`

Same venv, new script `tools/descriptors.py`: for each excerpt compute and
save (rounded to 3 decimals):

- `tempo` — `librosa.beat.beat_track(y=y, sr=sr)[0]` (float, BPM)
- `centroid` — mean of `librosa.feature.spectral_centroid` (Hz; brightness)
- `rms` — mean of `librosa.feature.rms` (energy)
- `onsetRate` — count of `librosa.onset.onset_detect` events / 60 (per sec)
- `flatness` — mean of `librosa.feature.spectral_flatness` (noisiness 0–1)

Schema: array aligned with exemplars.json:
`{ "albumId": ..., "tempo": ..., "centroid": ..., "rms": ..., "onsetRate": ..., "flatness": ... }`.
Load audio with `librosa.load(path, sr=22050, mono=True)` (librosa's
default rate is fine here — these are coarse descriptors).

**Check 4:** 56 entries; tempos mostly between 50–200; no zeros/NaNs.

## Step 5 — Similarity sanity report → `2026-exp/.audio-work/similarity-report.txt`

From the 512-d embeddings compute the 56×56 cosine similarity matrix.
Write a plain-text report: for each album, its **top 3 nearest neighbors**
with similarity scores, formatted:

```
Doubt Manifesto [July 7, 2026]
   0.83  Planetary Homeostasis [July 2, 2026]
   0.79  ...
```

Plausibility expectations (do not force these; just note in the report
whether they hold): the ten `ReRites` albums should tend to neighbor one
another; `soft austere post hybrid deep sleep ambiences` should sit far
from `Cloud-hop Vapor-Thrash` and `chipcore's diligent rebirth`.

## Step 6 (OPTIONAL — only if time permits) — all-track embeddings

Same pipeline for **all 746 tracks**: 30-second excerpts from 25% in,
same windowing, output `2026-exp/public/data/track-embeddings.json`
(same schema; ~30–60 min CPU; excerpts may be deleted after). This later
lets each track be audio-placed *within* its island. Skip without guilt.

---

## Definition of done

Committed (small JSON only — nothing else):
- `2026-exp/public/data/exemplars.json`
- `2026-exp/public/data/exemplar-embeddings.json`
- `2026-exp/public/data/exemplar-descriptors.json`
- `2026-exp/tools/embed_clap.py`, `2026-exp/tools/descriptors.py`,
  and the exemplar-selection script (Step 1) as `2026-exp/tools/select-exemplars.mjs`
- `.audio-work/` gitignored; similarity-report.txt left on disk, uncommitted
- All four checks pass; report Check-1 starred count and any Step-5
  observations in your summary.

## What happens in Phase B (NOT your job — context only)

The 56 anchors get reduced to 2D (MDS/UMAP on cosine distances), islands
are built around them (metaball terrain, playlist names as cartographic
labels, librosa descriptors driving each island's visual climate), and the
interface is rebuilt around island-hopping: one song at a time, crossfade
only at coastlines between exactly two islands, mixer for ≤3 voices,
auto-flight as a tour of audibly-adjacent styles, and CLAP text queries
("gentle folktronica") pointing at the island that sounds like the phrase.
