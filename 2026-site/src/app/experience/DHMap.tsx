"use client"

import * as React from "react"
import type { DHData, DHTrack } from "@/lib/dh"

type Props = {
  data: DHData
  focusIdx: number | null // playing track index (dh index)
  hoverIdx: number | null
  played: Set<number>
  onHover: (i: number | null) => void
  onPlay: (i: number) => void
  mapMode?: "music" | "lyrics" | "metrics" | "aesthetic" | "rhythm" | "groove" | "intent" | "texture" | "narrative" | "tempo"
  hideInstrumentals?: boolean
  activeTag?: string | null
  clickedTag?: string | null
  onClearTag?: () => void
  showPaths?: boolean
  matchSet?: Set<number> | null // active search/filter matches; non-members render dimmed
}

// Map key strings to Circle of Fifths indices
function getKeyCircleIndex(keyStr: string | null | undefined): number {
  if (!keyStr) return 0
  const normalized = keyStr.toLowerCase()
  // Match relative major/minor pairs on Circle of Fifths:
  if (normalized.includes("c major") || normalized.includes("a minor")) return 0
  if (normalized.includes("g major") || normalized.includes("e minor")) return 1
  if (normalized.includes("d major") || normalized.includes("b minor")) return 2
  if (normalized.includes("a major") || normalized.includes("f# minor") || normalized.includes("gb minor")) return 3
  if (normalized.includes("e major") || normalized.includes("c# minor") || normalized.includes("db minor")) return 4
  if (normalized.includes("b major") || normalized.includes("g# minor") || normalized.includes("ab minor")) return 5
  if (normalized.includes("f# major") || normalized.includes("gb major") || normalized.includes("d# minor") || normalized.includes("eb minor")) return 6
  if (normalized.includes("c# major") || normalized.includes("db major") || normalized.includes("a# minor") || normalized.includes("bb minor")) return 7
  if (normalized.includes("ab major") || normalized.includes("g# major") || normalized.includes("f minor")) return 8
  if (normalized.includes("eb major") || normalized.includes("d# major") || normalized.includes("c minor")) return 9
  if (normalized.includes("bb major") || normalized.includes("a# major") || normalized.includes("g minor")) return 10
  if (normalized.includes("f major") || normalized.includes("d minor")) return 11
  return 0
}

// Colors: unplayed grey, played gold, playing red pulse, starred ring, lyrics blue
const GREY = "#7c7a72"
const GOLD = "#c98500"
const RED = "#e24b4a"
const BLUE = "#38bdf8" // bright light blue for unplayed vocals
const RICH_BLUE = "#2563eb" // deep rich blue for played vocals

