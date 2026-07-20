"use client"

import * as React from "react"
import {
  AudioPlayerProvider,
  AudioPlayerProgress,
  AudioPlayerTime,
  AudioPlayerDuration,
  useAudioPlayer,
} from "@/components/ui/audio-player"
import type { Album, Track } from "@/lib/scan-audio"
import { cn } from "@/lib/utils"
import { PauseIcon, PlayIcon, SkipBackIcon, SkipForwardIcon, StarIcon } from "lucide-react"

type OrderMode = "sequential" | "random" | "random-star"

const LS_ORDER = "days171-order"
const LS_PLAYED = "days171-played"

/* -------------------- Preload first playable track -------------------- */

function PreloadFirstTrack({ albums }: { albums: Album[] }) {
  const player = useAudioPlayer()
  const didPreloadRef = React.useRef(false)

  React.useEffect(() => {
    if (didPreloadRef.current) return
    if (player.activeItem) return
    if (!albums?.length) return

    const firstAlbumWithTracks = albums.find((a) => a.tracks.length > 0)
    const firstTrack = firstAlbumWithTracks?.tracks[0]
    if (!firstTrack) return

    didPreloadRef.current = true
    player
      .setActiveItem({
        id: firstTrack.id,
        src: firstTrack.src,
        data: firstTrack.data,
      })
      .catch(() => {})
  }, [albums, player, player.activeItem])

  return null
}

/* -------------------- Main export -------------------- */

export default function AudioLibraryClient({
  albums,
  favIds,
}: {
  albums: Album[]
  favIds?: Set<string>
}) {
  return (
    <AudioPlayerProvider>
      <Library albums={albums} favIds={favIds ?? new Set()} />
    </AudioPlayerProvider>
  )
}

/* -------------------- Library (queue state + layout) -------------------- */

