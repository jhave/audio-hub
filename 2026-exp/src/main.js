import { loadData } from "./data.js"
import { World } from "./world.js"
import { SoundField } from "./audio.js"
import { Drift } from "./drift.js"
import * as THREE from "three"

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

/* ================= the complexity field =================
   The mouse position IS the instrument:
     X (left -> right): speed of change — drift velocity, topology migration
        rate, and how fast the active window rotates through the catalog
        (top-right: one track, but it keeps becoming a different track)
     Y (top -> bottom): complexity — number of active tracks (1 -> all),
        topology turbulence (still -> wildly pulsing), listening radius
   Values ease toward the mouse so nothing snaps. */
const P = { x: 0, y: 0, tx: 0, ty: 0 }
const total = data.tracks.length
const keys = data.layoutKeys

let windowStart = 0 // float catalog cursor; advances with speed
let morphT = Math.random() * 100 // migrating-topology clock
let activeSet = [] // catalog indices currently on the land
let activeMembership = new Set()
let N = 1

function catalog() {
  const out = []
  for (let i = 0; i < total; i++) if (!data.tracks[i].deleted) out.push(i)
  return out
}

function computeActiveSet(cat) {
  if (!cat.length) return []
  const start = ((Math.floor(windowStart) % cat.length) + cat.length) % cat.length
  const n = Math.min(N, cat.length)
  const out = []
  for (let i = 0; i < n; i++) out.push(cat[(start + i) % cat.length])
  return out
}

/* geometric arrangements for very small ensembles */
function geometricPts(n) {
  const R = 8.0
  if (n === 1) return [[0, 0]]
  if (n === 2) return [[-R * 0.7, 0], [R * 0.7, 0]]
  if (n === 3) {
    return [0, 1, 2].map((i) => {
      const th = -Math.PI / 2 + (i * Math.PI * 2) / 3
      return [R * Math.cos(th), R * Math.sin(th)]
    })
  }
  return [[-R * 0.8, -R * 0.8], [R * 0.8, -R * 0.8], [-R * 0.8, R * 0.8], [R * 0.8, R * 0.8]]
}

/* one integration step of the whole parameter field */
function layoutTick(dt) {
  P.x += (P.tx - P.x) * Math.min(1, dt * 2.5)
  P.y += (P.ty - P.y) * Math.min(1, dt * 2.5)
  const speed = P.x
  const comp = P.y

  // Y -> track count on a curve (fine resolution among small ensembles)
  N = Math.max(1, Math.round(1 + Math.pow(comp, 1.7) * (total - 1)))

  // X -> the window slides through the catalog: even one track keeps changing
  windowStart += dt * Math.pow(speed, 1.4) * 3

  const cat = catalog()
  activeSet = computeActiveSet(cat)
  activeMembership = new Set(activeSet)
  drift.activeSet = activeSet
  world.activeSet = activeMembership

  // topology migration: rate grows with speed, wildness with complexity
  morphT += dt * (0.05 + speed * 1.6) * (0.15 + comp)
  const wild = comp * comp
  const pos =
    2.5 +
    2.45 * Math.sin(morphT * 0.31) * Math.sin(morphT * 0.17 + 1.7) +
    Math.sin(morphT * 2.3) * 1.8 * wild
  const clamped = Math.min(keys.length - 1 - 1e-4, Math.max(0, pos))
  const ai = Math.floor(clamped)
  const k = clamped - ai
  const A = data.layouts[keys[ai]]
  const B = data.layouts[keys[ai + 1]]

  // place the active ensemble; exile everyone else
  const extent = 60 * 0.92 * (0.25 + 0.75 * Math.sqrt(comp))
  const geo = N <= 4 ? geometricPts(N) : null
  for (let i = 0; i < total; i++) {
    world.positions[i * 2] = 9999
    world.positions[i * 2 + 1] = 9999
  }
  for (let j = 0; j < activeSet.length; j++) {
    const i = activeSet[j]
    if (geo) {
      world.positions[i * 2] = geo[j][0]
      world.positions[i * 2 + 1] = geo[j][1]
    } else if (A[i]) {
      world.positions[i * 2] = (A[i][0] + (B[i][0] - A[i][0]) * k) * extent
      world.positions[i * 2 + 1] = (A[i][1] + (B[i][1] - A[i][1]) * k) * extent
    } else {
      // locally-loaded files have no embedding: orbit the center
      const th = (i * 2.4) % (Math.PI * 2)
      world.positions[i * 2] = Math.cos(th) * 10
      world.positions[i * 2 + 1] = Math.sin(th) * 10
    }
  }
  field.positions = world.positions
  drift.positions = world.positions

  // downstream parameters
  drift.flightSpeed = speed < 0.03 ? 0 : speed
  drift.auto = speed >= 0.03
  field.maxVoices = Math.min(12, N)
  field.falloff = 3 + comp * 18

  // keep the target inside the living ensemble
  if (drift.target == null || !activeMembership.has(drift.target)) {
    drift.retarget()
  }
}

