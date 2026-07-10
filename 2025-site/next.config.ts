// next.config.ts
import type { NextConfig } from "next"

const raw = process.env.NEXT_PUBLIC_BASE_PATH || "" // "" in dev; "2025/75days" for export
const base = raw.replace(/^\/+|\/+$/g, "")
const basePath = base ? `/${base}` : undefined
const assetPrefix = base ? `/${base}/` : undefined

const nextConfig: NextConfig = {
  output: "export",
  basePath,
  assetPrefix,
  trailingSlash: true,
}

export default nextConfig