// diag-tags.mjs — diagnostic tool to find average zero-shot tag scores across all tracks.
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const HERE = path.dirname(fileURLToPath(import.meta.url))
const V2 = path.join(HERE, "../public/data/v2")

const tagsWrap = JSON.parse(fs.readFileSync(path.join(V2, "tags-tracks.json"), "utf8"))
const probes = JSON.parse(fs.readFileSync(path.join(V2, "tag-probes.json"), "utf8"))

const numTracks = tagsWrap.tracks.length
const numProbes = probes.length

// Initialize sum array
const sums = new Array(numProbes).fill(0)

for (const t of tagsWrap.tracks) {
  for (let i = 0; i < numProbes; i++) {
    sums[i] += t.scores[i]
  }
}

const averages = sums.map((s, idx) => ({
  probe: probes[idx],
  index: idx,
  average: s / numTracks
}))

// Sort by average descending
averages.sort((a, b) => b.average - a.average)

console.log("=== TOP 20 TAGS BY RAW BASELINE AVERAGE ===")
averages.slice(0, 20).forEach((a, i) => {
  console.log(`${i+1}. ${a.probe}: ${a.average.toFixed(2)}`)
})

console.log("\n=== BOTTOM 10 TAGS BY RAW BASELINE AVERAGE ===")
averages.slice(-10).reverse().forEach((a, i) => {
  console.log(`${i+1}. ${a.probe}: ${a.average.toFixed(2)}`)
})
