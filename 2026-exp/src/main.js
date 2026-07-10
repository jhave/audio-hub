import { loadData } from "./data.js"
import { World } from "./world.js"
import { SoundField } from "./audio.js"
import { Drift } from "./drift.js"

const $ = (s) => document.querySelector(s)

// never strand the listener on the loading screen: retry, then say why
async function loadDataResilient() {
  for (let attempt = 1; ; attempt++) {
    try {
      return await loadData()
    } catch (e) {
      if (attempt >= 4) {
        $("#loading").textContent = `could not load the topology (${e.message}) — retrying…`
      }
      await new Promise((r) => setTimeout(r, Math.min(8000, 500 * attempt * attempt)))
    }
  }
}
const data = await loadDataResilient()
const world = new World($("#scene"), data)
const field = new SoundField(data.tracks)
const drift = new Drift(data.tracks)

let trackLimitCount = 1
world.setTrackLimit(trackLimitCount)
drift.trackLimitCount = trackLimitCount

let introActive = true
function enterExperience() {
  if (!introActive) return
  introActive = false
  field.resume()
  drift.userSelected(0) // target the first track on launch

  const intro = $("#intro")
  if (intro) {
    intro.classList.add("fade-out")
    setTimeout(() => {
      intro.style.display = "none"
    }, 800)
  }

  const toFade = ["#title", "#hud", "#panel", "#status", "#hint"]
  for (const id of toFade) {
    const el = $(id)
    if (el) {
      el.style.opacity = 1
      el.style.pointerEvents = "auto"
    }
  }
}
const enterBtn = $("#enter-btn")
if (enterBtn) enterBtn.onclick = enterExperience

/* Geometric quadrant coordinates layout: overrides all layout keys */
function applyGeometricLayout(N) {
  const R = 8.0 // baseline spacing radius
  const pts = []
  if (N === 1) {
    pts.push([0, 0])
  } else if (N === 2) {
    pts.push([-R * 0.7, 0])
    pts.push([R * 0.7, 0])
  } else if (N === 3) {
    for (let i = 0; i < 3; i++) {
      const theta = -Math.PI / 2 + (i * Math.PI * 2) / 3
      pts.push([R * Math.cos(theta), R * Math.sin(theta)])
    }
  } else if (N === 4) {
    // Quadrants: top-left, top-right, bottom-left, bottom-right
    pts.push([-R * 0.8, -R * 0.8]) // Q1
    pts.push([R * 0.8, -R * 0.8])  // Q2
    pts.push([-R * 0.8, R * 0.8])  // Q3
    pts.push([R * 0.8, R * 0.8])   // Q4
  } else {
    // Spiral layout for N > 4
    for (let i = 0; i < N; i++) {
      const theta = i * 0.35
      const r = R + i * 0.15
      pts.push([r * Math.cos(theta), r * Math.sin(theta)])
    }
  }

  const total = data.tracks.length
  for (let i = 0; i < total; i++) {
    const pt = pts[i] || [0, 0]
    world.positions[i * 2] = pt[0]
    world.positions[i * 2 + 1] = pt[1]
  }

  field.positions = world.positions
  drift.positions = world.positions
}
applyGeometricLayout(trackLimitCount)

/* flight speed */
function applyFlightSpeed(fs) {
  drift.flightSpeed = fs
}
applyFlightSpeed(0.0)
$("#flight-speed").addEventListener("input", (e) => {
  const val = parseFloat(e.target.value)
  applyFlightSpeed(val)
  if (val === 0) {
    setAuto(false)
  }
})

// Spread/diffusion sliders are disabled under geometric layout

/* region: radius of the listening area (volume falls off smoothly, no edge) */
function applyRegion(r) {
  field.falloff = 3 + r * 14
}
applyRegion(0.20)
$("#region").addEventListener("input", (e) => applyRegion(parseFloat(e.target.value)))

/* modes */
function setAuto(on) {
  drift.auto = on
  const btn = $("#toggle-autoflight")
  if (btn) {
    btn.classList.toggle("active", on)
    btn.textContent = on ? "Auto-Flight: ON" : "Auto-Flight: OFF"
  }
  const speedContainer = $("#flight-speed-container")
  if (speedContainer) {
    if (on) {
      speedContainer.classList.remove("hidden")
      if (drift.flightSpeed === 0) {
        applyFlightSpeed(0.20)
        $("#flight-speed").value = 0.20
      }
    } else {
      speedContainer.classList.add("hidden")
    }
  }
}
const btnToggle = $("#toggle-autoflight")
if (btnToggle) {
  btnToggle.onclick = () => setAuto(!drift.auto)
}
const urlMode = new URLSearchParams(location.search).get("mode")
setAuto(urlMode === "auto")

/* track spawning chevrons */
function changeTrackLimit(delta) {
  trackLimitCount = Math.min(data.tracks.length, Math.max(1, trackLimitCount + delta))
  $("#track-count-val").textContent = trackLimitCount
  
  // Re-apply geometric coordinates based on the new limit count N
  applyGeometricLayout(trackLimitCount)
  
  world.setTrackLimit(trackLimitCount)
  drift.trackLimitCount = trackLimitCount
  
  if (drift.target >= trackLimitCount) {
    drift.userSelected(trackLimitCount - 1)
  } else if (drift.auto && drift.arrived && trackLimitCount > 1) {
    // Take off immediately to explore the newly added track(s)
    drift.target = drift.chooseNext()
    drift.arrived = false
  }
}

