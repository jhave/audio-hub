import fs from "fs/promises"
import path from "path"
import { parseFile } from "music-metadata"

const AUDIO_ROOT = path.join(process.cwd(), "public", "audio")
const OUT_PATH = path.join(AUDIO_ROOT, "albums.meta.json")

function stripExt(name) {
  return name.replace(/\.[^/.]+$/, "")
}

function cleanAlbumTitle(folderName) {
  // remove trailing [date] chunk if present
  return folderName.replace(/\s*\[[^\]]+\]\s*$/, "").trim()
}

function extractBracketDate(folderName) {
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
  norm = norm.replace(
    /(\b[A-Za-z]+)\s+(\d+)\s*-\s*(\d+)(,)?\s+(\d{4})/i,
    "$1 $2, $5"
  )

  // handle "Nov 15 2025" -> "Nov 15, 2025"
  norm = norm.replace(/(\b[A-Za-z]+)\s+(\d+)\s+(\d{4})/i, "$1 $2, $3")

  // "Sept" -> "Sep" for JS Date parsing
  norm = norm.replace(/\bSept\b/i, "Sep")

  const d = new Date(norm)
  if (Number.isNaN(+d)) {
    return { dateLabel: raw } // keep label even if parse fails
  }

  const fmt = { month: "long", day: "numeric", year: "numeric" }
  return {
    dateLabel: d.toLocaleDateString("en-US", fmt),
    dateISO: d.toISOString().slice(0, 10),
    dateMs: +d,
  }
}

async function readWholeTxt(absPath) {
  try {
    const raw = await fs.readFile(absPath, "utf8")
    const trimmed = raw.trim()
    return trimmed || undefined
  } catch {
    return undefined
  }
}

async function readFirstLineTxt(absPath) {
  try {
    const raw = await fs.readFile(absPath, "utf8")
    const first = raw
      .split(/\r?\n/)
      .map((s) => s.trim())
      .find(Boolean)
    return first || undefined
  } catch {
    return undefined
  }
}

async function detectCover(folder) {
  const candidates = [
    "album.jpg",
    "album.jpeg",
    "album.png",
    "cover.jpg",
    "cover.jpeg",
    "cover.png",
  ]
  for (const f of candidates) {
    try {
      await fs.access(path.join(AUDIO_ROOT, folder, f))
      return `/audio/${encodeURIComponent(folder)}/${encodeURIComponent(f)}`
    } catch {}
  }
  return undefined
}

export async function genManifest() {
  // If public/audio doesn't exist, write empty manifest
  try {
    await fs.access(AUDIO_ROOT)
  } catch {
    const empty = { generatedAt: new Date().toISOString(), albums: [] }
    await fs.mkdir(AUDIO_ROOT, { recursive: true })
    await fs.writeFile(OUT_PATH, JSON.stringify(empty, null, 2), "utf8")
    console.log("Wrote empty manifest:", OUT_PATH)
    return
  }

  const entries = await fs.readdir(AUDIO_ROOT, { withFileTypes: true })
  const folders = entries.filter((e) => e.isDirectory()).map((e) => e.name)

  const albums = []

  for (const folder of folders) {
    const albumTitle = cleanAlbumTitle(folder)
    const { dateLabel, dateISO, dateMs } = extractBracketDate(folder)

    const subtitle = await readFirstLineTxt(path.join(AUDIO_ROOT, folder, "subtitle.txt"))
    const sunoUrl = await readFirstLineTxt(path.join(AUDIO_ROOT, folder, "suno.txt"))
    const prompt = await readWholeTxt(path.join(AUDIO_ROOT, folder, "prompt.txt"))
    let coverSrc = await detectCover(folder)
    let embeddedCover = null // captured from track metadata if no cover file exists

    // fs.readdir instead of glob: folder names contain glob metacharacters
    // ([dates], quotes, parens) that break pattern matching
    const dirEntries = await fs.readdir(path.join(AUDIO_ROOT, folder), { withFileTypes: true })
    const files = dirEntries
      .filter((e) => e.isFile() && /\.mp3$/i.test(e.name))
      .map((e) => path.join(AUDIO_ROOT, folder, e.name))

    files.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }))

    const tracks = []
    let totalDurationSec = 0

    for (const fp of files) {
      const filename = path.basename(fp)
      const id = `${folder}::${filename}`
      const title = stripExt(filename)
      const src = `/audio/${encodeURIComponent(folder)}/${encodeURIComponent(filename)}`

      let durationSec
      try {
        const meta = await parseFile(fp, { duration: true })
        const dur = meta?.format?.duration
        if (typeof dur === "number" && Number.isFinite(dur)) {
          durationSec = dur
          totalDurationSec += dur
        }
        if (!coverSrc && !embeddedCover) {
          const pic = meta?.common?.picture?.[0]
          if (pic?.data?.length) embeddedCover = pic
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

    // no album.jpg/png in the folder: materialize the first track's
    // embedded ID3 cover as album.jpeg so it ships with the static export
    if (!coverSrc && embeddedCover) {
      const ext = /png/i.test(embeddedCover.format || "") ? "png" : "jpeg"
      const coverFile = `album.${ext}`
      await fs.writeFile(path.join(AUDIO_ROOT, folder, coverFile), embeddedCover.data)
      coverSrc = `/audio/${encodeURIComponent(folder)}/${encodeURIComponent(coverFile)}`
      console.log(`Extracted embedded cover -> ${folder}/${coverFile}`)
    }

    albums.push({
      id: folder,
      title: albumTitle,
      subtitle,
      sunoUrl,
      prompt,
      coverSrc,
      dateLabel,
      dateISO,
      dateMs,
      tracks,
      totalDurationSec: Number.isFinite(totalDurationSec) ? totalDurationSec : undefined,
    })
  }

  // newest first by date; undated last; then alpha
  albums.sort((a, b) => {
    const am = typeof a.dateMs === "number" ? a.dateMs : -Infinity
    const bm = typeof b.dateMs === "number" ? b.dateMs : -Infinity
    if (am !== bm) return bm - am
    return String(a.title).localeCompare(String(b.title), undefined, { sensitivity: "base" })
  })

  const payload = {
    generatedAt: new Date().toISOString(),
    albums,
  }

  await fs.writeFile(OUT_PATH, JSON.stringify(payload, null, 2), "utf8")
  console.log(`Wrote manifest with ${albums.length} album(s):`)
  console.log(OUT_PATH)
}

await genManifest()