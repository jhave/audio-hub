# PLAN: Phase B — The Interactive Atlas of a Sonic Field

**Status legend:** `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` blocked/needs-decision
**Owner note:** This document is the single source of truth for building the
data-exploration website. It is written so that ANY competent model (or human)
can pick up at the first unchecked box and continue. Update the checkboxes and
the "PROGRESS LOG" at the bottom as you go. When you finish a step, check it,
add a one-line log entry with the commit hash.

---

## 0. The reframed intention (read first)

The remix/mashup portal is now **secondary** (jhave will build it later). This
iteration is a **data-informed exploration of AI-generated music topology** —
using data science, interactive UX, and ML analysis to yield *visual and
sonic insight* into a field of 746 Suno tracks made across 171 days.

The intellectual spine lives in `theoretical_undertones_for_blog.md`. The
site must let a visitor SEE and HEAR these ideas, especially the central
finding:

> **Culture heard vs culture described.** The ReRites tracks cluster tightly
> in *lyric/text* space and scatter to near-randomness in *audio* space. Two
> topologies of one archive that disagree. (Confirmed: ReRites intra-group
> cosine 0.038 vs global −0.002 in mean-centered lyric space.)

Design maxim from the undertones: **"two marching bands, not a block party."**
Clarity and legibility over density. One thing playing at a time. Insight, not
chaos.

### The four modalities the visitor asked about — RESOLVED as ONE app, four lenses

They are **merged into a single-page app** sharing one data core, one audio
engine, and one global "focused track" state. The visitor switches *lenses*;
the focused track and playback persist across lenses. The four lenses:

1. **ATLAS** (interactive map / "drifting over topology") — the centerpiece.
2. **INSPECTOR** (drill-down into one track: its fractal, curves, tags, lyrics).
3. **INDEX** (textual, sortable, filterable table — the accessible spine).
4. **READER** (the essay, with embedded playable figures).

They are not separate pages; they are panels/routes in one shell. A track
clicked in any lens becomes the global focus everywhere.

### Difficulty × priority ordering (build in this order — hardest-valuable first)

| Order | Module | Difficulty | Value | Rationale |
|------|--------|-----------|-------|-----------|
| **0** | **DH-Archive View** (`index_experience.html`, per-track fold) | **Med-High** | **Highest now** | Grafts ML insight onto the WORKING player; fastest human-readable review of the deep-analysis data; validates data before the ambitious Atlas |
| 1 | Data foundation (offline `atlas.json` + loader) | Med | Blocking | DH-View needs a slim subset; Atlas needs all |
| 2 | ATLAS map + audio engine + focus state | High | High | The immersive map; dual-topology morph |
| 3 | INSPECTOR (track fractal + curves + tags + lyrics) | High | High | Reused by lenses; the "fractal of a track" |
| 4 | INDEX (sortable/filterable table) | Low | High | Accessibility spine; fastest path to any track |
| 5 | READER (essay with embedded figures) | Med | High | Ties the argument together; needs 2–4 as widgets |
| 6 | Polish, a11y, deploy, dual-topology transitions | Med | High | Ship quality |

**Build Module 0 (DH-Archive View) FIRST** — jhave's directive. It reuses the
proven 2026-site playlist player and surfaces the ML data in human-readable
folds, which doubles as a review of Phase A2 before the larger Atlas is built.
Its neighborhood-graph needs only a slim data-foundation subset (boxes 1.1–1.3
producing 2D positions + neighbors), so do that subset first, then Module 0,
then return to the full Module 1 for the Atlas.

---

## Available data (all under `2026-exp/public/data/v2/`, committed)

Track order is canonical everywhere = order of `ALL_tracks.json` (746 tracks).
`trackId` = `"<albumFolder>::<filename.mp3>"`.

- `windows-index.json` — `{dim:512, dtype:"float16", tracks:[{trackId,offset,count}]}`.
  11,579 windows total. Also gains a `curves` block map (tempo/rms) and
  `tagsWindows` entry per the answers doc — VERIFY exact keys at build time.
