# PLAN Phase C — Refinements & Review (CLAUDE addendum)

This document reviews [`tools/deep_step7_stems_analyzer.py`](tools/deep_step7_stems_analyzer.py)
against [`PLAN-phase-c-deep-audio-analysis.md`](PLAN-phase-c-deep-audio-analysis.md) and
specifies the improvements implemented in the wrapper script
[`tools/deep_step7_stemmer_and_analyzer-CLAUDE.py`](tools/deep_step7_stemmer_and_analyzer-CLAUDE.py).

The original script is a solid first pass: it stems with Demucs, extracts vocal + drum
features, caches per-track, and truncates loading to 5 minutes. But it only implements a
fraction of the plan (vocals + drums), re-loads the Demucs model on every track, has two real
correctness bugs in the vocal path, and throws away the bass/other stems it already paid to
separate. The refinements below close the gap **without adding a single new heavyweight model**
— every new feature is cheap DSP on stems we already have in memory.

---

## 1. Architecture change: in-process Demucs, zero temp files

**Current:** every track shells out to `python -m demucs …`, which reloads the ~300 MB
`htdemucs` model from disk into MPS *per track*, writes four MP3s to `.audio-work/temp_stems`,
re-reads two of them from disk, then `rmtree`s the folder.

**Refined:** the venv (`.audio-work/venv`) exposes `demucs.api.Separator`. We construct **one**
`Separator(model="htdemucs", device="mps")` at startup and call `separate_tensor()` per track.
Stems stay in RAM as tensors — nothing is written to disk.

Wins:
- **Model loaded once**, not 746 times. This is the dominant speedup; subprocess model-reload
  was costing more per track than the separation itself.
- **Zero disk-fill risk.** Plan §2 devotes two sections to disk-space defense (compressed MP3,
  watermark batching). In-memory separation makes the entire concern moot — peak stem residency
  is one track at a time, freed immediately, and no MP3 encode/decode round-trip.
- **All four stems available** for analysis (see §4) instead of only the two written back.
- Explicit `-n htdemucs` is no longer implicit: the old script hard-coded the `htdemucs/`
  output subdir but never passed `-n`, so it would silently break if Demucs's default model
  ever changed. The API pins the model by name.

Loading is still truncated to `MAX_SECONDS = 300` (via `librosa.load(..., duration=300)`),
preserving the recent optimization, then fed to `separate_tensor`.

---

## 2. Correctness fixes to the vocal path

### 2a. Vibrato is computed on a non-contiguous signal (real bug)
The original filters voiced frames with `voiced = f0[pd > 0.5]` and then runs an FFT on that
array assuming uniform 10 ms spacing (`d=0.01`). But `voiced` **concatenates non-adjacent
frames** — every unvoiced gap is deleted, so the "time axis" is fictional and the resulting
vibrato frequencies are meaningless.

**Fix:** detect **contiguous voiced runs** (≥ 0.25 s each) on the original time grid, and run the
vibrato FFT within each run separately, where 10 ms spacing is real.

### 2b. Vibrato index is unnormalized → not comparable across tracks
`vibrato_index = max(fft_vals[4–8 Hz])` is a raw FFT magnitude that scales with segment length
and vocal loudness, so a value of `3.1` means nothing relative to another track's `1.4`.

**Fix:** report the **fraction of pitch-modulation power that falls in the 4–8 Hz vibrato band**,
length-weighted across voiced runs. This is bounded in `[0, 1]` and directly comparable.

### 2c. Pure-Python RMS loop (efficiency)
`vocal_density` was computed with a Python `for` loop over every 10 ms frame calling
`torch.sqrt(torch.mean(...)).item()` — thousands of tiny GPU→CPU syncs per track.

**Fix:** vectorize with `librosa.feature.rms` (C-backed, one call).

### 2d. Keep the good parts
`vocal_range_sd` (std of pitch in cents) is correct — std is invariant to the arbitrary 10 Hz
reference, so that quirk is harmless and retained. The pure-`numpy` 16 kHz resample (which
deliberately bypasses the soxr backend, per commit `dbec89b`) is kept verbatim. The explicit
`return_periodicity=True` / `batch_size=1024` CREPE call (commits `215a68f`, `bb0f448`) is kept.

---

## 3. Correctness/robustness fixes to the drum path

- **madmom processors instantiated once**, not per track (`RNNBeatProcessor` and
  `DBNBeatTrackingProcessor` were rebuilt on every call).
- **Tempo drift** and a **normalized syncopation index** are now first-class outputs (see §4),
  where before only the raw-seconds `swing_index` existed. These feed the Math Index (plan §4B).

---

## 4. New features — realizing plan §3C/§3D/§3E/§4B/§4C

Because all four stems are now in memory, the following are added at near-zero marginal cost.
Field-by-field mapping to the plan:

