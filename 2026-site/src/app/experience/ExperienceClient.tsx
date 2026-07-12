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
    <div className="grid h-screen grid-cols-1 md:grid-cols-[300px_minmax(0,1fr)_300px]">
      {/* LEFT: persistent map + essay */}
      <aside className="hidden border-r bg-neutral-50 md:flex md:flex-col h-full min-h-0">
        <div className="flex items-center justify-between px-3 py-2 text-[11px] text-neutral-500 border-b">
          <span>audio topology</span>
          <span>{played.size} / {data.tracks.length} heard</span>
        </div>
        <div className="h-[270px] w-full flex-shrink-0 relative border-b">
          <DHMap
            data={data}
            focusIdx={focusIdx}
            hoverIdx={hoverIdx}
            played={played}
            onHover={setHoverIdx}
            onPlay={playIdx}
          />
        </div>
        <div className="flex-1 min-h-0 bg-white">
          <DHEssay text={data.essay || ""} />
        </div>
      </aside>

      {/* CENTER: the (familiar) player list */}
      <main className="min-h-0 overflow-y-auto px-4 pb-28 pt-4">
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
      <aside id="dh-right-sidebar" className="hidden overflow-y-auto border-l bg-white md:block scroll-smooth">
        <DHData_ track={rightTrack} isLive={isLive} progress={progress} />
        <div className="border-t bg-neutral-50">
          <DHFAQ text={data.faq || ""} />
        </div>
      </aside>

      <Dock order={order} setOrder={setOrder} onPrev={() => { const i = prevIdx(); if (i != null) playIdx(i) }} onNext={() => { const i = nextIdx(); if (i != null) playIdx(i) }} />
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
