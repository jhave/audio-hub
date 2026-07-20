"use client"

import * as React from "react"

interface EssayNode {
  id: string
  num: string
  title: string
  anchorTitle: string
  content: string[]
  type: "section" | "subsection" | "intro"
}

function parseInlineMarkdown(text: string): React.ReactNode[] {
  const regex = /(\*\*.*?\*\*|\[.*?\]\(.*?\))/g
  const matches = text.split(regex)
  return matches.map((part, idx) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      const inner = part.slice(2, -2)
      if (inner.startsWith("[") && inner.endsWith(")")) {
        const linkMatch = inner.match(/\[(.*?)\]\((.*?)\)/)
        if (linkMatch) {
          const [, label, href] = linkMatch
          return (
            <strong key={idx}>
              <a href={href} target="_blank" rel="noopener noreferrer" className="underline text-[#e24b4a] hover:text-black">
                {label}
              </a>
            </strong>
          )
        }
      }
      return <strong key={idx} className="font-bold text-neutral-900">{inner}</strong>
    }
    if (part.startsWith("[") && part.includes("](")) {
      const linkMatch = part.match(/\[(.*?)\]\((.*?)\)/)
      if (linkMatch) {
        const [, label, href] = linkMatch
        return (
          <a key={idx} href={href} target="_blank" rel="noopener noreferrer" className="underline text-[#e24b4a] hover:text-black">
            {label}
          </a>
        )
      }
    }
    return part
  })
}