- `windows.bin` — 11,579 × 512 float16 LE, L2-normalized per window. (~11.9 MB)
- `tags-tracks.json` — `{scale:400, tracks:[{trackId, scores:[75 int8]}]}`.
- `tag-probes.json` — 75 probe strings (instruments/voice/rhythm/genre/mood).
- `tags-windows.bin` — int8, 75 per window, window order matches windows.bin.
- `descriptors.json` — **list of 746**; per track: `tempo, tempoDrift,
  tempoJumps, key, keyStrength, keySegments[], modulations, onsetRate, rms,
  rmsStd, rmsMax, centroid, flatness, sections[], sectionCount, introLen,
  dropAt, bounce, melodicComplexity`.
- `curves.bin` — tempo (uint8 BPM) + rms (int8, per-track-max normalized),
  two contiguous blocks, byte offsets in windows-index `curves`.
- `suno-truth.json` — `{tracks:[{trackId, sunoId, styleTags, lyrics,
  styleWeight, weirdness, model}]}`. 668/746 matched (89.5%). Sliders verified
  93% against filename `[NNW MMS]` tags.
- `lyrics-embeddings.json` — **list of 389** `{trackId, vec:[384]}` (only
  tracks with lyrics; instrumentals absent).
- `prompt-embeddings.json` — list of 746 `{trackId, vec:[384]}`.
- `shapes.json` — `{pcaRange:R, pcaComponents:[3×512], pcaMean:[512],
  tracks:[{trackId, traj:[48 int8]=16pts×3dims, journey, spread, novelty}]}`.
  Quantized `coord = q/127*R`. This is the per-track **fractal trajectory**.

Also available (from Phase A, still in `public/data/`): `ALL_track_embeddings.json`
(746 track-mean CLAP vecs), `favorites.json` (61 starred titles),
`exemplars.json`, `exemplar-*`. The player metadata + mp3s live adjacent at
`../171days/audio/` (see `src/data.js` for the `?audio=` override; on
github.io it points at raw.githubusercontent).

### Critical data facts the implementer MUST honor

- **Raw CLAP is collapsed** (all cosines ≈ 0.99). ALWAYS mean-center +
  renormalize before any distance/layout. Findings confirm separation only
  appears post-centering. This is done offline in `build-atlas.mjs`.
- **Lyric lens covers only 389 tracks.** Instrumentals have no lyric position.
  In the lyric lens they must "go offshore" (fade/drop out) — do not fake a
  position. This ABSENCE is itself part of the story (instrumental vs sung).
- **75 probes, not 76.** Read `tag-probes.json.length` dynamically.
- Some albums have twin-generation duplicates at near-identical positions;
  keep the pair-repulsion relax step so points stay clickable.

---

## Module 0 — DH-Archive View (`index_experience.html`)  `[ ]`

**The idea (jhave, 2026-07-11):** Duplicate the working 2026 playlist player,
keep ALL its functionality, and graft the ML analysis onto it so a person can
review the deep-analysis data in human-readable form. Each track has a **fold**
— an expandable info panel the listener may open or ignore. Open, it shows
where that track sits in the topological landscape and all its analytics,
neatly arranged. "DH" = Digital Humanities: this is the scholarly reading room
for the archive, versus the immersive Atlas.

This is the FIRST thing to build. It is lower-risk (reuses proven code) and it
validates the Phase A2 data by making every field visible and playable.

### RESOLVED LAYOUT (jhave, 2026-07-11) — three columns, player untouched

The existing center player-list stays **exactly as is** (album cards, rows,
floating bottom dock). We FRAME it: add a persistent **map column on the left**
and a persistent **data column on the right**. No per-row folds, no widened
rows, no duplicated maps. Master–detail with a single shared map + single
shared data panel.

