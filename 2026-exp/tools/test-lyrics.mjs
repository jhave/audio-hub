import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const HERE = path.dirname(fileURLToPath(import.meta.url))
const V2 = path.join(HERE, "../public/data/v2")

const tracks = JSON.parse(fs.readFileSync(path.join(HERE, "../public/data/ALL_tracks.json"), "utf8"))
const lyricsEmb = JSON.parse(fs.readFileSync(path.join(V2, "lyrics-embeddings.json"), "utf8"))

const promptsEmb = JSON.parse(fs.readFileSync(path.join(V2, "prompt-embeddings.json"), "utf8"))
console.log(`prompt-embeddings count: ${promptsEmb.length}`)

const prById = Object.fromEntries(promptsEmb.map(e => [e.trackId, e.vec]))
let missingPrompts = 0
for (const t of tracks) {
  if (!prById[t.trackId]) missingPrompts++
}
console.log(`Missing vectors in prompt-embeddings: ${missingPrompts}`)