export default function DHEssay({ text }: { text: string }) {
  const [viewMode, setViewMode] = React.useState<"nodes" | "linear">("nodes")
  const [activeNodeIdx, setActiveNodeIdx] = React.useState<number>(0)
  const readerRef = React.useRef<HTMLDivElement | null>(null)

  // Failsafe: when a new segment is selected, snap the reader back to the top
  // (matters only when text overflows the pane on smaller screens)
  React.useEffect(() => {
    readerRef.current?.scrollTo({ top: 0 })
  }, [activeNodeIdx])
  
  const nodes = React.useMemo(() => {
    if (!text) return []
    const lines = text.split("\n")
    const list: EssayNode[] = []
    
    let currentHeader = "Introduction"
    let currentAnchor = "essay-introduction"
    let currentLines: string[] = []
    let counter = 1
    let type: "section" | "subsection" | "intro" = "intro"

    const pushCurrent = () => {
      if (currentLines.length > 0) {
        const numStr = String(counter++).padStart(2, "0")
        list.push({
          id: currentAnchor,
          num: numStr,
          title: currentHeader,
          anchorTitle: currentHeader,
          content: [...currentLines],
          type,
        })
        currentLines = []
      }
    }

    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed.startsWith("# ")) {
        pushCurrent()
        const textVal = trimmed.slice(2).trim()
        currentHeader = textVal
        currentAnchor = `essay-${textVal.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`
        type = "section"
      } else if (trimmed.startsWith("## ")) {
        pushCurrent()
        const textVal = trimmed.slice(3).trim()
        currentHeader = textVal
        currentAnchor = `essay-${textVal.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`
        type = "subsection"
      } else if (trimmed === "---") {
        continue
      } else if (trimmed.length > 0) {
        currentLines.push(line)
      }
    }
    pushCurrent()
    return list
  }, [text])

  // Listen to external scrolling requests (e.g. click on a metric key)
  React.useEffect(() => {
    const handleScrollIntoView = (e: Event) => {
      const customEvent = e as CustomEvent<{ id: string }>
      const targetId = customEvent.detail?.id
      if (!targetId) return
      const foundIdx = nodes.findIndex((n) => n.id === targetId || n.id.includes(targetId))
      if (foundIdx !== -1) {
        setActiveNodeIdx(foundIdx)
        setViewMode("nodes")
      }
    };
    window.addEventListener("dh-essay-scroll", handleScrollIntoView)

    // Override element focus behavior for essay links
    const originalScrollTo = Element.prototype.scrollTo;
    Element.prototype.scrollTo = function(options?: any) {
      if (this.id === "dh-essay-container") {
        // Intercept container scrolling and convert to active node change
        return;
      }
      return originalScrollTo.apply(this, arguments as any);
    };

    // Check DOM mutation or custom scrolls
    const observer = new MutationObserver(() => {
      // Periodic check or event listener hook can bind here
    });
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      window.removeEventListener("dh-essay-scroll", handleScrollIntoView)
      Element.prototype.scrollTo = originalScrollTo;
      observer.disconnect();
    }
  }, [nodes])

  // Poll for external anchor clicks periodically to update active node
  React.useEffect(() => {
    const checkActiveAnchor = () => {
      const activeHash = window.location.hash
      if (activeHash && activeHash.startsWith("#essay-")) {
        const id = activeHash.substring(1)
        const found = nodes.findIndex(n => n.id === id)
        if (found !== -1) {
          setActiveNodeIdx(found)
          setViewMode("nodes")
        }
      }
    }
    window.addEventListener("hashchange", checkActiveAnchor)
    return () => window.removeEventListener("hashchange", checkActiveAnchor)
  }, [nodes])

  if (nodes.length === 0) return null

  const activeNode = nodes[activeNodeIdx]

  return (
    <div className="flex flex-col h-full bg-[#faf9f6] text-neutral-800 relative">
      {/* Header toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-neutral-200/50 bg-[#faf9f6]/95 z-20 flex-shrink-0 select-none">
        <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">Theory Space</span>
        <div className="flex bg-neutral-200/40 rounded p-0.5 text-[9px] font-bold gap-0.5">
          <button
            onClick={() => setViewMode("nodes")}
            className={`px-2 py-0.5 rounded transition-all cursor-pointer ${
              viewMode === "nodes" ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500 hover:text-neutral-700"
            }`}
          >
            Aphorisms
          </button>
          <button
            onClick={() => setViewMode("linear")}
            className={`px-2 py-0.5 rounded transition-all cursor-pointer ${
              viewMode === "linear" ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500 hover:text-neutral-700"
            }`}
          >
            Full Text
          </button>
        </div>
      </div>

      {viewMode === "nodes" ? (
        <div className="flex-1 min-h-0 flex flex-col p-4 relative overflow-hidden select-text">
          {/* Node Constellation Map */}
          <div className="flex flex-wrap justify-center gap-1.5 mb-3 overflow-y-auto max-h-[140px] select-none scrollbar-none">
            {nodes.map((node, idx) => {
              const isActive = idx === activeNodeIdx
              return (
                <button
                  key={node.id}
                  onClick={() => setActiveNodeIdx(idx)}
                  className={`w-7 h-7 flex-shrink-0 rounded-full text-[9px] font-mono font-bold flex items-center justify-center border transition-all cursor-pointer ${
                    isActive
                      ? "bg-[#e24b4a] border-[#e24b4a] text-white scale-110 shadow-md shadow-[#e24b4a]/20"
                      : "bg-white border-neutral-200/80 text-neutral-500 hover:bg-neutral-100 hover:border-neutral-300"
                  }`}
                  title={node.title}
                >
                  {node.num}
                </button>
              )
            })}
          </div>

          {/* Radical Focus Reader */}
          <div ref={readerRef} className="flex-1 min-h-0 flex flex-col justify-start overflow-y-auto px-1.5 pb-2 scrollbar-thin scrollbar-thumb-neutral-200">
            {activeNode && (
              <div key={activeNode.id} className="animate-fadeIn space-y-4">
                <div className="flex items-center gap-2.5">
                  <span className="text-[14px] font-mono text-[#e24b4a] font-bold">
                    §{activeNode.num}
                  </span>
                  <div className="h-[1px] flex-grow bg-gradient-to-r from-neutral-200 to-transparent" />
                </div>
                
                {activeNode.title && activeNode.title !== "Introduction" && (
                  <h2 className="text-[17px] font-serif font-bold text-neutral-900 tracking-tight leading-snug">
                    {activeNode.title}
                  </h2>
                )}

                <div className="space-y-3">
                  {activeNode.content.map((block, bIdx) => {
                    const trimmed = block.trim()
                    if (trimmed.startsWith("> ")) {
                      return (
                        <blockquote key={bIdx} className="border-l-2 border-[#e24b4a] pl-3 my-3 italic text-[12.5px] text-neutral-500/90 leading-relaxed font-serif">
                          {parseInlineMarkdown(trimmed.slice(2))}
                        </blockquote>
                      )
                    }
                    if (trimmed.startsWith("* ") || trimmed.startsWith("- ")) {
                      return (
                        <div key={bIdx} className="flex gap-2 pl-2 text-[12px] leading-relaxed text-neutral-600 font-sans">
                          <span className="text-[#e24b4a] font-mono">•</span>
                          <div>{parseInlineMarkdown(trimmed.slice(2))}</div>
                        </div>
                      )
                    }
                    if (trimmed.startsWith("<details>")) {
                      return null // skip raw HTML wrapper for clean aphorisms
                    }
                    if (trimmed.startsWith("<summary>")) {
                      return (
                        <div key={bIdx} className="font-semibold text-[13px] text-neutral-800 font-sans mt-2">
                          {parseInlineMarkdown(trimmed.replace(/<\/?b>|<\/?summary>/g, ""))}
                        </div>
                      )
                    }
                    if (trimmed.startsWith("</details>")) {
                      return null
                    }
                    return (
                      <p key={bIdx} className="text-[13.5px] leading-relaxed text-neutral-700 font-serif antialiased select-text">
                        {parseInlineMarkdown(block)}
                      </p>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Original Linear Reading View */
        <div id="dh-essay-container" className="flex-1 overflow-y-auto px-4 pb-28 pt-4 select-text scrollbar-thin scrollbar-thumb-neutral-200">
          <div className="max-w-2xl mx-auto space-y-6">
            {nodes.map((node) => (
              <section key={node.id} id={node.id} className="scroll-mt-16 space-y-3 border-b border-neutral-100 pb-5 last:border-0">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-neutral-400">§{node.num}</span>
                  {node.title !== "Introduction" && (
                    <h3 className={`font-serif font-bold text-neutral-900 leading-tight ${
                      node.type === "section" ? "text-[16px]" : "text-[13.5px]"
                    }`}>
                      {node.title}
                    </h3>
                  )}
                </div>
                <div className="space-y-2.5">
                  {node.content.map((block, bIdx) => {
                    const trimmed = block.trim()
                    if (trimmed.startsWith("> ")) {
                      return (
                        <blockquote key={bIdx} className="border-l-2 border-neutral-300 pl-3 my-2.5 italic text-[11px] text-neutral-500">
                          {parseInlineMarkdown(trimmed.slice(2))}
                        </blockquote>
                      )
                    }
                    if (trimmed.startsWith("* ") || trimmed.startsWith("- ")) {
                      return (
                        <div key={bIdx} className="flex gap-2 pl-2 text-[11px] leading-relaxed text-neutral-600">
                          <span className="text-neutral-400">•</span>
                          <div>{parseInlineMarkdown(trimmed.slice(2))}</div>
                        </div>
                      )
                    }
                    if (trimmed.startsWith("<details>") || trimmed.startsWith("</details>")) {
                      return null
                    }
                    if (trimmed.startsWith("<summary>")) {
                      return (
                        <div key={bIdx} className="font-semibold text-[11px] text-neutral-800 mt-1">
                          {parseInlineMarkdown(trimmed.replace(/<\/?b>|<\/?summary>/g, ""))}
                        </div>
                      )
                    }
                    return (
                      <p key={bIdx} className="text-[11.5px] leading-relaxed text-neutral-600 font-serif">
                        {parseInlineMarkdown(block)}
                      </p>
                    )
                  })}
                </div>
              </section>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
