# Plan: Deep Per-Track Analysis (Phase A2) - APPROVED VERSION

This plan implements Phase A2 (Deep Per-Track Analysis) to extract window-level features, Zero-shot tags, Suno metadata, musical descriptors, text embeddings, and PCA trajectories for all 746 tracks. This version incorporates the resolutions to the open questions.

## User Review Required

Please verify that all resolutions from the answers document are correctly represented. Once approved, we will proceed to execution.

---

## Technical Specifications

### 1. `curves.bin` Binary Layout
- `curves.bin` will contain two contiguous blocks:
  - **tempo block**: `uint8` values, where value = `round(BPM)` clipped to `[0, 255]`. Size: `TOTAL_WINDOWS` bytes.
  - **rms block**: `int8` values (track-normalized, see below). Size: `TOTAL_WINDOWS` bytes.
- Top-level block map in `windows-index.json`:
  ```json
  "curves": {
    "tempo": { "offsetBytes": 0, "bytesPerWindow": 1, "dtype": "uint8" },
    "rms":   { "offsetBytes": TOTAL_WINDOWS, "bytesPerWindow": 1, "dtype": "int8" }
  }
  ```
- **Alignment**: Every track (even if it fails processing or has 0 windows) must have an entry in the index with `"count": 0`.

### 2. PCA Quantization & Basis (`shapes.json`)
- **Shared Scale**: Find $R = \max(|coord|)$ over all tracks and all three PCA dimensions combined.
- **Quantization**: `q = round(coord / R * 127)` clipped to `[-127, 127]`.
- **Shapes JSON Keys**:
  - `"pcaRange"`: $R$ (single float)
  - `"pcaComponents"`: `[[...512 floats...] x3]` (rounded to 5 decimals)
  - `"pcaMean"`: `[...512 floats...]` (rounded to 5 decimals)
  - `"tracks"`: `[ { "trackId": ..., "traj": [...48 ints...], "journey": ..., "spread": ..., "novelty": ... } ]`

### 3. `rmsCurve` Scaling
- **Normalization**: Per-window `rms_window` is normalized by the track's maximum RMS value:
  `q = round(rms_window / rms_track_max * 127)` clipped to `[0, 127]`.
- **Absolutes**: `rmsMax` (float, 3 decimals) will be saved in `descriptors.json` alongside the existing `rms` mean and std.

### 4. Suno Scraping & Reference Resolution
- Match local track names against the Suno playlist tracks.
- Parse the React Server Components (RSC) payload and resolve lyrics references (e.g. `"$62"` resolves to the string variable value).
- If the lyric reference cannot be resolved, store `"lyrics": null` (not `""` which denotes confirmed instrumental).

### 5. Checkpointing & Fsync
- Checkpoint every 25 tracks by updating `progress.json`.
- At each checkpoint, close and reopen (or flush/fsync) the binary files to ensure truncation is crash-safe.

### 6. `introLen` (Sustained beats)
- `first sustained beat-dense region` is defined as the first frame where there are $\ge 4$ consecutive seconds with onset rate above half the track median.
- `introLen` = time (seconds) of the earliest of this region or the first section boundary.

---

## Proposed Changes

We will implement the analysis in 6 separate scripts under `tools/`, matching the steps in the specification.

### Step 1 — Window-level CLAP embeddings

#### [NEW] [deep_step1_windows.py](file:///Users/jhave/VIBE_Coding/audio-hub/2026-exp/tools/deep_step1_windows.py)
- Convert each track to a temporary 48 kHz mono WAV file using `ffmpeg` (spawned safely).
- Load the WAV, slice it into 10s windows with a 10s hop (dropping chunks < 3s).
- Compute `laion/larger_clap_music` audio features for each chunk and L2-normalize.
- Cast vectors to `float16` and append to `public/data/v2/windows.bin`.
- Construct `public/data/v2/windows-index.json` containing track offsets and window counts.
- Implement checkpointing: write `progress.json` containing the last processed track ID and the window count offset. On restart, truncate `windows.bin` to `last_offset * 512 * 2` bytes.
- Delete temporary WAV files immediately.

### Step 2 — Zero-shot tag scores

