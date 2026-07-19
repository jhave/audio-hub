"use client"

import * as React from "react"
import {
  AudioPlayerProvider,
  AudioPlayerProgress,
  AudioPlayerTime,
  AudioPlayerDuration,
  useAudioPlayer,
  useAudioPlayerTime,
} from "@/components/ui/audio-player"
import { PauseIcon, PlayIcon, ArrowLeft, ArrowRight, ShuffleIcon, StarIcon, ListOrderedIcon, SparklesIcon, ChevronDown } from "lucide-react"
import { loadDH, resolveSrc, type DHData, type DHTrack } from "@/lib/dh"
import DHMap from "./DHMap"
import DHData_ from "./DHData"
import DHEssay from "./DHEssay"
import DHFAQ from "./DHFAQ"

type OrderMode = "sequential" | "random" | "random-star" | "weirdness"
type Item = { id: string; src: string; data: { title: string; album: string } }

function linkify(text: string) {
  const parts = text.split(/(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"])/g)
  return parts.map((p, i) =>
    /^https?:\/\//.test(p) ? (
      <a key={i} href={p} target="_blank" rel="noreferrer" className="underline">
        {p}
      </a>
    ) : (
      <React.Fragment key={i}>{p}</React.Fragment>
    )
  )
}


function itemFor(t: DHTrack): Item {
  return { id: t.trackId, src: resolveSrc(t.src) || "", data: { title: t.title, album: t.album } }
}

function formatFilterLabel(clickedTag: string | null): string {
  if (!clickedTag) return ""
  if (!clickedTag.startsWith("metric:")) {
    return clickedTag.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")
  }
  const parts = clickedTag.split(":")
  if (parts.length < 3) return clickedTag
  const key = parts[1]
  const val = parts[2]
  
  if (key === "key") return val
  if (key === "tempo") return `${val} Bpm`
  if (key === "tempoDrift") return `±${val} Bpm Drift`
  if (key === "tempoJumps") return parseInt(val) === 1 ? `1 Tempo Jump` : `${val} Tempo Jumps`
  if (key === "sections" || key === "sectionCount") return parseInt(val) === 1 ? `1 Section` : `${val} Sections`
  if (key === "modulations") return parseInt(val) === 1 ? `1 Modulation` : `${val} Modulations`
  if (key === "weirdness") return `Weirdness: ${val}`
  if (key === "styleWeight") return `Style Weight: ${val}`
  return clickedTag
}

export default function ExperienceClient() {
  const [data, setData] = React.useState<DHData | null>(null)
  const [err, setErr] = React.useState<string | null>(null)

  React.useEffect(() => {
    ;(async () => {
      try {
        setData(await loadDH())
      } catch (e) {
        setErr(String(e))
      }
    })()
  }, [])

  if (err) return <div className="p-6 text-sm text-red-600">Failed to load: {err}</div>
  if (!data) return <div className="p-6 text-sm text-neutral-400">Loading the archive…</div>
  return (
    <AudioPlayerProvider>
      <Inner data={data} />
    </AudioPlayerProvider>
  )
}

function Inner({ data }: { data: DHData }) {
  const player = useAudioPlayer<Item["data"]>()
  const time = useAudioPlayerTime()
  const totalHours = React.useMemo(() => {
    const totalSec = data.tracks.reduce((acc, t) => acc + (t.durationSec || 0), 0)
    return Math.round(totalSec / 3600)
  }, [data])
  const idxById = React.useMemo(
    () => Object.fromEntries(data.tracks.map((t) => [t.trackId, t.i])),
    [data]
  )
  const focusIdx = player.activeItem ? idxById[player.activeItem.id as string] ?? null : null
  const [hoverIdx, setHoverIdx] = React.useState<number | null>(null)
  const [order, setOrder] = React.useState<OrderMode>("random")
  const [played, setPlayed] = React.useState<Set<number>>(new Set())
  const [playCycle, setPlayCycle] = React.useState<number>(1)
  const [mobileTab, setMobileTab] = React.useState<"map-essay" | "listen" | "faq">("listen")
  const [showIntro, setShowIntro] = React.useState(() => {
    try {
      if (typeof window !== "undefined") {
        const sp = new URLSearchParams(window.location.search)
        if (sp.has("track") || sp.has("map")) return false
      }
    } catch {}
    return true
  })
  const [isFading, setIsFading] = React.useState(false)
  const [mapMode, setMapMode] = React.useState<"music" | "lyrics" | "metrics" | "aesthetic" | "rhythm" | "groove" | "intent" | "texture" | "narrative" | "tempo">("music")
  const [hideInstrumentals, setHideInstrumentals] = React.useState(false)

  const [projectionMethod, setProjectionMethod] = React.useState<"tsne" | "umap">("tsne")
  const [hoveredTag, setHoveredTag] = React.useState<string | null>(null)
  const [clickedTag, setClickedTag] = React.useState<string | null>(null)
  const [tutorialStep, setTutorialStep] = React.useState<number | null>(null)
  const [isMapExpanded, setIsMapExpanded] = React.useState(false)
  const activeTag = hoveredTag || clickedTag

  // 0R.3/0R.4 — search + filters (shared by list and map)
  const query = ""
  const [fStar, setFStar] = React.useState(false)
  const [fUnheard, setFUnheard] = React.useState(false)
  const [fLyrics, setFLyrics] = React.useState<null | boolean>(null) // null=any, true=lyrics, false=instrumental
  const [isAlbumOpen, setIsAlbumOpen] = React.useState(false)
  const albumRef = React.useRef<HTMLDivElement | null>(null)

  // Column width percentages for desktop 3-column resizable layout
  const [leftWidth, setLeftWidth] = React.useState<number>(40)
  const [centerWidth, setCenterWidth] = React.useState<number>(25)
  const isDraggingRef = React.useRef<"left" | "right" | null>(null)
  const [isDesktop, setIsDesktop] = React.useState(false)

  React.useEffect(() => {
    const handleResize = () => setIsDesktop(window.innerWidth >= 768)
    handleResize()
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [])

  // Restore saved column widths from localStorage if present
  React.useEffect(() => {
    try {
      const savedL = localStorage.getItem("dh-col-left")
      const savedC = localStorage.getItem("dh-col-center")
      if (savedL) setLeftWidth(parseFloat(savedL))
      if (savedC) setCenterWidth(parseFloat(savedC))
    } catch {}
  }, [])

  const handleDividerMouseDown = (divider: "left" | "right") => (e: React.MouseEvent) => {
    e.preventDefault()
    isDraggingRef.current = divider
    document.body.style.cursor = "col-resize"
    document.body.style.userSelect = "none"

    const onMouseMove = (moveEv: MouseEvent) => {
      if (!isDraggingRef.current) return
      const totalW = window.innerWidth
      const mouseX = moveEv.clientX
      const pct = (mouseX / totalW) * 100

      if (isDraggingRef.current === "left") {
        const newLeft = Math.max(15, Math.min(65, pct))
        setLeftWidth(newLeft)
        try { localStorage.setItem("dh-col-left", String(newLeft)) } catch {}
      } else if (isDraggingRef.current === "right") {
        const newCenter = Math.max(15, Math.min(100 - leftWidth - 15, pct - leftWidth))
        setCenterWidth(newCenter)
        try { localStorage.setItem("dh-col-center", String(newCenter)) } catch {}
      }
    }

    const onMouseUp = () => {
      isDraggingRef.current = null
      document.body.style.cursor = ""
      document.body.style.userSelect = ""
      window.removeEventListener("mousemove", onMouseMove)
      window.removeEventListener("mouseup", onMouseUp)
    }

    window.addEventListener("mousemove", onMouseMove)
    window.addEventListener("mouseup", onMouseUp)
  }

  const resetColumnWidths = () => {
    setLeftWidth(40)
    setCenterWidth(25)
    try {
      localStorage.removeItem("dh-col-left")
      localStorage.removeItem("dh-col-center")
    } catch {}
  }

  // Horizontal height vh values for desktop row resizers
  const [mapHeight, setMapHeight] = React.useState<number>(38)
  const [dataHeight, setDataHeight] = React.useState<number>(45)
  const isDraggingHRef = React.useRef<"map" | "data" | null>(null)

  React.useEffect(() => {
    try {
      const savedMap = localStorage.getItem("dh-map-height")
      const savedData = localStorage.getItem("dh-data-height")
      if (savedMap) setMapHeight(parseFloat(savedMap))
      if (savedData) setDataHeight(parseFloat(savedData))
    } catch {}
  }, [])

  const handleHorizontalDividerMouseDown = (divider: "map" | "data") => (e: React.MouseEvent) => {
    e.preventDefault()
    isDraggingHRef.current = divider
    document.body.style.cursor = "row-resize"
    document.body.style.userSelect = "none"

    if (divider === "map") {
      setIsMapExpanded(false)
    }

    const onMouseMove = (moveEv: MouseEvent) => {
      if (!isDraggingHRef.current) return
      const totalH = window.innerHeight
      const mouseY = moveEv.clientY
      const pct = (mouseY / totalH) * 100

      if (isDraggingHRef.current === "map") {
        const newHeight = Math.max(15, Math.min(80, pct))
        setMapHeight(newHeight)
        try { localStorage.setItem("dh-map-height", String(newHeight)) } catch {}
      } else if (isDraggingHRef.current === "data") {
        const newHeight = Math.max(15, Math.min(75, pct))
        setDataHeight(newHeight)
        try { localStorage.setItem("dh-data-height", String(newHeight)) } catch {}
      }
    }

    const onMouseUp = () => {
      isDraggingHRef.current = null
      document.body.style.cursor = ""
      document.body.style.userSelect = ""
      window.removeEventListener("mousemove", onMouseMove)
      window.removeEventListener("mouseup", onMouseUp)
    }

    window.addEventListener("mousemove", onMouseMove)
    window.addEventListener("mouseup", onMouseUp)
  }

  const resetRowHeights = () => {
    setMapHeight(38)
    setDataHeight(45)
    try {
      localStorage.removeItem("dh-map-height")
      localStorage.removeItem("dh-data-height")
    } catch {}
  }
 
  const modes: ("music" | "lyrics" | "metrics" | "aesthetic" | "rhythm" | "groove" | "intent" | "texture" | "narrative" | "tempo")[] = [
    "music", "lyrics", "metrics", "aesthetic", "rhythm", "groove", "intent", "texture", "narrative", "tempo"
  ]
  const handlePrevMode = () => {
    const idx = modes.indexOf(mapMode)
    const nextIdx = (idx - 1 + modes.length) % modes.length
    setMapMode(modes[nextIdx])
  }
  const handleNextMode = () => {
    const idx = modes.indexOf(mapMode)
    const nextIdx = (idx + 1) % modes.length
    setMapMode(modes[nextIdx])
  }



  // restore played set
  React.useEffect(() => {
    try {
      if (localStorage.getItem("dh-map-expanded") === "1") setIsMapExpanded(true)
      const raw = localStorage.getItem("dh-played")
      if (raw) {
        const loadedSet = new Set<number>(JSON.parse(raw))
        setPlayed(loadedSet)
        if (data) {
          const sp = new URLSearchParams(window.location.search)
          if (!sp.has("track") && loadedSet.size > 0 && loadedSet.size < data.tracks.length) {
            setFUnheard(true)
          }
        }
      }
      const cycle = localStorage.getItem("dh-play-cycle")
      if (cycle) setPlayCycle(parseInt(cycle, 10) || 1)
      const o = localStorage.getItem("dh-order") as OrderMode | null
      if (o) setOrder(o)
    } catch {}
  }, [data])

  // mark previous track as played AFTER it finishes/transitions away
  const prevFocusRef = React.useRef<number | null>(null)
  React.useEffect(() => {
    const prev = prevFocusRef.current
    if (prev != null && prev !== focusIdx) {
      setPlayed((prevSet) => {
        if (prevSet.has(prev)) return prevSet
        const next = new Set(prevSet)
        next.add(prev)
        try {
          localStorage.setItem("dh-played", JSON.stringify([...next]))
        } catch {}
        return next
      })
    }
    prevFocusRef.current = focusIdx

    if (focusIdx != null) {
      // Remove active track from the current shuffle bag so it isn't repeated
      bagRef.current = bagRef.current.filter((idx) => idx !== focusIdx)
    }
  }, [focusIdx])

  React.useEffect(() => {
    try {
      localStorage.setItem("dh-order", order)
    } catch {}
  }, [order])

  const playIdx = React.useCallback(
    (i: number) => {
      player.play(itemFor(data.tracks[i]))
    },
    [player, data]
  )

  // Scroll focal track into view so it sits ~30% of the way down the playlist container (below sticky header)
  const scrollRowIntoView = React.useCallback((idx: number, smooth: boolean = true) => {
    const container = document.getElementById("tutorial-playlist")
    const row = document.getElementById(`dh-row-${idx}`)
    if (!container || !row) return

    const containerRect = container.getBoundingClientRect()
    const rowRect = row.getBoundingClientRect()
    const offset = (rowRect.top - containerRect.top) - (containerRect.height * 0.3)
    container.scrollTo({
      top: container.scrollTop + offset,
      behavior: smooth ? "smooth" : "auto"
    })
  }, [])

  const dismissIntro = React.useCallback(() => {
    setIsFading(true)
    setTimeout(() => {
      setShowIntro(false)
      setTutorialStep(0) // Start the tutorial onboarding!
    }, 500)
    if (data && data.tracks.length > 0) {
      let startIdx = 0
      // deep link wins: ?track=N names the track this session is FOR
      const urlTrack = parseInt(new URLSearchParams(location.search).get("track") ?? "", 10)
      if (!isNaN(urlTrack) && data.tracks[urlTrack]) {
        startIdx = urlTrack
      } else if (played.size > 0) {
        const firstUnplayed = data.tracks.find((t) => !played.has(t.i))
        if (firstUnplayed) startIdx = firstUnplayed.i
      }
      playIdx(startIdx)
      setTimeout(() => scrollRowIntoView(startIdx, false), 600)
    }
  }, [data, played, playIdx, scrollRowIntoView])

  // shuffle "bag": exhaust every track in the pool before any repeats.
  // Bag items are popped from the END. `justPlayedRef` tracks the last pick so
  // a fresh bag never opens with the track that just closed the previous one.
  const bagRef = React.useRef<number[]>([])
  const bagModeRef = React.useRef<OrderMode | null>(null)
  const justPlayedRef = React.useRef<number | null>(null)
  const refillBag = React.useCallback(() => {
    let pool =
      order === "random-star" ? data.tracks.filter((t) => t.fav).map((t) => t.i) : data.tracks.map((t) => t.i)
    
    // Prioritize unlistened tracks
    const unlistened = pool.filter((idx) => !played.has(idx))
    if (unlistened.length > 0) {
      pool = unlistened
    }

    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[pool[i], pool[j]] = [pool[j], pool[i]]
    }
    // boundary guard: if the next pop (last element) equals the just-played
    // track, swap it to the front so the new cycle starts on something else
    if (pool.length > 1 && pool[pool.length - 1] === justPlayedRef.current) {
      ;[pool[0], pool[pool.length - 1]] = [pool[pool.length - 1], pool[0]]
    }
    bagRef.current = pool
    bagModeRef.current = order
  }, [order, data, played])

  const nextIdx = React.useCallback((): number | null => {
    const n = data.tracks.length

    if (fUnheard) {
      const q = query.trim().toLowerCase()
      let pool = data.tracks.filter((t) => {
        if (fStar && !t.fav) return false
        if (fLyrics === true && t.lyricsPresent !== 1) return false
        if (fLyrics === false && t.lyricsPresent === 1) return false
        if (q) {
          const hay = `${t.title}\n${t.album}\n${t.prompt || ""}`.toLowerCase()
          if (!hay.includes(q)) return false
        }
        return !played.has(t.i)
      }).map(t => t.i)

      const poolExcludingCurrent = pool.filter(idx => idx !== focusIdx)
      if (poolExcludingCurrent.length === 0) {
        setPlayCycle(prev => {
          const nextVal = prev + 1
          try { localStorage.setItem("dh-play-cycle", String(nextVal)) } catch {}
          return nextVal
        })
        setPlayed(new Set())
        try { localStorage.setItem("dh-played", "[]") } catch {}
        
        pool = data.tracks.filter((t) => {
          if (fStar && !t.fav) return false
          if (fLyrics === true && t.lyricsPresent !== 1) return false
          if (fLyrics === false && t.lyricsPresent === 1) return false
          if (q) {
            const hay = `${t.title}\n${t.album}\n${t.prompt || ""}`.toLowerCase()
            if (!hay.includes(q)) return false
          }
          return true
        }).map(t => t.i)
      }

      if (pool.length === 0) return null

      // Always advance sequentially through the matching unheard pool
      const nextInPool = pool.find(idx => focusIdx == null || idx > focusIdx)
      const pick = nextInPool !== undefined ? nextInPool : pool[0]
      justPlayedRef.current = pick
      return pick
    }

    if (order === "weirdness") {
      const sorted = [...data.tracks].sort((a, b) => (b.weirdness ?? 0) - (a.weirdness ?? 0))
      const currIdx = sorted.findIndex((t) => t.i === focusIdx)
      const nextTrack = sorted[(currIdx + 1) % sorted.length]
      justPlayedRef.current = nextTrack.i
      return nextTrack.i
    }
    if (order === "sequential") {
      const i = focusIdx == null ? 0 : (focusIdx + 1) % n
      justPlayedRef.current = i
      return i
    }
    if (bagModeRef.current !== order || bagRef.current.length === 0) refillBag()
    const pick = bagRef.current.pop() ?? null
    justPlayedRef.current = pick
    return pick
  }, [order, focusIdx, data, refillBag, fUnheard, played, query, fStar, fLyrics])

  const prevIdx = React.useCallback((): number | null => {
    if (focusIdx == null) return 0

    if (fUnheard) {
      const q = query.trim().toLowerCase()
      const pool = data.tracks.filter((t) => {
        if (fStar && !t.fav) return false
        if (fLyrics === true && t.lyricsPresent !== 1) return false
        if (fLyrics === false && t.lyricsPresent === 1) return false
        if (q) {
          const hay = `${t.title}\n${t.album}\n${t.prompt || ""}`.toLowerCase()
          if (!hay.includes(q)) return false
        }
        return !played.has(t.i)
      }).map(t => t.i)

      if (pool.length === 0) return null

      // Always go backwards sequentially through the matching unheard pool
      const reversedPool = [...pool].reverse()
      const prevInPool = reversedPool.find(idx => idx < focusIdx)
      return prevInPool !== undefined ? prevInPool : pool[pool.length - 1]
    }

    if (order === "weirdness") {
      const sorted = [...data.tracks].sort((a, b) => (b.weirdness ?? 0) - (a.weirdness ?? 0))
      const currIdx = sorted.findIndex((t) => t.i === focusIdx)
      const prevTrack = sorted[(currIdx - 1 + sorted.length) % sorted.length]
      return prevTrack.i
    }
    return (focusIdx - 1 + data.tracks.length) % data.tracks.length
  }, [focusIdx, data, order, fUnheard, played, query, fStar, fLyrics])

  // auto-advance
  React.useEffect(() => {
    const audio = player.ref.current
    if (!audio) return
    const onEnded = () => {
      const i = nextIdx()
      if (i != null) playIdx(i)
    }
    audio.addEventListener("ended", onEnded)
    return () => audio.removeEventListener("ended", onEnded)
  }, [player.ref, nextIdx, playIdx])

  // Keyboard arrow keys navigation
  React.useEffect(() => {
    if (!data) return
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement
      if (
        activeEl &&
        (activeEl.tagName === "INPUT" ||
          activeEl.tagName === "TEXTAREA" ||
          activeEl.getAttribute("contenteditable") === "true")
      ) {
        return
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault()
        const i = prevIdx()
        if (i != null) playIdx(i)
      } else if (e.key === "ArrowRight") {
        e.preventDefault()
        const i = nextIdx()
        if (i != null) playIdx(i)
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [data, playIdx, prevIdx, nextIdx])

  // scroll center list to focal track (positioned at ~30% viewport height)
  React.useEffect(() => {
    if (focusIdx == null) return
    scrollRowIntoView(focusIdx, true)
  }, [focusIdx, scrollRowIntoView])

  // scroll FAQ sidebar to describe the active map projection space
  React.useEffect(() => {
    const idMap: Record<string, string> = {
      music: "faq-acoustic-timbre-space-music-",
      lyrics: "faq-semantic-lyric-space-lyrics-",
      metrics: "faq-structural-umap-metrics-",
      aesthetic: "faq-aesthetic-umap-aesthetic-",
      rhythm: "faq-rhythm-umap-rhythm-",
      groove: "faq-groove-grid",
      intent: "faq-intent-space",
      texture: "faq-texture-space",
      narrative: "faq-narrative-space",
      tempo: "faq-tempo-line"
    }
    const targetId = idMap[mapMode]
    if (targetId) {
      const el = document.getElementById(targetId)
      if (el) {
        // Expand parent details element if collapsed
        const details = el.closest("details")
        if (details) details.open = true

        const container = document.getElementById("dh-faq-container")
        if (container) {
          const rect = el.getBoundingClientRect()
          const containerRect = container.getBoundingClientRect()
          const relativeTop = rect.top - containerRect.top + container.scrollTop
          container.scrollTo({
            top: relativeTop - 12,
            behavior: "smooth"
          })
        }
      }
    }
  }, [mapMode])

  const handleMetricClick = React.useCallback((term: string) => {
    const key = term.toLowerCase().trim()

    // A. Switch map category to a relevant projection
    const modeMap: Record<string, typeof mapMode> = {
      complexity: "texture",
      bounce: "texture",
      weirdness: "intent",
      styleweight: "intent",
      journey: "narrative",
      spread: "narrative",
      tempo: "tempo",
      tempodrift: "tempo",
      tempojumps: "tempo",
      key: "groove",
      modulations: "groove"
    }
    const targetMode = modeMap[key]
    if (targetMode) {
      setMapMode(targetMode)
    }

    // B. Scroll the essay to a relevant section
    const essayMap: Record<string, string> = {
      complexity: "essay-the-fractal-of-a-track",
      bounce: "essay-the-fractal-of-a-track",
      journey: "essay-the-fractal-of-a-track",
      spread: "essay-the-fractal-of-a-track",
      weirdness: "essay-hyperparameters-as-weather",
      styleweight: "essay-hyperparameters-as-weather",
      tempo: "essay-the-sousaphone-phantom-ai-classification-drift",
      tempodrift: "essay-the-sousaphone-phantom-ai-classification-drift",
      tempojumps: "essay-the-sousaphone-phantom-ai-classification-drift",
      key: "essay-the-sousaphone-phantom-ai-classification-drift",
      modulations: "essay-the-sousaphone-phantom-ai-classification-drift",
    }
    const targetEssayId = essayMap[key]
    if (targetEssayId) {
      const essayEl = document.getElementById(targetEssayId)
      const essayContainer = document.getElementById("dh-essay-container")
      if (essayEl && essayContainer) {
        const rect = essayEl.getBoundingClientRect()
        const containerRect = essayContainer.getBoundingClientRect()
        const relativeTop = rect.top - containerRect.top + essayContainer.scrollTop
        essayContainer.scrollTo({
          top: relativeTop - 12,
          behavior: "smooth"
        })
      }
    }

    const idMap: Record<string, string> = {
      music: "faq-acoustic-timbre-space-music-",
      lyrics: "faq-semantic-lyric-space-lyrics-",
      metrics: "faq-structural-t-sne-metrics-",
      aesthetic: "faq-aesthetic-t-sne-aesthetic-",
      rhythm: "faq-rhythm-t-sne-rhythm-",
      groove: "faq-groove-grid",
      intent: "faq-intent-space",
      texture: "faq-texture-space",
      narrative: "faq-narrative-space",
      tempo: "faq-tempo-line"
    }

    // 1. Try direct mapped ID
    let targetEl = idMap[key] ? document.getElementById(idMap[key]) : null

    // 2. Try simple normalized ID
    if (!targetEl) {
      const normalized = key.replace(/[^a-z0-9]+/g, "-")
      targetEl = document.getElementById(`faq-${normalized}`) || document.getElementById(normalized)
    }

    // 3. Fallback: Search all heading elements for content matching the term
    if (!targetEl) {
      const container = document.getElementById("dh-faq-container")
      if (container) {
        const headings = container.querySelectorAll("h1, h2, h3, h4, h5, h6, strong")
        for (const el of Array.from(headings)) {
          const textVal = el.textContent || ""
          if (textVal.toLowerCase().includes(key)) {
            targetEl = el as HTMLElement
            break
          }
        }
      }
    }

    if (!targetEl) return

    // Flash highlight
    targetEl.classList.add("bg-yellow-200", "scale-105")
    setTimeout(() => {
      targetEl?.classList.remove("bg-yellow-200", "scale-105")
    }, 1500)

    const container = document.getElementById("dh-faq-container")
    if (container) {
      const containerRect = container.getBoundingClientRect()
      const targetRect = targetEl.getBoundingClientRect()
      const relativeTop = targetRect.top - containerRect.top + container.scrollTop
      container.scrollTo({
        top: relativeTop - 12,
        behavior: "smooth"
      })
    }
  }, [setMapMode])

  // Auto-leap the FAQ glossary to the corresponding description on topology change
  React.useEffect(() => {
    if (!showIntro) {
      // Small timeout to allow map state to settle
      const t = setTimeout(() => {
        handleMetricClick(mapMode)
      }, 50)
      return () => clearTimeout(t)
    }
  }, [mapMode, showIntro, handleMetricClick])

  const touchStartXRef = React.useRef(0)
  const touchStartYRef = React.useRef(0)

  const handleTouchStart = React.useCallback((e: React.TouchEvent) => {
    touchStartXRef.current = e.changedTouches[0].clientX
    touchStartYRef.current = e.changedTouches[0].clientY
  }, [])

  const handleTouchEnd = React.useCallback((e: React.TouchEvent) => {
    const endX = e.changedTouches[0].clientX
    const endY = e.changedTouches[0].clientY
    
    const diffX = endX - touchStartXRef.current
    const diffY = endY - touchStartYRef.current

    if (Math.abs(diffX) > 60 && Math.abs(diffY) < 50) {
      const tabs: ("map-essay" | "listen" | "faq")[] = ["map-essay", "listen", "faq"]
      const idx = tabs.indexOf(mobileTab)
      if (diffX < 0) {
        const next = tabs[(idx + 1) % tabs.length]
        setMobileTab(next)
      } else {
        const prev = tabs[(idx - 1 + tabs.length) % tabs.length]
        setMobileTab(prev)
      }
    }
  }, [mobileTab])

  const rightIdx = hoverIdx ?? focusIdx
  const rightTrack = rightIdx != null ? data.tracks[rightIdx] : null
  const isLive = rightIdx === focusIdx && hoverIdx == null
  const progress = player.duration ? time / player.duration : null

  // group tracks by album (dh order preserves album grouping)
  // matchSet: null = no active search/filter (everything full-strength);
  // otherwise the set of track indices that match query AND filters.
  const filtersActive = query.trim() !== "" || fStar || fUnheard || fLyrics !== null
  const matchSet = React.useMemo<Set<number> | null>(() => {
    if (!filtersActive) return null
    const q = query.trim().toLowerCase()
    const s = new Set<number>()
    for (const t of data.tracks) {
      if (fStar && !t.fav) continue
      if (fUnheard && played.has(t.i)) continue
      if (fLyrics === true && t.lyricsPresent !== 1) continue
      if (fLyrics === false && t.lyricsPresent === 1) continue
      if (q) {
        const hay = `${t.title}\n${t.album}\n${t.prompt || ""}`.toLowerCase()
        if (!hay.includes(q)) continue
      }
      s.add(t.i)
    }
    return s
  }, [filtersActive, query, fStar, fUnheard, fLyrics, data, played])

  // 0R.11 — keyboard: Space play/pause, arrows prev/next,
  // s cycles order, m cycles map mode (all inert while typing)
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === "INPUT" || tag === "TEXTAREA") return
      if (e.code === "Space") {
        e.preventDefault()
        if (player.isPlaying) player.pause()
        else player.play()
      } else if (e.key === "ArrowRight") {
        e.preventDefault()
        const i = nextIdx()
        if (i != null) playIdx(i)
      } else if (e.key === "ArrowLeft") {
        e.preventDefault()
        const i = prevIdx()
        if (i != null) playIdx(i)
      } else if (e.key === "s") {
        setOrder(order === "sequential" ? "random" : order === "random" ? "random-star" : "sequential")
      } else if (e.key === "m") {
        handleNextMode()
      }
    }
    addEventListener("keydown", onKey)
    return () => removeEventListener("keydown", onKey)
  })

  // 0R.8 — deep-linkable state: restore once from URL, then mirror into it
  const restoredRef = React.useRef(false)
  React.useEffect(() => {
    if (restoredRef.current) return
    restoredRef.current = true
    try {
      const sp = new URLSearchParams(location.search)
      const m = sp.get("map")
      if (m && (modes as string[]).includes(m)) setMapMode(m as typeof mapMode)
      const tr = sp.get("track")
      if (tr != null) {
        const i = parseInt(tr, 10)
        if (!isNaN(i) && data.tracks[i]) {
          player.setActiveItem(itemFor(data.tracks[i])).catch(() => {})
          setTimeout(() => scrollRowIntoView(i, true), 700)
        }
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

  React.useEffect(() => {
    if (!restoredRef.current) return
    try {
      const sp = new URLSearchParams()
      if (focusIdx != null) sp.set("track", String(focusIdx))
      if (mapMode !== "music") sp.set("map", mapMode)
      const s = sp.toString()
      history.replaceState(null, "", s ? `?${s}` : location.pathname)
    } catch {}
  }, [focusIdx, mapMode])

  const groups = React.useMemo(() => {
    if (order === "weirdness") {
      const sorted = [...data.tracks].sort((a, b) => (b.weirdness ?? 0) - (a.weirdness ?? 0))
      return [{ album: "Sorted by Weirdness (Most Weird First)", dateISO: null, prompt: null, rows: sorted }]
    }
    const g: { album: string; dateISO: string | null; prompt: string | null; rows: DHTrack[] }[] = []
    const promptByAlbumId = Object.fromEntries((data.albums || []).map((a) => [a.title, a.prompt]))
    for (const t of data.tracks) {
      const last = g[g.length - 1]
      if (last && last.album === t.album) {
        last.rows.push(t)
      } else {
        g.push({
          album: t.album,
          dateISO: t.dateISO,
          prompt: promptByAlbumId[t.album] || null,
          rows: [t]
        })
      }
    }
    return g
  }, [data, order])

  let methodSuffix = ""
  if (mapMode === "music" || mapMode === "lyrics") methodSuffix = "-512"
  if (mapMode === "metrics") methodSuffix = "-13"
  if (mapMode === "aesthetic") methodSuffix = "-9"
  if (mapMode === "rhythm") methodSuffix = "-4"

  const projLabel = (projectionMethod === "umap" ? "UMAP" : "t-SNE") + methodSuffix

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      className="flex flex-col h-screen overflow-hidden md:flex-row"
    >
      {/* Mobile Tab Bar Header */}
      <div className="flex border-b bg-white text-[12px] md:hidden select-none flex-shrink-0">
        {(
          [
            ["map-essay", "Map & Theory"],
            ["listen", "Player"],
            ["faq", "FAQ & Data"],
          ] as const
        ).map(([tab, label]) => (
          <button
            key={tab}
            onClick={() => setMobileTab(tab)}
            className={`flex-1 py-3 text-center font-bold border-b-2 transition-colors ${
              mobileTab === tab ? "border-[#e24b4a] text-[#e24b4a]" : "border-transparent text-neutral-500"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* LEFT: persistent map + essay */}
      <aside
        style={isDesktop ? { flexBasis: isMapExpanded ? "66.66%" : `${leftWidth}%` } : undefined}
        className={`${
          mobileTab === "map-essay" ? "flex flex-col h-full min-h-0 flex-1" : "hidden"
        } md:flex md:flex-col md:flex-shrink-0 border-r bg-neutral-50 h-full min-h-0 overflow-hidden`}
      >
        <div id="tutorial-map" className="flex flex-col flex-shrink-0 select-none bg-transparent">
          <div className="flex flex-col items-start w-full gap-y-1.5 px-3 pt-2.5 pb-1 text-[11px] text-neutral-500 bg-transparent">
            <div className="flex flex-wrap items-center gap-1">
              {([
                ["learned", [["music","Music",`${projLabel} of CLAP audio embeddings — distance = machine-heard similarity`],["lyrics","Lyrics",`${projLabel} of lyric text embeddings — distance = what the words mean`],["metrics","Metrics",`${projLabel} of all 13 measured descriptors`],["aesthetic","Aesthetic",`Metrics subspace: 9 aesthetic features (harmony, energy, texture) via ${projLabel}`],["rhythm","Rhythm",`Metrics subspace: 4 rhythm features (tempo, drift, bounce, onsets) via ${projLabel}`]]],
                ["measured", [["groove","Groove","x: tempo · y: circle of fifths"],["intent","Intent","x: weirdness · y: style weight (Suno generation sliders)"],["texture","Texture","x: bounce · y: melodic complexity"],["narrative","Narrative","x: journey · y: spread (trajectory statistics)"],["tempo","Tempo","x: tempo (one line)"]]],
              ] as const).map(([group, tabs]) => (
                <div key={group} className="flex bg-neutral-200/40 rounded p-0.5 text-[9px] font-bold">
                  {tabs.map(([mode, label, tip]) => (
                    <button
                      key={mode}
                      onClick={() => {
                        setMapMode(mode)
                        setClickedTag(null)
                      }}
                      className={`px-1 py-0.5 rounded transition-all cursor-pointer ${
                        mapMode === mode ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500 hover:text-neutral-700"
                      }`}
                      title={tip}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2 min-h-[22px]">
              {mapMode === "lyrics" && (
                <label className="flex items-center gap-1 cursor-pointer select-none text-[9.5px] text-neutral-500 hover:text-neutral-700">
                  <input
                    type="checkbox"
                    checked={hideInstrumentals}
                    onChange={(e) => setHideInstrumentals(e.target.checked)}
                    className="rounded border-neutral-300 text-neutral-900 focus:ring-0 w-3 h-3 cursor-pointer"
                  />
                  <span>hide instrumentals</span>
                </label>
              )}


              {/* UMAP vs t-SNE segmented selector pills */}
              {(["music", "lyrics", "metrics", "aesthetic", "rhythm"] as typeof mapMode[]).includes(mapMode) && (
                <div className="flex bg-neutral-200/40 rounded p-0.5 text-[9px] font-bold gap-0.5">
                  {(
                    [
                      ["tsne", "t-SNE"],
                      ["umap", "UMAP"],
                    ] as const
                  ).map(([method, label]) => {
                    let suffix = ""
                    if (mapMode === "music" || mapMode === "lyrics") suffix = "-512"
                    if (mapMode === "metrics") suffix = "-13"
                    if (mapMode === "aesthetic") suffix = "-9"
                    if (mapMode === "rhythm") suffix = "-4"
                    return (
                      <button
                        key={method}
                        onClick={() => setProjectionMethod(method)}
                        className={`px-1.5 py-0.5 rounded transition-all cursor-pointer select-none ${
                          projectionMethod === method
                            ? "bg-white text-neutral-900 shadow-sm"
                            : "text-neutral-500 hover:text-neutral-700"
                        }`}
                      >
                        {method === "tsne" ? "t-SNE" : "UMAP"}{suffix}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        <div
          id="tutorial-map-canvas"
          style={isDesktop ? { height: isMapExpanded ? "66.6vh" : `${mapHeight}vh` } : undefined}
          className="w-full flex-shrink-0 relative border-b bg-neutral-50 overflow-hidden"
        >
          {/* Top-left Expand/Collapse button */}
          <button
            onClick={() => {
              const next = !isMapExpanded
              setIsMapExpanded(next)
              try { localStorage.setItem("dh-map-expanded", next ? "1" : "0") } catch {}
            }}
            className="absolute top-2.5 left-2.5 z-20 w-6 h-6 flex items-center justify-center bg-white border border-neutral-200 rounded shadow-sm text-[12px] font-bold text-neutral-600 hover:bg-neutral-50 hover:text-black active:scale-95 transition-all cursor-pointer select-none"
            title={isMapExpanded ? "Collapse map" : "Expand map"}
          >
            {isMapExpanded ? "⤡" : "⤢"}
          </button>

          {/* Floating HUD Label inside map container (compact layout, top-right under the tabs, level with expand button top) */}
          <div className="absolute top-2.5 right-2.5 z-10 pointer-events-none select-none bg-white/40 backdrop-blur-md px-2 py-1.5 rounded-lg border border-white/20 shadow-sm leading-tight flex flex-col gap-0.5 transition-all duration-300 w-auto">
            <div className="flex flex-col gap-0.5 text-left">
              <span className="text-[12px] font-bold text-neutral-800 tracking-wide">
                {clickedTag ? (
                  <span>Focus: {formatFilterLabel(clickedTag)}</span>
                ) : (
                  <>
                    {mapMode === "music" && "Acoustic Timbre Space"}
                    {mapMode === "lyrics" && "Semantic Lyric Space"}
                    {mapMode === "metrics" && `Structural ${projLabel} (13D)`}
                    {mapMode === "aesthetic" && `Aesthetic ${projLabel} (9D)`}
                    {mapMode === "rhythm" && `Rhythm ${projLabel} (4D)`}
                    {mapMode === "groove" && "Groove Grid"}
                    {mapMode === "intent" && "Intent Space"}
                    {mapMode === "texture" && "Texture Space"}
                    {mapMode === "narrative" && "Narrative Space"}
                    {mapMode === "tempo" && "Tempo Line"}
                  </>
                )}
              </span>
              <span className="text-[8.5px] text-neutral-500 font-semibold">
                {clickedTag ? (
                  "Focus lens active — matching tracks centered."
                ) : (
                  <>
                    {mapMode === "music" && "mapped by genre & sound similarity"}
                    {mapMode === "lyrics" && "mapped by lyrics & prompt concepts"}
                    {mapMode === "metrics" && `mapped by 13 musicological metrics using ${projLabel}`}
                    {mapMode === "aesthetic" && `mapped by ablated 9-dimensional composition metrics using ${projLabel}`}
                    {mapMode === "rhythm" && `mapped by ablated 4-dimensional rhythm & density metrics using ${projLabel}`}
                    {mapMode === "groove" && "Tempo (X) vs. Key (Y: Circle of Fifths)"}
                    {mapMode === "intent" && "Weirdness (X) vs. Style Weight (Y)"}
                    {mapMode === "texture" && "Bounce (X) vs. Complexity (Y)"}
                    {mapMode === "narrative" && "Journey (X) vs. Spread (Y)"}
                    {mapMode === "tempo" && "Tempo (X: slow left → fast right)"}
                  </>
                )}
              </span>
            </div>
          </div>
          <DHMap
            data={data}
            focusIdx={focusIdx}
            hoverIdx={hoverIdx}
            played={played}
            onHover={setHoverIdx}
            onPlay={playIdx}
            mapMode={mapMode}
            hideInstrumentals={hideInstrumentals}
            activeTag={activeTag}
            clickedTag={clickedTag}
            onClearTag={() => setClickedTag(null)}
            showPaths={true}
            showKnn={true}
            matchSet={matchSet}
            projectionMethod={projectionMethod}
          />
        </div>

        {/* HORIZONTAL DIVIDER: Map | Essay */}
        {isDesktop && (
          <div
            onMouseDown={handleHorizontalDividerMouseDown("map")}
            onDoubleClick={resetRowHeights}
            className="w-full h-1.5 hover:h-2 bg-neutral-200/40 hover:bg-[#e24b4a]/70 cursor-row-resize select-none transition-all flex-shrink-0 z-30 flex items-center justify-center group"
            title="Drag to resize map (Double-click to reset heights)"
          >
            <div className="h-[1.5px] w-8 bg-neutral-300 group-hover:bg-white rounded-full transition-colors" />
          </div>
        )}

        <div id="tutorial-essay" className="flex-1 min-h-0 bg-white overflow-hidden">
          <DHEssay text={data.essay || ""} />
        </div>
      </aside>

      {/* DIVIDER 1: Left | Center */}
      {isDesktop && (
        <div
          onMouseDown={handleDividerMouseDown("left")}
          onDoubleClick={resetColumnWidths}
          className="w-1.5 hover:w-2 bg-neutral-200/40 hover:bg-[#e24b4a]/70 cursor-col-resize select-none transition-all flex-shrink-0 z-30 flex items-center justify-center group"
          title="Drag to resize columns (Double-click to reset layout)"
        >
          <div className="w-[1.5px] h-8 bg-neutral-300 group-hover:bg-white rounded-full transition-colors" />
        </div>
      )}

      {/* CENTER: the (familiar) player list */}
      <main
        id="tutorial-playlist"
        style={isDesktop ? { flexBasis: isMapExpanded ? "0%" : `${centerWidth}%` } : undefined}
        className={`${
          mobileTab === "listen" ? "block flex-1" : "hidden"
        } ${isMapExpanded ? "md:hidden" : "md:block md:flex-shrink-0"} min-h-0 overflow-y-auto pb-28 overflow-hidden`}
      >
        {/* 0R.3/0R.4 — sticky search + filter chips */}
        <div className="sticky top-0 z-10 -mx-4 mb-3 border-b bg-neutral-50/95 backdrop-blur flex flex-col select-none relative">
          <div className="w-full bg-[#fef2f2]/60 border-b border-red-100/30 py-[3px] px-4 text-center leading-none">
            <span className="text-[9px] font-bold tracking-widest text-red-700 uppercase">
              171 days · 746 AI tracks ({totalHours}h) · data science info-visualization · <span className="text-[7.5px] tracking-normal font-semibold">07-</span>2026
            </span>
          </div>
          
          <div className="px-4 pt-1.5 pb-1 flex flex-col gap-1.5">
            {/* Row 1: Album Jump dropdown + heard counter + logos */}
            <div className="flex items-center justify-between w-full gap-2">
              <div ref={albumRef} className="relative flex-grow max-w-[286px] self-center">
                <button
                  onClick={() => setIsAlbumOpen(!isAlbumOpen)}
                  className="h-[22px] w-full rounded-full border border-neutral-200 bg-white px-2.5 text-[10px] text-neutral-600 font-medium flex items-center justify-between cursor-pointer hover:border-neutral-300 transition-colors select-none"
                  title="Jump to album"
                >
                  <span className="truncate">jump to album…</span>
                  <ChevronDown className="h-3 w-3 text-neutral-400 flex-shrink-0 ml-1" />
                </button>
                {isAlbumOpen && (
                  <div className="absolute top-full left-0 mt-1 w-full min-w-[286px] bg-white border border-neutral-200/80 rounded-xl shadow-lg z-30 max-h-[560px] overflow-y-auto py-1 scrollbar-thin scrollbar-thumb-neutral-200">
                    {data.albums.map((a) => (
                      <button
                        key={a.id}
                        onClick={() => {
                          setIsAlbumOpen(false)
                          document.getElementById(`dh-album-${a.title}`)?.scrollIntoView({ behavior: "smooth", block: "start" })
                        }}
                        className="w-full px-3.5 py-2 text-left text-[11px] text-neutral-700 hover:bg-neutral-50 hover:text-neutral-900 border-b border-neutral-100/50 last:border-0 cursor-pointer transition-colors truncate font-medium"
                      >
                        {a.title}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Centered heard counter (vertical `# / total` + `heard` + `%`) */}
              <div 
                onClick={() => {
                  if (confirm("Reset heard history for this cycle?")) {
                    setPlayed(new Set())
                    setPlayCycle(1)
                    try {
                      localStorage.setItem("dh-played", "[]")
                      localStorage.setItem("dh-play-cycle", "1")
                    } catch {}
                  }
                }}
                className="text-center leading-[1.0] font-mono text-neutral-400 select-none flex-shrink-0 flex flex-col justify-center items-center mx-auto border-l border-r border-neutral-200/50 px-3 h-[24px] self-center cursor-pointer hover:bg-neutral-100/50 rounded transition-colors" 
                title="Songs played / total heard (click to reset)"
              >
                <span className="font-bold text-neutral-700 text-[10px] leading-none">{played.size} / {data.tracks.length}</span>
                <span className="text-[6.5px] uppercase tracking-wider text-neutral-400 mt-0.5 leading-none">
                  heard {playCycle > 1 ? `(#${playCycle})` : ""}
                </span>
                <span className="text-[6px] font-bold text-neutral-400/80 tracking-wider mt-[2px] leading-none">
                  {Math.round((played.size / data.tracks.length) * 100)}%
                </span>
              </div>

              {/* Logos container with text link below */}
              <div className="flex flex-col items-center flex-shrink-0 self-center">
                <div className="flex items-center gap-1.5 z-20">
                  {/* Suno Icon */}
                  <a 
                    href="https://suno.com/@jhave" 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="w-[22px] h-[22px] rounded-full border border-neutral-200 bg-white flex items-center justify-center hover:border-neutral-300 hover:opacity-100 opacity-80 transition-all shadow-sm cursor-pointer overflow-hidden"
                    title="suno.com/@jhave"
                  >
                    <img 
                      src="/img/suno-jhave.webp" 
                      alt="Suno Profile" 
                      className="w-full h-full object-cover select-none"
                    />
                  </a>

                  {/* Glia Logo */}
                  <a 
                    href="https://glia.ca" 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="w-[22px] h-[22px] rounded-full border border-neutral-200 bg-white flex items-center justify-center hover:border-neutral-300 hover:opacity-100 opacity-80 transition-all shadow-sm cursor-pointer overflow-hidden p-1"
                    title="glia.ca"
                  >
                    <img 
                      src="/img/glia-bw.png" 
                      alt="glia.ca" 
                      className="w-full h-full object-contain select-none"
                    />
                  </a>
                </div>
                <span className="text-[6.5px] font-bold text-neutral-400/80 tracking-wider mt-[2px] uppercase select-none leading-none">
                  jhave · glia
                </span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 w-full">
              {(["★ starred", "unheard", "lyrics", "instrumental"] as const).map((label) => {
                const on =
                  label === "★ starred" ? fStar :
                  label === "unheard" ? fUnheard :
                  label === "lyrics" ? fLyrics === true : fLyrics === false
                const toggle = () => {
                  if (label === "★ starred") setFStar(!fStar)
                  else if (label === "unheard") setFUnheard(!fUnheard)
                  else if (label === "lyrics") setFLyrics(fLyrics === true ? null : true)
                  else setFLyrics(fLyrics === false ? null : false)
                }
                return (
                  <button
                    key={label}
                    onClick={toggle}
                    className={`whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[10px] transition-colors cursor-pointer select-none ${
                      on ? "border-neutral-800 bg-neutral-800 text-white" : "border-neutral-200 text-neutral-500 hover:bg-neutral-50"
                    }`}
                  >
                    {label}
                  </button>
                )
              })}
              {filtersActive && (
                <span className="ml-auto whitespace-nowrap text-[10px] text-neutral-400">
                  {matchSet?.size ?? 0} match{(matchSet?.size ?? 0) === 1 ? "" : "es"}
                  <button
                    onClick={() => { setFStar(false); setFUnheard(false); setFLyrics(null) }}
                    className="ml-2 underline hover:text-neutral-600 cursor-pointer"
                  >
                    clear
                  </button>
                </span>
              )}
            </div>
          </div>
        </div>

        <header className="mb-3 mt-1.5">
          <h1 className="text-xl font-semibold">171 days, {data.tracks.length} tracks — Digital Humanities archive view</h1>
          <p className="mt-1 text-[12px] text-neutral-500">
            Every track sits in the machine-heard topology (left) with its analysis (right).
            Hover a title to preview; play to travel.
          </p>
        </header>

        <div className="space-y-6">
          {groups.map((g) => {
            const albumMatches = matchSet ? g.rows.filter((t) => matchSet.has(t.i)).length : g.rows.length
            if (matchSet && albumMatches === 0) return null
            return (
            <section key={g.album} id={`dh-album-${g.album}`} className="scroll-mt-14 rounded-2xl border bg-white p-4">
              <div className="mb-3">
                {g.dateISO && <p className="text-[11px] text-neutral-400">{g.dateISO}</p>}
                <h2 className="text-lg font-semibold leading-snug">{g.album}</h2>
                {g.prompt && (
                  <p className="mt-1 text-[11px] italic leading-snug text-neutral-500 whitespace-pre-line select-text border-l-2 border-neutral-200/50 pl-2">
                    {g.prompt}
                  </p>
                )}
              </div>
              <div className="space-y-0.5">
                {g.rows.map((t) => (
                  <div key={t.trackId} className={matchSet && !matchSet.has(t.i) ? "opacity-30" : undefined}>
                  <Row
                    t={t}
                    active={focusIdx === t.i}
                    playing={focusIdx === t.i && player.isPlaying}
                    isPlayed={played.has(t.i)}
                    onPlay={() => (focusIdx === t.i && player.isPlaying ? player.pause() : playIdx(t.i))}
                    onHover={() => setHoverIdx(t.i)}
                    onLeave={() => setHoverIdx(null)}
                  />
                  </div>
                ))}
              </div>
            </section>
            )
          })}
        </div>
      </main>

      {/* DIVIDER 2: Center | Right */}
      {isDesktop && !isMapExpanded && (
        <div
          onMouseDown={handleDividerMouseDown("right")}
          onDoubleClick={resetColumnWidths}
          className="w-1.5 hover:w-2 bg-neutral-200/40 hover:bg-[#e24b4a]/70 cursor-col-resize select-none transition-all flex-shrink-0 z-30 flex items-center justify-center group"
          title="Drag to resize columns (Double-click to reset layout)"
        >
          <div className="w-[1.5px] h-8 bg-neutral-300 group-hover:bg-white rounded-full transition-colors" />
        </div>
      )}

      {/* RIGHT: persistent data + FAQ */}
      <aside
        onMouseEnter={() => setHoverIdx(null)}
        style={isDesktop ? { flexBasis: isMapExpanded ? "33.33%" : `${100 - leftWidth - centerWidth}%` } : undefined}
        className={`${
          mobileTab === "faq" ? "flex flex-col h-full min-h-0 flex-1" : "hidden"
        } md:flex md:flex-col md:flex-shrink-0 border-l bg-white h-full min-h-0 overflow-hidden`}
      >
        <div
          id="tutorial-data"
          className="flex-shrink-0 border-b bg-white overflow-y-auto scrollbar-none max-h-[60vh]"
        >
          <DHData_
            track={rightTrack}
            isLive={isLive}
            progress={progress}
            onMetricClick={handleMetricClick}
            activeTag={activeTag}
            onTagHover={setHoveredTag}
            clickedTag={clickedTag}
            onTagClick={setClickedTag}
            hoverIdx={hoverIdx}
            onCopyLink={() => {
              try {
                const u = new URL(window.location.href)
                u.searchParams.delete("unheard")
                u.searchParams.delete("filter")
                navigator.clipboard.writeText(u.toString())
              } catch {}
            }}
            onTitleClick={() => {
              if (focusIdx != null) {
                scrollRowIntoView(focusIdx, true)
              }
            }}
          />
        </div>
        <div id="dh-faq-container" className="flex-1 min-h-0 bg-neutral-50 overflow-y-auto p-4 scroll-smooth">
          <DHFAQ
            text={data.faq || ""}
            tracks={data.tracks}
            onPlay={playIdx}
            activeTag={activeTag}
            onTagHover={setHoveredTag}
            clickedTag={clickedTag}
            onTagClick={setClickedTag}
          />
        </div>
      </aside>

      <Dock
        order={order}
        setOrder={setOrder}
        onPrev={() => {
          const i = prevIdx()
          if (i != null) playIdx(i)
        }}
        onNext={() => {
          const i = nextIdx()
          if (i != null) playIdx(i)
        }}
        playCycle={playCycle}
      />

      {tutorialStep !== null && (
        <OnboardingTutorial
          step={tutorialStep}
          onNext={() => {
            if (tutorialStep < 6) setTutorialStep(tutorialStep + 1)
            else setTutorialStep(null)
          }}
          onPrev={() => {
            if (tutorialStep > 0) setTutorialStep(tutorialStep - 1)
          }}
          onSkip={() => setTutorialStep(null)}
        />
      )}

      {showIntro && (
        <div
          className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-white p-8 transition-opacity duration-500 ease-in-out ${
            isFading ? "opacity-0 pointer-events-none" : "opacity-100"
          }`}
        >
          <div className="max-w-4xl text-center flex flex-col items-center">
            {/* Top Centered Logo (now inside content box and 40% larger) */}
            <img src="/img/glia-bw.png" alt="glia.ca" className="h-20 object-contain opacity-80 mb-5 select-none" />

            <h1 className="text-4xl font-extrabold tracking-tight text-neutral-900 mb-1 select-none">
              171 Days
            </h1>
            
            <p className="text-[12px] text-neutral-400 mb-5 select-none font-mono">
              January 18 to July 11, 2026
            </p>

            <p className="text-[18px] leading-relaxed text-neutral-700 mb-4 font-light select-text max-w-3xl">
              Machine learning analysis of a 31 hour corpus of AI generated music in a playable interface.
              <span className="block mt-3.5 text-[14.5px] text-neutral-500 italic font-serif leading-relaxed">
                “It is a mild comfort to realize that basic datascience cannot discern beauty, identify novelty, know banality, etc. Subjective taste remains elusive.”
              </span>
            </p>

            <div className="text-[10.5px] text-neutral-500 mb-4 font-mono select-none space-y-0.5 w-full max-w-md">
              <div>Music: Suno 5.5 · Human: Jhave</div>
              <div>Data-science: Fable 5 · Gemini 3.5 Flash</div>
            </div>

            <button
              onClick={dismissIntro}
              className="px-6 py-3 rounded-full bg-neutral-900 text-white text-[13px] font-semibold hover:bg-neutral-800 active:scale-95 transition-all shadow-md cursor-pointer select-none mt-10"
            >
              Explore the Experience
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function Row({
  t,
  active,
  playing,
  isPlayed,
  onPlay,
  onHover,
  onLeave,
}: {
  t: DHTrack
  active: boolean
  playing: boolean
  isPlayed: boolean
  onPlay: () => void
  onHover: () => void
  onLeave: () => void
}) {
  return (
    <div
      id={`dh-row-${t.i}`}
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      onClick={onPlay}
      className={`group flex items-center rounded-lg px-2 py-2 border-l-2 transition-all cursor-pointer ${
        active ? "bg-yellow-100/80 border-yellow-500 rounded-l-none font-medium" : "hover:bg-neutral-50 border-transparent"
      }`}
    >
      <button
        onClick={(e) => {
          e.stopPropagation()
          onPlay()
        }}
        aria-label={playing ? "Pause" : "Play"}
        className="relative inline-flex h-8 w-8 flex-none items-center justify-center rounded-full border border-neutral-200 bg-white text-black hover:bg-neutral-100"
      >
        {playing ? <PauseIcon className="h-4 w-4" /> : <PlayIcon className="h-4 w-4" />}
        {t.fav ? (
          <StarIcon
            className="absolute -left-1 -top-1 h-3 w-3 fill-[#c98500] text-[#c98500]"
            aria-label="published favorite"
          />
        ) : null}
      </button>
      <div className="ml-3 min-w-0 leading-tight flex flex-col">
        <div className={`truncate text-[13px] ${isPlayed && !active ? "text-neutral-400 font-normal" : "text-neutral-800 font-medium"}`}>
          {t.title}
        </div>
        {t.prompt && (
          <div className="truncate text-[10px] text-neutral-400 font-normal mt-0.5" title={t.prompt}>
            {t.prompt.split(",")[0].trim()}
          </div>
        )}
      </div>
    </div>
  )
}

function Dock({
  order,
  setOrder,
  onPrev,
  onNext,
  playCycle,
}: {
  order: OrderMode
  setOrder: (o: OrderMode) => void
  onPrev: () => void
  onNext: () => void
  playCycle: number
}) {
  const player = useAudioPlayer()
  const cycle = () => {
    if (order === "sequential") setOrder("random")
    else if (order === "random") setOrder("random-star")
    else if (order === "random-star") setOrder("weirdness")
    else setOrder("sequential")
  }
  const orderIcon =
    order === "sequential" ? (
      <ListOrderedIcon className="h-4 w-4" />
    ) : order === "weirdness" ? (
      <SparklesIcon className="h-4 w-4 text-purple-600" />
    ) : (
      <ShuffleIcon className="h-4 w-4" />
    )
  const orderTitle =
    order === "sequential"
      ? "Sequential (click: shuffle)"
      : order === "random"
      ? "Random (click: random of favorites)"
      : order === "random-star"
      ? "Random favorites (click: weirdest first)"
      : "Weirdest first (click: sequential)"

  const btn = "inline-flex h-8 w-8 items-center justify-center rounded-full border border-neutral-200 bg-white text-black hover:bg-neutral-100"

  return (
    <div id="tutorial-player" className="fixed bottom-3 left-1/2 z-20 w-[min(640px,94vw)] -translate-x-1/2">
      <div className="rounded-full border bg-white/90 px-4 py-3 shadow-md backdrop-blur">
        <div className="flex items-center gap-3">
          <button className={btn} onClick={onPrev} aria-label="Previous"><ArrowLeft className="h-4 w-4" /></button>
          <button className={`${btn} relative`} onClick={() => (player.isPlaying ? player.pause() : player.play())} aria-label={player.isPlaying ? "Pause" : "Play"}>
            {player.isPlaying ? <PauseIcon className="h-4 w-4" /> : <PlayIcon className="h-4 w-4" />}
            {playCycle > 1 && (
              <span className="absolute -top-1 -right-1 bg-red-600 text-white font-bold text-[8px] leading-none px-1.5 py-0.5 rounded-full shadow-sm border border-white">
                #{playCycle}
              </span>
            )}
          </button>
          <button className={btn} onClick={onNext} aria-label="Next"><ArrowRight className="h-4 w-4" /></button>
          <button className={`${btn} ${order !== "sequential" ? "bg-neutral-200" : ""} relative`} onClick={cycle} title={orderTitle} aria-label={orderTitle}>
            {orderIcon}
            {order === "random-star" ? <StarIcon className="absolute -right-1 -top-1 h-3 w-3 fill-[#c98500] text-[#c98500]" /> : null}
          </button>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-medium text-black">
              {player.activeItem?.data ? (player.activeItem.data as Item["data"]).title : "Nothing playing"}
            </div>
          </div>
          <div className="hidden min-w-[130px] items-center gap-2 sm:flex">
            <AudioPlayerProgress className="w-[60px]" />
            <div className="flex items-center gap-1 text-[11px] text-neutral-500">
              <AudioPlayerTime /><span>/</span><AudioPlayerDuration />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function OnboardingTutorial({
  step,
  onNext,
  onPrev,
  onSkip,
}: {
  step: number
  onNext: () => void
  onPrev: () => void
  onSkip: () => void
}) {
  const steps = [
    {
      title: "1. Map Controls",
      desc: "Use the projection buttons in this left sidebar header to morph the layout (Music, Lyrics, Metrics, Groove, etc.).",
      selector: "#tutorial-map",
      position: "left-6 md:left-[35vw] top-[20vh]",
    },
    {
      title: "2. Audio Topology Map",
      desc: "Each dot is a track, click to play. Lines connect tracks in same album.",
      selector: "#tutorial-map-canvas",
      position: "left-6 md:left-[35vw] top-[40vh]",
    },
    {
      title: "3. The Essay Zone",
      desc: "Read 'A few tiny thoughts about the implications of AI on music'—a critical essay discussing AI, automation, metadata limitations, and subjective curation.",
      selector: "#tutorial-essay",
      position: "left-6 md:left-[35vw] top-[45vh]",
    },
    {
      title: "4. Playlist Explorer",
      desc: "The central column displays all 171 days of Suno generations. Click any track to start playing, hover to preview, and use the filter buttons to isolate Favorites, Unheard, Lyrics, or Instrumentals.",
      selector: "#tutorial-playlist",
      position: "left-6 md:left-[5vw] top-[30vh]",
    },
    {
      title: "5. Track Data & Analysis",
      desc: "See deep acoustic parameter details for the selected track (weirdness, complexity, journey, spread). Click any metric to learn more about its meaning.",
      selector: "#tutorial-data",
      position: "right-6 md:right-[35vw] top-[30vh]",
    },
    {
      title: "6. FAQ & Glossary",
      desc: "Browse the project glossary, read detailed descriptions of the analysis metrics, and view frequently asked questions about the archive.",
      selector: "#dh-faq-container",
      position: "right-6 md:right-[35vw] top-[45vh]",
    },
    {
      title: "7. Bottom Playback Controls",
      desc: "Manage play, pause, track skipping, timeline progress, shuffle options, and playback speed. The player persists across all map and list selections.",
      selector: "#tutorial-player",
      position: "left-6 md:left-[35vw] bottom-[120px]",
    },
  ]

  const current = steps[step]
  const [coords, setCoords] = React.useState<{ top: number; left: number; width: number; height: number } | null>(null)

  React.useEffect(() => {
    if (!current) return
    const measure = () => {
      const el = document.querySelector(current.selector)
      if (el) {
        const rect = el.getBoundingClientRect()
        setCoords({
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
        })
      } else {
        setCoords(null)
      }
    }
    // Delay slightly to allow layout calculations to finish
    const timer = setTimeout(measure, 100)
    window.addEventListener("resize", measure)
    return () => {
      clearTimeout(timer)
      window.removeEventListener("resize", measure)
    }
  }, [step, current?.selector])

  if (!current) return null

  return (
    <div className="fixed inset-0 z-50 overflow-hidden select-none pointer-events-auto">
      {/* Click-anywhere backdrop to skip */}
      <div className="absolute inset-0 bg-transparent z-30 cursor-pointer" onClick={onSkip} />

      {/* Focus Highlight Spotlight Frame (Desktop & Mobile) */}
      {coords && (
        <div 
          style={{
            position: "fixed",
            top: coords.top - 4,
            left: coords.left - 4,
            width: coords.width + 8,
            height: coords.height + 8,
            borderWidth: "4px",
            borderColor: "#f59e0b",
            backgroundColor: "rgba(245, 158, 11, 0.03)",
            zIndex: 40,
            pointerEvents: "none",
            transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
            borderRadius: "16px",
            boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.45)",
          }}
        />
      )}

      {/* Tooltip Content Popover */}
      <div className={`absolute ${current.position} z-50 w-[min(340px,88vw)] rounded-2xl border border-neutral-800 bg-neutral-900 p-5 text-white shadow-2xl transition-all duration-300`}>
        <h3 className="text-sm font-bold text-yellow-400 uppercase tracking-wider mb-2">{current.title}</h3>
        <p className="text-[12px] text-neutral-300 leading-relaxed mb-4">{current.desc}</p>
        <div className="flex items-center justify-between">
          <button 
            onClick={onSkip} 
            className="text-[10px] text-neutral-500 hover:text-neutral-300 transition-colors uppercase font-bold tracking-wider cursor-pointer bg-transparent border-none"
          >
            Skip
          </button>
          <div className="flex gap-2">
            {step > 0 && (
              <button 
                onClick={onPrev} 
                className="px-2.5 py-1 rounded bg-neutral-800 text-[10px] text-neutral-300 hover:bg-neutral-700 transition-colors font-bold uppercase cursor-pointer"
              >
                Back
              </button>
            )}
            <button 
              onClick={onNext} 
              className="px-3 py-1 rounded bg-yellow-500 text-[10px] text-black hover:bg-yellow-400 transition-colors font-bold uppercase cursor-pointer"
            >
              {step === steps.length - 1 ? "Got It" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
