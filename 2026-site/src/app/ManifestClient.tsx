"use client"

import { useEffect, useState } from "react"
import AudioLibraryClient from "./AudioLibraryClient"
import type { Album } from "@/lib/scan-audio"

type Manifest = { albums: Album[] }

/* ---------------- path helpers ---------------- */

function runtimePrefix(): string {
  try {
    const p = window.location.pathname
    return p.replace(/\/index\.html?$/i, "").replace(/\/$/, "")
  } catch {
    return ""
  }
}

function withPrefix(prefix: string, p?: string): string | undefined {
  if (!p) return p
  if (/^[a-z]+:\/\//i.test(p)) return p // external URL
  if (prefix && p.startsWith(prefix + "/")) return p
  if (p.startsWith("/")) return `${prefix}${p}`
  return prefix ? `${prefix}/${p}` : p
}

// Optional external host for the mp3s (e.g. raw.githubusercontent.com on
// GitHub Pages, where the published site can't hold 2.5 GB of audio).
// Baked in at build time; empty in dev and for the glia.ca export.
const AUDIO_BASE = (process.env.NEXT_PUBLIC_AUDIO_BASE || "").replace(/\/+$/, "")

function normalizeAlbumPaths(albums: Album[], prefix: string): Album[] {
  return albums.map((a) => ({
    ...a,
    coverSrc: withPrefix(prefix, a.coverSrc),
    tracks: a.tracks.map((t) => ({
      ...t,
      src: AUDIO_BASE
        ? `${AUDIO_BASE}${t.src.replace(/^\/audio/, "")}`
        : withPrefix(prefix, t.src)!,
    })),
  }))
}

/* ---------------- stats helpers ---------------- */

function formatHMS(totalSeconds: number) {
  const s = Math.max(0, Math.round(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}h ${m}m ${sec}s`
  if (m > 0) return `${m}m ${sec.toString().padStart(2, "0")}s`
  return `${sec}s`
}

function computeHeader(albums: Album[]) {
  const dated = albums.filter((a) => typeof a.dateMs === "number")
  const totalTracks = albums.reduce((s, a) => s + a.tracks.length, 0)
  const totalDurationSec = albums.reduce(
    (s, a) => s + (a.totalDurationSec ?? 0),
    0
  )

  let range: string | null = null
  let daysSpan = 0

  if (dated.length > 0) {
    const min = new Date(Math.min(...dated.map((a) => a.dateMs!)))
    const max = new Date(Math.max(...dated.map((a) => a.dateMs!)))
    const fmt: Intl.DateTimeFormatOptions = {
      month: "long",
      day: "numeric",
      year: "numeric",
    }
    range = `${min.toLocaleDateString("en-US", fmt)} — ${max.toLocaleDateString(
      "en-US",
      fmt
    )}`
    daysSpan = Math.max(1, Math.ceil((+max - +min) / 86_400_000) + 1)
  }

  const tracksPerDay = daysSpan ? totalTracks / daysSpan : 0
  const minutesPerDay = daysSpan ? totalDurationSec / 60 / daysSpan : 0

  return {
    range,
    daysSpan,
    totalTracks,
    tracksPerDay,
    minutesPerDay,
    totalDurationLabel: formatHMS(totalDurationSec),
  }
}

/* ---------------- fetch manifest ---------------- */

async function fetchManifest(): Promise<Manifest> {
  const prefix = runtimePrefix()
  const firstSeg = prefix.match(/^\/[^/]+/)?.[0] ?? ""
  const bases = Array.from(new Set([prefix, firstSeg, ""]))

  const urls: string[] = []
  for (const b of bases) {
    urls.push(`${b}/audio/albums.meta.json`)
    urls.push(`${b}/audio/albums.meta.json?nocache=${Date.now()}`)
  }

  let lastErr: unknown = null
  for (const url of urls) {
    try {
      const res = await fetch(url, { cache: "no-cache" })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return (await res.json()) as Manifest
    } catch (e) {
      lastErr = e
      console.warn("Manifest fetch failed:", url)
    }
  }
  throw lastErr ?? new Error("Failed to fetch manifest")
}

/* ---------------- component ---------------- */

export default function ManifestClient() {
  const [albums, setAlbums] = useState<Album[] | null>(null)
  const [favIds, setFavIds] = useState<Set<string>>(new Set())
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      try {
        const data = await fetchManifest()
        const prefix = runtimePrefix()
        const list = Array.isArray(data.albums) ? data.albums : []
        setAlbums(normalizeAlbumPaths(list, prefix))
      } catch (e) {
        setErr(String(e))
      }
    })()
  }, [])

  // starred favorites (optional — playlist works without them)
  useEffect(() => {
    ;(async () => {
      const prefix = runtimePrefix()
      for (const b of Array.from(new Set([prefix, ""]))) {
        try {
          const res = await fetch(`${b}/data/favs.json`, { cache: "no-cache" })
          if (res.ok) {
            const ids = (await res.json()) as string[]
            if (Array.isArray(ids)) setFavIds(new Set(ids))
            return
          }
        } catch {}
      }
    })()
  }, [])

  if (err) {
    return (
      <div className="p-6 text-sm text-red-600">
        Failed to load manifest: {err}
      </div>
    )
  }

  if (!albums) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Loading library…
      </div>
    )
  }

  const { range, daysSpan, totalTracks, tracksPerDay, minutesPerDay, totalDurationLabel } =
    computeHeader(albums)

  const prefix = runtimePrefix()
  const sunoSrc = `${prefix}/img/suno-jhave.webp`
  const gliaSrc = `${prefix}/img/glia-bw.png`

  return (
    <>
      <header className="mb-6 text-sm text-muted-foreground">
        <div className="mb-2">
          <a href="https://glia.ca/" target="_blank" rel="noreferrer">
            <img src={gliaSrc} alt="Glia" style={{ width: "20%" }} />
          </a>
        </div>

        <div className="mb-3">
          <a href="https://suno.com/@jhave" target="_blank" rel="noreferrer">
            <img
              src={sunoSrc}
              alt="jhave on Suno"
              className="h-12 w-12 rounded-full object-cover"
            />
          </a>
        </div>

        <h1 className="text-2xl font-semibold text-black">
          {daysSpan.toLocaleString()} days (of Music Created in Suno)
        </h1>

        {range && <p className="mt-1">{range}</p>}

        <p className="mt-1">
          {daysSpan} days • {totalTracks} tracks •{" "}
          {tracksPerDay.toFixed(2)} tracks/day •{" "}
          {minutesPerDay.toFixed(1)} min/day
        </p>

        <p className="mt-1">Total duration: {totalDurationLabel}</p>
      </header>

      <AudioLibraryClient albums={albums} favIds={favIds} />
    </>
  )
}