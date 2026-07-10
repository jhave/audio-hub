// The visible land: terrain raised by the kernel density of track positions
// (style-clusters literally become hills), tracks as pulsing spheres, a
// glowing nexus, and an isometric orthographic camera.
import * as THREE from "three"
import { MapControls } from "three/examples/jsm/controls/MapControls.js"

export const WORLD = 60 // half-extent of the land in world units
const GRID = 150 // terrain segments per side
const HMAX = 7.5 // peak hill height

export class World {
  constructor(canvas, data) {
    this.data = data
    this.n = data.tracks.length
    this.positions = new Float32Array(this.n * 2) // layout-space [-1,1] -> world
    this.heights = new Float32Array(this.n)

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(0x05070a)
    this.scene.fog = new THREE.Fog(0x05070a, WORLD * 1.6, WORLD * 4.2)

    const aspect = innerWidth / innerHeight
    const d = WORLD * 0.85
    this.camera = new THREE.OrthographicCamera(-d * aspect, d * aspect, d, -d, -400, 800)
    this.camera.position.set(WORLD, WORLD * 0.95, WORLD)
    this.camera.lookAt(0, 0, 0)

    this.controls = new MapControls(this.camera, canvas)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.08
    this.controls.minZoom = 0.5
    this.controls.maxZoom = 7
    this.controls.maxPolarAngle = Math.PI * 0.46

    this.scene.add(new THREE.AmbientLight(0x8899bb, 0.55))
    const sun = new THREE.DirectionalLight(0xffe9c4, 1.15)
    sun.position.set(-40, 70, 30)
    this.scene.add(sun)
    this.sun = sun

    /* terrain */
    this.terrainGeo = new THREE.PlaneGeometry(WORLD * 2, WORLD * 2, GRID, GRID)
    this.terrainGeo.rotateX(-Math.PI / 2)
    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.92, metalness: 0.05, flatShading: false,
    })
    this.terrain = new THREE.Mesh(this.terrainGeo, mat)
    this.scene.add(this.terrain)
    const colorAttr = new THREE.BufferAttribute(
      new Float32Array(this.terrainGeo.attributes.position.count * 3), 3)
    this.terrainGeo.setAttribute("color", colorAttr)

    /* track spheres */
    const sphereGeo = new THREE.SphereGeometry(0.55, 14, 12)
    const sphereMat = new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.15 })
    this.spheres = new THREE.InstancedMesh(sphereGeo, sphereMat, this.n)
    this.spheres.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.scene.add(this.spheres)
    this.baseColors = []
    const c = new THREE.Color()
    for (let i = 0; i < this.n; i++) {
      const t = data.tracks[i]
      const a = data.albums[t.album]
      const sat = t.fav ? 0.85 : 0.55
      const lum = t.fav ? 0.68 : 0.5
      c.setHSL(a.hue, sat, lum)
      this.spheres.setColorAt(i, c)
      this.baseColors.push(c.clone())
    }
    this.spheres.instanceColor.needsUpdate = true

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
    this.scene.add(this.nexus)

    this.raycaster = new THREE.Raycaster()
    this._dummy = new THREE.Object3D()
    this._resize()
    addEventListener("resize", () => this._resize())
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

  /** Set current 2D layout positions (array of [x,y] in [-1,1]). */
  setLayout(pts) {
    for (let i = 0; i < this.n; i++) {
      this.positions[i * 2] = pts[i][0] * WORLD * 0.92
      this.positions[i * 2 + 1] = pts[i][1] * WORLD * 0.92
    }
    this.rebuildTerrain()
  }

  /** Blend two layouts (for hyperparameter morphs); k in [0,1]. */
  blendLayout(a, b, k) {
    const e = k * k * (3 - 2 * k) // smoothstep
    for (let i = 0; i < this.n; i++) {
      // slight per-index stagger so the flock doesn't move as one rigid sheet
      const kk = Math.min(1, Math.max(0, e * 1.25 - (i % 97) / 97 * 0.25))
      this.positions[i * 2] = (a[i][0] + (b[i][0] - a[i][0]) * kk) * WORLD * 0.92
      this.positions[i * 2 + 1] = (a[i][1] + (b[i][1] - a[i][1]) * kk) * WORLD * 0.92
    }
  }

  /** Density-field heightmap: every track is a gaussian splat of land. */
  rebuildTerrain() {
    const pos = this.terrainGeo.attributes.position
    const col = this.terrainGeo.attributes.color
    const g = GRID + 1
    const field = new Float32Array(g * g)
    const sigma = WORLD * 0.055
    const inv2s2 = 1 / (2 * sigma * sigma)
    const cell = (WORLD * 2) / GRID
    const rad = Math.ceil((sigma * 3) / cell)
    for (let i = 0; i < this.n; i++) {
      const x = this.positions[i * 2], z = this.positions[i * 2 + 1]
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
    const deep = new THREE.Color(0x0a1420)   // valley — night water
    const mid = new THREE.Color(0x1d3a33)    // lowland moss
    const high = new THREE.Color(0x8a7a55)   // ridge earth
    const peak = new THREE.Color(0xe8e0cc)   // lit summit
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
    // cache for height lookups
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

  /** Per-frame: place spheres on the terrain, pulse the audible ones. */
  updateSpheres(levelFn, time) {
    const d = this._dummy
    for (let i = 0; i < this.n; i++) {
      const x = this.positions[i * 2], z = this.positions[i * 2 + 1]
      const level = levelFn(i)
      const fav = this.data.tracks[i].fav
      const base = fav ? 0.8 : 0.55
      const bob = level > 0.01 ? Math.sin(time * 7 + i) * level * 0.6 : 0
      const s = base * (1 + level * 1.6)
      d.position.set(x, this.heightAt(x, z) + 0.5 + base + bob + level * 2.2, z)
      d.scale.setScalar(s)
      d.updateMatrix()
      this.spheres.setMatrixAt(i, d.matrix)
    }
    this.spheres.instanceMatrix.needsUpdate = true
  }

  setNexusPos(x, z) {
    this.nexus.position.set(x, this.heightAt(x, z) + 0.6, z)
  }

  /** Raycast a pointer event; returns { trackIdx } or { ground: [x, z] } or null. */
  pick(ev) {
    const ndc = new THREE.Vector2(
      (ev.clientX / innerWidth) * 2 - 1,
      -(ev.clientY / innerHeight) * 2 + 1
    )
    this.raycaster.setFromCamera(ndc, this.camera)
    const hitS = this.raycaster.intersectObject(this.spheres)
    if (hitS.length) return { trackIdx: hitS[0].instanceId }
    const hitT = this.raycaster.intersectObject(this.terrain)
    if (hitT.length) return { ground: [hitT[0].point.x, hitT[0].point.z] }
    return null
  }

  render(time) {
    const breathe = 1 + Math.sin(time * 1.8) * 0.12
    this.nexusRing.scale.setScalar(breathe)
    this.controls.update()
    this.renderer.render(this.scene, this.camera)
  }
}