- **Left column (persistent map):** the neighborhood graph / topology. Dots:
  **grey = unplayed → gold = played → red pulse = playing**, **ring = starred**.
  A "N / 746 heard" counter; the field warms to gold as you listen (coverage
  as reward). The map is also a minimap: click a dot → center that row in the
  list; hovering a row lights its neighbors here.
- **Center column (UNCHANGED player):** current cards + rows + bottom dock,
  with only the two tiny additions below (star badge + order icon).
- **Right column (persistent data):** analytics for the **focal track**. Focal
  = the playing track by default; but if the user scrolls and **rolls over
  another track's title (or a map dot)**, the right column *previews* that
  track's data while the original keeps playing in the dock. On mouse-out it
  reverts to the playing track. (Preview = look without committing.)

### 0A. Build & data  `[ ]`
- [ ] **0.1** Duplicate the 2026-site player into an `experience` route
  (static-export → `experience/index.html`, deployed at
  `glia.ca/2026/171days/experience/`). Duplicate `ManifestClient` →
  `ExperienceClient`, `AudioLibraryClient` → `ExperienceLibraryClient`; the
  original player at `/2026/171days/` stays untouched. Wrap the (unchanged)
  library in a 3-column CSS grid: `[map] [player] [data]`. On narrow screens
  the side columns collapse (see 0.9 mobile).
- [ ] **0.2** `tools/build-dh.mjs` reads `2026-exp/public/data/v2/` +
  `atlas.json` (boxes 1.1–1.3) → `2026-site/public/data/dh.json`, per track:
  `{ trackId, i, xy:[x,y] (audio layout), neighbors:[{i,title,album,w}],
  prompt(styleTags), lyricsPresent, key,keyMode,tempo,tempoDrift,sections,
  dropAt,bounce,melodicComplexity,weirdness,styleWeight,journey,spread,
  novelty, topTags:[{probe,score}], rmsSilhouette:[~48 uint8], fav }`, plus
  corpus `points:[[x,y,albumIdx]...746]`. Target < 450 KB; copy into
  2026-site/public so the export is self-contained + archive-safe.

### 0B. Two tiny additions to the player (nothing else changes)  `[ ]`
- [ ] **0.3** **Star badge** for published/starred tracks (from
  `favorites.json`, normalized-title match): glued to the **top-left corner of
  the play button**, INSIDE the play/pause clickable hit-area (no row
  widening). Filled star = favorite; absent otherwise. Tooltip: "published by
  jhave (a favorite)."
