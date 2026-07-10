// Bundle the experience into dist/ — a self-contained static folder that
// deploys next to 171days (e.g. glia.ca/2026/171exp) or runs offline.
import { build } from "esbuild"
import fs from "fs/promises"
import path from "path"
import { fileURLToPath } from "url"

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(HERE, "..")
const DIST = path.join(ROOT, "dist")

await fs.rm(DIST, { recursive: true, force: true })
await fs.mkdir(DIST, { recursive: true })

await build({
  entryPoints: [path.join(ROOT, "src/main.js")],
  bundle: true,
  minify: true,
  format: "esm",
  target: "es2022",
  outfile: path.join(DIST, "app.js"),
  logLevel: "info",
})

// copy public/ (index.html + data/)
async function copyDir(from, to) {
  await fs.mkdir(to, { recursive: true })
  for (const e of await fs.readdir(from, { withFileTypes: true })) {
    const f = path.join(from, e.name), t = path.join(to, e.name)
    if (e.isDirectory()) await copyDir(f, t)
    else await fs.copyFile(f, t)
  }
}
await copyDir(path.join(ROOT, "public"), DIST)
console.log("dist/ ready")
