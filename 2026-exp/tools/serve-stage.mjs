// Local stage that mirrors the deployed adjacency:
//   /2026/171days/audio/*  ->  ../2026-site/public/audio/*   (mp3s, covers, manifest)
//   /2026/171exp/*         ->  dist/*                        (the experience)
// Range requests supported (audio seeking needs them). This same file doubles
// as the offline-installation server: node tools/serve-stage.mjs
import http from "http"
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const HERE = path.dirname(fileURLToPath(import.meta.url))
const AUDIO_ROOT = path.join(HERE, "../../2026-site/public/audio")
const EXP_ROOT = path.join(HERE, "../dist")
const PORT = process.env.PORT || 3210

const TYPES = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".mp3": "audio/mpeg", ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg", ".png": "image/png", ".webp": "image/webp",
  ".svg": "image/svg+xml", ".ico": "image/x-icon", ".txt": "text/plain",
}

function send(res, file, req) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); return res.end("not found") }
    const type = TYPES[path.extname(file).toLowerCase()] || "application/octet-stream"
    const range = req.headers.range?.match(/bytes=(\d*)-(\d*)/)
    if (range && (range[1] || range[2])) {
      const start = range[1] ? parseInt(range[1]) : Math.max(0, st.size - parseInt(range[2]))
      const end = range[1] && range[2] ? Math.min(parseInt(range[2]), st.size - 1) : st.size - 1
      res.writeHead(206, {
        "Content-Type": type,
        "Content-Range": `bytes ${start}-${end}/${st.size}`,
        "Content-Length": end - start + 1,
        "Accept-Ranges": "bytes",
      })
      fs.createReadStream(file, { start, end }).pipe(res)
    } else {
      res.writeHead(200, { "Content-Type": type, "Content-Length": st.size, "Accept-Ranges": "bytes" })
      fs.createReadStream(file).pipe(res)
    }
  })
}

http.createServer((req, res) => {
  let p
  try { p = decodeURIComponent(new URL(req.url, "http://x").pathname) }
  catch { res.writeHead(400); return res.end() }
  if (p === "/" || p === "/2026" || p === "/2026/") {
    res.writeHead(302, { Location: "/2026/171exp/" })
    return res.end()
  }
  if (p.startsWith("/2026/171days/audio/")) {
    return send(res, path.join(AUDIO_ROOT, p.slice("/2026/171days/audio/".length)), req)
  }
  if (p.startsWith("/2026/171exp/")) {
    let rest = p.slice("/2026/171exp/".length) || "index.html"
    if (rest.endsWith("/")) rest += "index.html"
    return send(res, path.join(EXP_ROOT, rest || "index.html"), req)
  }
  res.writeHead(404)
  res.end("not found")
}).listen(PORT, () => console.log(`stage: http://localhost:${PORT}/2026/171exp/`))
