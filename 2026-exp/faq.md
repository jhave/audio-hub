# FAQ & Methodology

## How This Atlas Was Built

> Every song becomes a fingerprint of 512 numbers; similar fingerprints become neighbors on the map.

An AI model called **CLAP** (Contrastive Language-Audio Pretraining) listens to each track in 10-second windows and encodes what it hears as a 512-dimensional vector. Those vectors are projected down to 2D, so the archive can be explored like an archipelago of style.

Instead of averaging a song into one point, every window is kept and its sequence traced — a path through parameter space, drawn as a 16-point shape: the track's internal narrative.

**Sliders:** *Weirdness* (0–1) pushes Suno outside its highest-probability distribution (sort by it via the sparkles icon in the player dock). *Style Weight* (0–1) sets how strictly generation follows the prompt.

---

## Technical Pipeline

> 10-second windows → 512-d CLAP vectors → tags, trajectories, and a 2D map.

1. **Segment** — mp3s at 22,050 Hz, cut into 10-second windows.
2. **Encode** — each window → 512-d vector; a track's global embedding is the mean of its windows.
3. **Tag** — 76 text probes ("the sound of …") scored by dot product. CLAP matches *texture*, not instruments: synth sub-bass scores as "sousaphone/brass" because they share a frequency profile.
4. **Map** — centroids mean-centered, projected by t-SNE or UMAP.
5. **Describe** — key via chroma templates; tempo via onset autocorrelation (prone to octave errors — read it as onset density, not felt beat).

---

## Dimensionality Reduction: t-SNE vs UMAP

> 512 dimensions must be flattened to two — and every flattening lies differently.

### t-SNE

van der Maaten & Hinton, 2008. Converts distances into neighbor probabilities. **Strength:** crisp local clusters — ideal for spotting sub-genres. **Weakness:** distances *between* clusters are mostly arbitrary; slow at scale.

### UMAP

McInnes, Healy & Melville, 2018. Models the data as a manifold, preserves its topology. **Strength:** local *and* global structure survive — outliers land far apart, gradients persist; much faster. **Weakness:** clusters look stringier than t-SNE's clean islands.

---

## The Limits of Machine Listening

> A slow ballad tagged both "driving fast tempo" and "slow ambient pulse": each score is true; neither is the song.

- **Transient trap** — fast fingerpicking = high event-rate: Librosa reads 199 BPM, CLAP reads "fast." Humans filter the plucks and feel the slow flow; the math doesn't.
- **Independent tags** — each probe scores in isolation, so a track can rank 90% slow *and* 80% fast; the interface lists the top 5.
- **Future fix** — softmax across exclusive sets (slow/medium/fast) so probability must be shared.

---

## The Vermeer Smear Paradox

> Six sections, zero shifts, a journey of 8.4 — a song that morphs continuously never crosses a border.

**VERMEER SMEAR** is a gradient: it travels far (journey 8.4) without one abrupt transition (0 shifts), so its six composed sections blur into a smear. Generators synthesize this richness by predicting the next token; analytic tools then squeeze it into tiny labels ("no vocals," "99 BPM") — a brutally lossy translation. Music exceeds the numbers used to dissect it.

---

## The Map Projections (Topology Pane)

### Acoustic (Music) — [Occasionally inaccurate]

CLAP audio embeddings → t-SNE/UMAP. Sonic texture, instrumentation, genre. Slow ambient can cluster beside fast chipcore.

### Semantic (Lyrics) — [Moderately accurate]

Lyric + prompt text embeddings. Themes, vocabularies, prompt intent.

### Structural (Metrics) — [Accurate]

All 13 musicological metrics: complexity, tempo, drift, modulations, bounce, journey.

### Aesthetic — [Accurate]

9 composition metrics (noisy ones ablated). Structure, melodic complexity, weirdness.

### Rhythm — [Accurate]

Tempo, bounce, melodicComplexity, sectionCount. Density vs. complexity.

### Groove Grid — [Inaccurate]

Tempo (X) vs. circle-of-fifths key (Y). Fails where tempo extraction fails.

### Intent Space — [Accurate]

Suno's own parameters: weirdness (X) vs. style weight (Y). Control ceded to the model.

### Texture Space — [Accurate]

Bounce (X) vs. melodic complexity (Y). Transients against melodic layers.

### Narrative Space — [Inaccurate]

Journey (X) vs. style spread (Y). Short songs read as small journeys.

### Tempo Line — [Almost worthless]

Raw BPM (60–200) with jitter. Diagnostic; exposes double/half octave errors.

---

## Glossary of Descriptors

### SPREAD — [Accurate]

Style variety: mean distance of a track's windows from its own centroid. High = varied parts; low = consistency.

### JOURNEY — [Inaccurate]

Total distance traveled, window to window. Long = progressive evolution; short = static loop.

### TEMPO — [Almost worthless]

Global BPM via onset autocorrelation; locks onto half/double-time. Companions: **tempo drift** (local variability) and **tempo jumps** (shifts >10 BPM).

### KEY — [Inaccurate]

Tonal center via chroma correlation; segment-level keys yield **modulation** counts.

### BOUNCE — [Accurate]

Low-frequency rhythm periodicity (0–1). High = bass-heavy groove; low = drone.

### COMPLEXITY — [Inaccurate]

Entropy of chroma transitions. High = unpredictable harmony; biased upward for long repetitive tracks.
