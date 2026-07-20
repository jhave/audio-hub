// DH-Archive View data types + loader for dh.json (built by 2026-exp/tools/build-dh.mjs).
export type DHTag = { probe: string; score: number }
export type DHTrack = {
  i: number
  trackId: string
  title: string
  albumId: string
  album: string
  albumIdx: number
  dateISO: string | null
  durationSec: number
  src: string | null
  fav: 0 | 1
  xy: [number, number]
  neighbors: [number, number][] // [index, weight]
  key: string | null
  keyMode: string | null
  tempo: number | null
  tempoDrift: number | null
  tempoJumps: number | null
  sectionCount: number | null
  dropAt: number | null
  bounce: number | null
  melodicComplexity: number | null
  modulations: number | null
  weirdness: number | null
  styleWeight: number | null
  model: string | null
  lyricsPresent: 0 | 1
  prompt: string | null
  journey: number | null
  spread: number | null
  novelty: number | null
  topTags: DHTag[]
  rmsSilhouette: number[]
  anomalyScore?: number
  anomalyReason?: string
}
export type DHData = {
  version: number
  generatedAt: string
  trackCount: number
  tagScale: number
  essay?: string
  faq?: string
  albums: { id: string; title: string; dateISO: string | null; prompt?: string | null; description?: string | null }[]
  points: [number, number, number][] // x, y, albumIdx
  points_tsne?: [number, number, number][]
  points_umap?: [number, number, number][]
  lyricPoints?: [number, number, number][] // lx, ly, albumIdx
  lyricPoints_tsne?: [number, number, number][]
  lyricPoints_umap?: [number, number, number][]
  metricPoints?: [number, number, number][] // mx, my, albumIdx
  metricPoints_tsne?: [number, number, number][]
  metricPoints_umap?: [number, number, number][]
  metricPointsAblated9?: [number, number, number][]
  metricPointsAblated9_tsne?: [number, number, number][]
  metricPointsAblated9_umap?: [number, number, number][]
  metricPointsAblated4?: [number, number, number][]
  metricPointsAblated4_tsne?: [number, number, number][]
  metricPointsAblated4_umap?: [number, number, number][]
  tracks: DHTrack[]
}

// Audio lives one level up from the experience page (…/171days/audio/…).
// NEXT_PUBLIC_AUDIO_BASE (github.io mirror) overrides to an absolute host.
const AUDIO_BASE = (process.env.NEXT_PUBLIC_AUDIO_BASE || "").replace(/\/+$/, "")
export function resolveSrc(src: string | null): string | undefined {
  if (!src) return undefined
  if (/^[a-z]+:\/\//i.test(src)) return src
  if (AUDIO_BASE) return `${AUDIO_BASE}${src.replace(/^\/audio/, "")}`
  if (typeof window !== "undefined") {
    const base = window.location.pathname.replace(/\/experience\/?$/, "")
    return `${base}${src}`.replace(/\/+/g, "/")
  }
  return `..${src}` // "/audio/x.mp3" -> "../audio/x.mp3" (relative, archive-safe)
}

export async function loadDH(): Promise<DHData> {
  const candidates: string[] = []

  if (typeof window !== "undefined") {
    const base = window.location.pathname.replace(/\/experience\/?$/, "")
    const absoluteSubpath = `${base}/data/dh.json`.replace(/\/+/g, "/")
    candidates.push(absoluteSubpath)
  }
  candidates.push("../data/dh.json")
  candidates.push("./data/dh.json")
  candidates.push("/data/dh.json")

  let lastError: Error | null = null
  for (const url of candidates) {
    try {
      const res = await fetch(url, { cache: "no-cache" })
      if (res.ok) {
        return (await res.json()) as DHData
      }
    } catch (e: any) {
      lastError = e
    }
  }

  throw new Error(`Failed to load dh.json after trying candidates: ${candidates.join(", ")}. Last error: ${lastError?.message}`)
}