#### [NEW] [deep_step2_tags.py](file:///Users/jhave/VIBE_Coding/audio-hub/2026-exp/tools/deep_step2_tags.py)
- Load the 76 text probes. Prefix each with `"the sound of "` and extract text features using `ClapModel`.
- L2-normalize the text embeddings.
- Read `windows.bin` in chunks. For each window vector, calculate the dot product against all 76 text embeddings.
- Scale scores to `int8` using `round(score * 400)` clipped to `[-127, 127]`.
- Output `public/data/v2/tag-probes.json`.
- Output `public/data/v2/tags-windows.bin` (flat `int8` array of size `total_windows * 76`).
- Output `public/data/v2/tags-tracks.json` (mean score per probe across each track's windows, formatted as `int8`).
- Update `windows-index.json` to include the `tagsWindows` properties.

### Step 3 — Scrape ground truth from suno.com

#### [NEW] [deep_step3_suno.py](file:///Users/jhave/VIBE_Coding/audio-hub/2026-exp/tools/deep_step3_suno.py)
- Read `suno.txt` for each album to get the playlist URL.
- Fetch playlist pages (paginated with `?page=X`) and extract track titles and song UUIDs using our verified regex.
- For each matched track, fetch its song page (e.g. `suno.com/song/<uuid>`).
- Unescape the Next.js RSC payload pushes and resolve the prompt reference variable (containing lyrics), tags (style prompt), model name, duration, and control sliders.
- Cache fetched pages in `.audio-work/suno-cache/<uuid>.json`.
- Save final truth mapping to `public/data/v2/suno-truth.json`.

### Step 4 — Musically-informed descriptors

#### [NEW] [deep_step4_descriptors.py](file:///Users/jhave/VIBE_Coding/audio-hub/2026-exp/tools/deep_step4_descriptors.py)
- Load each track at 22,050 Hz mono.
- Extract:
  - **tempo** (global BPM) and **tempoCurve** (downsampled to 1-per-10s).
  - **key** (via CQT chroma correlated against K-S profiles), **keySegments** (per 30s segment), and **modulations** (changes count).
  - **onsetRate**, **rms** (mean/std), **spectralCentroid** (mean), and **flatness** (mean).
  - **structure**: beat-synchronous SSM, Foote novelty curve with 8x8 checkerboard kernel, novelty peaks (section boundaries), `sectionCount`, `introLen` (earliest of first boundary or first beat detection), and `dropAt` (largest positive RMS jump > 1.5σ std).
  - **bounce** (periodicity of low-band < 150 Hz envelope at beat lag).
  - **melodicComplexity** (entropy of the chroma transition matrix).
- Save to `public/data/v2/descriptors.json`.
- Save `tempoCurve` (float16) and `rmsCurve` (int8) to `public/data/v2/curves.bin`.

### Step 5 — Text embeddings of lyrics and prompts

#### [NEW] [deep_step5_embeddings.mjs](file:///Users/jhave/VIBE_Coding/audio-hub/2026-exp/tools/deep_step5_embeddings.mjs)
- Implement Node.js script using `@xenova/transformers` with `Xenova/all-MiniLM-L6-v2`.
- Embed lyrics from Step 3 (saving `trackId` + 384-d vector rounded to 5 decimals; skipping instrumentals) to `public/data/v2/lyrics-embeddings.json`.
- Embed style tags/album prompts to `public/data/v2/prompt-embeddings.json`.

### Step 6 — Track-shape signatures

#### [NEW] [deep_step6_shapes.py](file:///Users/jhave/VIBE_Coding/audio-hub/2026-exp/tools/deep_step6_shapes.py)
- Load all window vectors, mean-center them globally, and re-normalize to unit length.
- Perform PCA (n_components=3) on the normalized windows.
- Project each track's windows, resample to 16 points via linear interpolation, and quantize to `int8` over the global range.
- Calculate `journeyLength`, `spread`, and `noveltyCount`.
- Output `public/data/v2/shapes.json`.

---

## Verification Plan

### Automated Tests
- Check binary sizes to verify they align exactly with indexed window counts.
- Run Python verification check commands to verify no `NaN` or infinite values in JSON outputs.
- Spot-audit key distribution to confirm keys are dispersed across multiple pitches/modes.
- Perform `ReRites` lyric-space vs. audio-space similarity checks.

### Manual Verification
- Review the top-5 zero-shot tag results for a subset of tracks to confirm semantic alignment.
- Verify that `weirdness` and `styleWeight` match the filename tags `[NNW MMS]` for the sample of 20+ tracks.
