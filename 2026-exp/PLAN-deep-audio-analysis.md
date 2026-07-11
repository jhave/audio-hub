# PLAN: Deep Per-Track Analysis (Grunt-Work Spec, Phase A2)

**Audience:** an executor (proficient LLM or human) doing data extraction
ONLY. No design decisions. Follow the spec, run the checks, deliver the
files. Layout/interface work (Phase B) happens elsewhere and is not yours.

**Motivation:** the first pipeline mean-pooled each track's 10-second CLAP
windows into a single vector, discarding the track's internal journey
(intros, drops, modulations, tempo drift). This pass retains the windows,
adds musically-informed descriptors (key, tempo curves, structure), scrapes
ground-truth lyrics + per-track prompts + generation sliders from suno.com,
and produces zero-shot instrumentation/mood tags — all sized to run on a
MacBook (CPU) in a few hours total, and all packaged so a browser can use
it without drowning.

**Hard rules (same as Phase A):**
- Work in `2026-exp/`. Do NOT modify `2026-exp/src/` or anything in
  `2026-site/`. Intermediates go in `2026-exp/.audio-work/` (gitignored).
- Commit ONLY the deliverables listed at the end. No wavs, no model caches.
- Reuse the existing venv (`2026-exp/.audio-work/venv`) and the existing
  track list `public/data/ALL_tracks.json` (746 tracks, canonical order —
  every output must align to this order).
- All fetches to suno.com: browser User-Agent, ≥0.5 s delay between
  requests, retry once on failure, log failures and continue.

Estimated total runtime on Apple-silicon CPU: **~2.5–4 h** (Step 1 is the
long pole; Steps 2–6 are minutes each; Step 3 is network-bound ~15 min).

---

## Step 1 — Window-level CLAP embeddings (retain, don't pool)

Re-run CLAP over ALL 746 **full tracks** (mono 48 kHz, same ffmpeg pattern
as before, temp wav deleted per track), 10-second windows, hop 10 s — but
this time **save every window vector**, L2-normalized, in float16 binary.

Output A: `public/data/v2/windows.bin` — all window vectors concatenated
in track order, each 512 × float16 little-endian.
Output B: `public/data/v2/windows-index.json`:

```json
{ "dim": 512, "dtype": "float16",
  "tracks": [ { "trackId": "...", "offset": 0, "count": 14 }, ... ] }
```

`offset` = index of the track's first window (in vectors, not bytes).
Windows shorter than 3 s are dropped (as before). Expect roughly 11–15k
windows total (~12–16 MB binary).

Note for the writer: numpy `arr.astype(np.float16).tobytes()` appended to
one open file handle; build the index as you go; checkpoint every 25
tracks by also writing a `progress.json` in `.audio-work/` (binary appends
are restart-unsafe — on restart, truncate to the last checkpointed offset).

**Check 1:** file size == total_window_count × 512 × 2 bytes; reload three
random tracks' windows, confirm each vector's norm ≈ 1.0 ± 0.01; index
track count == 746 (minus any logged ffmpeg failures, which must be listed).

## Step 2 — Zero-shot tag scores from the same windows (nearly free)

Using the SAME ClapModel, embed the text probe list below once with
`model.get_text_features` (prefix each probe with `"the sound of "`),
L2-normalize. Then every window's tag scores = dot products against the
window vectors from Step 1. **No additional audio processing.**

Probe vocabulary (76 probes — keep ids stable, order = this list):

instruments: piano, acoustic guitar, electric guitar, cello, violin, harp,
sousaphone/brass, flute, saxophone, drum kit, 808 sub-bass, synthesizer pad,
plucked strings, sitar, oud, kalimba, marimba, church organ, accordion,
music box, tape hiss and vinyl crackle, field recordings
voice: male vocals, female vocals, choir, whispered vocals, spoken word,
vocalese without words, rap vocals, no vocals instrumental
rhythm: four-on-the-floor kick drum, breakbeat, syncopated rhythm,
half-time groove, rubato free tempo, driving fast tempo, slow ambient pulse,
glitchy stuttering rhythm
genre/texture: ambient drone, folktronica, jazz improvisation, techno,
shoegaze wall of sound, trap hi-hats, orchestral strings, chamber music,
lo-fi bedroom production, psychedelic rock, dub reggae, thrash metal,
new age meditation, musique concrete, chiptune, gospel, tango, bossa nova,
gamelan, west african percussion, celtic folk, drone metal, idm braindance,
vaporwave, post-rock crescendo
mood/dynamics: gentle and intimate, euphoric and soaring, melancholy,
aggressive and distorted, playful and quirky, solemn and sacred, tense
and anxious, warm and cozy, cold and austere, triumphant, mysterious,
danceable groove

