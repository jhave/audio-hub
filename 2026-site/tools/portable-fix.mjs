// Post-build pass for PORTABLE exports: Next.js emits some URLs in forms that
// break when the exported folder is served from an arbitrary subpath.
// Rewrite them relative to each HTML file's depth so the whole folder is
// archive-safe (runs from any path, no deploy URL baked in).
//
//  - metadata icons: always absolute ("/favicon.ico", "/img/…")
//  - _next assets: absolute ("/_next/…") without assetPrefix, or "./_next/…"
//    with assetPrefix "./" — both wrong for pages deeper than the root
//    (e.g. experience/index.html must reference "../_next/…")
import fs from "fs/promises"
import path from "path"

const OUT = path.join(process.cwd(), "out")

async function* htmlFiles(dir) {
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory() && e.name !== "audio" && e.name !== "_next") yield* htmlFiles(p)
    else if (e.isFile() && e.name.endsWith(".html")) yield p
  }
}

for await (const file of htmlFiles(OUT)) {
  const depth = path.relative(OUT, file).split(path.sep).length - 1
  const rel = depth === 0 ? "./" : "../".repeat(depth)
  const before = await fs.readFile(file, "utf8")
  const after = before
    .replaceAll('href="/favicon.ico', `href="${rel}favicon.ico`)
    .replaceAll('href="/img/', `href="${rel}img/`)
    // _next assets, in every attribute/inline form Next emits them
    .replaceAll('"./_next/', `"${rel}_next/`)
    .replaceAll('"/_next/', `"${rel}_next/`)
    .replaceAll("\\\"./_next/", `\\"${rel}_next/`)
    .replaceAll("\\\"/_next/", `\\"${rel}_next/`)
  if (after !== before) {
    await fs.writeFile(file, after, "utf8")
    console.log("relativized:", path.relative(OUT, file))
  }
}
