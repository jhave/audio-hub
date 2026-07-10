import { loadData } from "./data.js"
import { World } from "./world.js"
import { SoundField } from "./audio.js"
import { Drift } from "./drift.js"

const $ = (s) => document.querySelector(s)

const data = await loadData()
const world = new World($("#scene"), data)
const field = new SoundField(data.tracks)
const drift = new Drift(data.tracks)

/* layouts + morphing: the slider sweeps across all hyperparameter variants */
const keys = data.layoutKeys
let morphPos = 1 // continuous position along [0, keys.length-1]
function applyMorph() {
  const i = Math.min(keys.length - 2, Math.floor(morphPos))
  const k = morphPos - i
  world.blendLayout(data.layouts[keys[i]], data.layouts[keys[i + 1]], k)
  field.positions = world.positions
  drift.positions = world.positions
}
world.setLayout(data.layouts[keys[1]])
field.positions = world.positions
drift.positions = world.positions

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
  if (now - lastAutoTerrain > 2500) {
    lastAutoTerrain = now
    world.rebuildTerrain()
  }
}

/* chaos: voices, seeks, drift temperature */
function applyChaos(c) {
  field.chaos = c
  drift.chaos = c
  field.maxVoices = 1 + Math.round(c * 3) // 1..4 simultaneous songs
  field.falloff = 5 + c * 10
}
applyChaos(0.25)
$("#chaos").addEventListener("input", (e) => applyChaos(parseFloat(e.target.value)))

/* modes */
const btnWander = $("#mode-wander"), btnAuto = $("#mode-auto")
function setAuto(on) {
  drift.auto = on
  btnAuto.classList.toggle("active", on)
  btnWander.classList.toggle("active", !on)
}
btnWander.onclick = () => setAuto(false)
btnAuto.onclick = () => setAuto(true)
const urlMode = new URLSearchParams(location.search).get("mode")
if (urlMode === "wander") setAuto(false)

/* interaction */
let downAt = null
addEventListener("pointerdown", (e) => (downAt = [e.clientX, e.clientY, performance.now()]))
addEventListener("pointerup", (e) => {
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
addEventListener("pointerdown", () => field.resume(), { once: true })

// wander-mode magnetism: the nexus leans toward the mouse
let hoverClock = 0
addEventListener("pointermove", (e) => {
  const now = performance.now()
  if (now - hoverClock < 90) return
  hoverClock = now
  if (drift.autoActive) return
  if (e.target.closest("#panel")) return
  const hit = world.pick(e)
  drift.hoverPoint = hit?.ground ?? drift.hoverPoint
})

field.onended = () => drift.onSongEnded()

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

/* main loop */
import * as THREE from "three"
const focusVec = new THREE.Vector3()
let last = performance.now()
let mixClock = 0
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000)
  last = now
  autoMorph(now)
  const [nx, ny] = drift.step(dt)
  world.setNexusPos(nx, ny)
  mixClock += dt
  if (mixClock > 0.15) {
    mixClock = 0
    field.setNexus(nx, ny)
    updateCaption()
  }
  world.updateSpheres((i) => field.level(i), now / 1000)

  const dom = field.dominant()
  world.setPlayhead(dom, dom >= 0 ? field.progress(dom) : null)

  focusVec.set(nx, world.heightAt(nx, ny) + 2, ny)
  if (drift.autoActive) world.cinematicUpdate(dt, focusVec, drift.arrived, now / 1000)
  else world.controls.update()

  world.render(now / 1000)
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)

$("#loading").classList.add("done")

// debug/installation handle
window.__exp = { data, world, field, drift }
