// Auto-flight: when the listener is idle (or in auto mode), the nexus drifts
// from song to song. Favorites act as beacons — first visits to a region
// prefer published tracks. Chaos raises the temperature of the wandering.
export class Drift {
  constructor(tracks) {
    this.tracks = tracks
    this.nx = 0
    this.ny = 0
    this.vx = 0
    this.vy = 0
    this.target = null // track index
    this.visited = new Set()
    this.auto = true
    this.chaos = 0.25
    this.positions = null // Float32Array, shared with SoundField
    this.lastUserInput = 0
    this.idleAfter = 30_000
    this.arrived = false
    this.hoverPoint = null // [x, z] under the mouse (wander-mode magnetism)
  }

  userMovedTo(x, y) {
    this.nx = x
    this.ny = y
    this.vx = this.vy = 0
    this.target = null
    this.lastUserInput = performance.now()
  }

  userSelected(trackIdx) {
    this.target = trackIdx
    this.visited.add(trackIdx)
    this.lastUserInput = performance.now()
  }

  get autoActive() {
    return this.auto || performance.now() - this.lastUserInput > this.idleAfter
  }

  /** Choose where to fly next: near-ish, favorite-weighted, chaos-tempered. */
  chooseNext() {
    const n = this.tracks.length
    if (!this.positions || n === 0) return null
    const weights = new Float64Array(n)
    let sum = 0
    for (let i = 0; i < n; i++) {
      const dx = this.positions[i * 2] - this.nx
      const dy = this.positions[i * 2 + 1] - this.ny
      const d = Math.sqrt(dx * dx + dy * dy)
      // prefer the neighborhood, but chaos flattens distance-preference
      let w = 1 / (1 + Math.pow(d / (8 + this.chaos * 60), 2 - this.chaos))
      if (d < 2) w *= 0.05 // don't re-pick where we already are
      if (this.tracks[i].fav) w *= this.visited.has(i) ? 1.6 : 3.5
      if (this.visited.has(i)) w *= 0.35
      weights[i] = w
      sum += w
    }
    let r = Math.random() * sum
    for (let i = 0; i < n; i++) {
      r -= weights[i]
      if (r <= 0) return i
    }
    return n - 1
  }

  /** When every track has been visited, the flock's memory clears. */
  _maybeReset() {
    if (this.visited.size > this.tracks.length * 0.8) this.visited.clear()
  }

  /** Called when the dominant song ends — drift onward. */
  onSongEnded() {
    if (this.autoActive) {
      this.target = this.chooseNext()
      if (this.target != null) this.visited.add(this.target)
      this._maybeReset()
    }
  }

  /** Per-frame integration; returns [x, y] of the nexus. */
  step(dt) {
    if (this.autoActive && this.target == null) {
      this.target = this.chooseNext()
      if (this.target != null) this.visited.add(this.target)
    }
    if (this.target != null && this.positions) {
      const tx = this.positions[this.target * 2]
      const ty = this.positions[this.target * 2 + 1]
      const dx = tx - this.nx
      const dy = ty - this.ny
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist < 0.4) {
        // arrived: linger; a new target is chosen when the song ends
        this.arrived = true
        this.vx *= 0.9
        this.vy *= 0.9
        if (!this.autoActive) this.target = null
      } else {
        this.arrived = false
        // unhurried: the journey between songs is part of the listening
        const speed = 0.8 + this.chaos * 2.6 + dist * 0.015
        const k = Math.min(1, (speed * dt) / dist)
        // gentle curvature: drift has a hand on the tiller, not rails
        const swirl = Math.sin(performance.now() * 0.0004 + this.target) * 0.35 * this.chaos
        this.vx = dx * k + -dy * swirl * dt
        this.vy = dy * k + dx * swirl * dt
        this.nx += this.vx
        this.ny += this.vy
      }
    } else if (!this.autoActive && this.hoverPoint) {
      // wander mode: the nexus is quietly magnetized to the mouse
      const dx = this.hoverPoint[0] - this.nx
      const dy = this.hoverPoint[1] - this.ny
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist > 0.3) {
        const k = Math.min(1, (1.4 * dt) / dist)
        this.nx += dx * k
        this.ny += dy * k
      }
      this.arrived = false
    }
    return [this.nx, this.ny]
  }
}