function Library({ albums, favIds }: { albums: Album[]; favIds: Set<string> }) {
  const { activeItem, play, ref } = useAudioPlayer<Track["data"]>()
  const flat = React.useMemo(() => albums.flatMap((a) => a.tracks), [albums])
  const byId = React.useMemo(() => new Map(flat.map((t) => [String(t.id), t])), [flat])
  const favTracks = React.useMemo(() => flat.filter((t) => favIds.has(String(t.id))), [flat, favIds])

  const [order, setOrder] = React.useState<OrderMode>("random-star")
  const [played, setPlayed] = React.useState<Set<string>>(new Set())

  // restore persisted state: returning visitors resume an unheard shuffle queue
  React.useEffect(() => {
    try {
      const stored = new Set<string>(JSON.parse(localStorage.getItem(LS_PLAYED) || "[]"))
      if (stored.size > 0) setPlayed(stored)
      const o = localStorage.getItem(LS_ORDER)
      if (o === "sequential" || o === "random" || o === "random-star") setOrder(o)
      else if (stored.size > 0) setOrder("random") // returning visit: shuffle the unheard
      // first visit stays on random-star
    } catch {}
  }, [])

  React.useEffect(() => {
    try {
      localStorage.setItem(LS_ORDER, order)
    } catch {}
  }, [order])

  const markPlayed = React.useCallback((id: string) => {
    setPlayed((prev) => {
      if (prev.has(id)) return prev
      const next = new Set(prev)
      next.add(id)
      try {
        localStorage.setItem(LS_PLAYED, JSON.stringify([...next]))
      } catch {}
      return next
    })
  }, [])

  // shuffle bag: exhaust the pool (unheard first) before any repeats
  const bagRef = React.useRef<string[]>([])
  const bagModeRef = React.useRef<OrderMode | null>(null)
  const historyRef = React.useRef<string[]>([])

  const refillBag = React.useCallback(
    (mode: OrderMode) => {
      let pool = (mode === "random-star" ? favTracks : flat).map((t) => String(t.id))
      const unheard = pool.filter((id) => !played.has(id))
      if (unheard.length > 0) pool = unheard
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[pool[i], pool[j]] = [pool[j], pool[i]]
      }
      const cur = activeItem ? String(activeItem.id) : null
      if (pool.length > 1 && pool[pool.length - 1] === cur) {
        ;[pool[0], pool[pool.length - 1]] = [pool[pool.length - 1], pool[0]]
      }
      bagRef.current = pool
      bagModeRef.current = mode
    },
    [flat, favTracks, played, activeItem]
  )

  const nextTrack = React.useCallback((): Track | undefined => {
    if (flat.length === 0) return undefined
    const curId = activeItem ? String(activeItem.id) : null

    if (order === "sequential") {
      const idx = curId ? flat.findIndex((t) => String(t.id) === curId) : -1
      return flat[(idx + 1) % flat.length]
    }

    // Auto-cycling queues: random-★ until the star queue is exhausted,
    // then full random until every track is heard, then back. (etc.)
    let eff: OrderMode = order
    const favsExhausted =
      favTracks.length === 0 || favTracks.every((t) => played.has(String(t.id)) || String(t.id) === curId)
    const allExhausted = flat.every((t) => played.has(String(t.id)) || String(t.id) === curId)
    if (order === "random-star" && favsExhausted) eff = "random"
    else if (order === "random" && allExhausted && favTracks.length > 0) eff = "random-star"
    if (eff !== order) setOrder(eff)

    if (bagModeRef.current !== eff || bagRef.current.length === 0) refillBag(eff)
    const id = bagRef.current.pop()
    return id ? byId.get(id) : undefined
  }, [flat, favTracks, byId, order, played, activeItem, refillBag])

  // keep the bag free of the track that is currently playing
  React.useEffect(() => {
    if (!activeItem) return
    const id = String(activeItem.id)
    bagRef.current = bagRef.current.filter((x) => x !== id)
  }, [activeItem])

  const advance = React.useCallback(() => {
    if (activeItem) {
      const id = String(activeItem.id)
      markPlayed(id)
      historyRef.current.push(id)
    }
    const next = nextTrack()
    if (next) play(next)
  }, [activeItem, markPlayed, nextTrack, play])

  const goBack = React.useCallback(() => {
    const prevId = historyRef.current.pop()
    const prev = prevId ? byId.get(prevId) : undefined
    if (prev) {
      play(prev)
      return
    }
    // fallback: step back through display order
    const curId = activeItem ? String(activeItem.id) : null
    const idx = curId ? flat.findIndex((t) => String(t.id) === curId) : 0
    const target = flat[(idx - 1 + flat.length) % flat.length]
    if (target) play(target)
  }, [byId, flat, activeItem, play])

  // auto-advance through the active queue when a track ends
  React.useEffect(() => {
    const audio = ref.current
    if (!audio) return
    const onEnded = () => advance()
    audio.addEventListener("ended", onEnded)
    return () => audio.removeEventListener("ended", onEnded)
  }, [ref, advance])

  return (
    <>
      <PreloadFirstTrack albums={albums} />

      {albums.length === 0 ? (
        <EmptyHint />
      ) : (
        <div className="space-y-8">
          {albums.map((a) => (
            <AlbumCard key={a.id} album={a} favIds={favIds} played={played} />
          ))}
        </div>
      )}

      <FloatingDock
        canStep={flat.length > 0}
        order={order}
        starCount={favTracks.length}
        onCycleOrder={() =>
          setOrder(order === "sequential" ? "random" : order === "random" ? "random-star" : "sequential")
        }
        onNext={advance}
        onPrev={goBack}
      />
      <ScrollToActive />
    </>
  )
}

/* -------------------- Empty state -------------------- */

function EmptyHint() {
  return (
    <div className="rounded-2xl border bg-white p-6 text-sm text-muted-foreground shadow-sm">
      No audio found. Put albums under{" "}
      <code className="rounded bg-gray-50 px-1 py-0.5">public/audio/</code>
      .
    </div>
  )
}

/* -------------------- Linkify plain text -------------------- */

const LINK_CLASS =
  "underline decoration-neutral-300 underline-offset-2 hover:decoration-neutral-500"

function AutoLinkUrls({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"])/g)
  return (
    <>
      {parts.map((part, i) =>
        /^https?:\/\//.test(part) ? (
          <a key={i} href={part} target="_blank" rel="noreferrer" className={LINK_CLASS}>
            {part}
          </a>
        ) : (
          part
        )
      )}
    </>
  )
}

