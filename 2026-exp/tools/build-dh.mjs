// build-dh.mjs — slim data file for the DH-Archive View (Session B0).
// Reads Phase-A2 v2 data + track-mean CLAP embeddings, mean-centers (raw CLAP
// is collapsed — this is essential), runs UMAP -> 2D, computes k-NN neighbors,
// and folds in descriptors / suno-truth / tags / shapes / favorites / rms
// silhouette. Emits 2026-site/public/data/dh.json (self-contained, archive-safe).
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import TSNE from "tsne-js"
import { UMAP } from "umap-js"

const HERE = path.dirname(fileURLToPath(import.meta.url))
const V2 = path.join(HERE, "../public/data/v2")
const DATA = path.join(HERE, "../public/data")
const SITE = path.join(HERE, "../../2026-site/public")
const OUT = path.join(SITE, "data/dh.json")

const J = (p) => JSON.parse(fs.readFileSync(p, "utf8"))

function shortenTitle(title) {
  if (!title) return title
  if (title.length <= 57) return title
  
  // Extract bracket/parenthesis suffix at the end (e.g. [85S](1), [64W 84S], (Edit))
  const match = title.match(/(.*?)(\s*(?:\[[^\]]+\]|\([^)]+\))+(?:\(\d+\))?)$/)
  let desc = title
  let suffix = ""
  if (match) {
    desc = match[1]
    suffix = match[2]
  }
  
  // If still too long, truncate desc
  const maxDescLen = 55 - suffix.length
  if (desc.length > maxDescLen) {
    let truncated = desc.substring(0, maxDescLen - 3)
    const lastSpace = truncated.lastIndexOf(" ")
    if (lastSpace > 10) {
      truncated = truncated.substring(0, lastSpace)
    }
    desc = truncated.trim() + "…"
  }
  
  return desc + suffix
}

const tracks = J(path.join(DATA, "ALL_tracks.json"))          // canonical order, 746
const emb = J(path.join(DATA, "ALL_track_embeddings.json"))   // 512-d track-mean CLAP
const descriptors = J(path.join(V2, "descriptors.json"))      // list of 746
const shapes = J(path.join(V2, "shapes.json")).tracks
const truth = J(path.join(V2, "suno-truth.json")).tracks
const tagsWrap = J(path.join(V2, "tags-tracks.json"))
const probes = J(path.join(V2, "tag-probes.json"))
const favorites = J(path.join(DATA, "favorites.json"))
const manifest = J(path.join(SITE, "audio/albums.meta.json"))
const winIndex = J(path.join(V2, "windows-index.json"))
const curvesBin = fs.readFileSync(path.join(V2, "curves.bin"))
const lyricsEmb = J(path.join(V2, "lyrics-embeddings.json"))
const promptsEmb = J(path.join(V2, "prompt-embeddings.json"))

const N = tracks.length
const byId = (arr) => Object.fromEntries(arr.map((r) => [r.trackId, r]))
const embById = byId(emb)
const descById = byId(descriptors)
const shapeById = byId(shapes)
const truthById = byId(truth)
const tagsById = byId(tagsWrap.tracks)
const winById = byId(winIndex.tracks)
const lyrById = byId(lyricsEmb)
const prById = byId(promptsEmb)

// album index + date from manifest
const albumOrder = manifest.albums.map((a) => a.id)
const albumIdx = Object.fromEntries(albumOrder.map((id, i) => [id, i]))
const albumMeta = Object.fromEntries(
  manifest.albums.map((a) => [a.id, { title: a.title, dateISO: a.dateISO || null, prompt: a.prompt || null, description: a.subtitle || null }])
)
const srcById = {}
for (const a of manifest.albums) for (const t of a.tracks) srcById[`${a.id}::${t.filename}`] = t.src

