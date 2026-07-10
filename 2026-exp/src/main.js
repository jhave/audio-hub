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
$("#morph").addEventListener("input", (e) => {
  morphPos = parseFloat(e.target.value)
  applyMorph()
  terrainDirty = true
  clearTimeout(terrainTimer)
  terrainTimer = setTimeout(() => {
    if (terrainDirty) { world.rebuildTerrain(); terrainDirty = false }
  }, 250)
})

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
let last = performance.now()
let mixClock = 0
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000)
  last = now
  const [nx, ny] = drift.step(dt)
  world.setNexusPos(nx, ny)
  mixClock += dt
  if (mixClock > 0.15) {
    mixClock = 0
    field.setNexus(nx, ny)
    updateCaption()
  }
  world.updateSpheres((i) => field.level(i), now / 1000)
  world.render(now / 1000)
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)

$("#loading").classList.add("done")

// debug/installation handle
window.__exp = { data, world, field, drift }
