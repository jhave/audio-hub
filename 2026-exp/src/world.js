// The visible land: terrain raised by the kernel density of track positions
// (style-clusters literally become hills), tracks as a point cloud of glowing stars, a
// glowing nexus, and an isometric orthographic camera.
import * as THREE from "three"
import { MapControls } from "three/examples/jsm/controls/MapControls.js"

export const WORLD = 60 // half-extent of the land in world units
const GRID = 150 // terrain segments per side
const HMAX = 7.5 // peak hill height

function createCircleTexture() {
  const canvas = document.createElement("canvas")
  canvas.width = 16
  canvas.height = 16
  const ctx = canvas.getContext("2d")
  const grad = ctx.createRadialGradient(8, 8, 0, 8, 8, 8)
  grad.addColorStop(0, "rgba(255, 255, 255, 1)")
  grad.addColorStop(0.35, "rgba(255, 255, 255, 0.8)")
  grad.addColorStop(1, "rgba(255, 255, 255, 0)")
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, 16, 16)
  return new THREE.CanvasTexture(canvas)
}

export class World {
  constructor(canvas, data) {
    this.data = data
    this.n = data.tracks.length
    this.positions = new Float32Array(this.n * 2) // layout-space [-1,1] -> world
    
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(0x05070a)
    this.scene.fog = new THREE.Fog(0x05070a, WORLD * 1.6, WORLD * 4.2)

    const aspect = innerWidth / innerHeight
    const d = WORLD * 0.85
    this.camera = new THREE.OrthographicCamera(-d * aspect, d * aspect, d, -d, -400, 800)
    this.camera.position.set(WORLD, WORLD * 0.95, WORLD)
    this.camera.zoom = 2.8
    this.camera.lookAt(0, 0, 0)

    this.controls = new MapControls(this.camera, canvas)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.08
    this.controls.minZoom = 1.0
    this.controls.maxZoom = 12.0
    this.controls.maxPolarAngle = Math.PI * 0.46

    this.scene.add(new THREE.AmbientLight(0x8899bb, 0.55))
    const sun = new THREE.DirectionalLight(0xffe9c4, 1.15)
    sun.position.set(-40, 70, 30)
    this.scene.add(sun)
    this.sun = sun

    this.light = new THREE.PointLight(0xffe9c4, 7.0, 35.0)
    this.light.decay = 2
    this.scene.add(this.light)

    /* terrain */
    this.terrainGeo = new THREE.PlaneGeometry(WORLD * 2, WORLD * 2, GRID, GRID)
    this.terrainGeo.rotateX(-Math.PI / 2)
    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.92, metalness: 0.05, flatShading: false,
      visible: true, // Terrain mesh is visible to show landscape!
    })
    this.terrain = new THREE.Mesh(this.terrainGeo, mat)
    this.scene.add(this.terrain)
    const colorAttr = new THREE.BufferAttribute(
      new Float32Array(this.terrainGeo.attributes.position.count * 3), 3)
    this.terrainGeo.setAttribute("color", colorAttr)

    /* track points: glowing point cloud instead of spheres */
    const pointsGeo = new THREE.BufferGeometry()
    const posArray = new Float32Array(this.n * 3)
    const colorArray = new Float32Array(this.n * 3)
    
    this.baseColors = []
    const c = new THREE.Color()
    for (let i = 0; i < this.n; i++) {
      const t = data.tracks[i]
      const a = data.albums[t.album]
      const sat = t.fav ? 0.85 : 0.55
      const lum = t.fav ? 0.68 : 0.5
      c.setHSL(a.hue, sat, lum)
      this.baseColors.push(c.clone())
      
      colorArray[i * 3] = c.r
      colorArray[i * 3 + 1] = c.g
      colorArray[i * 3 + 2] = c.b
    }
    
    pointsGeo.setAttribute("position", new THREE.BufferAttribute(posArray, 3))
    pointsGeo.setAttribute("color", new THREE.BufferAttribute(colorArray, 3))
    
    const pointsMat = new THREE.PointsMaterial({
      size: 3.5,
      vertexColors: true,
      map: createCircleTexture(),
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true
    })
    
    this.points = new THREE.Points(pointsGeo, pointsMat)
    this.scene.add(this.points)

    /* nexus marker: a slow-breathing ring + pillar of light */
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(2.2, 0.12, 10, 48),
      new THREE.MeshBasicMaterial({ color: 0xe8c877, transparent: true, opacity: 0.9 })
    )
    ring.rotation.x = Math.PI / 2
    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.5, 26, 8, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xe8c877, transparent: true, opacity: 0.14, depthWrite: false })
    )
    pillar.position.y = 13
    this.nexus = new THREE.Group()
    this.nexus.add(ring, pillar)
    this.nexusRing = ring
    this.nexus.visible = false // Hide pointer group and light beam
    this.scene.add(this.nexus)

    this.labelsContainer = document.getElementById("labels-container")
    this.labelElements = []
    this.trackLimit = 1
    this.currentDominantIdx = -1

    /* region ring: contours the hills */
    const ringPoints = new Float32Array(64 * 3)
    const ringGeo = new THREE.BufferGeometry()
    ringGeo.setAttribute("position", new THREE.BufferAttribute(ringPoints, 3))
    const ringMat = new THREE.LineBasicMaterial({
      color: 0xe8c877, transparent: true, opacity: 0.35
    })
    this.regionRing = new THREE.LineLoop(ringGeo, ringMat)
    this.scene.add(this.regionRing)

    /* orbital playhead: a ring around the focal sphere, a dot as the needle */
    this.progressRing = new THREE.Mesh(
      new THREE.TorusGeometry(1, 0.03, 8, 64),
      new THREE.MeshBasicMaterial({ color: 0xe8c877, transparent: true, opacity: 0.55, depthWrite: false })
    )
    this.progressRing.rotation.x = Math.PI / 2
    this.progressDot = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xffe9b0 })
    )
    this.progressRing.visible = this.progressDot.visible = false
    this.scene.add(this.progressRing, this.progressDot)

    this.raycaster = new THREE.Raycaster()
    this.raycaster.params.Points.threshold = 1.2
    this.lastCamInput = -1e9
    this.controls.addEventListener("start", () => (this.lastCamInput = performance.now()))
    this._resize()
    addEventListener("resize", () => this._resize())
  }

  cinematicUpdate(dt, focus, arrived, time) {
    if (performance.now() - this.lastCamInput < 25_000) {
      this.controls.update()
      return
    }
    const center = new THREE.Vector3(0, 0, 0)
    this.controls.target.lerp(center, 1 - Math.exp(-dt * 0.7))
    const off = this.camera.position.clone().sub(this.controls.target)
    const sph = new THREE.Spherical().setFromVector3(off)
    sph.theta += dt * 0.035
    sph.phi = Math.min(1.35, Math.max(0.55, 0.95 + Math.sin(time * 0.06) * 0.09))
    sph.radius = WORLD * 1.6
    off.setFromSpherical(sph)
    this.camera.position.copy(this.controls.target).add(off)
    this.camera.lookAt(this.controls.target)
    const zTarget = arrived
      ? 5.0 + Math.sin(time * 0.08) * 2.5
      : 2.8
    this.camera.zoom += (zTarget - this.camera.zoom) * (1 - Math.exp(-dt * 0.35))
    this.camera.updateProjectionMatrix()
  }

  setPlayhead(trackIdx, frac) {
    this.progressRing.visible = this.progressDot.visible = false
  }

  setTrackLimit(N) {
    this.trackLimit = N
  }

  _resize() {
    const aspect = innerWidth / innerHeight
    const d = WORLD * 0.85
    this.camera.left = -d * aspect
    this.camera.right = d * aspect
    this.camera.top = d
    this.camera.bottom = -d
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(innerWidth, innerHeight)
  }

  setLayout(pts) {
    for (let i = 0; i < this.n; i++) {
      this.positions[i * 2] = pts[i][0] * WORLD * 0.92
      this.positions[i * 2 + 1] = pts[i][1] * WORLD * 0.92
    }
    this.rebuildTerrain()
  }

  blendLayout(aRaw, bRaw, aRel, bRel, k, spread) {
    const e = k * k * (3 - 2 * k)
    for (let i = 0; i < this.n; i++) {
      const kk = Math.min(1, Math.max(0, e * 1.25 - (i % 97) / 97 * 0.25))
      const rx = aRaw[i][0] + (bRaw[i][0] - aRaw[i][0]) * kk
      const ry = aRaw[i][1] + (bRaw[i][1] - aRaw[i][1]) * kk
      const sx = aRel[i][0] + (bRel[i][0] - aRel[i][0]) * kk
      const sy = aRel[i][1] + (bRel[i][1] - aRel[i][1]) * kk
      this.positions[i * 2] = (rx + (sx - rx) * spread) * WORLD * 0.92
      this.positions[i * 2 + 1] = (ry + (sy - ry) * spread) * WORLD * 0.92
    }
  }

  rebuildTerrain() {
    const pos = this.terrainGeo.attributes.position
    const col = this.terrainGeo.attributes.color
    const g = GRID + 1
    const field = new Float32Array(g * g)
    const sigma = WORLD * 0.055
    const inv2s2 = 1 / (2 * sigma * sigma)
    const cell = (WORLD * 2) / GRID
    const rad = Math.ceil((sigma * 3) / cell)
    const N = this.trackLimit || this.n
    for (let i = 0; i < N; i++) {
      const x = this.positions[i * 2], z = this.positions[i * 2 + 1]
      if (x > 9000) continue // Skip inactive or deleted tracks
      
      const cx = Math.round((x + WORLD) / cell), cz = Math.round((z + WORLD) / cell)
      for (let dz = -rad; dz <= rad; dz++) {
        const iz = cz + dz
        if (iz < 0 || iz >= g) continue
        for (let dx = -rad; dx <= rad; dx++) {
          const ix = cx + dx
          if (ix < 0 || ix >= g) continue
          const wx = ix * cell - WORLD - x
          const wz = iz * cell - WORLD - z
          field[iz * g + ix] += Math.exp(-(wx * wx + wz * wz) * inv2s2)
        }
      }
    }
    let max = 0
    for (let i = 0; i < field.length; i++) max = Math.max(max, field[i])
    const c = new THREE.Color()
    const deep = new THREE.Color(0x0a1420)
    const mid = new THREE.Color(0x1d3a33)
    const high = new THREE.Color(0x8a7a55)
    const peak = new THREE.Color(0xe8e0cc)
    for (let vi = 0, iz = 0; iz < g; iz++) {
      for (let ix = 0; ix < g; ix++, vi++) {
        const hRaw = max > 0 ? field[iz * g + ix] / max : 0
        const h = Math.pow(hRaw, 0.62) * HMAX
        pos.setY(vi, h)
        const k = h / HMAX
        if (k < 0.25) c.copy(deep).lerp(mid, k / 0.25)
        else if (k < 0.65) c.copy(mid).lerp(high, (k - 0.25) / 0.4)
        else c.copy(high).lerp(peak, (k - 0.65) / 0.35)
        col.setXYZ(vi, c.r, c.g, c.b)
      }
    }
    pos.needsUpdate = true
    col.needsUpdate = true
    this.terrainGeo.computeVertexNormals()
    this._field = field
    this._fieldMax = max
  }

  heightAt(x, z) {
    if (!this._field) return 0
    const g = GRID + 1
    const cell = (WORLD * 2) / GRID
    const ix = Math.min(g - 1, Math.max(0, Math.round((x + WORLD) / cell)))
    const iz = Math.min(g - 1, Math.max(0, Math.round((z + WORLD) / cell)))
    const hRaw = this._fieldMax > 0 ? this._field[iz * g + ix] / this._fieldMax : 0
    return Math.pow(hRaw, 0.62) * HMAX
  }

  updateSpheres(levelFn, time, falloff) {
    const N = this.trackLimit || 1
    const posAttr = this.points.geometry.attributes.position
    const colAttr = this.points.geometry.attributes.color
    
    const nx = this.nexus.position.x
    const nz = this.nexus.position.z
    const c = new THREE.Color()

    for (let i = 0; i < this.n; i++) {
      const x = this.positions[i * 2]
      const z = this.positions[i * 2 + 1]
      const y = this.heightAt(x, z)
      
      posAttr.setXYZ(i, x, y + 0.25, z)

      if (i < N) {
        const level = levelFn(i)
        const dx = x - nx
        const dz = z - nz
        const dist = Math.sqrt(dx * dx + dz * dz)
        
        const baseColor = this.baseColors[i]

        let scaleFactor = 1.0
        if (dist > falloff) {
          const k = Math.min(1.0, (dist - falloff) / (falloff * 2.0))
          scaleFactor = 1.0 - k * 0.85
        }

        const isDominant = (i === this.currentDominantIdx)
        if (isDominant) {
          c.setRGB(1.0, 0.95, 0.6)
        } else if (dist < falloff) {
          c.copy(baseColor).multiplyScalar(1.0 + level * 1.5)
        } else {
          c.copy(baseColor).multiplyScalar(0.15 * scaleFactor)
        }
        colAttr.setXYZ(i, c.r, c.g, c.b)
      } else {
        colAttr.setXYZ(i, 0, 0, 0)
      }
    }
    posAttr.needsUpdate = true
    colAttr.needsUpdate = true
  }

  updateRegionRing(nx, nz, R, isBlinking, time) {
    const posAttr = this.regionRing.geometry.attributes.position
    const array = posAttr.array
    for (let i = 0; i < 64; i++) {
      const theta = (i / 64) * Math.PI * 2
      const px = nx + Math.cos(theta) * R
      const pz = nz + Math.sin(theta) * R
      const py = this.heightAt(px, pz) + 0.15
      array[i * 3] = px
      array[i * 3 + 1] = py
      array[i * 3 + 2] = pz
    }
    posAttr.needsUpdate = true
  }

  setNexusPos(x, z) {
    this.nexus.position.set(x, this.heightAt(x, z) + 0.6, z)
    if (this.light) {
      this.light.position.set(x, this.heightAt(x, z) + 2.5, z)
    }
  }

  pick(ev) {
    const ndc = new THREE.Vector2(
      (ev.clientX / innerWidth) * 2 - 1,
      -(ev.clientY / innerHeight) * 2 + 1
    )
    this.raycaster.setFromCamera(ndc, this.camera)
    const hitS = this.raycaster.intersectObject(this.points)
    if (hitS.length) return { trackIdx: hitS[0].index }
    const hitT = this.raycaster.intersectObject(this.terrain)
    if (hitT.length) return { ground: [hitT[0].point.x, hitT[0].point.z] }
    return null
  }

  render(time) {
    const breathe = 1 + Math.sin(time * 1.8) * 0.12
    this.nexusRing.scale.setScalar(breathe)
    this.renderer.render(this.scene, this.camera)
  }
}
