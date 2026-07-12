"use client"

import * as React from "react"
import type { DHTrack } from "@/lib/dh"

function findExtremeTracks(tracks: DHTrack[], key: keyof DHTrack) {
  const valid = tracks.filter((t) => t[key] != null && typeof t[key] === "number")
  if (valid.length === 0) return { max: null, min: null }
  const sorted = [...valid].sort((a, b) => (a[key] as number) - (b[key] as number))
  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
  }
}

export default function DHFAQ({
  text,
  tracks,
  onPlay,
}: {
  text: string
  tracks?: DHTrack[]
  onPlay?: (i: number) => void
}) {
  if (!text) return null

  const lines = text.split("\n")
  const elements: React.ReactNode[] = []
  let keyIdx = 0

  let inDetails = false
  let detailsSummary: React.ReactNode = null
  let detailsInnerLines: string[] = []

  const renderPlayButtons = (metricName: string) => {
    if (!tracks || !onPlay) return null
    let key: keyof DHTrack | null = null
    const norm = metricName.toLowerCase()
    if (norm === "spread") key = "spread"
    else if (norm === "journey") key = "journey"
    else if (norm === "novelty") key = "novelty"
    else if (norm === "tempo") key = "tempo"
    else if (norm === "bounce") key = "bounce"
    else if (norm === "complexity") key = "melodicComplexity"

    if (!key) return null

    const { min, max } = findExtremeTracks(tracks, key)
    if (!min || !max) return null

    return (
      <div className="mt-1.5 mb-2.5 flex gap-1.5 select-none" key={`btns-${metricName}`}>
        <button
          onClick={() => onPlay(max.i)}
          className="flex-1 py-1 px-2 bg-neutral-900 text-white rounded text-[9.5px] font-semibold hover:bg-neutral-800 transition-colors cursor-pointer text-left truncate leading-tight"
          title={`Play track with highest ${metricName}: "${max.title}"`}
        >
          ▲ Highest: <span className="font-light italic font-serif">"{max.title}"</span>
        </button>
        <button
          onClick={() => onPlay(min.i)}
          className="flex-1 py-1 px-2 bg-neutral-200 text-neutral-800 rounded text-[9.5px] font-semibold hover:bg-neutral-300 transition-colors cursor-pointer text-left truncate leading-tight"
          title={`Play track with lowest ${metricName}: "${min.title}"`}
        >
          ▼ Lowest: <span className="font-light italic font-serif">"{min.title}"</span>
        </button>
      </div>
    )
  }

  const parseLinesToReact = (lineList: string[]): React.ReactNode[] => {
    const list: React.ReactNode[] = []
    let inList = false
    let listItems: string[] = []

    const flushList = () => {
      if (listItems.length > 0) {
        list.push(
          <ul key={`list-${keyIdx++}`} className="list-disc pl-4 mb-3 space-y-1 text-[11px] text-neutral-600">
            {listItems.map((item, idx) => (
              <li key={idx}>{item}</li>
            ))}
          </ul>
        )
        listItems = []
        inList = false
      }
    }

    for (const line of lineList) {
      const trimmed = line.trim()
      
      if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
        inList = true
        listItems.push(trimmed.slice(2))
        continue
      } else if (inList && trimmed.length === 0) {
        flushList()
        continue
      } else if (inList && !trimmed.startsWith("- ") && !trimmed.startsWith("* ")) {
        flushList()
      }

      // Check for headings that could be targets of our scroll links
      const isHeading = trimmed.startsWith("### ") || trimmed.startsWith("## ") || trimmed.startsWith("# ")
      let elementId = ""
      if (isHeading) {
        const textVal = trimmed.replace(/^###?\s+/, "").trim()
        elementId = `faq-${textVal.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`
      }

      if (trimmed.startsWith("# ")) {
        list.push(
          <h1 key={keyIdx++} id={elementId || undefined} className="mt-4 mb-2 text-[13px] font-bold text-black border-b pb-1">
            {trimmed.slice(2)}
          </h1>
        )
      } else if (trimmed.startsWith("## ")) {
        list.push(
          <h2 key={keyIdx++} id={elementId || undefined} className="mt-4 mb-1.5 text-[11.5px] font-bold text-neutral-800">
            {trimmed.slice(3)}
          </h2>
        )
      } else if (trimmed.startsWith("### ")) {
        const textVal = trimmed.replace(/^###\s+/, "").trim()
        list.push(
          <h3 key={keyIdx++} id={elementId || undefined} className="mt-3 mb-1 text-[11px] font-bold text-neutral-700 scroll-mt-4">
            {trimmed.slice(4)}
          </h3>
        )
        const btns = renderPlayButtons(textVal)
        if (btns) list.push(btns)
      } else if (trimmed.startsWith("> ")) {
        list.push(
          <blockquote key={keyIdx++} className="border-l-2 border-neutral-300 pl-3 my-2.5 italic text-[11px] text-neutral-500">
            {trimmed.slice(2)}
          </blockquote>
        )
      } else if (trimmed === "---") {
        list.push(<hr key={keyIdx++} className="my-4 border-neutral-200" />)
      } else if (trimmed.length === 0) {
        continue
      } else {
        list.push(
          <p key={keyIdx++} className="mb-2.5 text-[11px] leading-relaxed text-neutral-600">
            {renderWithHighlights(trimmed)}
          </p>
        )
      }
    }
    flushList()
    return list
  }

  const renderWithHighlights = (txt: string) => {
    const terms = ["tempo drift", "tempo jumps", "spread", "journey", "novelty", "tempo", "key", "bounce", "complexity"]
    const regex = new RegExp(`\\b(${terms.join("|")})\\b`, "gi")
    const parts = txt.split(regex)
    return parts.map((part, idx) => {
      const normPart = part.toLowerCase().replace(/\s+/g, "-")
      if (terms.includes(part.toLowerCase())) {
        return (
          <span
            key={idx}
            className="font-bold text-neutral-900 bg-neutral-200/50 px-1 rounded faq-word-occ scroll-mt-6"
            data-word={normPart}
          >
            {part}
          </span>
        )
      }
      return part
    })
  }

  for (let line of lines) {
    const trimmed = line.trim()

    if (trimmed.startsWith("<details>")) {
      inDetails = true
      continue
    }

    if (trimmed.startsWith("</details>")) {
      const innerReact = parseLinesToReact(detailsInnerLines)
      elements.push(
        <details key={keyIdx++} className="mb-4 bg-white border rounded-xl p-3 shadow-sm group">
          <summary className="text-[12px] font-bold text-neutral-800 cursor-pointer list-none flex justify-between items-center group-open:border-b group-open:pb-2 select-none">
            {detailsSummary || "WTF is that?"}
            <span className="text-[10px] text-neutral-400 font-normal transition-transform duration-200 group-open:rotate-180">▼</span>
          </summary>
          <div className="mt-3 space-y-1">
            {innerReact}
          </div>
        </details>
      )
      detailsSummary = null
      detailsInnerLines = []
      inDetails = false
      continue
    }

    if (inDetails) {
      if (trimmed.startsWith("<summary>")) {
        const innerText = trimmed.replace(/<\/?summary>/g, "").replace(/<\/?b>/g, "")
        detailsSummary = <span>{innerText}</span>
      } else {
        detailsInnerLines.push(line)
      }
    } else {
      elements.push(...parseLinesToReact([line]))
    }
  }

  return (
    <div className="p-4 text-[12px] select-text">
      {elements}
    </div>
  )
}
