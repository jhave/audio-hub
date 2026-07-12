import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const HERE = path.dirname(fileURLToPath(import.meta.url))
const json = JSON.parse(fs.readFileSync(path.join(HERE, "../../2026-site/public/data/dh.json"), "utf8"))

const t1 = json.tracks.find(t => t.title.includes("Beloved One Miss you Issue."))
const t2 = json.tracks.find(t => t.title.includes("Doubt Manifesto 1"))

if (t1) {
  console.log(`=== Tags for ${t1.title} ===`)
  console.log(t1.topTags.map(t => `${t.probe} (${t.score})`).join(", "))
}
if (t2) {
  console.log(`=== Tags for ${t2.title} ===`)
  console.log(t2.topTags.map(t => `${t.probe} (${t.score})`).join(", "))
}