Outputs:
- `public/data/v2/tag-probes.json` — the probe strings in order.
- `public/data/v2/tags-tracks.json` — per track: mean score per probe
  across its windows, **as int8**: `round((score - 0) * 400)` clipped to
  [-127, 127] (CLAP audio-text cosines are small; this scale preserves
  resolution). Schema: `{ "scale": 400, "tracks": [ { "trackId": ...,
  "scores": [ ...76 ints... ] }, ... ] }`.
- `public/data/v2/tags-windows.bin` + entry `"tagsWindows"` appended into
  `windows-index.json`: per-window scores, int8, same scale, 76 per window,
  same ordering as windows.bin (for temporal instrumentation curves).

**Check 2:** spot-audit 5 tracks you can reason about from titles: e.g. a
track titled with "cello" should rank cello probes high; a "no vocal"
title should rank "no vocals instrumental" above vocal probes. Print the
top-5 probes for 10 random tracks into the report (Step 7).

## Step 3 — Scrape ground truth from suno.com (lyrics, prompts, sliders)

DO NOT transcribe audio. Suno song pages contain, double-escaped in the
RSC payload (unescape one level: `\\\\`→NUL, `\\"`→`"`, NUL→`\\`, then
regex as JSON strings):
- `"tags"` — the per-track style prompt
- `"prompt"` — the LYRICS (empty for instrumentals)
- `"control_sliders":{"style_weight":0.84,"weirdness_constraint":0.54}`
- `"gpt_description_prompt"` — sometimes present (description mode)
- `"duration"`, `"model_name"` (e.g. chirp-fenix = v5.5-era)

Procedure:
1. For each of the 56 albums, read `suno.txt` in its folder under
   `../2026-site/public/audio/<albumId>/` → playlist URL. Fetch the
   playlist page; extract ALL clip entries: title + song id (pattern:
   `"title":"..."` followed within ~400 chars by
   `"id":"<uuid>","entity_type":"song_schema"`). Playlists SSR ~20 clips;
   also fetch `?page=2`, `?page=3` while new ids keep appearing.
2. Match local tracks to clips **within the same album's playlist** by
   normalized title (normalization as in Phase A). For locally-renamed
   tracks (no title match), leave unmatched — do NOT guess across albums.
3. Fetch each matched song page (one per unique id; cache raw payload
   fields in `.audio-work/suno-cache/<id>.json` so reruns are free).
4. Output `public/data/v2/suno-truth.json`, aligned to ALL_tracks order:

```json
{ "tracks": [ { "trackId": "...", "sunoId": "uuid-or-null",
    "styleTags": "...", "lyrics": "...", "styleWeight": 0.84,
    "weirdness": 0.54, "model": "chirp-fenix" }, ... ] }
```

Unmatched tracks get `"sunoId": null` and null fields.

