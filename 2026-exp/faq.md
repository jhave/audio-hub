# FAQ & Methodology

## How This Atlas Was Built

The atlas models the 746 tracks of the 171-day archive using **CLAP** (Contrastive Language-Audio Pretraining) embeddings.

**In plain English:** imagine a library where similar-sounding songs share a shelf. CLAP listens to 10-second snippets and turns each into 512 numbers — a sonic fingerprint. Similar fingerprints, similar sound. Those 512 dimensions are projected onto a 2D map, so the archive can be explored like an archipelago of style.

**Trajectories:** rather than averaging a song into one fingerprint, every 10-second window is kept and its sequence traced — a path through parameter space, projected onto the library's top 3 directions of variation (PCA) and drawn as a 16-point shape: the track's internal narrative.

**Sliders:** *Weirdness* (0–1) pushes Suno outside its highest-probability distribution; high values (> 0.8) yield strange textures and unpredictable modulations (sort by it via the sparkles icon in the player dock). *Style Weight* (0–1) sets how strictly generation follows the text prompt.

## Technical Pipeline

1. **Ingestion & segmentation** — mp3s downsampled to 22,050 Hz, cut into non-overlapping 10-second windows.
2. **CLAP encoding** — each window becomes a 512-dimensional vector; a track's global embedding is the mean of its windows.
3. **Zero-shot tagging** — 76 glossary probes (prefixed "the sound of …") are text-encoded; tag scores are dot products between window vectors and probe vectors. CLAP matches *acoustic texture*, not physical instruments: deep synth sub-bass scores high on "sousaphone/brass" because they share a frequency profile.
4. **2D layout** — track centroids are mean-centered, then projected by t-SNE or UMAP (see below).
5. **Descriptors** — key via Krumhansl-Schmuckler chroma templates; tempo via onset autocorrelation, which is prone to octave errors (dense hi-hats double 99 BPM to 198; drumless ambience under-reads). Tempo is best read as onset density, not felt beat.

## Dimensionality Reduction: t-SNE vs UMAP

The fingerprints live in 512 dimensions; humans see three at most. Dimensionality reduction projects high-dimensional data down to 2D while preserving as much structure as possible. The topology pane offers two projections:

### t-SNE

van der Maaten & Hinton, 2008. Converts distances into neighbor probabilities; a Student-t distribution in 2D resolves the crowding problem. **Strength:** excellent *local* structure — tight, separated clusters, ideal for spotting sub-genres. **Weakness:** global structure is lost (distances *between* clusters are mostly arbitrary), and it is slow at scale.

### UMAP

McInnes, Healy & Melville, 2018. Built on Riemannian geometry: models the data as a manifold, builds a fuzzy topological representation, then optimizes a matching 2D layout. **Strength:** preserves *local and global* structure — outliers land far apart, stylistic gradients survive; significantly faster. **Weakness:** clusters can look stringy and less distinct than t-SNE's clean islands.

## The Limits of Machine Listening

Algorithms analyze waveforms; they cannot sense elegy, novelty, or banality. Example: **A Sombre Just Enough**, a slow acoustic ballad, is tagged both "driving fast tempo" and "slow ambient pulse."

- **The transient trap** — fast fingerpicked guitar produces a high event-rate; Librosa reads 199 BPM and 12 tempo jumps, CLAP reads "fast." Humans filter the plucks and feel the slow elegiac flow; the math does not.
- **Contradictory tags co-exist** — each probe scores independently (an isolated dot product), so a track can rank 90% slow *and* 80% fast; the interface simply lists the top 5.
- **A future fix** — group probes into mutually exclusive sets (slow/medium/fast) and apply softmax across each set, forcing a single pool of probability.

## The Vermeer Smear Paradox

**VERMEER SMEAR** has prominent vocals yet is tagged "no vocals"; Suno metadata declares 6 sections, while analysis reports 0 shifts and an 8.4 journey. Reconciliation: 0 shifts means no abrupt transitions; 8.4 journey means a large total distance traveled. The track is a continuous, gradual morph — a gradient smear that evolves without ever crossing a sharp border.

The deeper asymmetry: generators synthesize cohesive multi-part beauty by predicting the next token inside a vast implicit space; analytic tools then compress that richness into tiny human labels ("no vocals," "99 BPM") — a brutally lossy translation. Music exceeds the numbers used to dissect it. Emerging remedies: analyzing structure directly in embedding space, attention-map tracing, and probing generators' hidden layers.

## The Map Projections (Topology Pane)

### Acoustic (Music) — [Occasionally inaccurate]

CLAP audio embeddings → t-SNE/UMAP. Sonic texture, instrumentation, genre. Occasionally highly inaccurate: slow ambient can cluster beside fast chipcore.

### Semantic (Lyrics) — [Moderately accurate]

Lyric + prompt text embeddings → t-SNE/UMAP. Themes, vocabularies, prompt intent.

### Structural (Metrics) — [Accurate]

All 13 musicological metrics. Structural complexity, tempo, drift, modulations, bounce, journey.

### Aesthetic — [Accurate]

9 composition metrics (ablating dropAt, tempoJumps, novelty). Composition structure, melodic complexity, weirdness.

### Rhythm — [Accurate]

Tempo, bounce, melodicComplexity, sectionCount. Rhythmic density vs. complexity.

### Groove Grid — [Inaccurate]

Tempo (X) vs. circle-of-fifths key (Y). Beat-speed against harmonic relationships; groups relative majors/minors. Inaccurate where tempo extraction fails.

### Intent Space — [Accurate]

Suno's own parameters: weirdness (X) vs. style weight (Y). How much control was ceded to the model. Perfect: direct plotting.

### Texture Space — [Accurate]

Bounce (X) vs. melodic complexity (Y). Transients against melodic layers.

### Narrative Space — [Inaccurate]

Journey (X) vs. style spread (Y). Progression against variety. Short songs read as small journeys.

### Tempo Line — [Almost worthless]

Raw BPM (60–200) on X with vertical jitter. Diagnostic view exposing double/half octave errors.

## Glossary of Descriptors

### SPREAD — [Accurate]

Style variety: mean distance of a track's windows to its own centroid in PCA space. High = varied parts (speech/singing, acoustic/electronic); low = consistency.

### JOURNEY — [Inaccurate]

Total distance traveled: sum of window-to-window distances. Long = progressive, evolving structure; short = static loop.

### TEMPO — [Almost worthless]

Global BPM via onset autocorrelation, prone to half/double-time locks. Companions: **tempo drift** (std-dev of local tempos) and **tempo jumps** (count of >10 BPM shifts between windows).

### KEY — [Inaccurate]

Tonal center via Krumhansl-Schmuckler chroma correlation; segment-level keys yield **modulation** counts.

### BOUNCE — [Accurate]

Low-frequency rhythm periodicity (0–1): autocorrelation peak of the sub-150 Hz envelope at the beat period. High = bass-heavy groove; low = drone.

### COMPLEXITY — [Inaccurate]

Entropy of the chroma-transition matrix. High = unpredictable harmony; biased upward for long repetitive tracks that accumulate transitions over duration.
