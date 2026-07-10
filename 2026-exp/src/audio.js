// Spatial crossfade engine: the nexus position mixes the nearest tracks with
// inverse-distance gains. A small pool of media elements is recycled so the
// full 746-track archive stays streamable without preloading anything.
const MAX_POOL = 6

export class SoundField {
  constructor(tracks) {
    this.tracks = tracks
    this.ctx = null
    this.master = null
    this.voices = new Map() // trackIdx -> voice
    this.pool = []
    this.maxVoices = 2
    this.falloff = 7 // world units at which a voice is ~half gain
    this.onended = null // (trackIdx) => void
    this.positions = null // Float32Array [x,y]*n, set by main each morph
  }

  ensureContext() {
    if (this.ctx) return
    this.ctx = new (window.AudioContext || window.webkitAudioContext)()
    this.master = this.ctx.createGain()
    this.master.gain.value = 0.9
    this.master.connect(this.ctx.destination)
  }

  resume() {
    this.ensureContext()
    if (this.ctx.state === "suspended") this.ctx.resume()
  }

  _makeVoice() {
    const el = new Audio()
    el.preload = "auto"
    if (/^https?:\/\//.test(this.tracks[0]?.url || "")) el.crossOrigin = "anonymous"
    const src = this.ctx.createMediaElementSource(el)
    const gain = this.ctx.createGain()
    gain.gain.value = 0
    const analyser = this.ctx.createAnalyser()
    analyser.fftSize = 256
    src.connect(gain)
    gain.connect(analyser)
    analyser.connect(this.master)
    return { el, gain, analyser, trackIdx: -1, target: 0, buf: new Uint8Array(128) }
  }

  _acquire(trackIdx) {
    this.ensureContext()
    let v = this.pool.pop()
    if (!v) {
      if (this.voices.size + 1 > MAX_POOL) return null
      v = this._makeVoice()
    }
    const t = this.tracks[trackIdx]
    v.trackIdx = trackIdx
    v.el.src = t.url
    
    // Restore progress if it was previously playing
    const saved = t.savedTime || 0
    if (saved > 0 && saved < t.dur) {
      v.el.currentTime = saved
    }

    v.el.onended = () => {
      if (this.onended) this.onended(trackIdx)
      this._release(trackIdx, true)
    }
    v.el.play().catch(() => {})
    this.voices.set(trackIdx, v)
    return v
  }

  _release(trackIdx, naturallyEnded = false) {
    const v = this.voices.get(trackIdx)
    if (!v) return

    // Save playback position so it can resume from the same spot
    if (naturallyEnded) {
      this.tracks[trackIdx].savedTime = 0
    } else if (v.el.currentTime > 0.1 && v.el.duration) {
      this.tracks[trackIdx].savedTime = v.el.currentTime
    }

    v.el.onended = null
    v.el.pause()
    v.el.removeAttribute("src")
    v.el.load()
    v.gain.gain.cancelScheduledValues(this.ctx.currentTime)
    v.gain.gain.value = 0
    v.trackIdx = -1
    this.voices.delete(trackIdx)
    this.pool.push(v)
  }

  /** Update the mix for a nexus at (x, y). Call ~5-10 times per second. */
  setNexus(x, y) {
    if (!this.ctx || !this.positions) return
    const n = this.tracks.length
    // nearest maxVoices by brute force (n=746: trivial)
    const best = []
    for (let i = 0; i < n; i++) {
      const dx = this.positions[i * 2] - x
      const dy = this.positions[i * 2 + 1] - y
      const d2 = dx * dx + dy * dy
      if (best.length < this.maxVoices) {
        best.push([d2, i])
        best.sort((a, b) => a[0] - b[0])
      } else if (d2 < best[best.length - 1][0]) {
        best[best.length - 1] = [d2, i]
        best.sort((a, b) => a[0] - b[0])
      }
    }
    const keep = new Set()
    const f2 = this.falloff * this.falloff
    let total = 0
    let gmax = 0
    const gains = []
    for (const [d2, i] of best) {
      const g = 1 / (1 + d2 / f2)
      gains.push([i, g])
      total += g
      gmax = Math.max(gmax, g)
    }
    // overall loudness follows proximity of the nearest song, but never
    // drops below a murmur while crossing open land
    const overall = Math.min(1, Math.max(0.18, gmax * 1.4))
    for (const [i, g] of gains) {
      keep.add(i)
      let v = this.voices.get(i)
      if (!v) v = this._acquire(i)
      if (!v) continue
      const share = total > 0 ? g / total : 0
      // sqrt(share): equal-power blend across simultaneous voices
      v.gain.gain.setTargetAtTime(Math.sqrt(share) * overall * 0.9, this.ctx.currentTime, 0.35)
    }
    for (const idx of [...this.voices.keys()]) {
      if (!keep.has(idx)) {
        const v = this.voices.get(idx)
        v.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.4)
        // release once actually inaudible (checked on the next ticks)
        if (v.gain.gain.value < 0.01) this._release(idx)
      }
    }
  }

  /** 0..1 audio level for a playing track (for sphere pulsing). */
  level(trackIdx) {
    const v = this.voices.get(trackIdx)
    if (!v) return 0
    v.analyser.getByteFrequencyData(v.buf)
    let s = 0
    for (let i = 0; i < v.buf.length; i++) s += v.buf[i]
    return (s / v.buf.length / 255) * v.gain.gain.value * 3
  }

  /** Playback fraction [0,1] of a playing track, or null. */
  progress(trackIdx) {
    const v = this.voices.get(trackIdx)
    if (!v || !v.el.duration) return null
    return v.el.currentTime / v.el.duration
  }

  /** The dominant (loudest-target) playing track index, or -1. */
  dominant() {
    let best = -1, bg = 0
    for (const [idx, v] of this.voices) {
      const g = v.gain.gain.value
      if (g > bg) { bg = g; best = idx }
    }
    return best
  }
}
