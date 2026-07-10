// src/components/Footer.tsx
export default function Footer() {
  return (
    <footer className="mt-10 border-t pt-4 text-xs text-neutral-500">
      <p>
        Vibe coded Jan 10, 2026
        <br />
        by GPT-5.2 in Next.js + TypeScript.
        <br />
        Audio generated in{" "}
        <a
          href="https://suno.com/@jhave"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:opacity-80"
        >
          Suno (@jhave)
        </a>
        .
        <br />
        UI components adapted from{" "}
        <a
          href="https://ui.elevenlabs.io/"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:opacity-80"
        >
          ElevenLabs UI
        </a>
        .
      </p>
    </footer>
  )
}