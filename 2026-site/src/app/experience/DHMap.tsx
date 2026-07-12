"use client"

import * as React from "react"
import type { DHData } from "@/lib/dh"

type Props = {
  data: DHData
  focusIdx: number | null // playing track index (dh index)
  hoverIdx: number | null
  played: Set<number>
  onHover: (i: number | null) => void
  onPlay: (i: number) => void
}

// Colors: unplayed grey, played gold, playing red pulse, starred ring.
const GREY = "#7c7a72"
const GOLD = "#c98500"
const RED = "#e24b4a"

export default function DHMap({ data, focusIdx, hoverIdx, played, onHover, onPlay }: Props) {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null)
  const wrapRef = React.useRef<HTMLDivElement | null>(null)
  const [size, setSize] = React.useState({ w: 300, h: 300 })
  const tRef = React.useRef(0)

  // neighbors of the active (hover or focus) track, for emphasis
  const activeIdx = hoverIdx ?? focusIdx
  const neighborSet = React.useMemo(() => {
    const s = new Set<number>()
    if (activeIdx != null) for (const [j] of data.tracks[activeIdx].neighbors) s.add(j)
    return s
  }, [activeIdx, data])

  React.useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      setSize({ w: el.clientWidth, h: el.clientHeight })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // map layout-space [-1,1] to canvas with padding
  const project = React.useCallback(
    (x: number, y: number, w: number, h: number) => {
      const pad = 18
      const s = Math.min(w, h) - pad * 2
      return [w / 2 + x * (s / 2), h / 2 + y * (s / 2)] as const
    },
    []
  )

  React.useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")!
    const dpr = Math.min(devicePixelRatio || 1, 2)
    canvas.width = size.w * dpr
    canvas.height = size.h * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    let raf = 0
    const draw = () => {
      tRef.current += 0.03
      const { w, h } = size
      ctx.clearRect(0, 0, w, h)
      const pts = data.points
      // base dots
      for (let i = 0; i < pts.length; i++) {
        if (i === focusIdx) continue
        const [px, py] = project(pts[i][0], pts[i][1], w, h)
        const isN = neighborSet.has(i)
        const isHover = i === hoverIdx
        ctx.beginPath()
        ctx.arc(px, py, isHover ? 4 : isN ? 3 : 2, 0, Math.PI * 2)
        ctx.fillStyle = isHover ? RED : played.has(i) ? GOLD : GREY
        ctx.globalAlpha = isN || isHover ? 1 : played.has(i) ? 0.9 : 0.5
        ctx.fill()
        if (data.tracks[i].fav) {
          ctx.globalAlpha = 0.9
          ctx.beginPath()
          ctx.arc(px, py, 5, 0, Math.PI * 2)
          ctx.strokeStyle = GOLD
          ctx.lineWidth = 1
          ctx.stroke()
        }
      }
      ctx.globalAlpha = 1
      // focal pulsing dot
      if (focusIdx != null) {
        const [px, py] = project(pts[focusIdx][0], pts[focusIdx][1], w, h)
        const pulse = 6 + Math.sin(tRef.current) * 3
        ctx.beginPath()
        ctx.arc(px, py, pulse + 5, 0, Math.PI * 2)
        ctx.fillStyle = "rgba(226,75,74,0.15)"
        ctx.fill()
        ctx.beginPath()
        ctx.arc(px, py, 4.5, 0, Math.PI * 2)
        ctx.fillStyle = RED
        ctx.fill()
      }
      raf = requestAnimationFrame(draw)
    }
    draw()
    return () => cancelAnimationFrame(raf)
  }, [data, size, focusIdx, hoverIdx, played, neighborSet, project])

  // hit-testing on move/click
  const pick = React.useCallback(
    (ev: React.MouseEvent) => {
      const canvas = canvasRef.current!
      const r = canvas.getBoundingClientRect()
      const mx = ev.clientX - r.left
      const my = ev.clientY - r.top
      let best = -1
      let bestD = 10 * 10
      for (let i = 0; i < data.points.length; i++) {
        const [px, py] = project(data.points[i][0], data.points[i][1], size.w, size.h)
        const d = (px - mx) ** 2 + (py - my) ** 2
        if (d < bestD) {
          bestD = d
          best = i
        }
      }
      return best
    },
    [data, size, project]
  )

  return (
    <div ref={wrapRef} className="relative h-full w-full">
      <canvas
        ref={canvasRef}
        style={{ width: size.w, height: size.h, cursor: hoverIdx != null ? "pointer" : "default" }}
        onMouseMove={(e) => {
          const i = pick(e)
          onHover(i >= 0 ? i : null)
        }}
        onMouseLeave={() => onHover(null)}
        onClick={(e) => {
          const i = pick(e)
          if (i >= 0) onPlay(i)
        }}
      />
    </div>
  )
}