| Plan section | Metric | New JSON field(s) |
|---|---|---|
| §3C Bass — Low-End Power | Sub-bass (<60 Hz) ÷ mid-bass (60–250 Hz) energy | `sub_bass_ratio` |
| §3C Bass — static vs dynamic | Spectral centroid of bass stem, and its variability | `bass_centroid`, `bass_centroid_std` |
| §3D Other — Harmonic Complexity | Normalized entropy of the 12-bin chroma distribution | `harmonic_complexity` |
| §3E Cross-Stem Coherence | `1 − cos(vocal pitch-class histogram, backing chroma)` | `dissonance_index` |
| §4B The "Math Index" | `w1·syncopation + w2·tempo_drift` | `syncopation_index`, `tempo_drift`, `math_index_raw` |
| §4C Continuous Vocal Presence | Vocal-stem RMS ÷ Σ(all stems RMS) | `vocal_presence` |

Notes:
- **`vocal_presence`** is the plan's requested *continuous* spectrum (energy ratio vs the mix),
  distinct from the older threshold-based `vocal_density`. Both are kept: density answers "how
  often is there vocal energy," presence answers "how much of the mix is vocal." `0.0` ≈ pure
  instrumental, `0.5–1.0` ≈ lyrical lead (matching the plan's stated bands).
- **`dissonance_index`** is `null` when the track has effectively no voiced vocal frames, so
  instrumentals don't pollute the metric with a spurious "0."
- **`math_index_raw`** is a within-track weighted sum of raw components. Its inputs
  (`syncopation_index`, `tempo_drift`) are absolute, so the final, corpus-comparable Math Index
  should be **re-derived after z-scoring both components across the whole corpus** — do that in
  the `dh.json` build step, not here. The raw fields are stored so that re-derivation needs no
  re-analysis.

---

## 5. Operational hardening

- **Atomic cache writes:** results are written to `descriptors_stems.json.tmp` then `os.replace`d
  onto the real file, so a crash mid-write can never corrupt the cache (the old code wrote the
  full dict in place on every track).
- **Per-track isolation:** each track runs under `try/except`; a failure records
  `{"error": "..."}` for that `trackId` and the run continues instead of aborting. Errored
  tracks are retried on the next run.
- **MPS memory hygiene:** `torch.mps.empty_cache()` after each track to avoid the fragmentation
  that motivated the `batch_size` cap in commit `bb0f448`.
- **Schema version:** every record carries `"schema": 2` so downstream consumers can tell
  refined records from the original step-7 output.
- **Resumability preserved:** existing completed records are skipped; only `pending` (and prior
  errors) are processed.

---

## 6. Deliberately deferred (out of scope for this step)

These plan items need heavyweight models or belong to a different pipeline stage. They are
**not** implemented here; the script leaves clean seams for them:

- **§3A Speech Rate (Wav2Vec2/Whisper).** Requires a separate ASR model download and a words-
  per-minute alignment pass. Belongs in its own later step so the stemming loop stays light.

> **Update:** §5 stem-targeted CLAP UMAP is **no longer deferred** — per-stem CLAP embeddings are
> now extracted inside the step-7 loop (they can only be computed while the stems exist), and a
> separate `deep_step8_stem_umap.py` runs the projections. See §9.

---

## 7. Output schema (`public/data/v3/descriptors_stems.json`)

```jsonc
{
  "<trackId>": {
    "trackId": "…",
    "schema": 2,
    // drums
    "tempo_rnn": 128.0,
    "swing_index": 0.0123,          // std of onset offsets, seconds (retained)
    "syncopation_index": 0.087,     // mean |offset| / beat interval, normalized [0,~1]
    "tempo_drift": 3.4,             // std of instantaneous BPM
    // vocals
    "vocal_density": 0.41,          // fraction of frames above RMS threshold (retained)
    "vocal_presence": 0.33,         // vocal RMS / total stem RMS  [0,1]  (plan §4C)
    "vocal_range_sd": 210.5,        // std of pitch in cents
    "vibrato_index": 0.28,          // fraction of pitch-mod power in 4–8 Hz band [0,1] (fixed)
    // bass
    "sub_bass_ratio": 1.9,          // <60Hz / 60–250Hz energy
    "bass_centroid": 95.2,          // Hz
    "bass_centroid_std": 40.1,      // Hz, dynamism of the bassline
    // other (melodic/harmonic)
    "harmonic_complexity": 0.72,    // normalized chroma entropy [0,1]
    // cross-stem
    "dissonance_index": 0.14,       // 1 - cos(vocal PC hist, backing chroma); null if instrumental
    // derived
    "math_index_raw": 0.31          // w1·syncopation + w2·tempo_drift (re-normalize corpus-wide)
  }
}
```

---

## 8. Running

```bash
cd 2026-exp
.audio-work/venv/bin/python tools/deep_step7_stemmer_and_analyzer-CLAUDE.py
```

Idempotent and resumable. Reads `public/data/ALL_tracks.json`, writes
`public/data/v3/descriptors_stems.json`. No temp-stem directory is created.

---

## 9. Update — per-stem CLAP embeddings + UMAP, and the 60-second window

### 9a. Why CLAP had to move *into* the stemming loop
A CLAP embedding is `audio → vector`; it needs the actual stem waveform. The stems live in RAM
for one track at a time and are freed immediately — and separation is the entire cost
(~50 s/track in 60 s mode, see §9c). So per-stem CLAP is extracted **inside `process_track`,
while the stems exist**. Doing it later would mean re-running the whole separation pass just to
recover the audio. The marginal cost is negligible: measured **~1 s/track** for all three stems
(3 spaces × six 10 s windows, mean-pooled). Implementation mirrors `tools/embed_clap.py`
(48 kHz, 10 s windows, L2-normalize each window, mean-pool, re-normalize) using
`ClapModel("laion/larger_clap_music")` on MPS.

The three stem-isolated CLAP spaces (plan §5), written to
`public/data/v3/descriptors_stem_embeddings.json` as `{trackId: {vocals[512], groove[512], harmonic[512]}}`:

| Space | Source stem | Groups tracks by |
|---|---|---|
| `vocals` | vocals | vocal tone / delivery (whispered, high, rap, + an empty zone for instrumentals) |
| `groove` | drums | percussive style (4-on-the-floor, breakbeats, brush drumming, ambient shakers) |
| `harmonic` | bass + other | chord structure, synths, scale types |

### 9b. UMAP is a *separate*, re-runnable step — `deep_step8_stem_umap.py`
UMAP is `vector → 2-D coords`; it never touches audio, so it reads the persisted embeddings and
is cheap to re-run while you tune `n_neighbors` / `min_dist` / `metric`. **CLAP vectors are
L2-normalized ⇒ use `metric="cosine"`.** Step 8 projects all three stem spaces plus (as a
baseline) the pre-existing **mixed**-audio embeddings in `ALL_track_embeddings.json`, so the
"hairball vs. stem-separated" improvement is visible side by side. Output:
`public/data/v3/stem_umap.json` → `{trackId: {vocalXY, grooveXY, harmonicXY, mixedXY}}`,
each axis normalized to `[-1, 1]`.

> **Install note:** `umap-learn` is **not** in `.audio-work/venv` (only scikit-learn). Before
> running step 8: `.audio-work/venv/bin/pip install umap-learn`.

**Anisotropy / mean-centering (important, validated on real data).** CLAP embeddings are strongly
anisotropic — every vector shares a large common-mode component, so raw pairwise cosines run
~0.99 even between an isolated-vocal and an isolated-drum stem. Measured on the first 5 tracks:
raw cross-track cosine 0.99+, but after subtracting the per-space mean vector it spreads to
**−0.85 … +0.69**, and the three spaces' similarity *patterns* correlate only −0.06 / −0.37 /
+0.60 (i.e. they carry genuinely complementary structure, not redundant copies). Consequence:
UMAP on the raw vectors under-separates; **step 8 mean-centers each space by default** (disable
with `--no-center`). This is the single most important projection knob — more so than
`n_neighbors`/`min_dist`.

### 9c-ops. Unattended overnight execution — `tools/run_deep_step7.sh`
The full run is long, so the wrapper makes it survive an unsupervised overnight session:
- **`caffeinate -ims`** — the Mac will not idle/system-sleep mid-run.
- **Restart loop** — a hard crash (segfault / OOM-kill / power blip) exits non-zero; the wrapper
  relaunches and the script resumes from the JSON cache. Clean completion exits 0 and stops.
- **Poison-track guard** — the script writes an `.inprogress` marker naming the track it is on;
  if a restart finds that track still unfinished, it is recorded as errored and skipped, so a
  single bad file can never trap the run in an infinite restart loop.
- **Atomic writes after every track** for both output files → a crash never corrupts the cache.
- **Timestamped log** under `.audio-work/logs/` (`tail -f` to watch).

```bash
tools/run_deep_step7.sh --limit 5   # verify on 5 tracks first (done: 5/5, 0 errors)
tools/run_deep_step7.sh             # full unattended run
```

### 9c. Runtime — measured on M1, extrapolated to M5
Both the window length and CREPE de-duplication (pitch is now computed once, not twice) cut the
per-track cost. Measured on this machine (**Apple M1, 8-core GPU, 16 GB**):

| Window | Per track (M1, measured) | Full corpus 746 tracks — M1 | Full corpus — **M5** (extrapolated) |
|---|---|---|---|
| **60 s centered** (default) | **~50 s** | **~10–11 h** | **~3–4 h** |
| 300 s (full-length) | ~344 s | ~71 h | ~20–24 h |

- The M5 column is an **extrapolation, not a benchmark** — I can only measure the M1 here. It
  assumes a ~3× (conservative) to ~4× (optimistic) MPS GPU speedup for this conv-heavy Demucs
  workload across the M1→M5 span; the neural-accelerator GPU cores in M5 favor the upper end.
- The 60 s window is a **centered** excerpt (offset `(durationSec−60)/2`) so it samples the body
  of the track, not a sparse intro. Tempo/harmony are slightly less robust than full-length but
  the run is ~7× faster; the constant `MAX_SECONDS` makes this a one-line trade-off to revisit.
- The run is resumable and writes both JSON outputs atomically after every track, so an M1
  overnight run or an interrupted M5 run both pick up where they left off.
