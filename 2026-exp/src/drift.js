// Auto-flight: when the listener is idle (or in auto mode), the nexus drifts
// from song to song. Favorites act as beacons — first visits to a region
// prefer published tracks. Speed of flight controls the movement rate.
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
    this.flightSpeed = 0.3
    this.positions = null // Float32Array, shared with SoundField
    this.lastUserInput = -1e9
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
    if (!this.auto) return false
    // any click/travel overrides auto-flight for 15s; it resumes on its own
    const idle = performance.now() - this.lastUserInput
    return idle > 15_000
  }

  /** ms until auto-flight resumes (for the status rollover); 0 if active. */
  autoResumeIn() {
    if (!this.auto) return 0
    const idle = performance.now() - this.lastUserInput
    return Math.max(0, 15_000 - idle)
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
      // prefer the neighborhood, but flightSpeed flattens distance-preference
      let w = 1 / (1 + Math.pow(d / (8 + this.flightSpeed * 60), 2 - this.flightSpeed * 0.5))
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

  getMinDistanceToAnyTrack() {
    if (!this.positions) return 0
    let minDistSq = 1e9
    const n = this.tracks.length
    for (let i = 0; i < n; i++) {
      const dx = this.positions[i * 2] - this.nx
      const dy = this.positions[i * 2 + 1] - this.ny
      const d2 = dx * dx + dy * dy
      if (d2 < minDistSq) minDistSq = d2
    }
    return Math.sqrt(minDistSq)
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
        
        // Find distance to the closest track to see if we are in silence
        const minDist = this.getMinDistanceToAnyTrack()
        
        // Base speed based on flightSpeed setting
        let speed = 0.5 + this.flightSpeed * 5.0 + dist * 0.015
        
        // If we are in a region of silence (far from any track), boost speed up to 4x
        if (minDist > 7) {
          const silenceBoost = Math.min(4.0, 1.0 + (minDist - 7) * 0.4)
          speed *= silenceBoost
        }
        
        const k = Math.min(1, (speed * dt) / dist)
        // gentle curvature: drift has a hand on the tiller, not rails
        const swirl = Math.sin(performance.now() * 0.0004 + this.target) * 0.15 * this.flightSpeed
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
