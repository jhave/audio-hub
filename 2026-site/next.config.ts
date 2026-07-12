// next.config.ts
import type { NextConfig } from "next"

const raw = process.env.NEXT_PUBLIC_BASE_PATH || "" // "" in dev; "2025/75days" for export
const base = raw.replace(/^\/+|\/+$/g, "")
const basePath = base ? `/${base}` : undefined
// PORTABLE=1: relative asset URLs so the exported folder runs from any path
// (archive-safe — no deploy URL baked into the build)
const assetPrefix = process.env.PORTABLE ? "./" : base ? `/${base}/` : undefined

const nextConfig: NextConfig = {
  output: "export",
  basePath,
  assetPrefix,
  trailingSlash: true,
  devIndicators: false, // hide the dev-only "N" overlay (never in the export anyway)
}

export default nextConfig