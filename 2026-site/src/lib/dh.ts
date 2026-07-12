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
}
export type DHData = {
  version: number
  generatedAt: string
  trackCount: number
  tagScale: number
  essay?: string
  faq?: string
  albums: { id: string; title: string; dateISO: string | null }[]
  points: [number, number, number][] // x, y, albumIdx
  tracks: DHTrack[]
}

// Audio lives one level up from the experience page (…/171days/audio/…).
// NEXT_PUBLIC_AUDIO_BASE (github.io mirror) overrides to an absolute host.
const AUDIO_BASE = (process.env.NEXT_PUBLIC_AUDIO_BASE || "").replace(/\/+$/, "")
export function resolveSrc(src: string | null): string | undefined {
  if (!src) return undefined
  if (/^[a-z]+:\/\//i.test(src)) return src
  if (AUDIO_BASE) return `${AUDIO_BASE}${src.replace(/^\/audio/, "")}`
  return `..${src}` // "/audio/x.mp3" -> "../audio/x.mp3" (relative, archive-safe)
}

function dataURL(): string {
  // dh.json sits at …/171days/data/dh.json; the page is …/171days/experience/
  return "../data/dh.json"
}

export async function loadDH(): Promise<DHData> {
  const res = await fetch(dataURL(), { cache: "no-cache" })
  if (!res.ok) throw new Error(`dh.json HTTP ${res.status}`)
  return (await res.json()) as DHData
}
