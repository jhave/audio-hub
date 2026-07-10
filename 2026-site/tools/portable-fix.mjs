// Post-build pass for PORTABLE exports: Next.js metadata icons are always
// emitted with absolute hrefs, which would break when the site folder is
// served from a subpath. Rewrite them relative to each HTML file's depth.
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
  if (after !== before) {
    await fs.writeFile(file, after, "utf8")
    console.log("relativized:", path.relative(OUT, file))
  }
}
