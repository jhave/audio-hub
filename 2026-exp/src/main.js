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

let introActive = true
function enterExperience() {
  if (!introActive) return
  introActive = false
  field.resume()

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

/* Diffused variants of every layout: iterative pair-repulsion until no two
   tracks sit closer than minD, so each song can be visually distinct. The
   spread slider mixes raw <-> relaxed. */
function relaxLayout(pts, minD = 0.05, iters = 16) {
  const p = pts.map(([x, y]) => [x, y])
  const cell = minD
  for (let it = 0; it < iters; it++) {
    const buckets = new Map()
    for (let i = 0; i < p.length; i++) {
      const key = `${Math.floor(p[i][0] / cell)},${Math.floor(p[i][1] / cell)}`
      let b = buckets.get(key)
      if (!b) buckets.set(key, (b = []))
      b.push(i)
    }
    for (let i = 0; i < p.length; i++) {
      const ix = Math.floor(p[i][0] / cell), iy = Math.floor(p[i][1] / cell)
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const b = buckets.get(`${ix + dx},${iy + dy}`)
          if (!b) continue
          for (const j of b) {
            if (j <= i) continue
            let vx = p[j][0] - p[i][0]
            let vy = p[j][1] - p[i][1]
            let d = Math.hypot(vx, vy)
            if (d >= minD) continue
            if (d < 1e-6) { vx = Math.cos(i); vy = Math.sin(i); d = 1e-6 }
            const push = (minD - d) / d * 0.5
            p[i][0] -= vx * push; p[i][1] -= vy * push
            p[j][0] += vx * push; p[j][1] += vy * push
          }
        }
      }
    }
  }
  return p
}
const relaxed = {}
for (const k of data.layoutKeys) relaxed[k] = relaxLayout(data.layouts[k])

/* layouts + morphing: the slider sweeps across all hyperparameter variants */
const keys = data.layoutKeys
let morphPos = 1 // continuous position along [0, keys.length-1]
let spread = 0.55
function applyMorph() {
  const i = Math.min(keys.length - 2, Math.floor(morphPos))
  const k = morphPos - i
  world.blendLayout(
    data.layouts[keys[i]], data.layouts[keys[i + 1]],
    relaxed[keys[i]], relaxed[keys[i + 1]],
    k, spread
  )
  field.positions = world.positions
  drift.positions = world.positions
}
applyMorph()
world.rebuildTerrain()

let terrainDirty = false
let terrainTimer = null
let userMorphAt = -1e9
function scheduleTerrain(delay = 250) {
  terrainDirty = true
  clearTimeout(terrainTimer)
  terrainTimer = setTimeout(() => {
    if (terrainDirty) { world.rebuildTerrain(); terrainDirty = false }
  }, delay)
}
$("#morph").addEventListener("input", (e) => {
  morphPos = parseFloat(e.target.value)
  userMorphAt = performance.now()
  applyMorph()
  scheduleTerrain()
})

/* in auto mode the topology itself migrates: two slow incommensurate sines
   wander the hyperparameter space, and the flocks keep resettling */
let lastAutoTerrain = 0
function autoMorph(now) {
  if (!drift.autoActive) return
  if (now - userMorphAt < 45_000) return // respect a recent human choice
  const t = now / 1000
  const drifted = 2.5 + 2.45 * Math.sin(t * 0.011) * Math.sin(t * 0.0053 + 1.7)
  morphPos = Math.min(5, Math.max(0, drifted))
  $("#morph").value = morphPos
  applyMorph()
  if (now - lastAutoTerrain > 2500 && !document.hidden) {
    lastAutoTerrain = now
    world.rebuildTerrain()
  }
}

/* flight speed */
function applyFlightSpeed(fs) {
  drift.flightSpeed = fs
}
applyFlightSpeed(0.3)
$("#flight-speed").addEventListener("input", (e) => applyFlightSpeed(parseFloat(e.target.value)))

/* spread: diffuse the clusters so each track is distinct */
$("#spread").addEventListener("input", (e) => {
  spread = parseFloat(e.target.value)
  applyMorph()
  scheduleTerrain()
})

/* region: radius of the listening area (volume falls off smoothly, no edge) */
function applyRegion(r) {
  field.falloff = 3 + r * 14
}
applyRegion(0.35)
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
    if (on) speedContainer.classList.remove("hidden")
    else speedContainer.classList.add("hidden")
  }
}
const btnToggle = $("#toggle-autoflight")
if (btnToggle) {
  btnToggle.onclick = () => setAuto(!drift.auto)
}
const urlMode = new URLSearchParams(location.search).get("mode")
if (urlMode === "wander") setAuto(false)

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

/* spacebar: hold the whole world's breath */
let paused = false
addEventListener("keydown", (e) => {
  if (e.code !== "Space" || e.target.tagName === "INPUT") return
  e.preventDefault()
  paused = !paused
  if (field.ctx) (paused ? field.ctx.suspend() : field.ctx.resume())
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
  autoMorph(now)
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
  world.updateRegionRing(nx, ny, field.falloff, introActive, now / 1000)
  world.updateSpheres((i) => field.level(i), now / 1000, field.falloff)

  const dom = field.dominant()
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
