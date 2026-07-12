"use client"

import * as React from "react"
import type { DHTrack } from "@/lib/dh"

function Meter({
  label,
  value,
  serial,
  activeTag,
  clickedTag,
  onTagHover,
  onTagClick,
}: {
  label: string
  value: number | null
  serial: string
  activeTag?: string | null
  clickedTag?: string | null
  onTagHover?: (tag: string | null) => void
  onTagClick?: (tag: string | null) => void
}) {
  if (value == null) return null
  const isActive = activeTag === serial || clickedTag === serial
  return (
    <div
      onMouseEnter={() => onTagHover?.(serial)}
      onMouseLeave={() => onTagHover?.(null)}
      onClick={() => {
        if (clickedTag === serial) onTagClick?.(null)
        else onTagClick?.(serial)
      }}
      className={`p-1 rounded transition-colors cursor-pointer select-none border ${
        isActive ? "bg-blue-50 border-blue-200 text-blue-900" : "border-transparent hover:bg-neutral-50"
      }`}
    >
      <div className="flex justify-between text-[10px] text-neutral-500">
        <span className={isActive ? "text-blue-600 font-semibold" : ""}>{label}</span>
        <span className={isActive ? "text-blue-600 font-mono font-semibold" : ""}>{value.toFixed(2)}</span>
      </div>
      <div className="h-1 overflow-hidden rounded bg-neutral-200 mt-1">
        <div className={`h-full ${isActive ? "bg-blue-500" : "bg-neutral-500"}`} style={{ width: `${Math.round(value * 100)}%` }} />
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


export default function DHData({
  track,
  isLive,
  progress,
  onMetricClick,
  activeTag,
  onTagHover,
  clickedTag,
  onTagClick,
  hoverIdx,
}: {
  track: DHTrack | null
  isLive: boolean
  progress: number | null
  onMetricClick: (term: string) => void
  activeTag?: string | null
  onTagHover?: (tag: string | null) => void
  clickedTag?: string | null
  onTagClick?: (tag: string | null) => void
  hoverIdx?: number | null
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
      value: track.key,
      tooltip: "Estimated key center. Click to zoom map & scroll FAQ.",
      onClick: () => onMetricClick("key")
    })
  }
  if (track.tempo != null) {
    chipsList.push({
      key: "tempo",
      label: `${Math.round(track.tempo)} bpm`,
      value: Math.round(track.tempo),
      tooltip: "Estimated tempo in beats per minute. Click to zoom map & scroll FAQ.",
      onClick: () => onMetricClick("tempo")
    })
  }
  if (track.tempoDrift != null && track.tempoDrift > 0) {
    chipsList.push({
      key: "tempoDrift",
      label: `±${Math.round(track.tempoDrift)} bpm drift`,
      value: Math.round(track.tempoDrift),
      tooltip: "Tempo drift (standard deviation of local tempo across windows). Click to zoom map & scroll FAQ.",
      onClick: () => onMetricClick("tempo-drift")
    })
  }
  if (track.tempoJumps != null && track.tempoJumps > 0) {
    chipsList.push({
      key: "tempoJumps",
      label: `${track.tempoJumps} tempo jump${track.tempoJumps > 1 ? "s" : ""}`,
      value: track.tempoJumps,
      tooltip: "Count of local tempo jumps exceeding 10 BPM. Click to zoom map & scroll FAQ.",
      onClick: () => onMetricClick("tempo-jumps")
    })
  }
  if (track.sectionCount != null) {
    chipsList.push({
      key: "sections",
      label: `${track.sectionCount} sections`,
      value: track.sectionCount,
      tooltip: "Estimated structural sections. Click to zoom map.",
      onClick: () => {}
    })
  }
  if (track.modulations != null) {
    chipsList.push({
      key: "modulations",
      label: `${track.modulations} modulation${track.modulations > 1 ? "s" : ""}`,
      value: track.modulations,
      tooltip: "Count of key modulation events. Click to zoom map & scroll FAQ.",
      onClick: () => onMetricClick("key")
    })
  }
  if (track.dropAt != null) {
    chipsList.push({
      key: "drop",
      label: `drop @ ${Math.round(track.dropAt)}s`,
      value: Math.round(track.dropAt),
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
        {chipsList.map((c) => {
          const serial = c.value != null ? `metric:${c.key}:${c.value}` : null
          const isActive = serial ? (activeTag === serial || clickedTag === serial) : false
          return (
            <span
              key={c.key}
              onMouseEnter={() => serial && onTagHover?.(serial)}
              onMouseLeave={() => serial && onTagHover?.(null)}
              onClick={() => {
                c.onClick?.()
                if (!serial) return
                if (clickedTag === serial) {
                  onTagClick?.(null)
                } else {
                  onTagClick?.(serial)
                }
              }}
              title={c.tooltip}
              className={`rounded-full border px-2 py-0.5 text-[10px] select-none cursor-pointer transition-colors ${
                isActive ? "bg-blue-500 text-white border-blue-500 font-semibold" : "text-neutral-600 hover:bg-neutral-50 hover:text-black"
              }`}
            >
              {c.label}
            </span>
          )
        })}
      </div>

      <div className="grid grid-cols-2 gap-3 mb-2.5">
        <Meter
          label="weirdness"
          value={track.weirdness}
          serial={`metric:weirdness:${track.weirdness}`}
          activeTag={activeTag}
          clickedTag={clickedTag}
          onTagHover={onTagHover}
          onTagClick={onTagClick}
        />
        <Meter
          label="style weight"
          value={track.styleWeight}
          serial={`metric:styleWeight:${track.styleWeight}`}
          activeTag={activeTag}
          clickedTag={clickedTag}
          onTagHover={onTagHover}
          onTagClick={onTagClick}
        />
      </div>

      {track.topTags.length > 0 && (
        <div className="mb-3.5 mt-2 flex flex-wrap gap-1 select-none">
          {track.topTags.map((t) => {
            const isActive = activeTag?.toLowerCase() === t.probe.toLowerCase() ||
                             clickedTag?.toLowerCase() === t.probe.toLowerCase()
            return (
              <span
                key={t.probe}
                onMouseEnter={() => onTagHover?.(t.probe)}
                onMouseLeave={() => onTagHover?.(null)}
                onClick={() => {
                  if (clickedTag?.toLowerCase() === t.probe.toLowerCase()) {
                    onTagClick?.(null)
                  } else {
                    onTagClick?.(t.probe)
                  }
                }}
                className={`rounded px-1.5 py-0.5 text-[10px] cursor-pointer transition-colors ${
                  isActive ? "bg-blue-500 text-white font-semibold" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                }`}
              >
                {t.probe}
              </span>
            )
          })}
        </div>
      )}

      {/* Trajectory Metrics */}
      <div className="mb-2 grid grid-cols-3 gap-2 text-center select-none">
        {(
          [
            ["journey", track.journey, "Total distance traveled through parameter space", "1–15"],
            ["spread", track.spread, "Style variety and internal diversity", "0.1–3.0"],
            ["shifts", track.novelty, "Count of internal scene changes or transitions", "0–8"],
          ] as const
        ).map(([k, v, desc, range]) => (
          <div
            key={k}
            onClick={() => onMetricClick(k)}
            title={`${desc}. Click to scroll to definition.`}
            className="rounded bg-neutral-50 py-1 cursor-pointer hover:bg-neutral-100 transition-colors border"
          >
            <div className="text-[13px] font-bold text-black leading-tight">
              {v != null ? (k === "shifts" ? v.toFixed(0) : v.toFixed(v < 10 ? 1 : 0)) : "—"}
            </div>
            <div className="text-[9px] uppercase tracking-wide text-neutral-400 font-bold">{k}</div>
            <div className="text-[7.5px] text-neutral-400 font-mono mt-0.5">range: {range}</div>
          </div>
        ))}
      </div>

      {/* Acoustic Rhythm/Melodic Metrics */}
      <div className="mb-3 grid grid-cols-2 gap-2 text-center select-none">
        {(
          [
            ["bounce", track.bounce, "Low-frequency groove/rhythm bounce", "0.05–0.6"],
            ["complexity", track.melodicComplexity, "Melodic and harmonic complexity", "0.05–0.7"],
          ] as const
        ).map(([k, v, desc, range]) => (
          <div
            key={k}
            onClick={() => onMetricClick(k)}
            title={`${desc}. Click to scroll to definition.`}
            className="rounded bg-neutral-50 py-1 cursor-pointer hover:bg-neutral-100 transition-colors border"
          >
            <div className="text-[12px] font-bold text-black leading-tight">{v != null ? v.toFixed(2) : "—"}</div>
            <div className="text-[8.5px] uppercase tracking-wide text-neutral-400 font-bold">{k}</div>
            <div className="text-[7.5px] text-neutral-400 font-mono mt-0.5">range: {range}</div>
          </div>
        ))}
      </div>


    </div>
  )
}