- [ ] **0.4** **Order toggle in the bottom dock** — one icon beside the
  existing transport (like VLC's loop toggle): cycles **sequential → random →
  random-star** on click, the icon glyph changing to show the mode; hover
  tooltip names it. Wire into the existing flat-queue/auto-advance;
  random-star shuffles only starred tracks. Persist in localStorage. The dock
  is otherwise unchanged (play/pause, scrub, prev/next as they are).

### 0C. The shared map (left) + shared data (right)  `[ ]`
- [ ] **0.5** **Map** (left, Canvas/SVG): plot `points` (grey/gold by
  played-state from localStorage), the focal track as **pulsing red**, its
  `neighbors` emphasized, starred = ring, album labels faint at zoom. Framed
  on the focal neighborhood; "see whole field" toggle.
- [ ] **0.6** **Map interaction:** hover a dot → label (title + album) + a play
  affordance; clicking play → play it, **scroll the center list to center that
  row**, focal follows. Hover (no click) → right column previews that track.
- [ ] **0.7** **Row↔map link:** hovering a track title in the center list
  lights that track + its neighbors on the map AND previews its data on the
  right (playing track keeps playing). Clicking play behaves as the player
  always did, and sets focal.
- [ ] **0.8** **Data column** (right): for the focal track — title + star,
  album + date (Suno link), key/tempo/sections/modulation chips, the
  **rms-silhouette waveform** (from `rmsSilhouette`, cheap; playhead synced
  when this IS the playing track), **weirdness + styleWeight meters**, **top
  tags**, and the **prompt** (linkified). Plain-language labels throughout.
  Preview state is visually marked (e.g. subtle "previewing" tag) vs the live
  playing track.

### 0D. Mobile + ship  `[ ]`
- [ ] **0.9** **Mobile/narrow:** side columns collapse; the center player is
  primary; tapping a track's disclosure reveals map+data inline beneath that
  row (one open at a time), in a bordered card tied to the track. Same
  components, relocated.
- [ ] **0.10** Verify in preview (Range stage): star badges click-through to
  play, order icon cycles, map played-state warms, hover-preview vs playing
  focal works, scroll-center works, data correct (cross-check a `[74W 85S]`
  track's weirdness/styleWeight ≈ .74/.85). Portable build. Deploy to
  `experience/` on glia.ca + gh-pages. Tag `exp-v0.5-dh`.

**Definition of done (M0):** the unchanged player, framed by a persistent
topology map (left, warming grey→gold as you listen) and a persistent data
panel (right, showing the playing track or a hover-preview), with a star badge
on the play button and a three-state order icon in the dock. A complete,
playable, human-readable review of the ML analysis that touches none of the
player's working internals.

### Open decisions for M0 (defaults chosen)
- [!] **D5** Map layout: `audio` UMAP default; a lens toggle (audio/lyric/
  prompt) on the map is a stretch.
- [!] **D6** Resolved — NO multi-fold; single shared map + single shared data
  panel, focal = playing track, hover = preview.

---

## Module 1 — Data foundation  `[ ]`

Goal: one offline builder produces a compact `atlas.json` (+ helper indices)
that the browser loads fast (<600 KB up front), and a tiny runtime data layer.

- [ ] **1.1** `tools/build-atlas.mjs` (Node, reuse `umap-js`, `tsne-js` already
  installed). Reads `windows.bin` + `windows-index.json`, computes per-track
  **mean CLAP vector**, mean-centers across corpus, renormalizes. (Or reuse
  `ALL_track_embeddings.json` and just center it — VERIFY it matches window
  means; prefer recomputing from windows for correctness.)
- [ ] **1.2** For each of THREE embedding spaces — `audio` (746), `lyric`
  (389), `prompt` (746) — produce a 2D layout: UMAP (n_neighbors 15,
  min_dist 0.25) on cosine distance of the centered vectors. Normalize each
  layout to fit [-1,1] with preserved aspect (single global scale per layout).
  Run the existing bucketed **pair-repulsion relax** (min separation) so
  twins don't overlap. Store both raw and relaxed coords.
- [ ] **1.3** Compute **album centroids** per layout (mean of member track
  positions) and a **k-NN adjacency** (k=6) in each space's high-dim centered
  vectors → the "shipping lanes"/MST for guided tours and for drawing faint
  connective edges. Store adjacency as index pairs + cosine weight.
- [ ] **1.4** Compute a **density field** per layout (coarse grid, e.g. 96×96,
  Gaussian KDE of points) → the browser draws topographic contour lines / hill
  shading from this. Store as a small quantized grid (uint8) per layout.
- [ ] **1.5** Precompute per-track **derived scalars for coloring**, min/max
  normalized across corpus: `brightness`(centroid), `energy`(rms), `tempo`,
  `flatness`, `melodicComplexity`, `journey`, `weirdness`, `styleWeight`,
  plus categorical `key`, `keyMode`(maj/min), `model`, `albumId`,
  `isFavorite`, `hasLyrics`. These drive the color/size encodings.
- [ ] **1.6** Emit `public/data/v2/atlas.json`:
  ```
  {
    version, generatedAt, trackCount,
    tracks: [{ i, trackId, title, albumId, albumTitle, dateISO, durationSec,
               fav, hasLyrics, model, key, keyMode, styleWeight, weirdness,
               color: {brightness, energy, tempo, flatness, complexity, journey},
               src }],           // src = mp3 URL suffix under audio base
    layouts: {
      audio:  { pts:[[x,y]...746], relaxed:[[x,y]...], present:[bool...746],
                centroids:{albumId:[x,y]}, density:{w,h,grid:[uint8]} },
      lyric:  { ... present marks the 389 },
      prompt: { ... }
    },
    adjacency: { audio:[[i,j,w]...], lyric:[...], prompt:[...] },
    albums: [{ id, title, dateISO, trackIdxs:[...], color }],
    tagProbes: [...75],
    stats: { keyHistogram, tempoHistogram, modelCounts, ... }
  }
  ```
  Target < 500 KB (positions are the bulk; round coords to 3 decimals).
- [ ] **1.7** `src/atlas/data.js` runtime loader: fetch `atlas.json`; expose
  `getTrack(i)`, `layout(name)`, `audioURL(track)` (reuse `../171days/audio`
  base + `?audio=` override from existing `src/data.js`). Lazy loaders:
  `loadWindows(i)` (HTTP Range on windows.bin: `offset*512*2` bytes,
  `count*512*2` length, decode float16), `loadTagCurve(i)` (Range on
  tags-windows.bin), `loadCurves(i)` (Range on curves.bin tempo+rms blocks),
  `loadTruth(i)` (from suno-truth.json, loaded once, ~735 KB — acceptable, or
  split later). Provide a float16 decoder (manual bit unpack; do NOT rely on
  Float16Array).
- [ ] **1.8** Verify `atlas.json` in Node: 746 tracks, three layouts, lyric
  `present` sums to 389, no NaN coords, density grids in [0,255].

**Definition of done (M1):** `atlas.json` exists, loads in browser < 200 ms,
and a scratch page can plot 746 dots from the `audio` layout.

---

## Module 2 — ATLAS (the centerpiece)  `[ ]`

A legible topographic **2D map** of the sonic field (not the chaotic 3D remix
field). WebGL points for 746 tracks over KDE contour "elevation lines." One
track plays at a time. This is where "drifting over topology from hill to hill"
becomes a clean, insight-driven instrument.

**Tech:** vanilla TS + esbuild (match existing 2026-exp build). Rendering:
prefer a thin WebGL layer (regl or raw) for the point cloud + a Canvas2D
overlay for contours/labels; OR Three.js orthographic if reusing prior code.
2D is the priority — legibility first. Keep the old 3D soundscape as a
separate legacy route (`/remix`, see Module 6.7); do NOT let it block this.

### 2A. Shell + audio + focus state  `[ ]`
- [ ] **2.1** New app entry `src/atlas/main.js` + `public/index.html` (this
  BECOMES the new default; move old mashup index to `public/remix.html`).
  Top bar: title, lens switcher (Atlas / Index / Reader), a persistent
  mini-player (now-playing title + play/pause + scrub) bound to global focus.
- [ ] **2.2** Global store `src/atlas/store.js`: `focusIdx`, `isPlaying`,
  `lens` (embedding: audio|lyric|prompt), `colorBy`, `sizeBy`, `filters`,
  `hoverIdx`. Simple pub/sub; every lens subscribes. Focus + playback persist
  across lens switches.
- [ ] **2.3** Audio engine `src/atlas/audio.js` — SINGLE voice by default
  (this is not the mashup field). One `<audio>` → WebAudio gain + analyser.
  `play(i)`, `pause()`, `seek(frac)`, `onProgress`, `onEnded`. Optional
  second voice ONLY for A/B compare (Module 3.6), not ambient blending.
  Reuse range-request-friendly mp3 URLs.

### 2B. The map render  `[ ]`
- [ ] **2.4** Render 746 points from `layout(lens)` (relaxed coords). Point
  size = `sizeBy` scalar (default: `journey` — long-traveling tracks bigger);
  color = `colorBy` (default: `key` hue wheel, or `brightness` sequential).
  Favorites get a ring. Orthographic pan/zoom (wheel + drag), clamp sensible.
- [ ] **2.5** Contour "elevation" overlay from `density` grid (marching-squares
  isolines on Canvas2D, or a shader). Gives the topographic "hills = clusters"
  reading WITHOUT 3D. Subtle, behind points. Optional hill-shade tint.
- [ ] **2.6** Album labels: draw playlist names at album centroids, collision-
  avoided, fading in at zoom. Cartography-as-typography (undertones).
- [ ] **2.7** Hover: highlight point, show a small tooltip (title, album, key,
  tempo, top-3 tags from `tags-tracks`), and a 1-line "why here." Cursor
  becomes pointer.
- [ ] **2.8** Click a point → set global focus, play it (single voice), open a
  slim INSPECTOR drawer (Module 3) docked to the side; the map stays visible.
- [ ] **2.9** The **playhead as traveler**: while a track plays, draw its
  `shapes.json` trajectory (16-pt fractal) as a faint glowing path ANCHORED
  at the track's map position (small, local — "the song walking its own
  miniature territory"), with a bead advancing by playback progress. This is
  the visible link between macro-topology and micro-fractal.

### 2C. The dual-topology "money shot"  `[ ]`
- [ ] **2.10** Lens morph: switching embedding (audio↔lyric↔prompt) animates
  each point from its old to new position (eased, staggered). Instrumentals
  fade out when entering `lyric` lens (they have no position). This is THE
  demonstration of "culture heard vs described."
- [ ] **2.11** "Highlight a set" affordance: select the ReRites albums (or any
  album/tag/query) → those points glow and keep glowing across a lens morph,
  so the visitor literally watches them **gather in lyric-space and scatter in
  audio-space**. Provide a one-click "Show me the ReRites finding" button that
  scripts: highlight ReRites → morph audio→lyric → caption the cosine numbers.
- [ ] **2.12** Guided **auto-tour** (idle or "Take a tour" button): camera
  drifts album-to-album along the k-NN adjacency (audibly adjacent), plays the
  exemplar of each, floats the playlist prompt as caption. Slow, cinematic,
  legible. Any interaction hands control back (25 s). This is the calm,
  installation-friendly mode — descended from prior drift work but single-voice
  and insight-captioned.

### 2D. Controls (minimal, top-right)  `[ ]`
- [ ] **2.13** Lens selector (audio / lyric / prompt) with a one-line
  explainer each. `colorBy` selector (key, brightness, energy, tempo, tempo-
  drift, weirdness, styleWeight, model, album, journey). `sizeBy` selector.
  A search box (title/lyric/prompt substring) that dims non-matches.
- [ ] **2.14** Filter chips: has-lyrics, instrumental, favorites, by model,
  by key/mode, tempo range, date range. Filtered-out points recede (low alpha),
  not removed (keep the field's shape legible).

**Definition of done (M2):** visitor can pan/zoom a legible topographic map of
746 tracks, click any to hear it (one voice), watch its fractal trajectory
animate with playback, recolor/resize by any descriptor, morph between the
three topologies, and trigger the ReRites dual-topology demonstration.

---

## Module 3 — INSPECTOR (drill-down, the fractal of a track)  `[ ]`

A drawer/panel that fully characterizes ONE track. Reused by Atlas, Index,
Reader. Opens on focus change.

- [ ] **3.1** Header: title, album (link to Suno playlist via `suno.txt`
  data), date, duration, model, key + mode + keyStrength, tempo (+drift/jumps),
  favorite star. Play/pause + scrub bound to global audio.
- [ ] **3.2** **Tempo & loudness silhouettes**: sparklines from `curves.bin`
  (per-track Range read): tempo curve + rms curve, with `dropAt` marked and
  `sections[]` boundaries as ticks. The track's dynamic shape at a glance.
- [ ] **3.3** **Instrumentation timeline**: from `tags-windows.bin` (Range),
  a small heat-strip of the top ~8 tag probes over time ("cello enters →
  drums drop out"). Label entering/leaving instruments as captions synced to
  playhead.
- [ ] **3.4** **The fractal**: draw `shapes.json` traj (16 pts × 3 PCA dims)
  as a 2D path (PC1×PC2, PC3→color or thickness), bead follows playback.
  Show `journey`, `spread`, `novelty` as three numbers with one-line glosses.
- [ ] **3.5** **Ground truth**: `styleTags` (the prompt) and `lyrics` from
  `suno-truth`, with URLs linkified; `styleWeight` + `weirdness` shown as two
  labeled meters (and note the `[NNW MMS]` filename echo when present).
- [ ] **3.6** **Neighbors**: from adjacency, list the k nearest tracks in the
  CURRENT lens with mini play buttons — and a toggle to show the SAME track's
  neighbors in a different lens (heard-neighbors vs described-neighbors: often
  different — the finding at track scale). Optional A/B: play focus + one
  neighbor briefly to compare (the only place a 2nd voice is used).
- [ ] **3.7** "Show on map" button: closes drawer focus to the Atlas point,
  pans/zooms to it.

**Definition of done (M3):** any track opens a panel showing its curves, tag
timeline, fractal, prompt/lyrics, sliders, and lens-dependent neighbors, all
synced to playback.

---

## Module 4 — INDEX (textual, sortable, accessible spine)  `[ ]`

The fast, screen-reader-friendly entry. A virtualized table of 746 rows.

- [ ] **4.1** Columns: title, album, date, key, tempo, sectionCount, journey,
  weirdness, styleWeight, model, has-lyrics, top tag. Sortable each. Row =
  play button + title; clicking sets global focus (opens Inspector).
- [ ] **4.2** Group-by-album ("playlist playback clusters") collapsible view:
  each album as a section with its prompt, its exemplar, and a "play album"
  queue. This directly answers the "purely textual / playlist clusters" idea.
- [ ] **4.3** Full-text filter across title/prompt/lyrics; faceted filters
  shared with Atlas (Module 2.14) via the store.
- [ ] **4.4** Virtualize (only render visible rows) for smoothness. Keyboard
  nav (↑↓ to move focus, Enter to play, / to search). ARIA table semantics.

**Definition of done (M4):** a sortable/filterable/playable table + album-
cluster view, keyboard-navigable, that shares focus/playback with all lenses.

---

## Module 5 — READER (the essay with embedded playable figures)  `[ ]`

Turn `theoretical_undertones_for_blog.md` into a living essay where each claim
has a playable/visual figure.

- [ ] **5.1** Long-form layout rendering the undertones prose (markdown →
  HTML at build, or authored HTML). Editorial typography, generous measure.
- [ ] **5.2** Embeddable **figure components** (reuse Atlas/Inspector as
  widgets): (a) a mini dual-topology morph for "culture heard vs described"
  with the ReRites highlight and the cosine numbers; (b) a "fractal of a
  track" figure playing one long multi-part piece with its trajectory; (c) a
  "hyperparameters as weather" figure morphing UMAP neighbor counts (reuse the
  6 prior t-SNE/UMAP layouts if regenerated, or n_neighbors variants); (d) a
  key/tempo histogram of the whole corpus.
- [ ] **5.3** Inline **play triggers**: any track name in prose is a play
  button (sets global focus). Scrolling past a figure can gently auto-focus
  its exemplar (respect reduced-motion / no autoplay audio without gesture).
- [ ] **5.4** The "savant" open question section (from undertones) closes the
  essay, linking out to the 171days player and inviting the visitor to judge.

**Definition of done (M5):** a scrollable essay whose every argument is backed
by a playable, data-driven figure drawn from the same core.

---

## Module 6 — Polish, accessibility, deploy  `[ ]`

- [ ] **6.1** Loading: skeleton + resilient fetch (retry/backoff, never strand
  on a spinner — reuse the lesson from prior `loadDataResilient`). Atomic
  build (temp dir → swap) so a mid-build reload never serves half a site.
- [ ] **6.2** Hidden-tab resilience: logic/audio on `setInterval`, visuals on
  rAF (prior lesson — rAF freezes when hidden).
- [ ] **6.3** Accessibility: keyboard for all lenses; ARIA for table + controls;
  focus-visible rings; captions/alt for figures; `prefers-reduced-motion`
  disables morph animations & auto-tour; never autoplay audio pre-gesture.
- [ ] **6.4** Mobile/responsive: Atlas gracefully degrades (pan/zoom touch;
  contours optional); Index is the mobile-first fallback.
- [ ] **6.5** Performance budget: first paint < 600 KB; windows/tag/curve data
  strictly lazy via Range; 60 fps pan/zoom for 746 pts.
- [ ] **6.6** `npm run build:portable`-equivalent for this app (relative asset
  paths — archive-safe, per project convention). Deploy adjacency preserved:
  fetches `../171days/audio/`; github.io default → raw.githubusercontent.
- [ ] **6.7** Preserve legacy: keep the mashup soundscape at `/remix.html`
  (or a `?mode=remix` route) — jhave will extend it later. Link to it from the
  Atlas as "the remix portal (experimental)."
- [ ] **6.8** Deploy: build to `dist/`, stage via `serve-stage.mjs` (Range
  support), verify in preview, then gh-pages + glia.ca (`/2026/171exp/`).
  Tag `exp-v0.5`.
- [ ] **6.9** Update `README.md` + `theoretical_undertones_for_blog.md`
  cross-links; add a short "how the map was made" methods note.

---

## Suggested build sessions (each ends shippable)

- **Session B0** — Data-foundation subset (boxes 1.1–1.3: positions +
  neighbors) → Module 0 (DH-Archive View) complete. Ship: "the working player,
  now with stars, an order toggle, and a per-track fold that reveals each
  track's place in the landscape + all its analytics." This is the FIRST build
  and the human-readable review of the ML data.
- **Session B1** — Module 1 complete + Module 2A/2B minimal (map plots, click
  plays one voice). Ship: "you can see and hear the field."
- **Session B2** — Module 3 (Inspector) + Module 2.9 fractal playhead. Ship:
  "you can drill into any track's interior."
- **Session B3** — Module 2C dual-topology + ReRites demonstration + 2D
  controls. Ship: "the money shot works."
- **Session B4** — Module 4 (Index) + filters shared across lenses. Ship:
  "accessible + fast navigation."
- **Session B5** — Module 5 (Reader) + Module 6 polish/deploy. Ship: "the
  essay that plays; live on glia.ca."

**Begin Session B0 at box 1.1**, but scope 1.1–1.3 to just what the DH-View
neighborhood graph needs (2D positions per space + k-NN neighbors), then build
Module 0. The DH-Archive View is now the first shippable deliverable and the
review surface for the Phase A2 data. After it ships and jhave has reviewed the
data through it, proceed to the full Module 1 and the Atlas; the single
hardest, highest-value sub-parts there remain 2.9 (fractal playhead) and
2.10–2.11 (dual-topology morph + ReRites highlight).

---

## Open decisions for jhave (non-blocking; sensible defaults chosen)

- [!] **D1** Render stack: default = 2D WebGL points + Canvas2D contours (max
  legibility). Alternative = reuse Three.js 3D terrain. *Default chosen: 2D.*
- [!] **D2** Default lens on load: `audio` (what the machine hears). *Chosen.*
- [!] **D3** Default color: by `key` (musical) vs `brightness` (perceptual).
  *Chosen: key, with a prominent switch.*
- [!] **D4** Whether the Reader is the landing view or the Atlas. *Chosen:
  Atlas lands; a one-time intro card offers "Read the essay first."*

---

## PROGRESS LOG (append one line per completed box: `box — commit — note`)

- 2026-07-11 — Phase A2 data delivered & committed (grunt/Gemini); this plan written.
- (next) — 1.1 build-atlas.mjs …