// Markdown-style [label](url) links first; bare URLs auto-link in the rest.
function Linkify({ text }: { text: string }) {
  const parts = text.split(/(\[[^\]]+\]\(https?:\/\/[^)\s]+\))/g)
  return (
    <>
      {parts.map((part, i) => {
        const md = part.match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/)
        return md ? (
          <a key={i} href={md[2]} target="_blank" rel="noreferrer" className={LINK_CLASS}>
            {md[1]}
          </a>
        ) : (
          <AutoLinkUrls key={i} text={part} />
        )
      })}
    </>
  )
}

/* -------------------- Album card -------------------- */

function AlbumCard({
  album,
  favIds,
  played,
}: {
  album: Album
  favIds: Set<string>
  played: Set<string>
}) {
  return (
    <section
      className="rounded-2xl border bg-white p-6 shadow-sm"
      data-subtitle={album.subtitle || ""}
      data-date={album.dateLabel || ""}
    >
      <div className="mb-4 flex items-start gap-5">
        {album.coverSrc && (
          <img
            src={album.coverSrc}
            alt={`${album.title} cover`}
            className="hidden h-20 w-20 flex-none rounded-xl object-cover sm:block"
          />
        )}

        <div className="min-w-0 flex-1">
          {album.dateLabel && (
            <p className="mb-1 text-[11px] text-muted-foreground">
              {album.dateLabel}
            </p>
          )}

          <h2 className="text-xl font-semibold leading-snug tracking-tight">
            {album.sunoUrl ? (
              <a
                href={album.sunoUrl}
                target="_blank"
                rel="noreferrer"
                className="hover:underline"
                title="Open playlist on Suno"
              >
                {album.title}
                <span className="ml-1.5 align-middle text-[11px] font-normal text-muted-foreground">
                  suno ↗
                </span>
              </a>
            ) : (
              album.title
            )}
          </h2>

          {album.subtitle && (
            <p className="mt-2 text-[12px] leading-snug text-neutral-700">
              <Linkify text={album.subtitle} />
            </p>
          )}

          {album.prompt && (
            <p className="mt-2 whitespace-pre-line text-[12px] italic leading-snug text-neutral-500">
              <Linkify text={album.prompt} />
            </p>
          )}
        </div>
      </div>

      <div className="space-y-1.5">
        {album.tracks.map((track) => (
          <TrackRow
            key={track.id}
            track={track}
            fav={favIds.has(String(track.id))}
            isPlayed={played.has(String(track.id))}
          />
        ))}
      </div>
    </section>
  )
}

/* -------------------- Track row -------------------- */

function TrackRow({ track, fav, isPlayed }: { track: Track; fav: boolean; isPlayed: boolean }) {
  return (
    <div
      id={`track-${track.id}`}
      className="group flex items-center rounded-lg px-2 py-2 hover:bg-gray-50"
    >
      <PlayPill item={track} fav={fav} />

      <div className="ml-4 min-w-0 leading-tight">
        <div
          className={cn(
            "truncate text-[13px] font-medium",
            isPlayed ? "text-neutral-400 font-normal" : "text-neutral-900"
          )}
        >
          {track.data.title}
        </div>
        <div className="mt-1 truncate text-[11px] text-muted-foreground">
          {track.data.albumTitle}
        </div>
      </div>
    </div>
  )
}

/* -------------------- Play pill (subtle greys) -------------------- */

function PlayPill({ item, fav }: { item: Track; fav?: boolean }) {
  const { isPlaying, isItemActive, play, pause } = useAudioPlayer<Track["data"]>()
  const active = isItemActive(item.id)
  const playing = active && isPlaying

  return (
    <button
      aria-label={playing ? "Pause" : "Play"}
      onClick={() => (playing ? pause() : play(item))}
      className={cn(
        "relative inline-flex h-8 w-8 items-center justify-center rounded-full border",
        "transition-colors",
        "bg-white text-black border-gray-200",
        "hover:bg-gray-100 hover:border-gray-200",
        playing && "bg-gray-200 text-black border-gray-200"
      )}
    >
      {playing ? <PauseIcon className="h-4 w-4" /> : <PlayIcon className="h-4 w-4" />}
      {fav ? (
        <StarIcon
          className="absolute -left-1 -top-1 h-3 w-3 fill-[#c98500] text-[#c98500]"
          aria-label="published favorite"
        />
      ) : null}
    </button>
  )
}