// favorites: normalized-title set
const norm = (s) =>
  s.toLowerCase().replace(/\((\d+)\)\s*$/g, "").replace(/\[[^\]]*\]/g, "")
    .replace(/[.!?,;:'"]+/g, " ").replace(/\s+/g, " ").trim()
const favTitles = new Set(favorites.map((f) => norm(f.title)).filter(Boolean))
// favorites also carry the Suno song UUID — match against suno-truth's sunoId
// for the tracks title-normalization misses (renamed road-movie tracks etc.)
const favSunoIds = new Set(favorites.map((f) => f.id).filter(Boolean))
function isFav(t) {
  const tr = truthById[t.trackId]
  if (tr && tr.sunoId && favSunoIds.has(tr.sunoId)) return 1
  return favTitles.has(norm(t.trackTitle)) ? 1 : 0
}

// ---- mean-center + renormalize the 512-d vectors (CRITICAL) ----
const D = emb[0].vec.length
const mat = tracks.map((t) => {
  const e = embById[t.trackId]
  return e ? Float64Array.from(e.vec) : new Float64Array(D)
})
const mean = new Float64Array(D)
for (const v of mat) for (let k = 0; k < D; k++) mean[k] += v[k]
for (let k = 0; k < D; k++) mean[k] /= N
for (const v of mat) {
  let nrm = 0
  for (let k = 0; k < D; k++) { v[k] -= mean[k]; nrm += v[k] * v[k] }
  nrm = Math.sqrt(nrm) || 1
  for (let k = 0; k < D; k++) v[k] /= nrm
}

// ---- t-SNE -> 2D helper ----
function computeTSNE(matrix, metric = "euclidean", perplexity = 30, nIter = 500) {
  const model = new TSNE({
    dim: 2,
    perplexity,
    earlyExaggeration: 4.0,
    learningRate: 100.0,
    nIter,
    metric
  })
  model.init({
    data: matrix.map((v) => Array.from(v)),
    type: "dense"
  })
  model.run()
  const rawPts = model.getOutput()

  // normalize to [-1,1] preserving aspect (single global scale)
  let mnX = 1e9, mxX = -1e9, mnY = 1e9, mxY = -1e9
  for (const [x, y] of rawPts) {
    mnX = Math.min(mnX, x); mxX = Math.max(mxX, x)
    mnY = Math.min(mnY, y); mxY = Math.max(mxY, y)
  }
  const cx = (mnX + mxX) / 2, cy = (mnY + mxY) / 2
  const scale = 2 / Math.max(mxX - mnX, mxY - mnY)
  return rawPts.map(([x, y]) => [
    Math.round((x - cx) * scale * 1000) / 1000,
    Math.round((y - cy) * scale * 1000) / 1000
  ])
}

// ---- UMAP -> 2D helper ----
function computeUMAP(matrix, nNeighbors = 15, minDist = 0.25, spread = 1.2) {
  const umap = new UMAP({ nComponents: 2, nNeighbors, minDist, spread })
  const rawPts = umap.fit(matrix.map((v) => Array.from(v)))

  // normalize to [-1,1] preserving aspect (single global scale)
  let mnX = 1e9, mxX = -1e9, mnY = 1e9, mxY = -1e9
  for (const [x, y] of rawPts) {
    mnX = Math.min(mnX, x); mxX = Math.max(mxX, x)
    mnY = Math.min(mnY, y); mxY = Math.max(mxY, y)
  }
  const cx = (mnX + mxX) / 2, cy = (mnY + mxY) / 2
  const scale = 2 / Math.max(mxX - mnX, mxY - mnY)
  return rawPts.map(([x, y]) => [
    Math.round((x - cx) * scale * 1000) / 1000,
    Math.round((y - cy) * scale * 1000) / 1000
  ])
}

// ---- t-SNE & UMAP -> 2D on centered vectors (cosine) ----
console.log("running t-SNE & UMAP on 746x512 (centered)...")
const xy_tsne = computeTSNE(mat, "euclidean", 30, 500)
const xy_umap = computeUMAP(mat, 15, 0.25, 1.2)

// ---- t-SNE & UMAP -> 2D on centered text/lyrics vectors (cosine) ----
const textMat = tracks.map((t) => {
  const l = lyrById[t.trackId]
  if (l) return Float64Array.from(l.vec)
  const p = prById[t.trackId]
  if (p) return Float64Array.from(p.vec)
  return new Float64Array(D)
})
const textMean = new Float64Array(D)
for (const v of textMat) for (let k = 0; k < D; k++) textMean[k] += v[k]
for (let k = 0; k < D; k++) textMean[k] /= N
for (const v of textMat) {
  let nrm = 0
  for (let k = 0; k < D; k++) { v[k] -= textMean[k]; nrm += v[k] * v[k] }
  nrm = Math.sqrt(nrm) || 1
  for (let k = 0; k < D; k++) v[k] /= nrm
}

console.log("running t-SNE & UMAP on 746x512 text/lyrics (centered)...")
const lXy_tsne = computeTSNE(textMat, "euclidean", 30, 500)
const lXy_umap = computeUMAP(textMat, 15, 0.25, 1.2)

// ---- t-SNE & UMAP -> 2D on normalized descriptors/metrics ----
function computeMetricTSNE(keys, perplexity = 30, nIter = 500) {
  const subsetMat = tracks.map((t) => {
    const d = descById[t.trackId] || {}
    const tr = truthById[t.trackId] || {}
    const s = shapeById[t.trackId] || {}
    return keys.map(k => {
      if (k === "weirdness" || k === "styleWeight") return tr[k] ?? 0
      if (k === "journey" || k === "spread" || k === "novelty") return s[k] ?? 0
      return d[k] ?? 0
    })
  })

  const M = keys.length
  const means = new Array(M).fill(0)
  const stds = new Array(M).fill(0)

  for (let j = 0; j < M; j++) {
    let sum = 0
    for (let i = 0; i < N; i++) sum += subsetMat[i][j]
    means[j] = sum / N
  }

  for (let j = 0; j < M; j++) {
    let variance = 0
    for (let i = 0; i < N; i++) {
      const diff = subsetMat[i][j] - means[j]
      variance += diff * diff
    }
    stds[j] = Math.sqrt(variance / N) || 1
  }

  for (let i = 0; i < N; i++) {
    for (let j = 0; j < M; j++) {
      subsetMat[i][j] = (subsetMat[i][j] - means[j]) / stds[j]
    }
  }

  return computeTSNE(subsetMat, "euclidean", perplexity, nIter)
}

function computeMetricUMAP(keys, nNeighbors = 15, minDist = 0.2, spread = 1.0) {
  const subsetMat = tracks.map((t) => {
    const d = descById[t.trackId] || {}
    const tr = truthById[t.trackId] || {}
    const s = shapeById[t.trackId] || {}
    return keys.map(k => {
      if (k === "weirdness" || k === "styleWeight") return tr[k] ?? 0
      if (k === "journey" || k === "spread" || k === "novelty") return s[k] ?? 0
      return d[k] ?? 0
    })
  })

  const M = keys.length
  const means = new Array(M).fill(0)
  const stds = new Array(M).fill(0)

  for (let j = 0; j < M; j++) {
    let sum = 0
    for (let i = 0; i < N; i++) sum += subsetMat[i][j]
    means[j] = sum / N
  }

  for (let j = 0; j < M; j++) {
    let variance = 0
    for (let i = 0; i < N; i++) {
      const diff = subsetMat[i][j] - means[j]
      variance += diff * diff
    }
    stds[j] = Math.sqrt(variance / N) || 1
  }

  for (let i = 0; i < N; i++) {
    for (let j = 0; j < M; j++) {
      subsetMat[i][j] = (subsetMat[i][j] - means[j]) / stds[j]
    }
  }

  return computeUMAP(subsetMat, nNeighbors, minDist, spread)
}

const descKeys = [
  "tempo", "tempoDrift", "tempoJumps", "sectionCount", "dropAt",
  "bounce", "melodicComplexity", "modulations", "weirdness", "styleWeight",
  "journey", "spread", "novelty"
]
console.log("running t-SNE & UMAP-13 on 746x13 metrics...")
const mXy_tsne = computeMetricTSNE(descKeys, 30, 500)
const mXy_umap = computeMetricUMAP(descKeys, 15, 0.2, 1.0)

const ablated9Keys = [
  "tempo", "tempoDrift", "sectionCount", "modulations",
  "bounce", "melodicComplexity", "weirdness", "journey", "spread"
]
console.log("running t-SNE & UMAP-9 (Aesthetic) ablated metrics...")
const mAblated9Xy_tsne = computeMetricTSNE(ablated9Keys, 30, 500)
const mAblated9Xy_umap = computeMetricUMAP(ablated9Keys, 15, 0.2, 1.0)

const ablated4Keys = [
  "tempo", "bounce", "melodicComplexity", "sectionCount"
]
console.log("running t-SNE & UMAP-4 (Rhythm) ablated metrics...")
const mAblated4Xy_tsne = computeMetricTSNE(ablated4Keys, 30, 500)
const mAblated4Xy_umap = computeMetricUMAP(ablated4Keys, 15, 0.2, 1.0)


// ---- k-NN neighbors (cosine on centered vecs), k=8 ----
function neighborsOf(i, k = 8) {
  const vi = mat[i]
  const scored = []
  for (let j = 0; j < N; j++) {
    if (j === i) continue
    const vj = mat[j]
    let d = 0
    for (let t = 0; t < D; t++) d += vi[t] * vj[t]
    scored.push([d, j])
  }
  scored.sort((a, b) => b[0] - a[0])
  // compact: [index, weight] — client already has titles/albums by index
  return scored.slice(0, k).map(([w, j]) => [j, Math.round(w * 1000) / 1000])
}

// ---- rms silhouette per track from curves.bin (int8 block) ----
const rmsBase = winIndex.curves.rms.offsetBytes // bytes
function rmsSilhouette(trackId, points = 32) {
  const w = winById[trackId]
  if (!w || !w.count) return []
  const vals = []
  for (let n = 0; n < w.count; n++) vals.push(curvesBin.readInt8(rmsBase + w.offset + n))
  // downsample/resample to `points`
  const out = []
  for (let p = 0; p < points; p++) {
    const idx = Math.min(vals.length - 1, Math.floor((p / points) * vals.length))
    out.push(Math.max(0, vals[idx]))
  }
  return out
}

// ---- top tags ----
const scaleTag = tagsWrap.scale || 400
const tagMeans = new Array(probes.length).fill(0)
for (const t of tagsWrap.tracks) {
  for (let i = 0; i < probes.length; i++) {
    tagMeans[i] += t.scores[i]
  }
}
for (let i = 0; i < probes.length; i++) {
  tagMeans[i] /= tagsWrap.tracks.length
}

function topTags(trackId, k = 5) {
  const r = tagsById[trackId]
  if (!r) return []
  return r.scores
    .map((s, i) => [s - tagMeans[i], i]) // Mean-center for distinctive ranking
    .sort((a, b) => b[0] - a[0])
    .slice(0, k)
    .map(([diff, i]) => ({ probe: probes[i], score: Math.round((r.scores[i] / scaleTag) * 1000) / 1000 }))
}

// ---- read essay and faq from root ----
const essayPath = path.join(HERE, "../essay.md")
const faqPath = path.join(HERE, "../faq.md")
let essay = ""
let faq = ""
try {
  essay = fs.readFileSync(essayPath, "utf8")
} catch (e) {
  console.warn("Could not read essay.md:", e.message)
}
try {
  faq = fs.readFileSync(faqPath, "utf8")
} catch (e) {
  console.warn("Could not read faq.md:", e.message)
}

// ---- assemble ----
const out = { version: 1, generatedAt: new Date().toISOString(), trackCount: N, tagScale: scaleTag, essay, faq }
out.albums = albumOrder.map((id) => ({
  id,
  title: albumMeta[id].title,
  dateISO: albumMeta[id].dateISO,
  prompt: albumMeta[id].prompt || null,
  description: albumMeta[id].description || null
}))
out.points_tsne = tracks.map((t, i) => [xy_tsne[i][0], xy_tsne[i][1], albumIdx[t.albumId] ?? -1])
out.points_umap = tracks.map((t, i) => [xy_umap[i][0], xy_umap[i][1], albumIdx[t.albumId] ?? -1])

out.lyricPoints_tsne = tracks.map((t, i) => [lXy_tsne[i][0], lXy_tsne[i][1], albumIdx[t.albumId] ?? -1])
out.lyricPoints_umap = tracks.map((t, i) => [lXy_umap[i][0], lXy_umap[i][1], albumIdx[t.albumId] ?? -1])

out.metricPoints_tsne = tracks.map((t, i) => [mXy_tsne[i][0], mXy_tsne[i][1], albumIdx[t.albumId] ?? -1])
out.metricPoints_umap = tracks.map((t, i) => [mXy_umap[i][0], mXy_umap[i][1], albumIdx[t.albumId] ?? -1])

out.metricPointsAblated9_tsne = tracks.map((t, i) => [mAblated9Xy_tsne[i][0], mAblated9Xy_tsne[i][1], albumIdx[t.albumId] ?? -1])
out.metricPointsAblated9_umap = tracks.map((t, i) => [mAblated9Xy_umap[i][0], mAblated9Xy_umap[i][1], albumIdx[t.albumId] ?? -1])

out.metricPointsAblated4_tsne = tracks.map((t, i) => [mAblated4Xy_tsne[i][0], mAblated4Xy_tsne[i][1], albumIdx[t.albumId] ?? -1])
out.metricPointsAblated4_umap = tracks.map((t, i) => [mAblated4Xy_umap[i][0], mAblated4Xy_umap[i][1], albumIdx[t.albumId] ?? -1])

// Backwards compatibility
out.points = out.points_tsne
out.lyricPoints = out.lyricPoints_tsne
out.metricPoints = out.metricPoints_tsne
out.metricPointsAblated9 = out.metricPointsAblated9_tsne
out.metricPointsAblated4 = out.metricPointsAblated4_tsne

out.tracks = tracks.map((t, i) => {
  const d = descById[t.trackId] || {}
  const s = shapeById[t.trackId] || {}
  const tr = truthById[t.trackId] || {}
  const lyrics = tr.lyrics
  const keyMode = d.key ? (d.key.split(" ").pop() || null) : null
  return {
    i,
    trackId: t.trackId,
    title: shortenTitle(t.trackTitle),
    albumId: t.albumId,
    album: t.albumTitle,
    albumIdx: albumIdx[t.albumId] ?? -1,
    dateISO: albumMeta[t.albumId]?.dateISO || null,
    durationSec: Math.round(t.durationSec),
    src: srcById[t.trackId] || null,
    fav: isFav(t),
    xy: xy_tsne[i],
    xy_tsne: xy_tsne[i],
    xy_umap: xy_umap[i],
    neighbors: neighborsOf(i),
    key: d.key || null,
    keyMode,
    tempo: d.tempo ?? null,
    tempoDrift: d.tempoDrift ?? null,
    tempoJumps: d.tempoJumps ?? null,
    sectionCount: d.sectionCount ?? null,
    dropAt: d.dropAt ?? null,
    bounce: d.bounce ?? null,
    melodicComplexity: d.melodicComplexity ?? null,
    modulations: d.modulations ?? null,
    weirdness: tr.weirdness ?? null,
    styleWeight: tr.styleWeight ?? null,
    model: tr.model || null,
    lyricsPresent: lyrics != null && lyrics.trim() !== "" ? 1 : 0,
    prompt: tr.styleTags || null,
    journey: s.journey ?? null,
    spread: s.spread ?? null,
    novelty: s.novelty ?? null,
    topTags: topTags(t.trackId),
    rmsSilhouette: rmsSilhouette(t.trackId),
  }
})

fs.mkdirSync(path.dirname(OUT), { recursive: true })
fs.writeFileSync(OUT, JSON.stringify(out))
// slim favorites list for the vanilla playlist (stars + random-star queue)
fs.writeFileSync(path.join(SITE, "data/favs.json"), JSON.stringify(tracks.filter((t) => isFav(t)).map((t) => t.trackId)))
const kb = (fs.statSync(OUT).size / 1024) | 0
console.log(`wrote ${OUT} (${kb} KB), ${N} tracks, ${out.albums.length} albums`)
console.log(`favorites matched: ${out.tracks.filter((t) => t.fav).length}`)
console.log(`lyrics present: ${out.tracks.filter((t) => t.lyricsPresent).length}`)
