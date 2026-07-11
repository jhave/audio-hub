import fs from "fs/promises"
import path from "path"
import { fileURLToPath } from "url"

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(HERE, "..")
const SUNO_TRUTH_PATH = path.join(ROOT, "public/data/v2/suno-truth.json")
const TRACKS_JSON_PATH = path.join(ROOT, "public/data/ALL_tracks.json")
const LYRICS_OUT = path.join(ROOT, "public/data/v2/lyrics-embeddings.json")
const PROMPT_OUT = path.join(ROOT, "public/data/v2/prompt-embeddings.json")

async function main() {
  // Load HF model pipeline
  console.log("Loading MiniLM model...")
  const { pipeline } = await import("@xenova/transformers")
  const embed = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2")
  
  // Load data
  const tracks = JSON.parse(await fs.readFile(TRACKS_JSON_PATH, "utf8"))
  const sunoTruth = JSON.parse(await fs.readFile(SUNO_TRUTH_PATH, "utf8"))
  
  // Map trackId -> suno truth info
  const truthMap = {}
  for (const t of sunoTruth.tracks) {
    truthMap[t.trackId] = t
  }
  
  const lyricsEmbeddings = []
  const promptEmbeddings = []
  
  const total = tracks.length
  console.log(`Embedding text features for ${total} tracks...`)
  
  for (let i = 0; i < total; i++) {
    const track = tracks[i]
    const trackId = track.trackId
    const tInfo = truthMap[trackId] || {}
    
    // 1. Embed lyrics if non-empty
    const lyrics = tInfo.lyrics
    if (lyrics && lyrics.trim().length > 0) {
      console.log(`[${i+1}/${total}] Embedding lyrics for ${trackId}...`)
      try {
        const out = await embed(lyrics, { pooling: "mean", normalize: true })
        const vec = Array.from(out.data).map(x => Math.round(x * 100000) / 100000)
        lyricsEmbeddings.push({ trackId, vec })
      } catch (e) {
        console.error(`  Failed to embed lyrics for ${trackId}:`, e)
      }
    }
    
    // 2. Embed prompt (styleTags or fallback to album prompt.txt)
    let promptText = tInfo.styleTags
    if (!promptText || promptText.trim().length === 0) {
      // Fallback: read album prompt.txt
      const albumId = track.albumId
      const promptTxtPath = path.join(ROOT, "..", "2026-site/public/audio", albumId, "prompt.txt")
      try {
        promptText = await fs.readFile(promptTxtPath, "utf8")
        promptText = promptText.trim()
      } catch (e) {
        // Fallback to empty string if file doesn't exist
        promptText = ""
      }
    }
    
    console.log(`[${i+1}/${total}] Embedding prompt for ${trackId} (length=${promptText.length})...`)
    try {
      // If promptText is empty, embed a space to prevent empty input error
      const textToEmbed = promptText.trim().length > 0 ? promptText : " "
      const out = await embed(textToEmbed, { pooling: "mean", normalize: true })
      const vec = Array.from(out.data).map(x => Math.round(x * 100000) / 100000)
      promptEmbeddings.push({ trackId, vec })
    } catch (e) {
      console.error(`  Failed to embed prompt for ${trackId}:`, e)
      // Save zero vector as placeholder in case of error to maintain index alignment
      promptEmbeddings.push({ trackId, vec: Array(384).fill(0.0) })
    }
  }
  
  // Save results
  await fs.writeFile(LYRICS_OUT, JSON.stringify(lyricsEmbeddings, null, 2))
  await fs.writeFile(PROMPT_OUT, JSON.stringify(promptEmbeddings, null, 2))
  
  console.log(`Saved ${lyricsEmbeddings.length} lyrics embeddings to ${LYRICS_OUT}`)
  console.log(`Saved ${promptEmbeddings.length} prompt embeddings to ${PROMPT_OUT}`)
  console.log("Step 5 Complete!")
}

main().catch(err => {
  console.error("Fatal error in Step 5:", err)
  process.exit(1)
})