function getMatchingIndices(tagOrMetric: string | null, tracks: DHTrack[]): number[] {
  if (!tagOrMetric) return []
  
  if (!tagOrMetric.startsWith("metric:")) {
    const indices: number[] = []
    for (let i = 0; i < tracks.length; i++) {
      const hasTag = tracks[i].topTags.some(
        (tg) => tg.probe.toLowerCase() === tagOrMetric.toLowerCase()
      )
      if (hasTag) indices.push(i)
    }
    return indices
  }

  const parts = tagOrMetric.split(":")
  if (parts.length < 3) return []
  const key = parts[1]
  const valStr = parts[2]

  const indices: number[] = []
  
  for (let i = 0; i < tracks.length; i++) {
    const t = tracks[i]
    if (key === "key") {
      if (t.key === valStr) indices.push(i)
    } else if (key === "tempo") {
      const targetVal = parseFloat(valStr)
      if (t.tempo != null && Math.abs(t.tempo - targetVal) <= 3) {
        indices.push(i)
      }
    } else if (key === "tempoDrift") {
      const targetVal = parseFloat(valStr)
      if (t.tempoDrift != null && Math.abs(t.tempoDrift - targetVal) <= 2) {
        indices.push(i)
      }
    } else if (key === "tempoJumps") {
      const targetVal = parseInt(valStr)
      if (t.tempoJumps === targetVal) indices.push(i)
    } else if (key === "sectionCount" || key === "sections") {
      const targetVal = parseInt(valStr)
      if (t.sectionCount === targetVal) indices.push(i)
    } else if (key === "modulations") {
      const targetVal = parseInt(valStr)
      if (t.modulations === targetVal) indices.push(i)
    } else if (key === "weirdness") {
      const targetVal = parseFloat(valStr)
      if (t.weirdness != null && Math.abs(t.weirdness - targetVal) <= 0.05) {
        indices.push(i)
      }
    } else if (key === "styleWeight") {
      const targetVal = parseFloat(valStr)
      if (t.styleWeight != null && Math.abs(t.styleWeight - targetVal) <= 0.05) {
        indices.push(i)
      }
    } else if (key === "journey") {
      const targetVal = parseFloat(valStr)
      if (t.journey != null && Math.abs(t.journey - targetVal) <= 1.0) {
        indices.push(i)
      }
    } else if (key === "spread") {
      const targetVal = parseFloat(valStr)
      if (t.spread != null && Math.abs(t.spread - targetVal) <= 0.2) {
        indices.push(i)
      }
    } else if (key === "shifts") {
      const targetVal = parseInt(valStr)
      if (t.novelty === targetVal) indices.push(i)
    } else if (key === "bounce") {
      const targetVal = parseFloat(valStr)
      if (t.bounce != null && Math.abs(t.bounce - targetVal) <= 0.05) {
        indices.push(i)
      }
    } else if (key === "complexity") {
      const targetVal = parseFloat(valStr)
      if (t.melodicComplexity != null && Math.abs(t.melodicComplexity - targetVal) <= 0.05) {
        indices.push(i)
      }
    }
  }

  return indices
}

