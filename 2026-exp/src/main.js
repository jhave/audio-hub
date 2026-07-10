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
field.maxVoices = Math.min(6, trackLimitCount) // Sync initial voices count (prevents 2 tracks playing)

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

  const toFade = ["#hud-active-songs", "#load-file-btn", "#stats-overlay"]
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

/* Geometric quadrant coordinates layout: overrides all layout keys, filters out deleted tracks */
function applyGeometricLayout(N) {
  const R = 8.0 // baseline spacing radius
  const pts = []
  
  const activeTracks = []
  for (let i = 0; i < data.tracks.length; i++) {
    if (!data.tracks[i].deleted) {
      activeTracks.push(i)
    }
  }
  
  const limit = Math.min(N, activeTracks.length)
  
  if (limit === 1) {
    pts.push([0, 0])
  } else if (limit === 2) {
    pts.push([-R * 0.7, 0])
    pts.push([R * 0.7, 0])
  } else if (limit === 3) {
    for (let i = 0; i < 3; i++) {
      const theta = -Math.PI / 2 + (i * Math.PI * 2) / 3
      pts.push([R * Math.cos(theta), R * Math.sin(theta)])
    }
  } else if (limit === 4) {
    pts.push([-R * 0.8, -R * 0.8]) // Q1
    pts.push([R * 0.8, -R * 0.8])  // Q2
    pts.push([-R * 0.8, R * 0.8])  // Q3
    pts.push([R * 0.8, R * 0.8])   // Q4
  } else {
    for (let i = 0; i < limit; i++) {
      const theta = i * 0.35
      const r = R + i * 0.15
      pts.push([r * Math.cos(theta), r * Math.sin(theta)])
    }
  }

  for (let i = 0; i < limit; i++) {
    const trackIdx = activeTracks[i]
    world.positions[trackIdx * 2] = pts[i][0]
    world.positions[trackIdx * 2 + 1] = pts[i][1]
  }

  // Push all inactive or deleted tracks extremely far away to keep them silent
  for (let i = 0; i < data.tracks.length; i++) {
    const isUnderLimit = activeTracks.indexOf(i) !== -1 && activeTracks.indexOf(i) < limit
    if (!isUnderLimit) {
      world.positions[i * 2] = 9999.0
      world.positions[i * 2 + 1] = 9999.0
    }
  }

  field.positions = world.positions
  drift.positions = world.positions
  
  world.rebuildTerrain()
}
applyGeometricLayout(trackLimitCount)

/* Unified HUD Mixer songs list renderer */
function updateActiveSongsList() {
  const container = $("#hud-active-songs")
  if (!container) return
  
  const activeTrackIndices = Array.from(field.voices.keys())
  
  if (activeTrackIndices.length === 0) {
    container.innerHTML = `<div style="font-size: 11px; color: #62757d; text-align: center; padding: 4px 0;">No active tracks in region</div>`
    return
  }
  
  const existingItems = Array.from(container.children)
  const existingMap = new Map()
  for (const el of existingItems) {
    const trackIdx = parseInt(el.dataset.trackIdx)
    existingMap.set(trackIdx, el)
  }
  
  const keepIndices = new Set(activeTrackIndices)
  for (const el of existingItems) {
    const trackIdx = parseInt(el.dataset.trackIdx)
    if (!keepIndices.has(trackIdx)) {
      container.removeChild(el)
    }
  }
  
  for (const trackIdx of activeTrackIndices) {
    const v = field.voices.get(trackIdx)
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
      volSlider.oninput = (e) => {
        t.manualVolume = parseFloat(e.target.value)
      }
      
      const deleteBtn = document.createElement("button")
      deleteBtn.className = "hud-btn delete-song-btn"
      deleteBtn.textContent = "✖"
      deleteBtn.onclick = (e) => {
        e.stopPropagation()
        t.deleted = true
        field._release(trackIdx)
        changeTrackLimit(0)
      }
      
      el.appendChild(titleSpan)
      el.appendChild(playPauseBtn)
      el.appendChild(volSlider)
      el.appendChild(deleteBtn)
      container.appendChild(el)
    } else {
      const playPauseBtn = el.querySelector(".play-pause-btn")
      if (playPauseBtn) {
        playPauseBtn.textContent = t.manualPaused ? "▶" : "‖"
      }
      const isDominant = (trackIdx === field.dominant())
      el.classList.toggle("dominant", isDominant)
    }
  }
}

/* flight speed */
function applyFlightSpeed(fs) {
  drift.flightSpeed = fs
}
applyFlightSpeed(0.0)