/* ================= intro / fullscreen ================= */
let introActive = true
function enterExperience() {
  if (!introActive) return
  introActive = false
  field.resume()
  layoutTick(0.001)
  drift.setTarget(activeSet[0] ?? 0)

  if (document.documentElement.requestFullscreen) {
    document.documentElement.requestFullscreen().catch(() => {})
  } else if (document.documentElement.webkitRequestFullscreen) {
    document.documentElement.webkitRequestFullscreen()
  }

  const intro = $("#intro")
  if (intro) {
    intro.classList.add("fade-out")
    setTimeout(() => (intro.style.display = "none"), 800)
  }
  for (const id of ["#hud-active-songs", "#load-file-btn", "#stats-overlay"]) {
    const el = $(id)
    if (el) {
      el.style.opacity = 1
      el.style.pointerEvents = "auto"
    }
  }
}
const enterBtn = $("#enter-btn")
if (enterBtn) enterBtn.onclick = enterExperience

/* ================= floating mixer list ================= */
function updateActiveSongsList() {
  const container = $("#hud-active-songs")
  if (!container) return

  const activeTrackIndices = Array.from(field.voices.keys())
  if (activeTrackIndices.length === 0) {
    container.innerHTML = `<div style="font-size: 11px; color: #62757d; text-align: center; padding: 4px 0;">No active tracks in region</div>`
    return
  }
  if (container.firstChild && !container.firstChild.dataset) container.innerHTML = ""

  const existingMap = new Map()
  for (const el of Array.from(container.children)) {
    existingMap.set(parseInt(el.dataset.trackIdx), el)
  }
  const keepIndices = new Set(activeTrackIndices)
  for (const [idx, el] of existingMap) {
    if (!keepIndices.has(idx)) container.removeChild(el)
  }

  for (const trackIdx of activeTrackIndices) {
    const t = data.tracks[trackIdx]
    if (!t) continue
    let el = existingMap.get(trackIdx)
    if (!el) {
      el = document.createElement("div")
      el.className = "active-song-item"
      el.dataset.trackIdx = trackIdx

      const titleSpan = document.createElement("span")
      titleSpan.className = "song-title"
      titleSpan.textContent = t.title

      const playPauseBtn = document.createElement("button")
      playPauseBtn.className = "hud-btn play-pause-btn"
      playPauseBtn.textContent = t.manualPaused ? "▶" : "‖"
      playPauseBtn.onclick = (e) => {
        e.stopPropagation()
        t.manualPaused = !t.manualPaused
        playPauseBtn.textContent = t.manualPaused ? "▶" : "‖"
      }

      const volSlider = document.createElement("input")
      volSlider.type = "range"
      volSlider.min = "0"
      volSlider.max = "1"
      volSlider.step = "0.01"
      volSlider.className = "hud-vol-slider"
      volSlider.value = t.manualVolume !== undefined ? t.manualVolume : "1.0"
      volSlider.oninput = (e) => (t.manualVolume = parseFloat(e.target.value))

      const deleteBtn = document.createElement("button")
      deleteBtn.className = "hud-btn delete-song-btn"
      deleteBtn.textContent = "✖"
      deleteBtn.onclick = (e) => {
        e.stopPropagation()
        t.deleted = true
        field._release(trackIdx)
      }

      el.appendChild(titleSpan)
      el.appendChild(playPauseBtn)
      el.appendChild(volSlider)
      el.appendChild(deleteBtn)
      container.appendChild(el)
    } else {
      const playPauseBtn = el.querySelector(".play-pause-btn")
      if (playPauseBtn) playPauseBtn.textContent = t.manualPaused ? "▶" : "‖"
    }
    el.classList.toggle("dominant", trackIdx === field.dominant())
  }
}

/* ================= local file loader ================= */
const loadFileBtn = $("#load-file-btn")
const fileInput = $("#file-input")
if (loadFileBtn && fileInput) {
  loadFileBtn.onclick = (e) => {
    e.stopPropagation()
    fileInput.click()
  }
  fileInput.onchange = (e) => {
    const files = Array.from(e.target.files)
    if (files.length === 0) return
    const firstNew = data.tracks.length
    for (const file of files) {
      data.tracks.push({
        title: file.name.replace(/\.[^/.]+$/, ""),
        url: URL.createObjectURL(file),
        album: 0,
        dur: 180,
        fav: true,
      })
    }
    // grow the shared position buffers to fit the newcomers
    world.growTo(data.tracks.length)
    // slide the window onto the new tracks and travel there
    const cat = catalog()
    windowStart = cat.indexOf(firstNew)
    layoutTick(0.001)
    drift.setTarget(firstNew)
  }
}

