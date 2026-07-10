// Load layout.json and resolve audio URLs against the adjacent 171days folder.
// ?audio=<base> overrides (e.g. an absolute host for a GitHub Pages mirror).
const params = new URLSearchParams(location.search)
// on the GitHub Pages mirror there is no adjacent 171days folder — stream
// straight from the repository instead
const DEFAULT_AUDIO = location.hostname.endsWith("github.io")
  ? "https://raw.githubusercontent.com/jhave/audio-hub/main/2026-site/public/audio"
  : "../171days/audio"
export const AUDIO_BASE = (params.get("audio") || DEFAULT_AUDIO).replace(/\/+$/, "")

export async function loadData() {
  const res = await fetch("data/layout.json")
  if (!res.ok) throw new Error(`layout.json: HTTP ${res.status}`)
  const data = await res.json()

  for (const t of data.tracks) {
    // manifest srcs look like /audio/<album>/<file>.mp3
    t.url = AUDIO_BASE + t.src.replace(/^\/audio/, "")
  }
  for (const a of data.albums) {
    a.coverUrl = a.cover ? AUDIO_BASE + a.cover.replace(/^\/audio/, "") : null
  }

  // stable per-album hue from title hash (later: sample the cover art)
  for (const a of data.albums) {
    let h = 0
    for (const c of a.title) h = (h * 31 + c.charCodeAt(0)) >>> 0
    a.hue = (h % 360) / 360
  }
  return data
}
