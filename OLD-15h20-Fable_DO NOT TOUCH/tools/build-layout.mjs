// Build layout.json for the 171exp soundscape:
//  1. embed every track's text (title + album + Suno style prompt) locally
//     with MiniLM (no API, cached model, fully offline after first run)
//  2. reduce to 2D with several t-SNE perplexities and UMAP neighbor counts —
//     the runtime morphs between these, so shifting hyperparameters visibly
//     reshuffles the flock-neighborhoods
//  3. flag favorites (published + greatest-hits titles) for playback bias
import fs from "fs/promises"
import path from "path"
import { fileURLToPath } from "url"

const HERE = path.dirname(fileURLToPath(import.meta.url))
const MANIFEST = path.join(HERE, "../../2026-site/public/audio/albums.meta.json")
const FAVORITES = path.join(HERE, "../public/data/favorites.json")
const OUT = path.join(HERE, "../public/data/layout.json")

const manifest = JSON.parse(await fs.readFile(MANIFEST, "utf8"))
const favorites = JSON.parse(await fs.readFile(FAVORITES, "utf8"))

function normTitle(s) {
  return s
    .toLowerCase()
    .replace(/\((\d+)\)\s*$/g, "")
    .replace(/\[[^\]]*\]/g, "")
    .replace(/[.!?,;:'"]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}
const favTitles = new Set(favorites.map((f) => normTitle(f.title)).filter(Boolean))

/* ---------- assemble track table ---------- */
const albums = []
const tracks = []
for (const a of manifest.albums) {
  const albumIdx = albums.length
  albums.push({
    id: a.id,
    title: a.title,
    date: a.dateISO || null,
    cover: a.coverSrc || null,
    prompt: a.prompt || "",
    sunoUrl: a.sunoUrl || null,
  })
  for (const t of a.tracks) {
    tracks.push({
      id: t.id,
      title: t.data.title,
      album: albumIdx,
      src: t.src,
      dur: Math.round(t.durationSec || 0),
      fav: favTitles.has(normTitle(t.data.title)) ? 1 : 0,
      text: `${t.data.title.replace(/\[[^\]]*\]/g, "").trim()}. ${a.title}. ${(a.prompt || "").slice(0, 600)}`,
    })
  }
}
console.log(`tracks: ${tracks.length}, favorites matched: ${tracks.filter((t) => t.fav).length}`)

/* ---------- embeddings (local MiniLM) ---------- */
const { pipeline } = await import("@xenova/transformers")
const embed = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2")
const vecs = []
const t0 = Date.now()
for (let i = 0; i < tracks.length; i++) {
  const out = await embed(tracks[i].text, { pooling: "mean", normalize: true })
  vecs.push(Array.from(out.data))
  if (i % 100 === 0) console.log(`embedded ${i}/${tracks.length} (${((Date.now() - t0) / 1000) | 0}s)`)
}
console.log(`embeddings done in ${((Date.now() - t0) / 1000) | 0}s, dim=${vecs[0].length}`)

/* ---------- reductions ---------- */
function normalize2d(pts) {
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9
  for (const [x, y] of pts) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x)
    minY = Math.min(minY, y); maxY = Math.max(maxY, y)
  }
  const s = 2 / Math.max(maxX - minX, maxY - minY)
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2
  return pts.map(([x, y]) => [Math.round((x - cx) * s * 1000) / 1000, Math.round((y - cy) * s * 1000) / 1000])
}

const layouts = {}

const { default: TSNE } = await import("tsne-js")
for (const perplexity of [8, 20, 45]) {
  const t = Date.now()
  const model = new TSNE({
    dim: 2, perplexity, earlyExaggeration: 4, learningRate: 150,
    nIter: 600, metric: "euclidean",
  })
  model.init({ data: vecs, type: "dense" })
  model.run()
  layouts[`tsne-${perplexity}`] = normalize2d(model.getOutputScaled())
  console.log(`tsne perplexity=${perplexity} in ${((Date.now() - t) / 1000) | 0}s`)
}

const { UMAP } = await import("umap-js")
for (const nNeighbors of [6, 15, 40]) {
  const t = Date.now()
  const umap = new UMAP({ nComponents: 2, nNeighbors, minDist: 0.25, spread: 1.2 })
  layouts[`umap-${nNeighbors}`] = normalize2d(umap.fit(vecs))
  console.log(`umap nNeighbors=${nNeighbors} in ${((Date.now() - t) / 1000) | 0}s`)
}

/* ---------- write ---------- */
const payload = {
  generatedAt: new Date().toISOString(),
  albums,
  tracks: tracks.map(({ text, ...t }) => t),
  layoutKeys: Object.keys(layouts),
  layouts,
}
await fs.writeFile(OUT, JSON.stringify(payload))
const kb = ((await fs.stat(OUT)).size / 1024) | 0
console.log(`wrote layout.json (${kb} KB) with layouts: ${Object.keys(layouts).join(", ")}`)
