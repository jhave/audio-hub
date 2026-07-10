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
import { PauseIcon, PlayIcon, SkipBackIcon, SkipForwardIcon } from "lucide-react"

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

export default function AudioLibraryClient({ albums }: { albums: Album[] }) {
  return (
    <AudioPlayerProvider>
      <PreloadFirstTrack albums={albums} />

      {albums.length === 0 ? (
        <EmptyHint />
      ) : (
        <div className="space-y-8">
          {albums.map((a) => (
            <AlbumCard key={a.id} album={a} />
          ))}
        </div>
      )}

      <FloatingDock albums={albums} />
      <AutoAdvanceAndScroll albums={albums} />
    </AudioPlayerProvider>
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

/* -------------------- Album card -------------------- */

function AlbumCard({ album }: { album: Album }) {
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
            {album.title}
          </h2>

          {album.subtitle && (
            <p className="mt-2 text-[13px] leading-snug text-neutral-700">
              {album.subtitle}
            </p>
          )}
        </div>
      </div>

      <div className="space-y-1.5">
        {album.tracks.map((track) => (
          <TrackRow key={track.id} track={track} />
        ))}
      </div>
    </section>
  )
}

/* -------------------- Track row -------------------- */

function TrackRow({ track }: { track: Track }) {
  return (
    <div
      id={`track-${track.id}`}
      className="group flex items-center rounded-lg px-2 py-2 hover:bg-gray-50"
    >
      <PlayPill item={track} />

      <div className="ml-4 min-w-0 leading-tight">
        <div className="truncate text-[13px] font-medium">{track.data.title}</div>
        <div className="mt-1 truncate text-[11px] text-muted-foreground">
          {track.data.albumTitle}
        </div>
      </div>
    </div>
  )
}

/* -------------------- Play pill (subtle greys) -------------------- */

function PlayPill({ item }: { item: Track }) {
  const { isPlaying, isItemActive, play, pause } = useAudioPlayer<Track["data"]>()
  const active = isItemActive(item.id)
  const playing = active && isPlaying

  return (
    <button
      aria-label={playing ? "Pause" : "Play"}
      onClick={() => (playing ? pause() : play(item))}
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-full border",
        "transition-colors",
        "bg-white text-black border-gray-200",
        "hover:bg-gray-100 hover:border-gray-200",
        playing && "bg-gray-200 text-black border-gray-200"
      )}
    >
      {playing ? <PauseIcon className="h-4 w-4" /> : <PlayIcon className="h-4 w-4" />}
    </button>
  )
}

/* -------------------- Flat queue for prev/next + auto-advance -------------------- */

function useFlatQueue(albums: Album[]) {
  // albums already in display order (newest first)
  return React.useMemo(() => albums.flatMap((a) => a.tracks), [albums])
}

function useQueueControls(albums: Album[]) {
  const { activeItem, play } = useAudioPlayer<Track["data"]>()
  const flat = useFlatQueue(albums)

  const index = React.useMemo(() => {
    if (!activeItem) return -1
    return flat.findIndex((t) => String(t.id) === String(activeItem.id))
  }, [activeItem, flat])

  const canStep = flat.length > 0 && index >= 0

  const playNext = React.useCallback(() => {
    if (!canStep) return
    const next = flat[(index + 1) % flat.length]
    if (next) play(next)
  }, [canStep, flat, index, play])

  const playPrev = React.useCallback(() => {
    if (!canStep) return
    const prev = flat[(index - 1 + flat.length) % flat.length]
    if (prev) play(prev)
  }, [canStep, flat, index, play])

  return { playNext, playPrev, canStep }
}

/* -------------------- Floating dock -------------------- */

function FloatingDock({ albums }: { albums: Album[] }) {
  const { isPlaying, play, pause, activeItem } = useAudioPlayer<Track["data"]>()
  const { playNext, playPrev, canStep } = useQueueControls(albums)

  const title = activeItem?.data?.title ?? "Nothing playing"
  const album = activeItem?.data?.albumTitle ?? ""

  return (
    <div className="sticky bottom-3 z-20 mx-auto mt-6 max-w-2xl">
      <div className="rounded-full border bg-white/90 px-4 py-3 shadow-md backdrop-blur">
        <div className="flex items-center gap-3">
          <button
            onClick={playPrev}
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
            onClick={playNext}
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

          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-medium text-black">{title}</div>
            {album && (
              <div className="truncate text-[11px] text-muted-foreground">{album}</div>
            )}
          </div>

          <div className="hidden min-w-[210px] items-center gap-2 sm:flex">
            <AudioPlayerProgress className="w-[120px]" />
            <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <AudioPlayerTime />
              <span>/</span>
              <AudioPlayerDuration />
            </div>
          </div>
        </div>

        {/* Mobile: progress below */}
        <div className="mt-2 flex items-center gap-2 sm:hidden">
          <AudioPlayerProgress className="w-full" />
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <AudioPlayerTime />
            <span>/</span>
            <AudioPlayerDuration />
          </div>
        </div>
      </div>
    </div>
  )
}

/* -------------------- Auto-advance + scroll-to-active -------------------- */

function AutoAdvanceAndScroll({ albums }: { albums: Album[] }) {
  const { ref, activeItem, play } = useAudioPlayer<Track["data"]>()
  const flat = useFlatQueue(albums)

  React.useEffect(() => {
    const audio = ref.current
    if (!audio) return

    const onEnded = () => {
      if (!activeItem) return
      if (flat.length === 0) return
      const idx = flat.findIndex((t) => String(t.id) === String(activeItem.id))
      const next = flat[(idx + 1 + flat.length) % flat.length]
      if (next) play(next)
    }

    audio.addEventListener("ended", onEnded)
    return () => audio.removeEventListener("ended", onEnded)
  }, [ref, activeItem, play, flat])

 const { isPlaying } = useAudioPlayer<Track["data"]>()

React.useEffect(() => {
  if (!isPlaying) return
  if (!activeItem) return
  const el = document.getElementById(`track-${activeItem.id}`)
  if (el) el.scrollIntoView({ behavior: "smooth", block: "center" })
}, [activeItem, isPlaying])

  return null
}