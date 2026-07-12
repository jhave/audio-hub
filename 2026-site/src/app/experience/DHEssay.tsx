"use client"

import * as React from "react"

export default function DHEssay({ text }: { text: string }) {
  if (!text) return null

  // Simple Markdown-to-React parser to render headings, paragraphs, quotes, and lists
  const lines = text.split("\n")
  const elements: React.ReactNode[] = []
  let keyIdx = 0

  let inList = false
  let listItems: string[] = []

  const flushList = () => {
    if (listItems.length > 0) {
      elements.push(
        <ul key={`list-${keyIdx++}`} className="list-disc pl-4 mb-3.5 space-y-1 text-[11px] text-neutral-600">
          {listItems.map((item, idx) => (
            <li key={idx}>{item}</li>
          ))}
        </ul>
      )
      listItems = []
      inList = false
    }
  }

  for (let line of lines) {
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

    if (trimmed.startsWith("# ")) {
      elements.push(
        <h1 key={keyIdx++} className="mt-4 mb-2 text-[13px] font-bold text-black border-b pb-1">
          {trimmed.slice(2)}
        </h1>
      )
    } else if (trimmed.startsWith("## ")) {
      elements.push(
        <h2 key={keyIdx++} className="mt-4 mb-1.5 text-[11.5px] font-bold text-neutral-800">
          {trimmed.slice(3)}
        </h2>
      )
    } else if (trimmed.startsWith("### ")) {
      elements.push(
        <h3 key={keyIdx++} className="mt-3 mb-1 text-[11px] font-semibold text-neutral-700">
          {trimmed.slice(4)}
        </h3>
      )
    } else if (trimmed.startsWith("> ")) {
      elements.push(
        <blockquote key={keyIdx++} className="border-l-2 border-neutral-300 pl-3 my-2.5 italic text-[11px] text-neutral-500">
          {trimmed.slice(2)}
        </blockquote>
      )
    } else if (trimmed === "---") {
      elements.push(<hr key={keyIdx++} className="my-4 border-neutral-200" />)
    } else if (trimmed.length === 0) {
      continue
    } else {
      elements.push(
        <p key={keyIdx++} className="mb-2.5 text-[11px] leading-relaxed text-neutral-600">
          {trimmed}
        </p>
      )
    }
  }
  flushList()

  return (
    <div className="h-full overflow-y-auto px-3.5 pb-6 pt-2 select-text opacity-70 hover:opacity-100 transition-opacity duration-300 scrollbar-thin scrollbar-thumb-neutral-200">
      {elements}
    </div>
  )
}