export default function DHMap({
  data,
  focusIdx,
  hoverIdx,
  played,
  onHover,
  onPlay,
  mapMode = "music",
  hideInstrumentals = false,
  activeTag = null,
  clickedTag = null,
  onClearTag,
  showPaths = true,
  matchSet = null,
}: Props) {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null)
  const wrapRef = React.useRef<HTMLDivElement | null>(null)
  const [size, setSize] = React.useState({ w: 300, h: 300 })
  const tRef = React.useRef(0)
  const currentPtsRef = React.useRef<{ x: number; y: number }[]>([])

  // Zoom & Pan states
  const [zoom, setZoom] = React.useState(1.0)
  const [pan, setPan] = React.useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = React.useState(false)

  // Track the last centered tag to prevent hover/move changes from resetting manual zoom/pan
  const lastCenteredTagRef = React.useRef<string | null>(null)

  // neighbors of the active (hover or focus) track, for emphasis
  const activeIdx = hoverIdx ?? focusIdx
  const neighborSet = React.useMemo(() => {
    const s = new Set<number>()
    if (activeIdx != null) {
      // Don't show neighbor associations if the track itself is filtered out
      if (hideInstrumentals && data.tracks[activeIdx].lyricsPresent !== 1) return s
      for (const [j] of data.tracks[activeIdx].neighbors) s.add(j)
    }
    return s
  }, [activeIdx, data, hideInstrumentals])

  // Auto-centering when a tag is clicked
  React.useEffect(() => {
    if (!clickedTag || size.w === 0 || size.h === 0) {
      lastCenteredTagRef.current = clickedTag
      return
    }

    // Only run centering calculation when the clicked tag changes!
    if (clickedTag === lastCenteredTagRef.current) {
      return
    }
    lastCenteredTagRef.current = clickedTag

    // Reset pan and set a comfortable zoom to frame the new central cluster
    setZoom(2.8)
    setPan({ x: 0, y: 0 })
  }, [clickedTag, size.w, size.h])
  const dragRef = React.useRef({ startX: 0, startY: 0, curX: 0, curY: 0, moved: false })

  React.useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      setSize({ w: el.clientWidth, h: el.clientHeight })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const camPanRef = React.useRef({ x: 0, y: 0 })
  const camZoomRef = React.useRef(1.0)

  // map layout-space [-1,1] to canvas with padding, zoom and pan
  const project = React.useCallback(
    (x: number, y: number, w: number, h: number) => {
      const pad = 18
      const s = (Math.min(w, h) - pad * 2) * camZoomRef.current
      return [w / 2 + x * (s / 2) + camPanRef.current.x, h / 2 + y * (s / 2) + camPanRef.current.y] as const
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

      // 0R.6 — measured-axis modes draw labeled axes (they are unreadable
      // clouds without them); axes live in layout space so they pan/zoom
      // with the data. Embedding modes get no axes (distance IS the meaning).
      const AXIS_SPECS: Record<string, { x: string; y: string; x0: string; x1: string; y0: string; y1: string } | undefined> = {
        groove: { x: "tempo →", y: "↑ circle of fifths", x0: "60 bpm", x1: "200 bpm", y0: "C/Am", y1: "F/Dm" },
        intent: { x: "weirdness →", y: "↑ style weight", x0: "0", x1: "1", y0: "0", y1: "1" },
        texture: { x: "bounce →", y: "↑ melodic complexity", x0: "0.05", x1: "0.6", y0: "0.05", y1: "0.7" },
        narrative: { x: "journey →", y: "↑ spread", x0: "1", x1: "15", y0: "0.1", y1: "3.0" },
        tempo: { x: "tempo →", y: "", x0: "60 bpm", x1: "200 bpm", y0: "", y1: "" },
      }
      const axis = AXIS_SPECS[mapMode]
      if (axis) {
        const E = 0.85 // layout-space extent used by the axis scatters
        const [x0, y0] = project(-E, E, w, h)   // bottom-left (y+ is down in canvas after projection? y grows downward)
        const [x1, y1] = project(E, -E, w, h)   // top-right
        ctx.save()
        ctx.strokeStyle = "rgba(0,0,0,0.14)"
        ctx.fillStyle = "rgba(0,0,0,0.45)"
        ctx.lineWidth = 1
        // x axis along bottom, y axis along left
        ctx.beginPath()
        ctx.moveTo(x0, y0); ctx.lineTo(x1, y0) // bottom
        ctx.moveTo(x0, y0); ctx.lineTo(x0, y1) // left
        ctx.stroke()
        ctx.font = "10px sans-serif"
        // x labels
        ctx.textAlign = "left"
        ctx.fillText(axis.x0, x0 + 2, y0 + 12)
        ctx.textAlign = "right"
        ctx.fillText(axis.x1, x1, y0 + 12)
        ctx.textAlign = "center"
        ctx.font = "bold 10px sans-serif"
        ctx.fillText(axis.x, (x0 + x1) / 2, y0 + 12)
        // y labels (rotated)
        if (axis.y) {
          ctx.save()
          ctx.translate(x0 - 4, (y0 + y1) / 2)
          ctx.rotate(-Math.PI / 2)
          ctx.textAlign = "center"
          ctx.fillText(axis.y, 0, 0)
          ctx.restore()
          ctx.font = "10px sans-serif"
          ctx.textAlign = "left"
          ctx.save()
          ctx.translate(x0 - 4, y0 - 2); ctx.rotate(-Math.PI / 2); ctx.fillText(axis.y0, 0, 0); ctx.restore()
          ctx.save()
          ctx.translate(x0 - 4, y1 + 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = "right"; ctx.fillText(axis.y1, 0, 0); ctx.restore()
        }
        ctx.restore()
      }

      // Calculate target coordinates based on active layout and clicked tag distortion
      let basePts: [number, number, number][]
      if (mapMode === "lyrics") {
        basePts = data.lyricPoints || data.points
      } else if (mapMode === "metrics") {
        basePts = data.metricPoints || data.points
      } else if (mapMode === "aesthetic") {
        basePts = data.metricPointsAblated9 || data.points
      } else if (mapMode === "rhythm") {
        basePts = data.metricPointsAblated4 || data.points
      } else if (mapMode === "groove") {
        basePts = data.tracks.map((t) => {
          const tempo = t.tempo != null ? Math.max(60, Math.min(200, t.tempo)) : 100
          const tempoRawX = ((tempo - 60) / (200 - 60)) * 1.7 - 0.85
          const hasMinor = t.key ? t.key.toLowerCase().includes("minor") : false
          const minorOffset = hasMinor ? 0.25 : -0.25
          const circleVal = getKeyCircleIndex(t.key) + minorOffset
          const keyRawY = ((circleVal - (-0.5)) / (11.5 - (-0.5))) * 1.7 - 0.85
          
          // Deterministic jitter to prevent coordinate overlapping
          const jitterX = Math.sin(t.i * 12.34) * 0.022
          const jitterY = Math.cos(t.i * 56.78) * 0.022
          return [tempoRawX + jitterX, -keyRawY + jitterY, 0] as [number, number, number]
        })
      } else if (mapMode === "intent") {
        basePts = data.tracks.map((t) => {
          const weirdRawX = (t.weirdness ?? 0.0) * 1.7 - 0.85
          const styleRawY = (t.styleWeight ?? 0.0) * 1.7 - 0.85
          
          // Deterministic jitter to prevent coordinate overlapping
          const jitterX = Math.sin(t.i * 23.45) * 0.035
          const jitterY = Math.cos(t.i * 67.89) * 0.035
          return [weirdRawX + jitterX, -styleRawY + jitterY, 0] as [number, number, number]
        })
      } else if (mapMode === "texture") {
        basePts = data.tracks.map((t) => {
          const bounce = t.bounce != null ? Math.max(0.05, Math.min(0.6, t.bounce)) : 0.3
          const bounceRawX = ((bounce - 0.05) / (0.6 - 0.05)) * 1.7 - 0.85
          const comp = t.melodicComplexity != null ? Math.max(0.05, Math.min(0.7, t.melodicComplexity)) : 0.3
          const compRawY = ((comp - 0.05) / (0.7 - 0.05)) * 1.7 - 0.85
          
          // Deterministic jitter to prevent coordinate overlapping
          const jitterX = Math.sin(t.i * 34.56) * 0.022
          const jitterY = Math.cos(t.i * 78.90) * 0.022
          return [bounceRawX + jitterX, -compRawY + jitterY, 0] as [number, number, number]
        })
      } else if (mapMode === "narrative") {
        basePts = data.tracks.map((t) => {
          const journey = t.journey != null ? Math.max(1.0, Math.min(15.0, t.journey)) : 8.0
          const journeyRawX = ((journey - 1.0) / (15.0 - 1.0)) * 1.7 - 0.85
          const spread = t.spread != null ? Math.max(0.1, Math.min(3.0, t.spread)) : 1.5
          const spreadRawY = ((spread - 0.1) / (3.0 - 0.1)) * 1.7 - 0.85
          
          // Deterministic jitter to prevent coordinate overlapping
          const jitterX = Math.sin(t.i * 45.67) * 0.022
          const jitterY = Math.cos(t.i * 89.01) * 0.022
          return [journeyRawX + jitterX, -spreadRawY + jitterY, 0] as [number, number, number]
        })
      } else if (mapMode === "tempo") {
        basePts = data.tracks.map((t) => {
          const tempo = t.tempo != null ? Math.max(60, Math.min(200, t.tempo)) : 100
          const tempoRawX = ((tempo - 60) / (200 - 60)) * 1.7 - 0.85
          
          // Plot directly on X with Y-jitter to make it a legible debugging cloud
          const jitterY = Math.sin(t.i * 12.34) * 0.25
          return [tempoRawX, jitterY, 0] as [number, number, number]
        })
      } else {
        basePts = data.points
      }

      const clickedTagIndices = clickedTag ? getMatchingIndices(clickedTag, data.tracks) : []
      const clickedTagSet = new Set(clickedTagIndices)

      const targetPts: [number, number][] = []
      if (clickedTag && clickedTagIndices.length > 0) {
        for (let i = 0; i < basePts.length; i++) {
          if (clickedTagSet.has(i)) {
            // Pull matching dots to the center
            targetPts.push([basePts[i][0] * 0.28, basePts[i][1] * 0.28])
          } else {
            // Push non-matching dots to outer ring
            const angle = Math.atan2(basePts[i][1], basePts[i][0])
            const r = 1.05 + 0.12 * Math.sin(i * 9.87)
            targetPts.push([Math.cos(angle) * r, Math.sin(angle) * r])
          }
        }
      } else {
        for (let i = 0; i < basePts.length; i++) {
          targetPts.push([basePts[i][0], basePts[i][1]])
        }
      }

      // Initialize or interpolate current positions
      if (currentPtsRef.current.length !== targetPts.length) {
        currentPtsRef.current = targetPts.map(pt => ({ x: pt[0], y: pt[1] }))
      } else {
        const lerpRate = 0.08 // fluid morph speed
        for (let i = 0; i < targetPts.length; i++) {
          const cur = currentPtsRef.current[i]
          const tarX = targetPts[i][0]
          const tarY = targetPts[i][1]
          cur.x += (tarX - cur.x) * lerpRate
          cur.y += (tarY - cur.y) * lerpRate
        }
      }

      const pts = currentPtsRef.current

      // Camera zoom & pan fluid drift tracking
      const camLerpRate = 0.05
      camZoomRef.current += (zoom - camZoomRef.current) * camLerpRate

      if (isDragging) {
        // Follow dragging exactly
        camPanRef.current.x = pan.x
        camPanRef.current.y = pan.y
      } else if (focusIdx != null && pts[focusIdx]) {
        // Drift pan to center the active playing track, preserving the current zoom level!
        const pad = 18
        const s = (Math.min(w, h) - pad * 2) * camZoomRef.current
        const targetPanX = -pts[focusIdx].x * (s / 2)
        const targetPanY = -pts[focusIdx].y * (s / 2)
        
        // Reduce auto-centering influence when zoomed out, so edge nodes don't push the map off-screen.
        // Goes from 0.0 (no centering at zoom=1.0) to 1.0 (full centering at zoom>=2.0)
        const centerWeight = Math.min(1.0, Math.max(0.0, (camZoomRef.current - 1.0) / 1.0))
        const finalTargetX = targetPanX * centerWeight + pan.x * (1 - centerWeight)
        const finalTargetY = targetPanY * centerWeight + pan.y * (1 - centerWeight)

        camPanRef.current.x += (finalTargetX - camPanRef.current.x) * camLerpRate
        camPanRef.current.y += (finalTargetY - camPanRef.current.y) * camLerpRate
      } else {
        // Fallback to panned coordinates
        camPanRef.current.x += (pan.x - camPanRef.current.x) * camLerpRate
        camPanRef.current.y += (pan.y - camPanRef.current.y) * camLerpRate
      }

      const isLyricsMode = mapMode === "lyrics"

      // 1. Draw Nearest Neighbors Web or Sequential Flow Path
      if (focusIdx != null && pts[focusIdx]) {
        const isFocusHidden = hideInstrumentals && data.tracks[focusIdx].lyricsPresent !== 1
        if (!isFocusHidden) {
          const track = data.tracks[focusIdx]
          
          if (showPaths) {
            // Draw sequential marching ants trajectory path: focusIdx -> neighbor 0 -> neighbor 1 -> ...
            const pathPoints: [number, number][] = []
            if (pts[focusIdx]) {
              const [x, y] = project(pts[focusIdx].x, pts[focusIdx].y, w, h)
              pathPoints.push([x, y])
            }
            for (const [neighIdx] of track.neighbors) {
              const isNeighHidden = hideInstrumentals && data.tracks[neighIdx].lyricsPresent !== 1
              if (pts[neighIdx] && !isNeighHidden) {
                const [x, y] = project(pts[neighIdx].x, pts[neighIdx].y, w, h)
                pathPoints.push([x, y])
              }
            }

            if (pathPoints.length > 1) {
              ctx.save()
              ctx.beginPath()
              ctx.moveTo(pathPoints[0][0], pathPoints[0][1])
              for (let i = 1; i < pathPoints.length; i++) {
                ctx.lineTo(pathPoints[i][0], pathPoints[i][1])
              }
              ctx.strokeStyle = "rgba(226, 75, 74, 0.7)" // playhead red
              ctx.lineWidth = 1.8
              ctx.setLineDash([5, 5])
              ctx.lineDashOffset = -tRef.current * 12
              ctx.stroke()
              ctx.restore()
            }
          } else {
            // Draw default faint web lines
            const [px0, py0] = project(pts[focusIdx].x, pts[focusIdx].y, w, h)
            ctx.strokeStyle = "rgba(226,75,74,0.18)"
            ctx.lineWidth = 1.0
            for (const [neighIdx] of track.neighbors) {
              const isNeighHidden = hideInstrumentals && data.tracks[neighIdx].lyricsPresent !== 1
              if (pts[neighIdx] && !isNeighHidden) {
                const [px1, py1] = project(pts[neighIdx].x, pts[neighIdx].y, w, h)
                ctx.beginPath()
                ctx.moveTo(px0, py0)
                const cx = (px0 + px1) / 2 + (w / 2 - (px0 + px1) / 2) * 0.12
                const cy = (py0 + py1) / 2 + (h / 2 - (py0 + py1) / 2) * 0.12
                ctx.quadraticCurveTo(cx, cy, px1, py1)
                ctx.stroke()
              }
            }
          }
        }
      }

      // 2. Draw Relational Tag/Metric Constellation (blue lines to centroid hub)
      if (activeTag) {
        const matchingIndices = getMatchingIndices(activeTag, data.tracks).filter(
          (idx) => !(hideInstrumentals && data.tracks[idx].lyricsPresent !== 1)
        )

        if (matchingIndices.length > 0) {
          // Calculate centroid
          let sumX = 0, sumY = 0
          for (const idx of matchingIndices) {
            if (pts[idx]) {
              sumX += pts[idx].x
              sumY += pts[idx].y
            }
          }
          const avgX = sumX / matchingIndices.length
          const avgY = sumY / matchingIndices.length
          const [cx, cy] = project(avgX, avgY, w, h)

          // Draw hub centroid
          ctx.beginPath()
          ctx.arc(cx, cy, 3.5, 0, Math.PI * 2)
          ctx.fillStyle = "#3b82f6"
          ctx.fill()
          ctx.strokeStyle = "#ffffff"
          ctx.lineWidth = 1.2
          ctx.stroke()

          // Draw spokes from centroid to each node
          ctx.strokeStyle = "rgba(59, 130, 246, 0.35)"
          ctx.lineWidth = 1.2
          for (const idx of matchingIndices) {
            if (pts[idx]) {
              const [px, py] = project(pts[idx].x, pts[idx].y, w, h)
              ctx.beginPath()
              ctx.moveTo(cx, cy)
              const ctrlX = (cx + px) / 2 + (w / 2 - (cx + px) / 2) * 0.1
              const ctrlY = (cy + py) / 2 + (h / 2 - (cy + py) / 2) * 0.1
              ctx.quadraticCurveTo(ctrlX, ctrlY, px, py)
              ctx.stroke()
            }
          }
        }
      }

      const activeTagIndices = activeTag ? getMatchingIndices(activeTag, data.tracks) : []
      const activeTagSet = new Set(activeTagIndices)

      // 3. Draw base dots
      for (let i = 0; i < pts.length; i++) {
        if (i === focusIdx) continue
        if (hideInstrumentals && data.tracks[i].lyricsPresent !== 1) continue

        const [px, py] = project(pts[i].x, pts[i].y, w, h)
        const isN = neighborSet.has(i)
        const isHover = i === hoverIdx
        
        // Relational activeTag check
        const isTagMatched = activeTagSet.has(i)

        // Determine dot color: vocal tracks highlight in blue in lyrics mode
        const hasLyrics = data.tracks[i].lyricsPresent === 1
        const dotColor = isHover 
          ? RED
          : isTagMatched
          ? "#3b82f6"
          : (isLyricsMode && hasLyrics)
          ? (played.has(i) ? RICH_BLUE : BLUE)
          : played.has(i)
          ? GOLD
          : GREY

        // search/filter dimming: non-matching dots recede but keep the field's shape
        const searchDim = matchSet != null && !matchSet.has(i) ? 0.15 : 1
        ctx.beginPath()
        ctx.arc(px, py, isHover || isTagMatched ? 4 : isN ? 3 : 2, 0, Math.PI * 2)
        ctx.fillStyle = dotColor
        ctx.globalAlpha = (isN || isHover || isTagMatched ? 1.0 : played.has(i) ? 0.9 : 0.5) * searchDim
        ctx.fill()

        if (data.tracks[i].fav) {
          ctx.globalAlpha = 0.9 * searchDim
          ctx.beginPath()
          ctx.arc(px, py, 5, 0, Math.PI * 2)
          ctx.strokeStyle = isTagMatched ? "#3b82f6" : GOLD
          ctx.lineWidth = 1
          ctx.stroke()
        }
      }
      ctx.globalAlpha = 1

      // 4. Draw focal pulsing dot
      if (focusIdx != null && pts[focusIdx]) {
        const isFocusHidden = hideInstrumentals && data.tracks[focusIdx].lyricsPresent !== 1
        if (!isFocusHidden) {
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
        }
      }
      raf = requestAnimationFrame(draw)
    }

    draw()
    return () => cancelAnimationFrame(raf)
  }, [data, size, focusIdx, hoverIdx, played, neighborSet, project, mapMode, zoom, hideInstrumentals, activeTag])

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
        if (hideInstrumentals && data.tracks[i].lyricsPresent !== 1) continue
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
    [data, size, project, mapMode, hideInstrumentals]
  )

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setIsDragging(true)
    dragRef.current = { startX: e.clientX, startY: e.clientY, curX: e.clientX, curY: e.clientY, moved: false }
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isDragging) {
      const dx = e.clientX - dragRef.current.startX
      const dy = e.clientY - dragRef.current.startY
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
        dragRef.current.moved = true
      }
      setPan(p => ({ x: p.x + dx, y: p.y + dy }))
      dragRef.current.startX = e.clientX
      dragRef.current.startY = e.clientY
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
      dragRef.current = { startX: t.clientX, startY: t.clientY, curX: t.clientX, curY: t.clientY, moved: false }
    }
  }

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (isDragging && e.touches.length === 1) {
      const t = e.touches[0]
      const dx = t.clientX - dragRef.current.curX
      const dy = t.clientY - dragRef.current.curY
      setPan(p => ({ x: p.x + dx, y: p.y + dy }))
      dragRef.current.curX = t.clientX
      dragRef.current.curY = t.clientY

      const dist = Math.sqrt((t.clientX - dragRef.current.startX) ** 2 + (t.clientY - dragRef.current.startY) ** 2)
      if (dist > 5) {
        dragRef.current.moved = true
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
    const nextZoom = Math.max(0.5, Math.min(zoom * delta, 30.0))
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

      {/* Lyric Topology Legend Note */}
      {mapMode === "lyrics" && (
        <div className="absolute top-2 left-3 text-[9.5px] text-blue-500 font-mono pointer-events-none select-none">
          * vocal tracks highlighted in blue
        </div>
      )}

      {/* Floating Zoom Controls */}
      <div className="absolute bottom-3 right-3 flex flex-col gap-1 z-10 select-none">
        <button
          onClick={() => setZoom(z => Math.min(z * 1.3, 30.0))}
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
        <button
          onClick={() => {
            setZoom(1.0)
            setPan({ x: 0, y: 0 })
            onClearTag?.()
          }}
          className={`w-6 h-6 flex items-center justify-center bg-white border border-neutral-200 rounded shadow-sm text-[10px] font-bold text-neutral-400 hover:bg-neutral-50 hover:text-neutral-600 active:scale-90 transition-all cursor-pointer transition-opacity duration-200 ${
            (zoom !== 1.0 || pan.x !== 0 || pan.y !== 0 || clickedTag !== null)
              ? "opacity-100 pointer-events-auto"
              : "opacity-0 pointer-events-none"
          }`}
          title="Reset View"
        >
          ⟲
        </button>
      </div>
    </div>
  )
}