/* -------------------- Floating dock -------------------- */

const ORDER_LABEL: Record<OrderMode, string> = {
  sequential: "in order",
  random: "random",
  "random-star": "random ★",
}

function FloatingDock({
  canStep,
  order,
  starCount,
  onCycleOrder,
  onNext,
  onPrev,
}: {
  canStep: boolean
  order: OrderMode
  starCount: number
  onCycleOrder: () => void
  onNext: () => void
  onPrev: () => void
}) {
  const { isPlaying, play, pause, activeItem } = useAudioPlayer<Track["data"]>()

  const title = activeItem?.data?.title ?? "Nothing playing"
  const album = activeItem?.data?.albumTitle ?? ""

  return (
    <div className="sticky bottom-3 z-20 mx-auto mt-6 max-w-2xl">
      <div className="rounded-3xl border bg-white/90 px-4 py-3 shadow-md backdrop-blur">
        {/* full-width scrub line: click anywhere to jump within the track */}
        <div className="mb-2.5 flex items-center gap-3">
          <AudioPlayerProgress className="w-full" />
          <div className="flex flex-none items-center gap-1 text-[11px] text-muted-foreground">
            <AudioPlayerTime />
            <span>/</span>
            <AudioPlayerDuration />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={onPrev}
            disabled={!canStep}
            className={cn(
              "inline-flex h-8 w-8 items-center justify-center rounded-full border",
              "transition-colors",
              "bg-white text-black border-gray-200",
              "hover:bg-gray-100",
              "disabled:opacity-40 disabled:hover:bg-white"
            )}
            aria-label="Previous"
            title="Previous"
          >
            <SkipBackIcon className="h-4 w-4" />
          </button>

          <button
            onClick={() => (isPlaying ? pause() : play())}
            className={cn(
              "inline-flex h-8 w-8 items-center justify-center rounded-full border",
              "transition-colors",
              "bg-white text-black border-gray-200",
              "hover:bg-gray-100",
              isPlaying && "bg-gray-200"
            )}
            aria-label={isPlaying ? "Pause" : "Play"}
            title={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? <PauseIcon className="h-4 w-4" /> : <PlayIcon className="h-4 w-4" />}
          </button>

          <button
            onClick={onNext}
            disabled={!canStep}
            className={cn(
              "inline-flex h-8 w-8 items-center justify-center rounded-full border",
              "transition-colors",
              "bg-white text-black border-gray-200",
              "hover:bg-gray-100",
              "disabled:opacity-40 disabled:hover:bg-white"
            )}
            aria-label="Next"
            title="Next"
          >
            <SkipForwardIcon className="h-4 w-4" />
          </button>

          <button
            onClick={onCycleOrder}
            className={cn(
              "inline-flex h-8 flex-none items-center justify-center rounded-full border px-3",
              "text-[11px] font-semibold transition-colors",
              order === "random-star"
                ? "bg-[#c98500]/10 text-[#8a5c00] border-[#c98500]/40 hover:bg-[#c98500]/20"
                : "bg-white text-black border-gray-200 hover:bg-gray-100"
            )}
            aria-label={`Play order: ${ORDER_LABEL[order]}`}
            title={`Play order: ${ORDER_LABEL[order]}${
              order === "random-star" ? ` (${starCount} starred, unheard first)` : " (unheard first)"
            } — click to change`}
          >
            {ORDER_LABEL[order]}
          </button>

          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-medium text-black">{title}</div>
            {album && (
              <div className="truncate text-[11px] text-muted-foreground">{album}</div>
            )}
          </div>

        </div>
      </div>
    </div>
  )
}

/* -------------------- Scroll-to-active -------------------- */

function ScrollToActive() {
  const { activeItem, isPlaying } = useAudioPlayer<Track["data"]>()

  React.useEffect(() => {
    if (!isPlaying) return
    if (!activeItem) return
    const el = document.getElementById(`track-${activeItem.id}`)
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" })
  }, [activeItem, isPlaying])

  return null
}