/* region: radius of the listening area (volume falls off smoothly, no edge) */
function applyRegion(r) {
  field.falloff = 3 + r * 14
}
applyRegion(0.20)

/* modes */
function setAuto(on) {
  drift.auto = on
}
const urlMode = new URLSearchParams(location.search).get("mode")
setAuto(urlMode === "auto")

/* track spawning chevrons */
function changeTrackLimit(delta) {
  trackLimitCount = Math.min(data.tracks.length, Math.max(0, trackLimitCount + delta))
  
  // Re-apply geometric coordinates based on the new limit count N
  applyGeometricLayout(trackLimitCount)
  
  world.setTrackLimit(trackLimitCount)
  drift.trackLimitCount = trackLimitCount
  field.maxVoices = Math.min(24, trackLimitCount)
  
  if (drift.target >= trackLimitCount) {
    drift.userSelected(trackLimitCount - 1)
  } else if (drift.auto && drift.arrived && trackLimitCount > 1) {
    // Take off immediately to explore the newly added track(s)
    drift.target = drift.chooseNext()
    drift.arrived = false
  }
}

/* Local file loader setup */
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
    
    const oldLength = data.tracks.length
    for (const file of files) {
      const url = URL.createObjectURL(file)
      const newTrack = {
        title: file.name.replace(/\.[^/.]+$/, ""),
        url: url,
        album: 0,
        dur: 180,
        fav: true
      }
      data.tracks.push(newTrack)
    }
    
    // Refresh geometric layout and automatically jump target to play the first loaded track!
    changeTrackLimit(files.length)
    drift.userSelected(oldLength)
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
  if (e.target.closest("#hud-active-songs") || e.target.closest("#load-file-btn")) return
  field.resume()
  const hit = world.pick(e)
  if (!hit) return
  if (hit.trackIdx != null) {
    drift.userSelected(hit.trackIdx)
    // Every click launches a song and increases topology total complexity number
    changeTrackLimit(1)
  } else if (hit.ground) {
    drift.userMovedTo(hit.ground[0], hit.ground[1])
  }
})
// any gesture unlocks audio (browser autoplay policy)
addEventListener("pointerdown", () => {
  if (!introActive) field.resume()
}, { once: true })

// hover: cursor feedback; mapping coordinates to flightSpeed and trackLimitCount
let hoverClock = 0
addEventListener("pointermove", (e) => {
  const now = performance.now()
  if (now - hoverClock < 50) return
  hoverClock = now
  
  if (e.target.closest("#hud-active-songs") || e.target.closest("#load-file-btn")) return
  
  const hit = world.pick(e)
  document.body.style.cursor = hit?.trackIdx != null ? "pointer" : ""
  
  if (introActive) return
  
  // Map X to Change Rate (flight speed) - INVERTED (left is 1.0/100, right is 0.0)
  const fs = Math.min(1.0, Math.max(0.0, 1.0 - e.clientX / window.innerWidth))
  if (fs < 0.03) {
    setAuto(false)
    applyFlightSpeed(0.0)
  } else {
    setAuto(true)
    applyFlightSpeed(fs)
  }
  
  // Map Y to Number of Songs (trackLimitCount) - ranges from 0 to total count
  const pctY = Math.min(1.0, Math.max(0.0, e.clientY / window.innerHeight))
  const limit = Math.round(pctY * data.tracks.length)
  
  // Dynamically map listening region falloff based on complexity Y (ranges up to 21.0)
  field.falloff = 3.0 + pctY * 18.0
  
  // Directly update parameters
  trackLimitCount = limit
  applyGeometricLayout(trackLimitCount)
  world.setTrackLimit(trackLimitCount)
  drift.trackLimitCount = trackLimitCount
  field.maxVoices = Math.min(24, trackLimitCount)
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
/* logic tick: drift + audio mix on a timer so the music keeps flowing even
   when the tab/window is hidden (rAF freezes there; setInterval survives) */
let lastTick = performance.now()
setInterval(() => {
  const now = performance.now()
  const dt = Math.min(1, (now - lastTick) / 1000)
  lastTick = now
  if (paused) return
  const [nx, ny] = drift.step(dt)
  field.setNexus(nx, ny)
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

  // Update dynamic song listings inside consolidated HUD
  updateActiveSongsList()

  // Update stats overlay values
  const elSpeed = document.getElementById("stat-speed")
  const elTracks = document.getElementById("stat-tracks")
  const elComplexity = document.getElementById("stat-complexity")
  if (elSpeed) elSpeed.textContent = Math.round(drift.flightSpeed * 100)
  if (elTracks) elTracks.textContent = field.voices.size
  if (elComplexity) elComplexity.textContent = trackLimitCount

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
