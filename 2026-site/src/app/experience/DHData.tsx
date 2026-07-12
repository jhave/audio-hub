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
  onMetricClick,
}: {
  track: DHTrack | null
  isLive: boolean
  progress: number | null
  onMetricClick: (term: string) => void
}) {
  if (!track)
    return (
      <div className="p-4 text-[12px] text-neutral-400">
        Play a track, or hover a title, to read its analysis here.
      </div>
    )

  const chipsList = []
  if (track.key) {
    chipsList.push({
      key: "key",
      label: track.key,
      tooltip: "Estimated key center. Click to scroll to definition.",
      onClick: () => onMetricClick("key")
    })
  }
  if (track.tempo != null) {
    chipsList.push({
      key: "tempo",
      label: `${Math.round(track.tempo)} bpm`,
      tooltip: "Estimated tempo in beats per minute. Click to scroll to definition.",
      onClick: () => onMetricClick("tempo")
    })
  }
  if (track.sectionCount != null) {
    chipsList.push({
      key: "sections",
      label: `${track.sectionCount} sections`,
      tooltip: "Estimated structural sections inside the track.",
      onClick: undefined
    })
  }
  if (track.modulations != null) {
    chipsList.push({
      key: "modulations",
      label: `${track.modulations} modulation${track.modulations > 1 ? "s" : ""}`,
      tooltip: "Count of key modulation events. Click to scroll to definition.",
      onClick: () => onMetricClick("key")
    })
  }
  if (track.dropAt != null) {
    chipsList.push({
      key: "drop",
      label: `drop @ ${Math.round(track.dropAt)}s`,
      tooltip: "Estimated drop location.",
      onClick: undefined
    })
  }

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

      <div className="mb-2.5 flex flex-wrap gap-1.5">
        {chipsList.map((c) => (
          <span
            key={c.key}
            onClick={c.onClick}
            title={c.tooltip}
            className={`rounded-full border px-2 py-0.5 text-[10px] text-neutral-600 select-none ${
              c.onClick ? "cursor-pointer hover:bg-neutral-50 hover:text-black transition-colors" : ""
            }`}
          >
            {c.label}
          </span>
        ))}
      </div>

      <Silhouette rms={track.rmsSilhouette} progress={isLive ? progress : null} />

      <Meter label="weirdness" value={track.weirdness} />
      <Meter label="style weight" value={track.styleWeight} />

      {track.topTags.length > 0 && (
        <div className="mb-3.5 mt-2 flex flex-wrap gap-1">
          {track.topTags.map((t) => (
            <span key={t.probe} className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] text-neutral-600">
              {t.probe}
            </span>
          ))}
        </div>
      )}

      {/* Trajectory Metrics */}
      <div className="mb-2 grid grid-cols-3 gap-2 text-center">
        {(
          [
            ["journey", track.journey, "Total distance traveled through parameter space"],
            ["spread", track.spread, "Style variety and internal diversity"],
            ["novelty", track.novelty, "Count of internal scene changes or transitions"],
          ] as const
        ).map(([k, v, desc]) => (
          <div
            key={k}
            onClick={() => onMetricClick(k)}
            title={`${desc}. Click to scroll to definition.`}
            className="rounded bg-neutral-50 py-1.5 cursor-pointer hover:bg-neutral-100 transition-colors border"
          >
            <div className="text-[13px] font-bold text-black">{v != null ? v.toFixed(v < 10 ? 1 : 0) : "—"}</div>
            <div className="text-[9px] uppercase tracking-wide text-neutral-400 font-semibold">{k}</div>
          </div>
        ))}
      </div>

      {/* Acoustic Rhythm/Melodic Metrics */}
      <div className="mb-3 grid grid-cols-2 gap-2 text-center">
        {(
          [
            ["bounce", track.bounce, "Low-frequency groove/rhythm bounce"],
            ["complexity", track.melodicComplexity, "Melodic and harmonic complexity"],
          ] as const
        ).map(([k, v, desc]) => (
          <div
            key={k}
            onClick={() => onMetricClick(k)}
            title={`${desc}. Click to scroll to definition.`}
            className="rounded bg-neutral-50 py-1.5 cursor-pointer hover:bg-neutral-100 transition-colors border"
          >
            <div className="text-[12px] font-bold text-black">{v != null ? v.toFixed(2) : "—"}</div>
            <div className="text-[8.5px] uppercase tracking-wide text-neutral-400 font-semibold">{k}</div>
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
