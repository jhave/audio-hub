"use client"

import * as React from "react"
import type { DHTrack } from "@/lib/dh"

function Meter({ label, value }: { label: string; value: number | null }) {
  if (value == null) return null
  return (
    <div className="mb-1.5">
      <div className="flex justify-between text-[10px] text-neutral-500">
        <span>{label}</span>
        <span>{value.toFixed(2)}</span>
      </div>
      <div className="h-1 overflow-hidden rounded bg-neutral-200">
        <div className="h-full bg-neutral-500" style={{ width: `${Math.round(value * 100)}%` }} />
      </div>
    </div>
  )
}

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

// rms silhouette (0..127) as tiny bars; progress marks the playhead when live.
function Silhouette({ rms, progress }: { rms: number[]; progress: number | null }) {
  if (!rms.length) return null
  const n = rms.length
  return (
    <svg viewBox={`0 0 ${n * 3} 26`} className="mb-2 w-full" style={{ height: 24 }}>
      {rms.map((v, i) => {
        const played = progress != null && i / n <= progress
        const hh = Math.max(1, (v / 127) * 22)
        return (
          <rect
            key={i}
            x={i * 3}
            y={(24 - hh) / 2}
            width={2}
            height={hh}
            fill={played ? "#e24b4a" : "#9a988f"}
          />
        )
      })}
    </svg>
  )
}

export default function DHData({
  track,
  isLive,
  progress,
}: {
  track: DHTrack | null
  isLive: boolean
  progress: number | null
}) {
  if (!track)
    return (
      <div className="p-4 text-[12px] text-neutral-400">
        Play a track, or hover a title, to read its analysis here.
      </div>
    )
  const chips: string[] = []
  if (track.key) chips.push(track.key)
  if (track.tempo != null) chips.push(`${Math.round(track.tempo)} bpm`)
  if (track.sectionCount != null) chips.push(`${track.sectionCount} sections`)
  if (track.modulations) chips.push(`${track.modulations} modulation${track.modulations > 1 ? "s" : ""}`)
  if (track.dropAt != null) chips.push(`drop @ ${Math.round(track.dropAt)}s`)

  return (
    <div className="p-4 text-[12px]">
      <div className="mb-0.5 flex items-center gap-1.5 text-[14px] font-medium text-black">
        {track.fav ? <span className="text-[#c98500]">★</span> : null}
        <span>{track.title}</span>
      </div>
      <div className="mb-2 text-[11px] text-neutral-500">
        {track.album}
        {track.dateISO ? ` · ${track.dateISO}` : ""}
        {!isLive ? <span className="ml-2 rounded bg-neutral-100 px-1.5 py-0.5 text-neutral-400">previewing</span> : null}
      </div>

      <div className="mb-2 flex flex-wrap gap-1.5">
        {chips.map((c) => (
          <span key={c} className="rounded-full border px-2 py-0.5 text-[10px] text-neutral-600">
            {c}
          </span>
        ))}
      </div>

      <Silhouette rms={track.rmsSilhouette} progress={isLive ? progress : null} />

      <Meter label="weirdness" value={track.weirdness} />
      <Meter label="style weight" value={track.styleWeight} />

      {track.topTags.length > 0 && (
        <div className="mb-2 mt-2 flex flex-wrap gap-1">
          {track.topTags.map((t) => (
            <span key={t.probe} className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] text-neutral-600">
              {t.probe}
            </span>
          ))}
        </div>
      )}

      <div className="mb-2 grid grid-cols-3 gap-2 text-center">
        {(
          [
            ["journey", track.journey],
            ["spread", track.spread],
            ["novelty", track.novelty],
          ] as const
        ).map(([k, v]) => (
          <div key={k} className="rounded bg-neutral-50 py-1.5">
            <div className="text-[13px] font-medium text-black">{v != null ? v.toFixed(v < 10 ? 1 : 0) : "—"}</div>
            <div className="text-[9px] uppercase tracking-wide text-neutral-400">{k}</div>
          </div>
        ))}
      </div>

      {track.prompt && (
        <div className="mt-2 border-t pt-2 text-[11px] italic leading-snug text-neutral-500">
          {linkify(track.prompt)}
        </div>
      )}
    </div>
  )
}
