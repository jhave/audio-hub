# Debugging Report: Inaccuracies in Groove Grid & Tempo Estimation

This report outlines the debugging process, traces the data pipeline, and provides benchmark scientific evidence for the tempo errors observed in the Groove Grid layout (e.g., *Reservoid Grace* listed at 185 BPM instead of ~92.5 BPM, and *Ulymer* listed at 103 BPM instead of ~206 BPM).

---

## 1. Pipeline Data Trace (Is the right data being used?)

To verify if the client app is displaying the correct data computed by the pipeline:
1. **Source File**: [ALL_tracks.json](file:///Users/jhave/VIBE_Coding/audio-hub/2026-exp/public/data/ALL_tracks.json) and [descriptors.json](file:///Users/jhave/VIBE_Coding/audio-hub/2026-exp/public/data/v2/descriptors.json) house the raw output of the descriptors step.
2. **Extractor Script**: [deep_step4_descriptors.py](file:///Users/jhave/VIBE_Coding/audio-hub/2026-exp/tools/deep_step4_descriptors.py#L120-L135) calculates:
   ```python
   tempo_array, beats = librosa.beat.beat_track(y=y, sr=sr)
   global_tempo = float(tempo_array.item())
   ```
3. **Packaging Script**: [build-dh.mjs](file:///Users/jhave/VIBE_Coding/audio-hub/2026-exp/tools/build-dh.mjs#L272) bundles `tempo` directly from `descriptors.json` into `dh.json`.
4. **Conclusion**: The data pipeline is functioning as designed. The inaccuracy is **not** a database mismatch or a loading bug; it is a fundamental algorithmic limitation of the machine listening library (**Librosa**) on this corpus.

---

## 2. Why the ML Pipeline Failed: The Mechanics of Octave Errors

The core of the issue lies in how `librosa.beat.beat_track` estimates tempo:
1. **Onset Strength Envelope**: It detects sudden rises in energy (transients) across frequency bands (drum hits, vocal onsets, chord attacks).
2. **Autocorrelation (Tempogram)**: It measures the self-similarity of this onset envelope over different time delays (lags). The delay with the highest repeating self-similarity becomes the estimated tempo.
3. **Octave Errors**:
   * **Double-Time Error (185 BPM instead of ~92.5 BPM)**: In tracks with highly active drum subdivisions (e.g., syncopated hi-hats, arpeggiators, or sub-bass transients), the autocorrelation detects a powerful repeating pattern at *half* the actual beat period. The algorithm mistakenly locks onto this subdivision, doubling the tempo.
   * **Half-Time Error (103 BPM instead of ~206 BPM)**: In highly fast, dense tracks, the algorithm fails to track the rapid individual attacks and instead locks onto the phrasing periodicity (e.g., snare hits on every second beat), halving the estimated tempo.

---

## 3. Scientific Benchmark Evidence

Octave errors are the most widely documented failure mode in Music Information Retrieval (MIR) beat tracking literature:
* **The "Three-Way" Ambiguity**: Human beat perception is subjective. When listening to a song, humans often tap at different metrical levels (e.g., some tap at 80 BPM, others at 160 BPM). Algorithms suffer from the same ambiguity.
* **MIREX Benchmarks**: In the annual Music Information Retrieval Evaluation eXchange (MIREX) Audio Tempo Extraction tasks, standard onset-autocorrelation models typically achieve only **50–60% accuracy** under strict evaluation metrics (which require the tempo to be within 4% of ground truth). However, when evaluated under "Type 2" metrics (which count double/half tempos as correct), their scores rise to **90%+**, proving that **octave doubling/halving constitutes nearly all of the algorithm's failures**.
* **Suno/Generative Audio Factors**: Generative models like Suno introduce phase-aligned sub-bass layers and dense synthetic textures that do not follow traditional acoustic drum transient profiles, further confusing simple onset autocorrelation templates.

---

## 4. Proposed Debugging & Resolution Steps

If we want to improve tempo estimation in a future phase, we can implement:
1. **Bounded Tempo Estimators**: Restrict the search range of the tempo estimator to human-likely zones (e.g., `start_bpm=120`, `bpm_lim=80-160`).
2. **Deep Learning Tempo Models**: Replace Librosa's onset autocorrelation with deep neural network tempo trackers such as **`demucs`** (for stem separation) followed by **`madmom`** (which uses recurrent neural networks trained specifically to predict beats, significantly reducing octave errors).
3. **Contested HUD Marking**: For now, we flag this metric inside the UI and map overlays as **Contested** to educate users about machine listening octave limits.
