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
    default: "75 days (of Music Created in Suno) — Glia",
    template: "%s — Glia",
  },
  description: "Audio library for the 2025/75days Suno set on glia.ca. October 13, 2025 — December 25, 2025. 75 days • 422 tracks • 5.63 tracks/day • 17.9 min/day. Total duration: 22h 21m 59s. The price of music/muzak is falling to zero.",
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
