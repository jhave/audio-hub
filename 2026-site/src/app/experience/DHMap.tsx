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
  mapMode?: "music" | "lyrics"
}

// Colors: unplayed grey, played gold, playing red pulse, starred ring.
const GREY = "#7c7a72"
const GOLD = "#c98500"
const RED = "#e24b4a"

export default function DHMap({ data, focusIdx, hoverIdx, played, onHover, onPlay, mapMode = "music" }: Props) {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null)
  const wrapRef = React.useRef<HTMLDivElement | null>(null)
  const [size, setSize] = React.useState({ w: 300, h: 300 })
  const tRef = React.useRef(0)
  const currentPtsRef = React.useRef<{ x: number; y: number }[]>([])

  // Zoom & Pan states
  const [zoom, setZoom] = React.useState(1.0)
  const [pan, setPan] = React.useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = React.useState(false)
  const dragRef = React.useRef({ startX: 0, startY: 0, curX: 0, curY: 0, moved: false })

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

  // map layout-space [-1,1] to canvas with padding, zoom and pan
  const project = React.useCallback(
    (x: number, y: number, w: number, h: number) => {
      const pad = 18
      const s = (Math.min(w, h) - pad * 2) * zoom
      return [w / 2 + x * (s / 2) + pan.x, h / 2 + y * (s / 2) + pan.y] as const
    },
    [zoom, pan]
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

      const targetPts = mapMode === "lyrics" ? (data.lyricPoints || data.points) : data.points

      // Initialize or interpolate current positions
      if (currentPtsRef.current.length !== targetPts.length) {
        currentPtsRef.current = targetPts.map(pt => ({ x: pt[0], y: pt[1] }))
      } else {
        const lerpRate = 0.12
        for (let i = 0; i < targetPts.length; i++) {
          const cur = currentPtsRef.current[i]
          const tarX = targetPts[i][0]
          const tarY = targetPts[i][1]
          cur.x += (tarX - cur.x) * lerpRate
          cur.y += (tarY - cur.y) * lerpRate
        }
      }

      const pts = currentPtsRef.current

      // base dots
      for (let i = 0; i < pts.length; i++) {
        if (i === focusIdx) continue
        const [px, py] = project(pts[i].x, pts[i].y, w, h)
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

        // Draw track title text labels if zoomed in
        if (zoom > 2.2) {
          ctx.globalAlpha = isHover ? 1.0 : isN ? 0.8 : played.has(i) ? 0.7 : 0.35
          ctx.fillStyle = isHover ? RED : isN ? "#000" : played.has(i) ? "#9e6900" : "#555"
          ctx.font = isHover || isN ? "600 7.5px sans-serif" : "7px sans-serif"
          ctx.textAlign = "left"
          ctx.textBaseline = "middle"
          ctx.fillText(data.tracks[i].title, px + 5, py)
        }
      }
      ctx.globalAlpha = 1

      // focal pulsing dot
      if (focusIdx != null && pts[focusIdx]) {
        const [px, py] = project(pts[focusIdx].x, pts[focusIdx].y, w, h)
        const pulse = 6 + Math.sin(tRef.current) * 3
        ctx.beginPath()
        ctx.arc(px, py, pulse + 5, 0, Math.PI * 2)
        ctx.fillStyle = "rgba(226,75,74,0.15)"
        ctx.fill()
        ctx.beginPath()
        ctx.arc(px, py, 4.5, 0, Math.PI * 2)
        ctx.fillStyle = RED
        ctx.fill()

        // Draw active track title label if zoomed in
        if (zoom > 2.2) {
          ctx.globalAlpha = 1.0
          ctx.fillStyle = RED
          ctx.font = "bold 8px sans-serif"
          ctx.textAlign = "left"
          ctx.textBaseline = "middle"
          ctx.fillText(data.tracks[focusIdx].title, px + 6, py)
        }
      }
      raf = requestAnimationFrame(draw)
    }

    draw()
    return () => cancelAnimationFrame(raf)
  }, [data, size, focusIdx, hoverIdx, played, neighborSet, project, mapMode, zoom])

  // hit-testing on move/click
  const pick = React.useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current!
      const r = canvas.getBoundingClientRect()
      const mx = clientX - r.left
      const my = clientY - r.top
      let best = -1
      let bestD = 10 * 10

      const pts = currentPtsRef.current.length > 0 
        ? currentPtsRef.current 
        : (mapMode === "lyrics" ? (data.lyricPoints || data.points) : data.points).map(pt => ({ x: pt[0], y: pt[1] }))

      for (let i = 0; i < pts.length; i++) {
        const cur = pts[i]
        const [px, py] = project(cur.x, cur.y, size.w, size.h)
        const d = (px - mx) ** 2 + (py - my) ** 2
        if (d < bestD) {
          bestD = d
          best = i
        }
      }
      return best
    },
    [data, size, project, mapMode]
  )

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setIsDragging(true)
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      curX: e.clientX,
      curY: e.clientY,
      moved: false,
    }
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current
    if (isDragging) {
      const dx = e.clientX - drag.curX
      const dy = e.clientY - drag.curY
      setPan(p => ({ x: p.x + dx, y: p.y + dy }))
      drag.curX = e.clientX
      drag.curY = e.clientY

      const dist = Math.sqrt((e.clientX - drag.startX) ** 2 + (e.clientY - drag.startY) ** 2)
      if (dist > 5) {
        drag.moved = true
      }
      onHover(null)
    } else {
      const i = pick(e.clientX, e.clientY)
      onHover(i >= 0 ? i : null)
    }
  }

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isDragging) {
      setIsDragging(false)
      if (!dragRef.current.moved) {
        const i = pick(e.clientX, e.clientY)
        if (i >= 0) onPlay(i)
      }
    }
  }

  const handleMouseLeave = () => {
    setIsDragging(false)
    onHover(null)
  }

  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length === 1) {
      setIsDragging(true)
      const t = e.touches[0]
      dragRef.current = {
        startX: t.clientX,
        startY: t.clientY,
        curX: t.clientX,
        curY: t.clientY,
        moved: false,
      }
    }
  }

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current
    if (isDragging && e.touches.length === 1) {
      const t = e.touches[0]
      const dx = t.clientX - drag.curX
      const dy = t.clientY - drag.curY
      setPan(p => ({ x: p.x + dx, y: p.y + dy }))
      drag.curX = t.clientX
      drag.curY = t.clientY

      const dist = Math.sqrt((t.clientX - drag.startX) ** 2 + (t.clientY - drag.startY) ** 2)
      if (dist > 5) {
        drag.moved = true
      }
      onHover(null)
    }
  }

  const handleTouchEnd = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (isDragging) {
      setIsDragging(false)
      if (!dragRef.current.moved) {
        const touch = e.changedTouches[0]
        if (touch) {
          const i = pick(touch.clientX, touch.clientY)
          if (i >= 0) onPlay(i)
        }
      }
    }
  }

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    const delta = e.deltaY < 0 ? 1.15 : 1 / 1.15
    const nextZoom = Math.max(0.5, Math.min(zoom * delta, 6.0))
    setZoom(nextZoom)
    if (nextZoom === 1.0) {
      setPan({ x: 0, y: 0 })
    }
  }

  const getCursor = () => {
    if (isDragging) return "grabbing"
    if (hoverIdx != null) return "pointer"
    if (zoom > 1.0) return "grab"
    return "default"
  }

  return (
    <div ref={wrapRef} className="relative h-full w-full overflow-hidden select-none">
      <canvas
        ref={canvasRef}
        style={{ width: size.w, height: size.h, cursor: getCursor() }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onWheel={handleWheel}
      />

      {/* Floating Zoom Controls */}
      <div className="absolute bottom-3 right-3 flex flex-col gap-1 z-10 select-none">
        <button
          onClick={() => setZoom(z => Math.min(z * 1.3, 6.0))}
          className="w-6 h-6 flex items-center justify-center bg-white border border-neutral-200 rounded shadow-sm text-[13px] font-bold text-neutral-700 hover:bg-neutral-50 active:scale-90 transition-all cursor-pointer"
          title="Zoom In"
        >
          +
        </button>
        <button
          onClick={() => {
            const nextZ = Math.max(zoom / 1.3, 0.5)
            setZoom(nextZ)
            if (nextZ === 1.0) setPan({ x: 0, y: 0 })
          }}
          className="w-6 h-6 flex items-center justify-center bg-white border border-neutral-200 rounded shadow-sm text-[13px] font-bold text-neutral-700 hover:bg-neutral-50 active:scale-90 transition-all cursor-pointer"
          title="Zoom Out"
        >
          -
        </button>
        {(zoom !== 1.0 || pan.x !== 0 || pan.y !== 0) && (
          <button
            onClick={() => {
              setZoom(1.0)
              setPan({ x: 0, y: 0 })
            }}
            className="w-6 h-6 flex items-center justify-center bg-white border border-neutral-200 rounded shadow-sm text-[10px] font-bold text-neutral-400 hover:bg-neutral-50 hover:text-neutral-600 active:scale-90 transition-all cursor-pointer"
            title="Reset View"
          >
            ⟲
          </button>
        )}
      </div>
    </div>
  )
}
