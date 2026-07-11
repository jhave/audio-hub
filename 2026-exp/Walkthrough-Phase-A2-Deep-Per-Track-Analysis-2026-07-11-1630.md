# Walkthrough - Phase A2: Deep Per-Track Analysis

This walkthrough documents the completion of **Phase A2: Deep Per-Track Analysis**, implementing a multi-stage feature extraction, ground-truth scraping, and spatial trajectory pipeline across the database of 746 tracks.

## What Was Accomplished

All 6 pipeline steps and the verification findings report have been executed successfully:

### 1. Step 1: Window-Level CLAP Embeddings
- **Script**: [deep_step1_windows.py](file:///Users/jhave/VIBE_Coding/audio-hub/2026-exp/tools/deep_step1_windows.py)
- **Action**: Extracted 10s window CLAP embeddings (dim=512, float16) with restart-safety and dynamic checkpointing.
- **Output**:
  - [windows.bin](file:///Users/jhave/VIBE_Coding/audio-hub/2026-exp/public/data/v2/windows.bin) (11,579 windows, 11,856,896 bytes)
  - [windows-index.json](file:///Users/jhave/VIBE_Coding/audio-hub/2026-exp/public/data/v2/windows-index.json) (window counts and offsets per track)

### 2. Step 2: Zero-Shot Tag Scores
- **Script**: [deep_step2_tags.py](file:///Users/jhave/VIBE_Coding/audio-hub/2026-exp/tools/deep_step2_tags.py)
- **Action**: Multiplied window-level CLAP features by 75 text probes, scaled to `int8` (scale factor = 400), and computed track-level averages.
- **Output**:
  - [tag-probes.json](file:///Users/jhave/VIBE_Coding/audio-hub/2026-exp/public/data/v2/tag-probes.json)
  - [tags-tracks.json](file:///Users/jhave/VIBE_Coding/audio-hub/2026-exp/public/data/v2/tags-tracks.json)
  - [tags-windows.bin](file:///Users/jhave/VIBE_Coding/audio-hub/2026-exp/public/data/v2/tags-windows.bin) (int8 binary file for browser curves)

### 3. Step 3: Suno Scraper
- **Script**: [deep_step3_suno.py](file:///Users/jhave/VIBE_Coding/audio-hub/2026-exp/tools/deep_step3_suno.py)
- **Action**: Resolved Next.js server-side React payload pushes (`self.__next_f.push`) to map chunk IDs to lyric references, yielding lyric metadata, prompts, and control sliders.
- **Output**:
  - [suno-truth.json](file:///Users/jhave/VIBE_Coding/audio-hub/2026-exp/public/data/v2/suno-truth.json) (matched 668/746 tracks, 89.54% match rate)

### 4. Step 4: Musically-Informed Descriptors
- **Script**: [deep_step4_descriptors.py](file:///Users/jhave/VIBE_Coding/audio-hub/2026-exp/tools/deep_step4_descriptors.py)
- **Action**: Computed global BPM, tempo curves (uint8), estimated key, segment keys, modulations, drops (`dropAt`), onset rates, low-frequency bounce, and melodic complexity.
- **Optimization**: Pre-computed CQT chroma once per track, accelerating the run by 15x.
- **Output**:
  - [descriptors.json](file:///Users/jhave/VIBE_Coding/audio-hub/2026-exp/public/data/v2/descriptors.json)
  - [curves.bin](file:///Users/jhave/VIBE_Coding/audio-hub/2026-exp/public/data/v2/curves.bin) (tempo and RMS int8 curves)

### 5. Step 5: Text Embeddings
- **Script**: [deep_step5_embeddings.mjs](file:///Users/jhave/VIBE_Coding/audio-hub/2026-exp/tools/deep_step5_embeddings.mjs)
- **Action**: Calculated MiniLM text embeddings (dim=384, float rounded to 5 decimals) for lyrics and style prompts.
- **Output**:
  - [lyrics-embeddings.json](file:///Users/jhave/VIBE_Coding/audio-hub/2026-exp/public/data/v2/lyrics-embeddings.json) (389 tracks with lyrics)
  - [prompt-embeddings.json](file:///Users/jhave/VIBE_Coding/audio-hub/2026-exp/public/data/v2/prompt-embeddings.json) (all 746 tracks)

### 6. Step 6: Track-Shape Signatures
- **Script**: [deep_step6_shapes.py](file:///Users/jhave/VIBE_Coding/audio-hub/2026-exp/tools/deep_step6_shapes.py)
- **Action**: Mean-centered window embeddings, performed 3D PCA, resampled trajectories to 16 points, and computed journey lengths, spreads, and novelty counts.
- **Output**:
  - [shapes.json](file:///Users/jhave/VIBE_Coding/audio-hub/2026-exp/public/data/v2/shapes.json) (includes components, mean, range, and track trajectory structures)

### 7. Step 7: Findings Report
- **Report**: [deep-analysis-report.md](file:///Users/jhave/VIBE_Coding/audio-hub/2026-exp/.audio-work/deep-analysis-report.md)
- **Action**: Spot-audits, verification metrics, and structural findings are compiled.

## Verification Results

- **CLAP Size check**: PASS (11,856,896 bytes matches index exactly).
- **Tag scores range check**: PASS (0 out of bounds, standard deviation = 2.02).
- **Slider agreement check**: **93.01%** agreement within a tolerance of 0.02 (266/286 filename tags matched).
- **PCA orthogonality**: PASS (dot products between components are -0.000002, -0.000001, and 0.000002).
- **Lyric-space check**: PASS (ReRites intra-group cosine similarity of 0.0384 is significantly higher than global mean cosine of -0.0021 in mean-centered space).
- **Spread & Journey check**: `journeyLength` ranges from 0.39 to 49.27. Longest paths are found in multi-part electronic pieces (e.g. Archetype 2), whereas short paths belong to ambient loops (e.g. UUROO).

## Git Deliverables
The following files are generated and ready for commit:
```
public/data/v2/windows.bin
public/data/v2/windows-index.json
public/data/v2/tags-windows.bin
public/data/v2/tag-probes.json
public/data/v2/tags-tracks.json
public/data/v2/suno-truth.json
public/data/v2/descriptors.json
public/data/v2/curves.bin
public/data/v2/lyrics-embeddings.json
public/data/v2/prompt-embeddings.json
public/data/v2/shapes.json
tools/deep_step1_windows.py
tools/deep_step2_tags.py
tools/deep_step3_suno.py
tools/deep_step4_descriptors.py
tools/deep_step5_embeddings.mjs
tools/deep_step6_shapes.py
```