/* ================= interaction ================= */
let downAt = null
addEventListener("pointerdown", (e) => {
  if (introActive) {
    if (!e.target.closest(".intro-content")) enterExperience()
    return
  }
  downAt = [e.clientX, e.clientY, performance.now()]
})
addEventListener("pointerup", (e) => {
  if (introActive || !downAt) return
  const [x0, y0, t0] = downAt
  downAt = null
  if (Math.hypot(e.clientX - x0, e.clientY - y0) > 6 || performance.now() - t0 > 400) return
  if (e.target.closest("#hud-active-songs") || e.target.closest("#load-file-btn")) return
  field.resume()
  const hit = world.pick(e)
  if (!hit) return
  if (hit.trackIdx != null && activeMembership.has(hit.trackIdx)) {
    drift.userSelected(hit.trackIdx)
  } else if (hit.ground) {
    drift.userMovedTo(hit.ground[0], hit.ground[1])
  }
})

/* mouse position -> parameter targets (the actual work happens in the
   logic tick, eased — this handler only records intent, so it can never jank) */
let hoverClock = 0
addEventListener("pointermove", (e) => {
  const now = performance.now()
  if (now - hoverClock < 40) return
  hoverClock = now
  if (introActive) return
  if (e.target.closest("#hud-active-songs") || e.target.closest("#load-file-btn")) return

  P.tx = Math.min(1, Math.max(0, e.clientX / innerWidth))
  P.ty = Math.min(1, Math.max(0, (e.clientY - 10) / (innerHeight - 10)))
  if (e.clientY < 10) P.ty = 0 // top edge: guaranteed solo

  const hit = world.pick(e)
  document.body.style.cursor = hit?.trackIdx != null ? "pointer" : ""
})

/* keyboard: space pause, arrows step through the active ensemble */
let paused = false
addEventListener("keydown", (e) => {
  if (e.target.tagName === "INPUT") return
  if (e.code === "Space") {
    e.preventDefault()
    paused = !paused
    if (field.ctx) (paused ? field.ctx.suspend() : field.ctx.resume())
  } else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
    e.preventDefault()
    if (!activeSet.length) return
    const dir = e.key === "ArrowRight" ? 1 : -1
    const cur = Math.max(0, activeSet.indexOf(drift.target))
    drift.userSelected(activeSet[(cur + dir + activeSet.length) % activeSet.length])
  }
})

field.onended = () => drift.onSongEnded()

/* ================= loops ================= */
/* logic tick on a timer: parameters, drift and audio keep flowing even when
   the window is hidden (rAF freezes there; setInterval survives) */
let lastTick = performance.now()
setInterval(() => {
  const now = performance.now()
  const dt = Math.min(1, (now - lastTick) / 1000)
  lastTick = now
  if (paused || introActive) return
  layoutTick(dt)
  const [nx, ny] = drift.step(dt)
  field.setNexus(nx, ny)
}, 150)

/* render loop: visuals only; terrain rebuilds are throttled here */
const focusVec = new THREE.Vector3()
const camAnchor = new THREE.Vector3()
let last = performance.now()
let lastTerrain = 0
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000)
  last = now

  if (!document.hidden && now - lastTerrain > 250) {
    lastTerrain = now
    world.rebuildTerrain()
  }

  const nx = drift.nx, ny = drift.ny
  world.setNexusPos(nx, ny)
  const dom = field.dominant()
  world.currentDominantIdx = dom
  world.updateRegionRing(nx, ny, field.falloff, introActive, now / 1000)
  world.updateSpheres((i) => field.level(i), now / 1000, field.falloff)

  updateActiveSongsList()

  const elSpeed = $("#stat-speed"), elTracks = $("#stat-tracks"), elComplexity = $("#stat-complexity")
  if (elSpeed) elSpeed.textContent = Math.round(P.x * 100)
  if (elTracks) elTracks.textContent = field.voices.size
  if (elComplexity) elComplexity.textContent = N

  world.setPlayhead(dom, dom >= 0 ? field.progress(dom) : null)

  if (!paused) {
    focusVec.set(nx, world.heightAt(nx, ny) + 2, ny)
    // camera anchor: centered for tiny ensembles, follows the action as
    // complexity spreads the land
    const follow = Math.min(1, N / 30)
    camAnchor.set(nx * follow, focusVec.y * follow, ny * follow)
    if (drift.autoActive) world.cinematicUpdate(dt, camAnchor, drift.arrived, now / 1000, P.y)
    else world.controls.update()
  }
  world.render(now / 1000)
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)

$("#loading").classList.add("done")

// debug/installation handle
window.__exp = { data, world, field, drift, P, get activeSet() { return activeSet }, get N() { return N } }
