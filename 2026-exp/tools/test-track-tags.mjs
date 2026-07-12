import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const HERE = path.dirname(fileURLToPath(import.meta.url))
const V2 = path.join(HERE, "../public/data/v2")

const tagsWrap = JSON.parse(fs.readFileSync(path.join(V2, "tags-tracks.json"), "utf8"))
const probes = JSON.parse(fs.readFileSync(path.join(V2, "tag-probes.json"), "utf8"))

const t = tagsWrap.tracks.find(x => x.trackId.includes("A Sombre Just Enough"))

if (t) {
  console.log(`=== Raw Scores for ${t.trackId} ===`)
  
  // Calculate means
  const numProbes = probes.length
  const tagMeans = new Array(numProbes).fill(0)
  for (const tr of tagsWrap.tracks) {
    for (let i = 0; i < numProbes; i++) {
      tagMeans[i] += tr.scores[i]
    }
  }
  for (let i = 0; i < numProbes; i++) {
    tagMeans[i] /= tagsWrap.tracks.length
  }

  const list = t.scores.map((s, i) => ({
    probe: probes[i],
    raw: s,
    mean: tagMeans[i],
    diff: s - tagMeans[i]
  }))

  console.log("--- TOP 10 BY MEAN-CENTERED DIFFERENCE ---")
  const byDiff = [...list].sort((a, b) => b.diff - a.diff)
  byDiff.slice(0, 10).forEach(x => {
    console.log(`${x.probe}: raw=${x.raw}, mean=${x.mean.toFixed(2)}, diff=${x.diff.toFixed(2)}`)
  })

  console.log("\n--- TOP 10 BY RAW SCORE ---")
  const byRaw = [...list].sort((a, b) => b.raw - a.raw)
  byRaw.slice(0, 10).forEach(x => {
    console.log(`${x.probe}: raw=${x.raw}, mean=${x.mean.toFixed(2)}, diff=${x.diff.toFixed(2)}`)
  })
} else {
  console.log("Track not found!")
}
