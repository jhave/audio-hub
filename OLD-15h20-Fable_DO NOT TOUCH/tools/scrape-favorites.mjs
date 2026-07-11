// Collect jhave's "favored" songs from suno.com: the published-songs profile
// page plus the curated "suno's greatest hits" playlist. Titles land in
// public/data/favorites.json and bias first-visit playback in the experience.
import fs from "fs/promises"

const UA = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
}

const GREATEST_HITS = "https://suno.com/playlist/efd3eb99-0ef4-4031-94a6-bd795cf813a0"
const PROFILE_SONGS = "https://suno.com/@jhave?page=songs"

async function get(url) {
  const res = await fetch(url, { headers: UA })
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  return res.text()
}

// Suno pages embed clip JSON double-escaped in the RSC payload:
// \"id\":\"<uuid>\",...\"title\":\"...\"  — unescape one level then scan.
function extractClips(html) {
  const lvl1 = html.replaceAll("\\\\", "\x00").replaceAll('\\"', '"').replaceAll("\x00", "\\")
  const clips = new Map()
  // within a clip object the title precedes: "id":"<uuid>","entity_type":"song_schema"
  const re = /"title":"((?:[^"\\]|\\.)*)",[^]{0,400}?"id":"([0-9a-f-]{36})","entity_type":"song_schema"/g
  for (const m of lvl1.matchAll(re)) {
    let title = m[1]
    try {
      title = JSON.parse(`"${m[1]}"`)
    } catch {}
    clips.set(m[2], title.trim())
  }
  return clips
}

const all = new Map()
for (const [source, url] of [
  ["greatest-hits", GREATEST_HITS],
  ["published", PROFILE_SONGS],
]) {
  try {
    const clips = extractClips(await get(url))
    for (const [id, title] of clips) {
      if (!all.has(id)) all.set(id, { id, title, sources: [] })
      all.get(id).sources.push(source)
    }
    console.log(`${source}: ${clips.size} clips`)
  } catch (e) {
    console.warn(`${source} failed:`, e.message)
  }
  await new Promise((r) => setTimeout(r, 600))
}

const out = [...all.values()]
await fs.mkdir(new URL("../public/data/", import.meta.url), { recursive: true })
await fs.writeFile(
  new URL("../public/data/favorites.json", import.meta.url),
  JSON.stringify(out, null, 1)
)
console.log(`favorites.json: ${out.length} unique songs`)
