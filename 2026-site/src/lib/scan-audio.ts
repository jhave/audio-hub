import fs from "fs/promises"
import path from "path"
import fg from "fast-glob"
import { parseFile } from "music-metadata"

export type Track = {
  id: string
  src: string
  filename: string
  data: {
    title: string
    albumId: string
    albumTitle: string
  }
  durationSec?: number
}

export type Album = {
  id: string
  title: string
  subtitle?: string
  sunoUrl?: string
  dateLabel?: string
  dateISO?: string
  dateMs?: number
  coverSrc?: string
  tracks: Track[]
  totalDurationSec?: number
}

const AUDIO_ROOT = path.join(process.cwd(), "public", "audio")

function stripExt(name: string) {
  return name.replace(/\.[^/.]+$/, "")
}

function cleanAlbumTitle(folderName: string) {
  // remove trailing [date] chunk if present
  return folderName.replace(/\s*\[[^\]]+\]\s*$/, "").trim()
}

function extractBracketDate(folderName: string): { label?: string; iso?: string; ms?: number } {
  const m = folderName.match(/\[([^\]]+)\]\s*$/)
  if (!m) return {}

  const raw = m[1].trim()

  // Normalize: remove ordinal suffixes, normalize separators
  // e.g. "Sept 3rd, 2025" -> "Sept 3, 2025"
  // e.g. "Nov 27-28, 2025" -> "Nov 27, 2025" (take first day)
  let norm = raw
    .replace(/(\d+)(st|nd|rd|th)\b/gi, "$1")
    .replace(/\s+/g, " ")
    .trim()

  // handle ranges like "Nov 27-28, 2025" or "Nov 27-28 2025"
  norm = norm.replace(/(\b[A-Za-z]+)\s+(\d+)\s*-\s*(\d+)(,)?\s+(\d{4})/i, "$1 $2, $5")

  // handle "Nov 15 2025" -> "Nov 15, 2025"
  norm = norm.replace(/(\b[A-Za-z]+)\s+(\d+)\s+(\d{4})/i, "$1 $2, $3")

  // Some people use "Sept" but JS Date prefers "Sep"
  norm = norm.replace(/\bSept\b/i, "Sep")

  const d = new Date(norm)
  if (Number.isNaN(+d)) {
    return { label: raw } // keep label even if parse fails
  }

  const fmt: Intl.DateTimeFormatOptions = { month: "long", day: "numeric", year: "numeric" }
  const label = d.toLocaleDateString("en-US", fmt)
  const iso = d.toISOString().slice(0, 10)
  const ms = +d
  return { label, iso, ms }
}

async function readSubtitleTxt(folder: string): Promise<string | undefined> {
  try {
    const p = path.join(AUDIO_ROOT, folder, "subtitle.txt")
    const raw = await fs.readFile(p, "utf8")
    const first = raw
      .split(/\r?\n/)
      .map((s) => s.trim())
      .find(Boolean)
    return first || undefined
  } catch {
    return undefined
  }
}

async function detectCover(folder: string): Promise<string | undefined> {
  // optional: album.jpg / album.png / cover.jpg / cover.png
  const candidates = ["album.jpg", "album.jpeg", "album.png", "cover.jpg", "cover.jpeg", "cover.png"]
  for (const f of candidates) {
    try {
      await fs.access(path.join(AUDIO_ROOT, folder, f))
      return `/audio/${encodeURIComponent(folder)}/${encodeURIComponent(f)}`
    } catch {}
  }
  return undefined
}

export async function scanAlbums(): Promise<Album[]> {
  // If audio folder doesn't exist, return empty
  try {
    await fs.access(AUDIO_ROOT)
  } catch {
    return []
  }

  const entries = await fs.readdir(AUDIO_ROOT, { withFileTypes: true })
  const folders = entries.filter((e) => e.isDirectory()).map((e) => e.name)

  const albums: Album[] = []

  for (const folder of folders) {
    const albumTitle = cleanAlbumTitle(folder)
    const { label: dateLabel, iso: dateISO, ms: dateMs } = extractBracketDate(folder)
    const subtitle = await readSubtitleTxt(folder)
    const coverSrc = await detectCover(folder)

    // find mp3 files
    const pattern = path.join(AUDIO_ROOT, folder, "*.mp3").replace(/\\/g, "/")
    const files = await fg(pattern, { onlyFiles: true, unique: true })

    files.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }))

    const tracks: Track[] = []
    let totalDurationSec = 0

    for (const fp of files) {
      const filename = path.basename(fp)
      const id = `${folder}::${filename}`
      const title = stripExt(filename)

      // public URL
      const src = `/audio/${encodeURIComponent(folder)}/${encodeURIComponent(filename)}`

      let durationSec: number | undefined
      try {
        const meta = await parseFile(fp, { duration: true })
        const dur = meta.format.duration
        if (typeof dur === "number" && Number.isFinite(dur)) {
          durationSec = dur
          totalDurationSec += dur
        }
      } catch {
        // ignore duration failures
      }

      tracks.push({
        id,
        src,
        filename,
        durationSec,
        data: {
          title,
          albumId: folder,
          albumTitle,
        },
      })
    }

    albums.push({
      id: folder,
      title: albumTitle,
      tracks,
      subtitle,
      coverSrc,
      dateLabel,
      dateISO,
      dateMs,
      totalDurationSec: Number.isFinite(totalDurationSec) ? totalDurationSec : undefined,
    })
  }

  // newest first if dates exist; undated go last, alphabetical
  albums.sort((a, b) => {
    const am = a.dateMs ?? -Infinity
    const bm = b.dateMs ?? -Infinity
    if (am !== bm) return bm - am
    return a.title.localeCompare(b.title, undefined, { sensitivity: "base" })
  })

  return albums
}