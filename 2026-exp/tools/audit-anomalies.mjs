import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const HERE = path.dirname(fileURLToPath(import.meta.url))
const DH_JSON_PATH = path.join(HERE, "../../2026-site/public/data/dh.json")
const REPORT_PATH = path.join(HERE, "../anomaly_report.md")

if (!fs.existsSync(DH_JSON_PATH)) {
  console.error(`Error: Could not find dh.json at ${DH_JSON_PATH}`)
  process.exit(1)
}

const data = JSON.parse(fs.readFileSync(DH_JSON_PATH, "utf8"))
const tracks = data.tracks
const pts = data.points_tsne || data.points // Use t-SNE as reference space for neighborhood checking
const N = tracks.length

console.log(`Auditing ${N} tracks for topological metric anomalies...`)

// Helper: Calculate 2D Euclidean distance
function dist2D(p1, p2) {
  return Math.sqrt((p1[0] - p2[0]) ** 2 + (p1[1] - p2[1]) ** 2)
}

// Find k-nearest neighbors in t-SNE space
function findNeighbors(index, k = 8) {
  const pIdx = pts[index]
  const scored = []
  for (let i = 0; i < N; i++) {
    if (i === index) continue
    const d = dist2D(pIdx, pts[i])
    scored.push({ index: i, dist: d })
  }
  scored.sort((a, b) => a.dist - b.dist)
  return scored.slice(0, k)
}

const anomalies = []

for (let i = 0; i < N; i++) {
  const track = tracks[i]
  const neighbors = findNeighbors(i, 8)
  
  // Calculate average neighbor metrics
  let sumTempo = 0, countTempo = 0
  let sumBounce = 0, countBounce = 0
  let sumComplexity = 0, countComplexity = 0
  
  for (const n of neighbors) {
    const nt = tracks[n.index]
    if (nt.tempo != null) {
      sumTempo += nt.tempo
      countTempo++
    }
    if (nt.bounce != null) {
      sumBounce += nt.bounce
      countBounce++
    }
    if (nt.melodicComplexity != null) {
      sumComplexity += nt.melodicComplexity
      countComplexity++
    }
  }
  
  const avgTempo = countTempo > 0 ? sumTempo / countTempo : null
  const avgBounce = countBounce > 0 ? sumBounce / countBounce : null
  const avgComplexity = countComplexity > 0 ? sumComplexity / countComplexity : null
  
  let tempoDiff = 0
  let bounceDiff = 0
  let complexityDiff = 0
  const reasons = []
  
  if (track.tempo != null && avgTempo != null) {
    tempoDiff = Math.abs(track.tempo - avgTempo)
    if (tempoDiff > 40) {
      reasons.push(`BPM is ${Math.round(track.tempo)} but neighbors average ${Math.round(avgTempo)}`)
    }
  }
  
  if (track.bounce != null && avgBounce != null) {
    bounceDiff = Math.abs(track.bounce - avgBounce)
    if (bounceDiff > 0.35) {
      reasons.push(`Bounce is ${track.bounce.toFixed(2)} but neighbors average ${avgBounce.toFixed(2)}`)
    }
  }
  
  if (track.melodicComplexity != null && avgComplexity != null) {
    complexityDiff = Math.abs(track.melodicComplexity - avgComplexity)
    if (complexityDiff > 0.3) {
      reasons.push(`Complexity is ${track.melodicComplexity.toFixed(2)} but neighbors average ${avgComplexity.toFixed(2)}`)
    }
  }
  
  // Normalize differences to compute overall anomaly score
  // Tempo scale: max diff ~ 140 bpm
  // Bounce scale: max diff ~ 1.0
  // Complexity scale: max diff ~ 1.0
  const score = Math.min(1.0, (tempoDiff / 140) * 0.4 + (bounceDiff / 1.0) * 0.3 + (complexityDiff / 1.0) * 0.3)
  
  if (score > 0.15 && reasons.length > 0) {
    track.anomalyScore = score
    track.anomalyReason = reasons.join("; ")
    anomalies.push({
      index: i,
      title: track.title,
      album: track.album,
      score,
      reason: track.anomalyReason,
      tempo: track.tempo,
      avgTempo,
      bounce: track.bounce,
      avgBounce
    })
  } else {
    // Clear previous anomaly stats if any
    delete track.anomalyScore
    delete track.anomalyReason
  }
}

// Sort flagged anomalies by score descending
anomalies.sort((a, b) => b.score - a.score)

// Write updated dh.json back
fs.writeFileSync(DH_JSON_PATH, JSON.stringify(data), "utf8")
console.log(`Updated dh.json with anomaly scores. Flagged ${anomalies.length} tracks.`)

// Write Markdown report
let report = `# Topological Anomaly & Outlier Report\n\n`
report += `This report outlines tracks in the 171-day archive whose extracted musical descriptors (tempo, bounce, melodic complexity) deviate significantly from their spatial neighbors in the CLAP Timbre t-SNE space.\n\n`
report += `Total Tracks Flagged: **${anomalies.length}** / ${N}\n\n`
report += `| Rank | Track Name | Album | Score | Diagnostic Reason |\n`
report += `|---|---|---|---|---|\n`

for (let r = 0; r < anomalies.length; r++) {
  const a = anomalies[r]
  report += `| ${r + 1} | **${a.title}** | *${a.album}* | **${(a.score * 100).toFixed(0)}%** | ${a.reason} |\n`
}

fs.writeFileSync(REPORT_PATH, report, "utf8")
console.log(`Saved markdown anomaly report to ${REPORT_PATH}`)
