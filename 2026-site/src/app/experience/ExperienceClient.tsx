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
import { PauseIcon, PlayIcon, SkipBackIcon, SkipForwardIcon, ShuffleIcon, StarIcon, ListOrderedIcon } from "lucide-react"
import { loadDH, resolveSrc, type DHData, type DHTrack } from "@/lib/dh"
import DHMap from "./DHMap"
import DHData_ from "./DHData"
import DHEssay from "./DHEssay"
import DHFAQ from "./DHFAQ"

type OrderMode = "sequential" | "random" | "random-star"
type Item = { id: string; src: string; data: { title: string; album: string } }


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
  const [order, setOrder] = React.useState<OrderMode>("sequential")
  const [played, setPlayed] = React.useState<Set<number>>(new Set())
  const [mobileTab, setMobileTab] = React.useState<"map-essay" | "listen" | "faq">("listen")
  const [showIntro, setShowIntro] = React.useState(true)
  const [isFading, setIsFading] = React.useState(false)


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
    }, 500)
    if (data.tracks.length > 0) {
      playIdx(0)
    }
  }, [data.tracks, playIdx])

  // shuffle "bag": exhaust every track in the pool before any repeats.
  // Bag items are popped from the END. `justPlayedRef` tracks the last pick so
  // a fresh bag never opens with the track that just closed the previous one.
  const bagRef = React.useRef<number[]>([])
  const bagModeRef = React.useRef<OrderMode | null>(null)
  const justPlayedRef = React.useRef<number | null>(null)
  const refillBag = React.useCallback(() => {
    const pool =
      order === "random-star" ? data.tracks.filter((t) => t.fav).map((t) => t.i) : data.tracks.map((t) => t.i)
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
  }, [order, data])

  const nextIdx = React.useCallback((): number | null => {
    const n = data.tracks.length
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
    return (focusIdx - 1 + data.tracks.length) % data.tracks.length
  }, [focusIdx, data])

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

  // scroll center list to focal track
  React.useEffect(() => {
    if (focusIdx == null) return
    const el = document.getElementById(`dh-row-${focusIdx}`)
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" })
  }, [focusIdx])

  const lastOccurrencesRef = React.useRef<{ [key: string]: number }>({})

  const handleMetricClick = React.useCallback((term: string) => {
    const normalized = term.toLowerCase().replace(/[^a-z0-9]+/g, "-")
    const occurrences = Array.from(
      document.querySelectorAll(`#faq-${normalized}, .faq-word-occ[data-word="${normalized}"]`)
    )
    if (occurrences.length === 0) return

    const lastIdx = lastOccurrencesRef.current[normalized] ?? -1
    const nextIdx = (lastIdx + 1) % occurrences.length
    lastOccurrencesRef.current[normalized] = nextIdx

    const targetEl = occurrences[nextIdx] as HTMLElement
    
    // Flash highlight
    occurrences.forEach(el => el.classList.remove("bg-yellow-200", "scale-105"))
    targetEl.classList.add("bg-yellow-200", "scale-105")
    setTimeout(() => {
      targetEl.classList.remove("bg-yellow-200", "scale-105")
    }, 1500)

    const container = document.getElementById("dh-faq-container")
    if (container && targetEl) {
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
    const g: { album: string; dateISO: string | null; rows: DHTrack[] }[] = []
    for (const t of data.tracks) {
      const last = g[g.length - 1]
      if (last && last.album === t.album) last.rows.push(t)
      else g.push({ album: t.album, dateISO: t.dateISO, rows: [t] })
    }
    return g
  }, [data])

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      className="flex flex-col h-screen overflow-hidden md:grid md:grid-cols-[300px_minmax(0,1fr)_300px]"
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
        className={`${
          mobileTab === "map-essay" ? "flex flex-col h-full min-h-0 flex-1" : "hidden"
        } md:flex md:flex-col border-r bg-neutral-50 h-full min-h-0 overflow-hidden`}
      >
        <div className="flex items-center justify-between px-3 py-2 text-[11px] text-neutral-500 border-b flex-shrink-0">
          <span>audio topology</span>
          <span>{played.size} / {data.tracks.length} heard</span>
        </div>
        <div className="h-[270px] w-full flex-shrink-0 relative border-b bg-neutral-50">
          <DHMap
            data={data}
            focusIdx={focusIdx}
            hoverIdx={hoverIdx}
            played={played}
            onHover={setHoverIdx}
            onPlay={playIdx}
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
        } md:block min-h-0 overflow-y-auto px-4 pb-28 pt-4`}
      >
        <header className="mb-4">
          <h1 className="text-xl font-semibold">171 days — DH archive view</h1>
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
        className={`${
          mobileTab === "faq" ? "flex flex-col h-full min-h-0 flex-1" : "hidden"
        } md:flex md:flex-col border-l bg-white h-full min-h-0 overflow-hidden`}
      >
        <div className="flex-shrink-0 border-b bg-white overflow-y-auto scrollbar-none max-h-[60vh]">
          <DHData_ track={rightTrack} isLive={isLive} progress={progress} onMetricClick={handleMetricClick} />
        </div>
        <div id="dh-faq-container" className="flex-1 min-h-0 bg-neutral-50 overflow-y-auto scroll-smooth">
          <DHFAQ text={data.faq || ""} tracks={data.tracks} onPlay={playIdx} />
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

      {showIntro && (
        <div
          className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-white p-8 transition-opacity duration-500 ease-in-out ${
            isFading ? "opacity-0 pointer-events-none" : "opacity-100"
          }`}
        >
          <div className="max-w-4xl text-center flex flex-col items-center">
            {/* Top Centered Logo (now inside content box and 2x larger) */}
            <img src="/img/glia-bw.png" alt="glia.ca" className="h-14 object-contain opacity-80 mb-5 select-none" />

            <h1 className="text-4xl font-extrabold tracking-tight text-neutral-900 mb-1 select-none">
              171 Days
            </h1>
            
            <p className="text-[12px] text-neutral-400 mb-5 select-none font-mono">
              January 18 to July 11, 2026
            </p>

            <p className="text-[18px] leading-relaxed text-neutral-700 mb-4 font-light select-text max-w-3xl">
              Machine learning applied to analyze a 31 hour corpus of AI generated music
            </p>

            <div className="text-[10.5px] text-neutral-500 mb-4 font-mono select-none space-y-0.5 w-full max-w-md">
              <div>Music: Suno 5.5 · Human: Jhave</div>
              <div>Data-science: Fable 5 · Gemini 3.5 Flash</div>
            </div>

            <button
              onClick={dismissIntro}
              className="px-6 py-3 rounded-full bg-neutral-900 text-white text-[13px] font-semibold hover:bg-neutral-800 active:scale-95 transition-all shadow-md cursor-pointer select-none"
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
  onPlay,
  onHover,
  onLeave,
}: {
  t: DHTrack
  active: boolean
  playing: boolean
  onPlay: () => void
  onHover: () => void
  onLeave: () => void
}) {
  return (
    <div
      id={`dh-row-${t.i}`}
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      className={`group flex items-center rounded-lg px-2 py-2 ${active ? "bg-neutral-100" : "hover:bg-neutral-50"}`}
    >
      <button
        onClick={onPlay}
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
        <div className="truncate text-[13px] font-medium">{t.title}</div>
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
  const cycle = () =>
    setOrder(order === "sequential" ? "random" : order === "random" ? "random-star" : "sequential")
  const orderIcon =
    order === "sequential" ? <ListOrderedIcon className="h-4 w-4" /> : <ShuffleIcon className="h-4 w-4" />
  const orderTitle =
    order === "sequential" ? "Sequential (click: shuffle)" : order === "random" ? "Random (click: random of favorites)" : "Random favorites (click: sequential)"

  const btn = "inline-flex h-8 w-8 items-center justify-center rounded-full border border-neutral-200 bg-white text-black hover:bg-neutral-100"

  return (
    <div className="fixed bottom-3 left-1/2 z-20 w-[min(680px,92vw)] -translate-x-1/2">
      <div className="rounded-full border bg-white/90 px-4 py-3 shadow-md backdrop-blur">
        <div className="flex items-center gap-3">
          <button className={btn} onClick={onPrev} aria-label="Previous"><SkipBackIcon className="h-4 w-4" /></button>
          <button className={btn} onClick={() => (player.isPlaying ? player.pause() : player.play())} aria-label={player.isPlaying ? "Pause" : "Play"}>
            {player.isPlaying ? <PauseIcon className="h-4 w-4" /> : <PlayIcon className="h-4 w-4" />}
          </button>
          <button className={btn} onClick={onNext} aria-label="Next"><SkipForwardIcon className="h-4 w-4" /></button>
          <button className={`${btn} ${order !== "sequential" ? "bg-neutral-200" : ""} relative`} onClick={cycle} title={orderTitle} aria-label={orderTitle}>
            {orderIcon}
            {order === "random-star" ? <StarIcon className="absolute -right-1 -top-1 h-3 w-3 fill-[#c98500] text-[#c98500]" /> : null}
          </button>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-medium text-black">
              {player.activeItem?.data ? (player.activeItem.data as Item["data"]).title : "Nothing playing"}
            </div>
          </div>
          <div className="hidden min-w-[190px] items-center gap-2 sm:flex">
            <AudioPlayerProgress className="w-[110px]" />
            <div className="flex items-center gap-1 text-[11px] text-neutral-500">
              <AudioPlayerTime /><span>/</span><AudioPlayerDuration />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