const btnDec = $("#dec-tracks")
const btnInc = $("#inc-tracks")
if (btnDec && btnInc) {
  btnDec.onclick = (e) => {
    e.stopPropagation()
    const delta = e.shiftKey ? -10 : (e.altKey ? -50 : -1)
    changeTrackLimit(delta)
  }
  btnInc.onclick = (e) => {
    e.stopPropagation()
    const delta = e.shiftKey ? 10 : (e.altKey ? 50 : 1)
    changeTrackLimit(delta)
  }
}

/* interaction */
let downAt = null
addEventListener("pointerdown", (e) => {
  if (introActive) {
    if (!e.target.closest(".intro-content")) {
      enterExperience()
    }
    return
  }
  downAt = [e.clientX, e.clientY, performance.now()]
})
addEventListener("pointerup", (e) => {
  if (introActive) return
  if (!downAt) return
  const [x0, y0, t0] = downAt
  downAt = null
  const moved = Math.hypot(e.clientX - x0, e.clientY - y0)
  if (moved > 6 || performance.now() - t0 > 400) return // it was a drag
  if (e.target.closest("#panel")) return
  field.resume()
  const hit = world.pick(e)
  if (!hit) return
  if (hit.trackIdx != null) drift.userSelected(hit.trackIdx)
  else if (hit.ground) drift.userMovedTo(hit.ground[0], hit.ground[1])
})
// any gesture unlocks audio (browser autoplay policy)
addEventListener("pointerdown", () => {
  if (!introActive) field.resume()
}, { once: true })

// hover: cursor feedback everywhere; nexus magnetism in manual control
let hoverClock = 0
addEventListener("pointermove", (e) => {
  const now = performance.now()
  if (now - hoverClock < 90) return
  hoverClock = now
  if (e.target.closest("#panel")) return
  const hit = world.pick(e)
  document.body.style.cursor = hit?.trackIdx != null ? "pointer" : ""
  if (!drift.autoActive && hit?.ground) drift.hoverPoint = hit.ground
})

/* keyboard interaction: space to pause, arrows to navigate */
let paused = false
addEventListener("keydown", (e) => {
  if (e.target.tagName === "INPUT") return
  if (e.code === "Space") {
    e.preventDefault()
    paused = !paused
    if (field.ctx) (paused ? field.ctx.suspend() : field.ctx.resume())
  } else if (e.key === "ArrowRight") {
    e.preventDefault()
    let nextIdx = (drift.target != null ? drift.target + 1 : 0)
    if (nextIdx >= trackLimitCount) nextIdx = 0
    drift.userSelected(nextIdx)
  } else if (e.key === "ArrowLeft") {
    e.preventDefault()
    let prevIdx = (drift.target != null ? drift.target - 1 : 0)
    if (prevIdx < 0 || prevIdx >= trackLimitCount) prevIdx = trackLimitCount - 1
    drift.userSelected(prevIdx)
  }
})

field.onended = () => drift.onSongEnded()

/* status rollover: who is flying, and when auto resumes */
const elStatus = $("#status")
function updateStatus() {
  let text
  if (paused) text = "paused — space to resume"
  else if (drift.autoActive) text = "auto-flight"
  else {
    const s = Math.ceil(drift.autoResumeIn() / 1000)
    text = drift.auto ? `yours — auto-flight resumes in ${s}s` : "wander — you have the tiller"
  }
  if (elStatus.textContent !== text) elStatus.textContent = text
  elStatus.classList.toggle("manual", !paused && !drift.autoActive)
}

/* caption */
const elAlbum = $("#hud .album"), elTrack = $("#hud .track"), elPrompt = $("#hud .prompt")
let lastDom = -1
function updateCaption() {
  const dom = field.dominant()
  if (dom === lastDom) return
  lastDom = dom
  if (dom < 0) { elAlbum.textContent = ""; elTrack.textContent = ""; elPrompt.textContent = ""; return }
  const t = data.tracks[dom]
  const a = data.albums[t.album]
  elAlbum.textContent = a.title
  elTrack.textContent = t.title
  elPrompt.textContent = a.prompt
}

/* logic tick: drift + audio mix on a timer so the music keeps flowing even
   when the tab/window is hidden (rAF freezes there; setInterval survives) */
let lastTick = performance.now()
setInterval(() => {
  const now = performance.now()
  const dt = Math.min(1, (now - lastTick) / 1000)
  lastTick = now
  if (paused) { updateStatus(); return }
  const [nx, ny] = drift.step(dt)
  field.setNexus(nx, ny)
  updateCaption()
  updateStatus()
}, 180)

/* render loop: visuals only */
import * as THREE from "three"
const focusVec = new THREE.Vector3()
let last = performance.now()
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000)
  last = now
  const nx = drift.nx, ny = drift.ny
  world.setNexusPos(nx, ny)
  const dom = field.dominant()
  world.currentDominantIdx = dom
  world.updateRegionRing(nx, ny, field.falloff, introActive, now / 1000)
  world.updateSpheres((i) => field.level(i), now / 1000, field.falloff)

  world.setPlayhead(dom, dom >= 0 ? field.progress(dom) : null)

  if (!paused) {
    focusVec.set(nx, world.heightAt(nx, ny) + 2, ny)
    if (drift.autoActive) world.cinematicUpdate(dt, focusVec, drift.arrived, now / 1000)
    else world.controls.update()
  }
  world.render(now / 1000)
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)

$("#loading").classList.add("done")

// debug/installation handle
window.__exp = { data, world, field, drift }
