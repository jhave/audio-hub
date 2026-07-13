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
import { PauseIcon, PlayIcon, ArrowLeft, ArrowRight, ShuffleIcon, StarIcon, ListOrderedIcon, SparklesIcon } from "lucide-react"
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
  const idxById = React.useMemo(
    () => Object.fromEntries(data.tracks.map((t) => [t.trackId, t.i])),
    [data]
  )
  const focusIdx = player.activeItem ? idxById[player.activeItem.id as string] ?? null : null
  const [hoverIdx, setHoverIdx] = React.useState<number | null>(null)
  const [order, setOrder] = React.useState<OrderMode>("random")
  const [played, setPlayed] = React.useState<Set<number>>(new Set())
  const [mobileTab, setMobileTab] = React.useState<"map-essay" | "listen" | "faq">("listen")
  const [showIntro, setShowIntro] = React.useState(true)
  const [isFading, setIsFading] = React.useState(false)
  const [mapMode, setMapMode] = React.useState<"music" | "lyrics" | "metrics" | "groove" | "intent" | "texture" | "narrative">("music")
  const [hideInstrumentals, setHideInstrumentals] = React.useState(false)
  const [showPaths, setShowPaths] = React.useState(true)
  const [hoveredTag, setHoveredTag] = React.useState<string | null>(null)
  const [clickedTag, setClickedTag] = React.useState<string | null>(null)
  const [tutorialStep, setTutorialStep] = React.useState<number | null>(null)
  const [isMapExpanded, setIsMapExpanded] = React.useState(false)
  const activeTag = hoveredTag || clickedTag
 
  const modes: ("music" | "lyrics" | "metrics" | "groove" | "intent" | "texture" | "narrative")[] = ["music", "lyrics", "metrics", "groove", "intent", "texture", "narrative"]
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
      const raw = localStorage.getItem("dh-played")
      if (raw) setPlayed(new Set(JSON.parse(raw)))
      const o = localStorage.getItem("dh-order") as OrderMode | null
      if (o) setOrder(o)
    } catch {}
  }, [])

  // mark played when a track becomes active
  React.useEffect(() => {
    if (focusIdx == null) return
    setPlayed((prev) => {
      if (prev.has(focusIdx)) return prev
      const next = new Set(prev)
      next.add(focusIdx)
      try {
        localStorage.setItem("dh-played", JSON.stringify([...next]))
      } catch {}
      return next
    })
    // Remove active track from the current shuffle bag so it isn't repeated
    bagRef.current = bagRef.current.filter((idx) => idx !== focusIdx)
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

  const dismissIntro = React.useCallback(() => {
    setIsFading(true)
    setTimeout(() => {
      setShowIntro(false)
      setTutorialStep(0) // Start the tutorial onboarding!
    }, 500)
    if (data && data.tracks.length > 0) {
      let startIdx = 0
      if (played.size > 0) {
        const firstUnplayed = data.tracks.find((t) => !played.has(t.i))
        if (firstUnplayed) startIdx = firstUnplayed.i
      }
      playIdx(startIdx)
    }
  }, [data, played, playIdx])

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
  }, [order, focusIdx, data, refillBag])

  const prevIdx = React.useCallback((): number | null => {
    if (focusIdx == null) return 0
    if (order === "weirdness") {
      const sorted = [...data.tracks].sort((a, b) => (b.weirdness ?? 0) - (a.weirdness ?? 0))
      const currIdx = sorted.findIndex((t) => t.i === focusIdx)
      const prevTrack = sorted[(currIdx - 1 + sorted.length) % sorted.length]
      return prevTrack.i
    }
    return (focusIdx - 1 + data.tracks.length) % data.tracks.length
  }, [focusIdx, data, order])

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

  // scroll center list to focal track
  React.useEffect(() => {
    if (focusIdx == null) return
    const el = document.getElementById(`dh-row-${focusIdx}`)
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" })
  }, [focusIdx])

  const handleMetricClick = React.useCallback((term: string) => {
    const normalized = term.toLowerCase().replace(/[^a-z0-9]+/g, "-")
    const targetEl = document.getElementById(`faq-${normalized}`)
    if (!targetEl) return

    // Flash highlight
    targetEl.classList.add("bg-yellow-200", "scale-105")
    setTimeout(() => {
      targetEl.classList.remove("bg-yellow-200", "scale-105")
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
  }, [])

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
  const groups = React.useMemo(() => {
    if (order === "weirdness") {
      const sorted = [...data.tracks].sort((a, b) => (b.weirdness ?? 0) - (a.weirdness ?? 0))
      return [{ album: "Sorted by Weirdness (Most Weird First)", dateISO: null, rows: sorted }]
    }
    const g: { album: string; dateISO: string | null; rows: DHTrack[] }[] = []
    for (const t of data.tracks) {
      const last = g[g.length - 1]
      if (last && last.album === t.album) last.rows.push(t)
      else g.push({ album: t.album, dateISO: t.dateISO, rows: [t] })
    }
    return g
  }, [data, order])

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      className={`flex flex-col h-screen overflow-hidden md:grid transition-all duration-500 ease-in-out ${
        isMapExpanded ? "md:grid-cols-[2fr_0fr_1fr]" : "md:grid-cols-3"
      }`}
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
        onMouseEnter={() => setIsMapExpanded(true)}
        onMouseLeave={() => setIsMapExpanded(false)}
        className={`${
          mobileTab === "map-essay" ? "flex flex-col h-full min-h-0 flex-1" : "hidden"
        } md:flex md:flex-col border-r bg-neutral-50 h-full min-h-0 overflow-hidden transition-all duration-500 ease-in-out`}
      >
        <div className="flex flex-col px-3 py-1.5 text-[11px] text-neutral-500 border-b flex-shrink-0 bg-neutral-50 select-none gap-1">
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-neutral-700">topology:</span>
              <div className="flex items-center gap-1">
                <button 
                  onClick={handlePrevMode} 
                  className="px-1.5 py-0.5 rounded hover:bg-neutral-200 text-neutral-500 hover:text-black cursor-pointer font-bold transition-colors select-none"
                  title="Previous Topology Mode"
                >
                  &lt;
                </button>
                <div className="flex bg-neutral-200/60 rounded p-0.5 text-[9px] font-bold">
                  <button
                    onClick={() => setMapMode("music")}
                    className={`px-1 py-0.5 rounded transition-all cursor-pointer ${
                      mapMode === "music" ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500 hover:text-neutral-700"
                    }`}
                    title="Acoustic Texture Similarity"
                  >
                    Music
                  </button>
                  <button
                    onClick={() => setMapMode("lyrics")}
                    className={`px-1 py-0.5 rounded transition-all cursor-pointer ${
                      mapMode === "lyrics" ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500 hover:text-neutral-700"
                    }`}
                    title="Semantic Lyric Similarity"
                  >
                    Lyrics
                  </button>
                  <button
                    onClick={() => setMapMode("metrics")}
                    className={`px-1 py-0.5 rounded transition-all cursor-pointer ${
                      mapMode === "metrics" ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500 hover:text-neutral-700"
                    }`}
                    title="Structural Metrics UMAP"
                  >
                    Metrics
                  </button>
                  <button
                    onClick={() => setMapMode("groove")}
                    className={`px-1 py-0.5 rounded transition-all cursor-pointer ${
                      mapMode === "groove" ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500 hover:text-neutral-700"
                    }`}
                    title="Tempo vs. Circle of Fifths key mapping"
                  >
                    Groove
                  </button>
                  <button
                    onClick={() => setMapMode("intent")}
                    className={`px-1 py-0.5 rounded transition-all cursor-pointer ${
                      mapMode === "intent" ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500 hover:text-neutral-700"
                    }`}
                    title="Weirdness vs. Style Weight mapping"
                  >
                    Intent
                  </button>
                  <button
                    onClick={() => setMapMode("texture")}
                    className={`px-1 py-0.5 rounded transition-all cursor-pointer ${
                      mapMode === "texture" ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500 hover:text-neutral-700"
                    }`}
                    title="Bounce vs. Melodic Complexity mapping"
                  >
                    Texture
                  </button>
                  <button
                    onClick={() => setMapMode("narrative")}
                    className={`px-1 py-0.5 rounded transition-all cursor-pointer ${
                      mapMode === "narrative" ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500 hover:text-neutral-700"
                    }`}
                    title="Journey vs. Style Spread mapping"
                  >
                    Narrative
                  </button>
                </div>
                <button 
                  onClick={handleNextMode} 
                  className="px-1.5 py-0.5 rounded hover:bg-neutral-200 text-neutral-500 hover:text-black cursor-pointer font-bold transition-colors select-none"
                  title="Next Topology Mode"
                >
                  &gt;
                </button>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {mapMode === "lyrics" && (
                <label className="flex items-center gap-1 cursor-pointer select-none text-[10px] text-neutral-500 hover:text-neutral-700">
                  <input
                    type="checkbox"
                    checked={hideInstrumentals}
                    onChange={(e) => setHideInstrumentals(e.target.checked)}
                    className="rounded border-neutral-300 text-neutral-900 focus:ring-0 w-3 h-3 cursor-pointer"
                  />
                  <span>hide instrumentals</span>
                </label>
              )}
              <label className="flex items-center gap-1 cursor-pointer select-none text-[10px] text-neutral-500 hover:text-neutral-700" title="Draw sequential similarity trajectories on selection">
                <input
                  type="checkbox"
                  checked={showPaths}
                  onChange={(e) => setShowPaths(e.target.checked)}
                  className="rounded border-neutral-300 text-neutral-900 focus:ring-0 w-3 h-3 cursor-pointer"
                />
                <span>show paths</span>
              </label>
              <span className="font-mono text-[9px] text-neutral-400">{played.size}/{data.tracks.length} heard</span>
            </div>
          </div>
        </div>
        <div className={`w-full flex-shrink-0 relative border-b bg-neutral-50 transition-all duration-500 ease-in-out ${
          isMapExpanded ? "h-[66.6vh]" : "h-[270px]"
        }`}>
          {/* Floating HUD Label inside map container */}
          <div className="absolute top-2.5 left-3 z-10 pointer-events-none select-none bg-white/75 backdrop-blur-sm px-2.5 py-1.5 rounded-lg border border-neutral-200/40 shadow-sm leading-tight flex flex-col">
            <span className="text-[14px] font-bold text-neutral-800 tracking-wide">
              {mapMode === "music" && "Acoustic Timbre Space"}
              {mapMode === "lyrics" && "Semantic Lyric Space"}
              {mapMode === "metrics" && "Structural UMAP"}
              {mapMode === "groove" && "Groove Grid"}
              {mapMode === "intent" && "Intent Space"}
              {mapMode === "texture" && "Texture Space"}
              {mapMode === "narrative" && "Narrative Space"}
            </span>
            <span className="text-[9.5px] text-neutral-400 font-medium">
              {mapMode === "music" && "mapped by genre & sound similarity"}
              {mapMode === "lyrics" && "mapped by lyrics & prompt concepts"}
              {mapMode === "metrics" && "mapped by 13 musicological metrics"}
              {mapMode === "groove" && "Tempo (X: slow left → fast right) vs. Key (Y: Circle of Fifths)"}
              {mapMode === "intent" && "Weirdness (X: low left → high right) vs. Style Weight (Y: low bottom → high top)"}
              {mapMode === "texture" && "Bounce (X: low left → high right) vs. Complexity (Y: low bottom → high top)"}
              {mapMode === "narrative" && "Journey (X: short left → long right) vs. Spread (Y: narrow bottom → wide top)"}
            </span>
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
            showPaths={showPaths}
          />
        </div>
        <div className="flex-1 min-h-0 bg-white overflow-hidden">
          <DHEssay text={data.essay || ""} />
        </div>
      </aside>

      {/* CENTER: the (familiar) player list */}
      <main
        className={`${
          mobileTab === "listen" ? "block flex-1" : "hidden"
        } md:block min-h-0 overflow-y-auto px-4 pb-28 pt-4 transition-all duration-500 ease-in-out overflow-hidden`}
      >
        <header className="mb-4">
          <h1 className="text-xl font-semibold">171 days, {data.tracks.length} tracks — DH archive view</h1>
          <p className="mt-1 text-[12px] text-neutral-500">
            Every track sits in the machine-heard topology (left) with its analysis (right).
            Hover a title to preview; play to travel.
          </p>
        </header>
        <div className="space-y-6">
          {groups.map((g) => (
            <section key={g.album} className="rounded-2xl border bg-white p-4">
              <div className="mb-3">
                {g.dateISO && <p className="text-[11px] text-neutral-400">{g.dateISO}</p>}
                <h2 className="text-lg font-semibold leading-snug">{g.album}</h2>
              </div>
              <div className="space-y-0.5">
                {g.rows.map((t) => (
                  <Row
                    key={t.trackId}
                    t={t}
                    active={focusIdx === t.i}
                    playing={focusIdx === t.i && player.isPlaying}
                    isPlayed={played.has(t.i)}
                    onPlay={() => (focusIdx === t.i && player.isPlaying ? player.pause() : playIdx(t.i))}
                    onHover={() => setHoverIdx(t.i)}
                    onLeave={() => setHoverIdx(null)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      </main>

      {/* RIGHT: persistent data + FAQ */}
      <aside
        onMouseEnter={() => setHoverIdx(null)}
        className={`${
          mobileTab === "faq" ? "flex flex-col h-full min-h-0 flex-1" : "hidden"
        } md:flex md:flex-col border-l bg-white h-full min-h-0 overflow-hidden transition-all duration-500 ease-in-out`}
      >
        <div className="flex-shrink-0 border-b bg-white overflow-y-auto scrollbar-none max-h-[60vh]">
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
            onTitleClick={() => {
              if (focusIdx != null) {
                const el = document.getElementById(`dh-row-${focusIdx}`)
                if (el) el.scrollIntoView({ behavior: "smooth", block: "center" })
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
      />

      {tutorialStep !== null && (
        <OnboardingTutorial
          step={tutorialStep}
          onNext={() => {
            if (tutorialStep < 4) setTutorialStep(tutorialStep + 1)
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
      <div className="ml-3 min-w-0 leading-tight">
        <div className={`truncate text-[13px] ${isPlayed && !active ? "text-neutral-400 font-normal" : "text-neutral-800 font-medium"}`}>
          {t.title}
        </div>
      </div>
    </div>
  )
}

function Dock({
  order,
  setOrder,
  onPrev,
  onNext,
}: {
  order: OrderMode
  setOrder: (o: OrderMode) => void
  onPrev: () => void
  onNext: () => void
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
    <div className="fixed bottom-3 left-1/2 z-20 w-[min(476px,92vw)] -translate-x-1/2">
      <div className="rounded-full border bg-white/90 px-4 py-3 shadow-md backdrop-blur">
        <div className="flex items-center gap-3">
          <button className={btn} onClick={onPrev} aria-label="Previous"><ArrowLeft className="h-4 w-4" /></button>
          <button className={btn} onClick={() => (player.isPlaying ? player.pause() : player.play())} aria-label={player.isPlaying ? "Pause" : "Play"}>
            {player.isPlaying ? <PauseIcon className="h-4 w-4" /> : <PlayIcon className="h-4 w-4" />}
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
      title: "1. Audio Topology Map",
      desc: "This map layouts the 746 tracks of the archive. You can morph the coordinates by clicking the projection buttons at the top (Music, Lyrics, Metrics, Groove, Intent, Texture, Narrative) or cycling with the < and > arrows.",
      position: "left-6 md:left-[35vw] top-[30vh]",
      highlightClass: "fixed left-0 top-0 bottom-0 w-[33.3vw] border-[4px] border-yellow-400 bg-yellow-400/5 z-40 pointer-events-none transition-all hidden md:block",
      mobileHighlightClass: "fixed left-0 right-0 top-0 h-[40vh] border-[4px] border-yellow-400 bg-yellow-400/5 z-40 pointer-events-none md:hidden",
    },
    {
      title: "1.1 Deep Map Exploration",
      desc: "Zoom deep into the map (using your mouse scroll wheel or trackpad pinch) to see individual dots, and drag to pan. Click any dot directly to play it. Dotted red lines show similarity trajectories, tracing a path from the active song sequentially through its 5 nearest neighbors in this layout.",
      position: "left-6 md:left-[35vw] top-[35vh]",
      highlightClass: "fixed left-0 top-[35px] h-[270px] w-[33.3vw] border-[4px] border-yellow-400 bg-yellow-400/5 z-40 pointer-events-none transition-all hidden md:block",
      mobileHighlightClass: "fixed left-0 right-0 top-0 h-[40vh] border-[4px] border-yellow-400 bg-yellow-400/5 z-40 pointer-events-none md:hidden",
    },
    {
      title: "2. Playlist Explorer",
      desc: "Every row in the playlist is fully clickable to start playing. Playback auto-advances based on your selected dock order (Sequential, Shuffle, Favorites, or Weirdest First). Hover any title to preview its details.",
      position: "left-6 md:left-[5vw] top-[40vh]",
      highlightClass: "fixed left-[33.3vw] top-0 bottom-0 w-[33.4vw] border-[4px] border-yellow-400 bg-yellow-400/5 z-40 pointer-events-none transition-all hidden md:block",
      mobileHighlightClass: "fixed left-0 right-0 bottom-[10vh] top-[40vh] border-[4px] border-yellow-400 bg-yellow-400/5 z-40 pointer-events-none md:hidden",
    },
    {
      title: "3. The Essay Zone",
      desc: "Scroll this bottom-left panel to read 'A few tiny thoughts about the implications of AI on music'—a critical essay discussing subjective taste, automated curation, and the limitations of metadata representation.",
      position: "left-6 md:left-[35vw] top-[45vh]",
      highlightClass: "fixed left-0 top-[305px] bottom-0 w-[33.3vw] border-[4px] border-yellow-400 bg-yellow-400/5 z-40 pointer-events-none transition-all hidden md:block",
      mobileHighlightClass: "fixed left-0 right-0 bottom-0 h-[30vh] border-[4px] border-yellow-400 bg-yellow-400/5 z-40 pointer-events-none md:hidden",
    },
    {
      title: "4. Analysis, FAQ & Glossary",
      desc: "The right sidebar displays acoustic parameters (weirdness, complexity, trajectory, and spread). Hover any metric to see its description, click it to jump straight to the glossary definition, or click the track title to center it in the playlist.",
      position: "right-6 md:right-[35vw] top-[30vh]",
      highlightClass: "fixed right-0 top-0 bottom-0 w-[33.3vw] border-[4px] border-yellow-400 bg-yellow-400/5 z-40 pointer-events-none transition-all hidden md:block",
      mobileHighlightClass: "fixed left-0 right-0 top-0 bottom-0 border-[4px] border-yellow-400 bg-yellow-400/5 z-40 pointer-events-none md:hidden",
    },
  ]

  const current = steps[step]
  if (!current) return null

  return (
    <div className="fixed inset-0 z-50 overflow-hidden select-none pointer-events-auto">
      {/* Dark overlay backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[0.5px]" onClick={onSkip} />

      {/* Focus Highlight Frame (Desktop) */}
      <div className={current.highlightClass} />

      {/* Focus Highlight Frame (Mobile) */}
      <div className={current.mobileHighlightClass} />

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
