# 171exp — a navigable soundscape

An isometric 3D landscape grown from 171 days of Suno music. The terrain is
the kernel density of the tracks' embedding layout — style-clusters are
literally hills. Tracks are pulsing spheres; the golden **nexus** crossfades
the nearest songs as it moves, so traveling the land *is* the remix.

## Design

- **Topology slider** morphs between six precomputed layouts (t-SNE
  perplexity 8/20/45, UMAP neighbors 6/15/40). Shifting hyperparameters
  visibly redistributes the flock-neighborhoods.
- **Chaos** scales simultaneous voices (1–4), random in-track seek offsets,
  and the temperature of the auto-flight wandering.
- **Auto-flight**: when idle (or in auto mode) the nexus drifts song to song.
  Published/greatest-hits favorites glow brighter and are ~3.5× more likely
  to be visited first in a region.
- Click a sphere to travel to it; click the ground to listen *between* songs.

## Adjacency (no audio duplication)

The app fetches everything from `../171days/audio/` — deploy `dist/` as a
sibling of the player:

    glia.ca/2026/171days/   (the audio player + all mp3s)
    glia.ca/2026/171exp/    (this experience — ~1 MB)

Override the audio location with `?audio=<base>` (e.g. an absolute URL for a
GitHub Pages mirror).

## Commands

    npm run data:favorites   # scrape published + greatest-hits titles from suno.com
    npm run data:layout      # local MiniLM embeddings -> 6 t-SNE/UMAP layouts
    npm run build            # bundle to dist/
    npm run stage            # offline server: /2026/171days/audio + /2026/171exp

The data pipeline runs entirely on this machine (transformers.js, no API).
The runtime is pure static files — no network needed beyond the audio folder.

## Offline installation (e.g. gallery / lecture)

Copy the repo (or just `2026-exp/dist`, `2026-exp/tools/serve-stage.mjs`, and
`2026-site/public/audio`) to any machine with node and run:

    node 2026-exp/tools/serve-stage.mjs

Then open http://localhost:3210/ fullscreen. Query params: `?mode=wander`
starts in manual mode; default is auto-flight.
