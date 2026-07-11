# ANSWERS: Deep Per-Track Analysis — review of the executor's proposal

Verdict on the overall plan: **approved as proposed**, six scripts as
listed, with the three open questions resolved below (question 1 approved
with one dtype change, question 2 approved, question 3 revised). Where
this file conflicts with PLAN-deep-audio-analysis.md, this file wins.

---

## Q1 — curves.bin binary layout: APPROVED, with one dtype change

Two contiguous blocks with offsets in the index: yes, that layout works —
the browser addresses any byte span via HTTP Range requests, and per-track
window offsets are already in `windows-index.json`, so a track's slice of
either block is computable client-side.

**One change: do NOT use float16 for the tempo block.** `Float16Array` /
`DataView.getFloat16` support is still uneven across engines, and this
project's outputs must stay archive-safe for dumb clients. BPM fits a byte
natively:

- **tempo block**: `uint8`, value = `round(BPM)` clipped to [0, 255].
  One byte per window. Precision loss (±0.5 BPM) is irrelevant for
  visualization; exact global BPM already lives in `descriptors.json`.
- **rms block**: `int8` as you proposed (scaling revised in Q3).

Add to `windows-index.json` a top-level block map, byte-addressed:

```json
"curves": {
  "tempo": { "offsetBytes": 0, "bytesPerWindow": 1, "dtype": "uint8" },
  "rms":   { "offsetBytes": TOTAL_WINDOWS, "bytesPerWindow": 1, "dtype": "int8" }
}
```

Browser math: `byteStart = block.offsetBytes + track.offset *
block.bytesPerWindow`, length `track.count * block.bytesPerWindow`.

(For `windows.bin` itself, float16 stays as specified — embedding
precision matters there, and Phase B decodes it offline/with a tiny
helper; the curves are the only data a naive client must read raw.)

**Alignment rule for both .bin files:** if a track fails ffmpeg or yields
zero windows, it MUST still appear in the index with `"count": 0` at the
correct position — array order is the contract; never silently omit.

## Q2 — PCA quantization range: APPROVED as proposed

One single global range across all three PCA dimensions combined is
correct. Per-dimension scaling would stretch PC2/PC3 to visually equal
PC1 and destroy the true aspect ratio of the corpus's variance —
trajectories would look more dramatic than they are. Keep the shared
scale; the anisotropy IS the information.

Make it symmetric and explicit: let `R = max(abs(coord))` over all tracks
and all three dims; quantize `q = round(coord / R * 127)` clipped to
[-127, 127]; store `"pcaRange": R` (single float) in `shapes.json`.
Also store the corpus PCA basis for Phase B reuse:
`"pcaComponents": [[...512 floats...] x3]` and `"pcaMean": [...512...]`
(rounded to 5 decimals; ~15 KB — include them in shapes.json).

## Q3 — rmsCurve scaling: REVISED — do not use round(rms × 127)

Librosa RMS on normalized music typically lives in ~0.02–0.35, so a ×127
scale would use only the bottom third of the byte and make quiet ambient
tracks nearly flat-line — precisely the tracks whose silhouettes matter
most in this archive. The curve's job is each track's *loudness shape*,
not absolute level:

- **Normalize per track**: `q = round(rms_window / rms_track_max * 127)`,
  clipped to [0, 127].
- **Preserve absolutes in descriptors.json**: add `rmsMax` (float, 3
  decimals) per track alongside the existing rms mean/std, so absolute
  loudness is recoverable by multiplication and tracks remain comparable.

## Notes on the rest of the proposal (no action needed beyond these)

1. **Step 3, RSC `$`-reference resolution** — good catch that `prompt`
   (lyrics) may be stored as a reference variable in the Next flight
   payload rather than inline. Resolve references within the same page's
   pushes; if a reference can't be resolved, store `"lyrics": null` and
   count it in the report — don't substitute empty string (null = unknown,
   "" = confirmed instrumental; the distinction matters for Step 5's skip
   logic).
2. **Step 2 int8 tag scale** — keep `scale: 400` recorded in BOTH
   tags-tracks.json and the windows-index entry, so no consumer ever has
   to remember it.
3. **Checkpointing** — your truncate-on-restart scheme is right; also
   fsync (or close/reopen) the bin file at each checkpoint so the
   truncation offset is trustworthy after a crash.
4. **Step 4 `introLen`** — "first beat detection" in your wording should
   be "first *sustained* beat-dense region" per the spec (a single spurious
   onset at t=0.3s must not zero out every intro); sustained = e.g. ≥ 4
   consecutive seconds with onset rate above half the track median.
5. **Verification plan** — approved as listed; put all of it in
   `.audio-work/deep-analysis-report.md` (uncommitted) per Step 7,
   including the weirdness/styleWeight ↔ filename-tag agreement rate.
