import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "173 days (of Music Created in Suno) — Glia",
    template: "%s — Glia",
  },
  description: "Audio library for the 2026 Suno set on glia.ca. January 18, 2026 — July 9, 2026. 173 days • 746 tracks • 4.31 tracks/day • 11.0 min/day. Total duration: 31h 47m 28s. The price of music/muzak is falling to zero.",
  icons: {
    icon: "/img/glia-bw.png" 
  },
  // optional:
  metadataBase: new URL("https://glia.ca"),
};



export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-black">
        {children}
      </body>
    </html>
  )
}