**Check 3:** report match rate (expect ≥ 75%; the road-movie renames in
'more intimate than intimate' and similar will miss — that's fine). Verify
sliders: for ≥20 tracks whose filenames carry `[NNW MMS]` tags, confirm
`weirdness≈NN/100` and `styleWeight≈MM/100`; report the agreement rate —
this is a delightful ground-truth cross-check.

## Step 4 — Musically-informed descriptors (librosa, per track)

Load each full track at 22 050 Hz mono (librosa). Compute and store per
track (all floats rounded to 3 decimals):

- **tempo**: global BPM; **tempoCurve**: `librosa.feature.tempo(...,
  aggregate=None)` downsampled to one value per 10 s (align with windows);
  **tempoDrift** = std of curve; **tempoJumps** = count of adjacent-curve
  changes > 10 BPM.
- **key**: global estimate via chroma (CQT) averaged, correlated against
  the 24 Krumhansl-Schmuckler major/minor profiles → e.g. `"F# minor"` +
  `keyStrength` (correlation). **keySegments**: same estimate per 30 s
  segment; **modulations** = count of segment-to-segment key changes.
- **onsetRate**, **rms** mean + std, **spectralCentroid** mean,
  **flatness** mean (as before, but full-track).
- **structure**: build a beat-synchronous self-similarity matrix from
  MFCC+chroma stacks; novelty curve via checkerboard kernel; peaks →
  section boundaries. Store `sections` (boundary times, seconds),
  `sectionCount`, `introLen` (time until first boundary OR first sustained
  beat-dense region, whichever is earlier), `dropAt` (time of the largest
  positive RMS jump between adjacent 5 s frames, if jump > 1.5× track RMS
  std, else null).
- **bounce**: beat-synchronous low-band (< 150 Hz) RMS periodicity — the
  autocorrelation peak height of the low-band envelope at the beat period
  (0..1). **melodicComplexity**: entropy of the chroma-class transition
  matrix (12×12, row-normalized), 0..1 scaled.

Output `public/data/v2/descriptors.json` aligned to ALL_tracks order, plus
`public/data/v2/curves.bin` + index entries for tempoCurve and a 1-per-10s
int8 RMS curve (loudness silhouette), same window alignment as Step 1.

**Check 4:** keys distribute across ≥ 12 distinct values (not all C major
— if they collapse, the chroma averaging is broken); tempos 40–220;
sectionCount median between 3 and 12; spot-check `dropAt` on 3 tracks with
"drop"-like titles by listening or by RMS plot saved to `.audio-work/`.

## Step 5 — Text embeddings of lyrics and per-track prompts

Using the existing Node MiniLM pipeline pattern (`tools/build-layout.mjs`
shows the idiom; @xenova/transformers, all-MiniLM-L6-v2, mean pooling,
normalized):
- `public/data/v2/lyrics-embeddings.json` — 384-d vector per track with
  non-empty lyrics from Step 3 (store trackId + vec; skip instrumentals).
- `public/data/v2/prompt-embeddings.json` — 384-d vector per track from
  `styleTags` (fall back to the album's prompt.txt when unmatched).

Round to 5 decimals. **Check 5:** counts reported; no NaNs; lyric-space
sanity: the ReRites tracks (11 albums) should show HIGH mutual similarity
here (they share 2017 lyric sources) — report their mean intra-group vs
global cosine after mean-centering. This is the counterpart to the audio
finding and is expected to flip.

## Step 6 — Track-shape signatures (the fractal, browser-sized)

From Step 1 windows, per track (numpy only):
- Mean-center all windows globally (subtract the grand mean of all windows
  in the corpus, renormalize — this is essential, raw CLAP is collapsed).
- **trajectory**: project the track's centered windows onto the corpus's
  top-3 PCA components; resample to exactly 16 points (linear interp);
  quantize each coord to int8 over the global range.
- **journeyLength**: sum of consecutive-window distances (how far the
  track travels); **spread**: mean distance from the track's own centroid
  (how varied it is); **noveltyCount**: peaks in consecutive-window
  distance above (mean + 2σ) — the track's internal "scene changes".

Output `public/data/v2/shapes.json`: `{ "pcaRange": ..., "tracks": [
{ "trackId":..., "traj": [...48 ints...], "journey": ..., "spread": ...,
"novelty": ... } ] }` (~150 KB total).

**Check 6:** the corpus's highest-`spread` tracks should skew toward long
multi-part pieces; report the top and bottom 5 by journeyLength with titles.

## Step 7 — Findings report

`.audio-work/deep-analysis-report.md` (NOT committed): match rates, check
results, slider cross-check agreement, 10 random tracks' top tags, ReRites
lyric-space vs audio-space numbers, any failures. Plus one summary
paragraph: what, in your reading, the richest surprising structure is.

---

## Deliverables (commit exactly these; everything else stays local)

```
public/data/v2/windows.bin              (~12–16 MB, float16)
public/data/v2/windows-index.json
public/data/v2/tags-windows.bin        (int8)
public/data/v2/tag-probes.json
public/data/v2/tags-tracks.json
public/data/v2/suno-truth.json
public/data/v2/descriptors.json
public/data/v2/curves.bin
public/data/v2/lyrics-embeddings.json
public/data/v2/prompt-embeddings.json
public/data/v2/shapes.json
tools/  (the scripts you wrote, one per step, named deep_step1_windows.py etc.)
```

Binary + index (not JSON) for anything per-window: the browser will
lazy-load individual tracks' windows via HTTP Range requests against
windows.bin — that is how the fractal stays walkable without bogging
down load time. Nothing in the app loads more than ~600 KB up front.

## Context only — what Phase B does with this (not your job)

Three morphable topologies (audio / lyrics / prompt) over the archipelago;
island climates from descriptors (tempo→pulse, centroid→hue, rms→light,
flatness→haze); a track's 16-point trajectory drawn as a glowing path when
it plays, the playhead traveling its own miniature territory; zero-shot
tag curves as captions ("cello enters… drums drop out"); drops and
modulations as visible landmarks; and the weirdness/style-weight sliders
from Suno as a scatter overlay — the artist's hand, measured.
