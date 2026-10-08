import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { CSS2DObject, CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { ComponentId } from '../data/content'

export type HotspotSelect = (id: ComponentId | null) => void

export type InstrumentId =
  | 'chw-supply'
  | 'chw-return'
  | 'cw-supply'
  | 'cw-return'
  | 'gly-supply'
  | 'gly-return'

type LoopKind = 'chw' | 'cw' | 'gly'

type PlantTag = 'CHWS' | 'CHWR' | 'CWS' | 'CWR' | 'GLS' | 'GLR' | 'TOWER · WATER' | 'GLYCOL DRY'

/** Live loop readings the plant sim actually publishes. */
export interface SceneReadings {
  chwsF: number
  chwrF: number
  cwsF: number
  cwrF: number
  glyS: number
  glyR: number
  chwValvePct: number
  cwValvePct: number
  glycolValvePct: number
  towerFanPct: number
  dryFanPct: number
}

export function isLowPowerClient(): boolean {
  if (typeof window === 'undefined') return true
  const coarse = window.matchMedia('(max-width: 900px), (pointer: coarse)').matches
  const saveData = Boolean((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData)
  const cores = navigator.hardwareConcurrency ?? 4
  return coarse || saveData || cores <= 4
}

export function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas')
    return Boolean(c.getContext('webgl2') || c.getContext('webgl'))
  } catch {
    return false
  }
}

interface Hotspot {
  id: ComponentId
  mesh: THREE.Object3D
}

export class ChillerScene {
  readonly renderer: THREE.WebGLRenderer
  readonly scene = new THREE.Scene()
  readonly camera: THREE.PerspectiveCamera
  readonly controls: OrbitControls
  readonly root = new THREE.Group()
  private hotspots: Hotspot[] = []
  private raycaster = new THREE.Raycaster()
  private pointer = new THREE.Vector2()
  private particles: THREE.Points | null = null
  private particleVel: Float32Array | null = null
  private clock = new THREE.Clock()
  private onSelect: HotspotSelect
  private animId = 0
  private disposed = false
  private rotor: THREE.Group | null = null
  private highlightRing!: THREE.Mesh
  private lowPower: boolean
  private needsRender = true
  private interacting = false
  private model: THREE.Object3D | null = null
  private labelRenderer: CSS2DRenderer
  private labelValues = new Map<PlantTag, HTMLElement>()
  private readings: SceneReadings | null = null
  private instruments: { id: InstrumentId; mesh: THREE.Object3D; wheel: THREE.Object3D; kind: LoopKind }[] = []
  private fans: { mesh: THREE.Object3D; sink: 'dry' | 'tower' }[] = []
  private drySpin = 2
  private towerSpin = 2
  onInstrument: ((id: InstrumentId) => void) | null = null
  readonly ready: Promise<void>

  constructor(canvas: HTMLCanvasElement, onSelect: HotspotSelect, lowPower = isLowPowerClient()) {
    this.onSelect = onSelect
    this.lowPower = lowPower
    const w = Math.max(canvas.clientWidth || 320, 1)
    const h = Math.max(canvas.clientHeight || 280, 1)

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: !lowPower,
      alpha: true,
      powerPreference: lowPower ? 'low-power' : 'high-performance',
      failIfMajorPerformanceCaveat: false,
    })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lowPower ? 2 : 1.5))
    this.renderer.setSize(w, h, false)
    this.labelRenderer = new CSS2DRenderer()
    const labels = this.labelRenderer.domElement
    labels.className = 'plant-labels'
    labels.style.position = 'absolute'
    labels.style.left = '0'
    labels.style.top = '0'
    labels.style.pointerEvents = 'none'
    labels.style.zIndex = '1'
    labels.setAttribute('aria-hidden', 'true')
    canvas.parentElement?.appendChild(labels)
    this.labelRenderer.setSize(w, h)
    void document.fonts.load("600 13px 'IBM Plex Mono'").catch(() => undefined)
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.0
    this.renderer.shadowMap.enabled = !lowPower

    this.camera = new THREE.PerspectiveCamera(42, w / h, 0.1, 80)
    this.camera.position.set(0.4, 5.2, 13)

    this.controls = new OrbitControls(this.camera, canvas)
    this.controls.enableDamping = !lowPower
    this.controls.dampingFactor = 0.08
    this.controls.minDistance = 4
    this.controls.maxDistance = 28
    this.controls.target.set(0, 1.1, 0)
    this.controls.maxPolarAngle = Math.PI * 0.48
    this.controls.addEventListener('change', () => {
      this.needsRender = true
    })
    canvas.addEventListener('pointerdown', () => {
      this.interacting = true
      this.needsRender = true
    })
    canvas.addEventListener('pointerup', () => {
      this.interacting = false
    })

    this.scene.fog = new THREE.FogExp2(0x071018, lowPower ? 0.045 : 0.035)
    this.scene.add(this.root)
    this.buildEnvironment()
    this.ready = this.loadModel()
    if (!lowPower) this.buildParticles()
    this.buildHighlight()

    canvas.addEventListener('pointerdown', this.onPointer)
    window.addEventListener('resize', this.onResize, { passive: true })
    document.addEventListener('visibilitychange', this.onVisibility)
    this.tick()
    requestAnimationFrame(() => this.onResize())
  }

  private segs(hi: number, lo: number) {
    return this.lowPower ? lo : hi
  }

  private steel(color: number, metalness = 0.65, roughness = 0.4) {
    return new THREE.MeshStandardMaterial({ color, metalness, roughness })
  }

  private addHotspot(id: ComponentId, mesh: THREE.Object3D) {
    mesh.userData.componentId = id
    mesh.traverse((c) => {
      c.userData.componentId = id
      if ((c as THREE.Mesh).isMesh) {
        c.castShadow = !this.lowPower
        c.receiveShadow = !this.lowPower
      }
    })
    this.hotspots.push({ id, mesh })
    this.root.add(mesh)
  }

  private shell(length: number, radius: number, color: number) {
    const g = new THREE.Group()
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius, length, this.segs(32, 16)),
      this.steel(color, 0.7, 0.32),
    )
    body.rotation.z = Math.PI / 2
    g.add(body)
    const capMat = this.steel(0x2a3544, 0.55, 0.45)
    for (const x of [-length / 2, length / 2]) {
      const cap = new THREE.Mesh(
        new THREE.SphereGeometry(radius, this.segs(20, 10), this.segs(12, 8), 0, Math.PI),
        capMat,
      )
      cap.rotation.z = x < 0 ? Math.PI / 2 : -Math.PI / 2
      cap.position.x = x
      g.add(cap)
    }
    return g
  }

  private buildEnvironment() {
    this.scene.add(new THREE.HemisphereLight(0x9eb6d4, 0x0a1018, 0.9))
    const key = new THREE.DirectionalLight(0xdde7f5, this.lowPower ? 0.95 : 1.1)
    key.position.set(6, 10, 4)
    if (!this.lowPower) {
      key.castShadow = true
      key.shadow.mapSize.set(1024, 1024)
      key.shadow.camera.near = 1
      key.shadow.camera.far = 30
      key.shadow.camera.left = -10
      key.shadow.camera.right = 10
      key.shadow.camera.top = 10
      key.shadow.camera.bottom = -10
    }
    this.scene.add(key)
    this.scene.add(new THREE.DirectionalLight(0x3ecfcf, 0.35).translateX(-5).translateY(3).translateZ(-4))

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(this.lowPower ? 10 : 14, this.segs(48, 24)),
      this.steel(0x121c28, 0.45, 0.55),
    )
    floor.rotation.x = -Math.PI / 2
    floor.receiveShadow = !this.lowPower
    this.scene.add(floor)

    if (!this.lowPower) {
      const grid = new THREE.GridHelper(18, 28, 0x24384c, 0x152433)
      grid.position.y = 0.01
      this.scene.add(grid)
    }

    const wallMat = this.steel(0x1a2736, 0.15, 0.9)
    const back = new THREE.Mesh(new THREE.BoxGeometry(16, 4.5, 0.15), wallMat)
    back.position.set(0, 2.25, -5.8)
    this.scene.add(back)

    const chw = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.14, 12, this.segs(16, 8)),
      this.steel(0x2a9d8f, 0.65, 0.35),
    )
    chw.rotation.z = Math.PI / 2
    chw.position.set(0, 3.1, -5.4)
    this.scene.add(chw)

    if (!this.lowPower) {
      const ghostMat = new THREE.MeshStandardMaterial({
        color: 0x3ecfcf,
        transparent: true,
        opacity: 0.1,
        metalness: 0.2,
        roughness: 0.7,
      })
      const ghost = new THREE.Mesh(new THREE.BoxGeometry(5.5, 1.6, 2.2), ghostMat)
      ghost.position.set(0, 1.1, -3.8)
      this.scene.add(ghost)
    }

    const stripe = new THREE.Mesh(
      new THREE.PlaneGeometry(14, 0.28),
      new THREE.MeshBasicMaterial({ color: 0xf0a202 }),
    )
    stripe.rotation.x = -Math.PI / 2
    stripe.position.set(0, 0.02, 3.2)
    this.scene.add(stripe)
  }

  private loadModel() {
    const loader = new GLTFLoader()
    return new Promise<void>((resolve) => {
      loader.load(
        `${import.meta.env.BASE_URL}models/ymc2.glb`,
        (gltf) => {
          this.mountModel(gltf.scene)
          resolve()
        },
        undefined,
        () => {
          this.buildChiller()
          resolve()
        },
      )
    })
  }

  /**
   * Fit the Meshy package. POSITION accessor on this GLB is about
   * 0.85 × 1.22 × 1.90, so the shells run on Z and Y is already up.
   * Yaw +90° maps that measured long axis onto X for the side camera.
   */
  private mountModel(model: THREE.Object3D) {
    this.model = model
    model.traverse((c) => {
      const mesh = c as THREE.Mesh
      if (mesh.isMesh) {
        mesh.castShadow = false
        mesh.receiveShadow = !this.lowPower
      }
    })
    model.rotation.y = Math.PI / 2
    model.updateMatrixWorld(true)
    let box = new THREE.Box3().setFromObject(model)
    let size = box.getSize(new THREE.Vector3())
    const scale = 6.4 / Math.max(size.x, size.y, size.z, 0.001)
    model.scale.setScalar(scale)
    model.updateMatrixWorld(true)
    box = new THREE.Box3().setFromObject(model)
    const center = box.getCenter(new THREE.Vector3())
    model.position.set(-center.x, -box.min.y, -center.z)
    this.root.add(model)
    model.updateMatrixWorld(true)
    const fitted = new THREE.Box3().setFromObject(model)
    const mid = fitted.getCenter(new THREE.Vector3())
    this.controls.target.set(mid.x, mid.y, mid.z)
    // Generated PBR is darker than the old flat metals. Lift it so the package reads on the plant-room floor.
    this.renderer.toneMappingExposure = 1.45
    this.placeProxyHotspots(fitted)
    this.buildFieldPiping(fitted)
    this.framePlant()
    this.needsRender = true
  }

  /** Fit the camera to the chiller plus both heat sinks. One placement, from the measured bounds. */
  private framePlant() {
    const box = new THREE.Box3().setFromObject(this.root)
    if (box.isEmpty()) return
    const size = box.getSize(new THREE.Vector3())
    const center = box.getCenter(new THREE.Vector3())
    const vFov = (this.camera.fov * Math.PI) / 180
    const aspect = Math.max(this.camera.aspect, 0.35)
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect)
    const pad = 1.22
    const distH = (size.x * 0.5 * pad) / Math.tan(hFov / 2)
    const distV = (size.y * 0.5 * pad) / Math.tan(vFov / 2)
    const dist = Math.max(distH, distV, 8)
    this.controls.target.set(center.x, Math.max(center.y * 0.7, 1.05), center.z)
    // Camera sits on +Z (the hall side) and looks back at the plant. Screen-right is then world +X.
    this.camera.position.set(center.x, this.controls.target.y + dist * 0.38, center.z + dist)
    this.camera.far = Math.max(80, dist * 6)
    this.camera.updateProjectionMatrix()
    this.controls.maxDistance = dist * 2.5
    this.controls.update()
  }

  setValve(kind: LoopKind, pct: number) {
    const turns = (pct / 100) * Math.PI * 3
    for (const item of this.instruments) {
      if (item.kind === kind) item.wheel.rotation.y = turns
    }
    this.needsRender = true
  }

  /** Fan rpm follows the sim. 100% is a full spin; 0% is stopped. */
  setFans(dryPct: number, towerPct: number) {
    this.drySpin = Math.max(0, dryPct) / 100 * 9
    this.towerSpin = Math.max(0, towerPct) / 100 * 7
    this.needsRender = true
  }

  /** Refresh label text from the latest sim snapshot. Nodes stay put; only textContent changes. */
  setReadings(readings: SceneReadings) {
    this.readings = readings
    for (const [tag, el] of this.labelValues) {
      const next = readingText(tag, readings)
      if (el.textContent !== next) el.textContent = next
    }
    this.needsRender = true
  }

  /**
   * Three loops leave the nozzle face (world +X after the measured yaw):
   * teal water to the hall, gold water to the tower, violet glycol to the dry cooler.
   */
  private buildFieldPiping(box: THREE.Box3) {
    const group = new THREE.Group()
    const size = box.getSize(new THREE.Vector3())
    const face = box.max.x - 0.08
    const yBase = box.min.y + size.y * 0.36
    const zMid = (box.min.z + box.max.z) / 2
    const front = box.max.z + 1.05
    const towerX = box.max.x + 3.15
    const towerZ = zMid - 0.1
    const coolX = box.min.x - 2.55
    const coolZ = front - 0.15

    const chw: { id: InstrumentId; color: number; y: number; z: number; rack: number; tag: PlantTag }[] = [
      { id: 'chw-return', color: 0x146e78, y: yBase, z: zMid + size.z * 0.18, rack: 0, tag: 'CHWR' },
      { id: 'chw-supply', color: 0x2ec4c4, y: yBase + 0.26, z: zMid + size.z * 0.04, rack: 1, tag: 'CHWS' },
    ]
    for (const line of chw) {
      const rackY = 0.9 + line.rack * 0.24
      const out = face + 0.85
      this.layLine(group, [
        new THREE.Vector3(face - 0.2, line.y, line.z),
        new THREE.Vector3(out, line.y, line.z),
        new THREE.Vector3(out, rackY, line.z),
        new THREE.Vector3(out, rackY, front),
        new THREE.Vector3(box.min.x + 0.5, rackY, front),
      ], line, 'chw')
    }

    const cw: { id: InstrumentId; color: number; y: number; z: number; rack: number; tag: PlantTag }[] = [
      { id: 'cw-supply', color: 0xd4a017, y: yBase + 0.04, z: zMid - size.z * 0.14, rack: 0, tag: 'CWS' },
      { id: 'cw-return', color: 0x8a5a12, y: yBase + 0.3, z: zMid - size.z * 0.28, rack: 1, tag: 'CWR' },
    ]
    for (const line of cw) {
      const rackY = 1.2 + line.rack * 0.26
      const out = face + 0.55
      this.layLine(group, [
        new THREE.Vector3(face - 0.15, line.y, line.z),
        new THREE.Vector3(out, line.y, line.z),
        new THREE.Vector3(out, rackY, line.z),
        new THREE.Vector3(towerX - 0.95, rackY, line.z),
        new THREE.Vector3(towerX - 0.95, rackY, towerZ),
        new THREE.Vector3(towerX - 0.7, 1.25, towerZ),
      ], line, 'cw')
    }
    this.buildTower(group, towerX, towerZ)

    const gly: { id: InstrumentId; color: number; y: number; z: number; rack: number; tag: PlantTag }[] = [
      { id: 'gly-supply', color: 0x7c5cff, y: yBase + 0.48, z: zMid + size.z * 0.32, rack: 0, tag: 'GLS' },
      { id: 'gly-return', color: 0xb9a6ff, y: yBase + 0.7, z: zMid + size.z * 0.4, rack: 1, tag: 'GLR' },
    ]
    for (const line of gly) {
      const rackY = 1.82 + line.rack * 0.24
      const out = face + 1.25
      this.layLine(group, [
        new THREE.Vector3(face - 0.1, line.y, line.z),
        new THREE.Vector3(out, line.y, line.z),
        new THREE.Vector3(out, rackY, line.z),
        new THREE.Vector3(out, rackY, front + 0.45),
        new THREE.Vector3(coolX + 1.05, rackY, front + 0.45),
        new THREE.Vector3(coolX + 1.05, 1.15, coolZ),
      ], line, 'gly')
    }
    this.buildDryCooler(group, coolX, coolZ)
    this.root.add(group)
  }

  private layLine(
    group: THREE.Group,
    points: THREE.Vector3[],
    line: { id: InstrumentId; color: number; tag: PlantTag },
    kind: LoopKind,
  ) {
    this.runPipe(group, points, kind === 'gly' ? 0.068 : 0.082, this.steel(line.color, 0.62, 0.32))
    this.addFlange(group, points[0], 'x')
    this.addValve(group, points[1].clone().lerp(points[2], 0.55), line.id, kind, line.tag)
    const run = points.length - 2
    this.addGauge(group, points[run - 1].clone().lerp(points[run], 0.34), 'p')
    this.addGauge(group, points[run - 1].clone().lerp(points[run], 0.7), 't')
  }

  private buildTower(group: THREE.Group, x: number, z: number) {
    const g = new THREE.Group()
    g.position.set(x, 0, z)
    const basin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.36, 1.7), this.steel(0x163246, 0.3, 0.55))
    basin.position.y = 0.2
    g.add(basin)
    const fill = new THREE.Mesh(new THREE.BoxGeometry(1.42, 1.25, 1.42), this.steel(0x2c5166, 0.22, 0.72))
    fill.position.y = 0.98
    g.add(fill)
    const deck = new THREE.Mesh(
      new THREE.CylinderGeometry(0.7, 0.76, 0.16, this.segs(20, 10)),
      this.steel(0xc5ccd1, 0.7, 0.3),
    )
    deck.position.y = 1.7
    g.add(deck)
    const fan = this.fanDisc(0.5)
    fan.position.y = 1.84
    g.add(fan)
    this.fans.push({ mesh: fan, sink: 'tower' })
    const label = this.tagLabel('TOWER · WATER', '#ffb020')
    label.position.y = 2.28
    g.add(label)
    group.add(g)
  }

  private buildDryCooler(group: THREE.Group, x: number, z: number) {
    const g = new THREE.Group()
    g.position.set(x, 0, z)
    const frame = new THREE.Mesh(new THREE.BoxGeometry(2.35, 1.05, 0.82), this.steel(0x2a2438, 0.4, 0.5))
    frame.position.y = 0.62
    g.add(frame)
    const fins = new THREE.Mesh(
      new THREE.BoxGeometry(2.1, 0.78, 0.06),
      new THREE.MeshStandardMaterial({
        color: 0x1a1030,
        metalness: 0.28,
        roughness: 0.72,
        emissive: 0x3a2070,
        emissiveIntensity: 0.2,
      }),
    )
    fins.position.set(0, 0.64, 0.4)
    g.add(fins)
    for (const fx of [-0.55, 0.55]) {
      const fan = this.fanDisc(0.32)
      fan.position.set(fx, 1.22, 0)
      g.add(fan)
      this.fans.push({ mesh: fan, sink: 'dry' })
    }
    const label = this.tagLabel('GLYCOL DRY', '#c4b5fd')
    label.position.y = 1.72
    g.add(label)
    group.add(g)
  }

  /** Fan disc lies in XZ and spins on Y. Local +Y is up, so the visible face is the top. */
  private fanDisc(radius: number) {
    const fan = new THREE.Group()
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(radius, 0.028, this.segs(6, 4), this.segs(16, 10)),
      this.steel(0xd7dee6, 0.65, 0.3),
    )
    ring.rotation.x = Math.PI / 2
    fan.add(ring)
    for (let i = 0; i < 4; i++) {
      const theta = (i * Math.PI) / 2
      const blade = new THREE.Mesh(
        new THREE.BoxGeometry(radius * 0.85, 0.02, radius * 0.22),
        this.steel(0xe7eef4, 0.55, 0.35),
      )
      blade.position.set(Math.cos(theta) * radius * 0.42, 0, Math.sin(theta) * radius * 0.42)
      blade.rotation.y = theta
      fan.add(blade)
    }
    return fan
  }

  private runPipe(group: THREE.Group, points: THREE.Vector3[], radius: number, mat: THREE.Material) {
    const up = new THREE.Vector3(0, 1, 0)
    const dir = new THREE.Vector3()
    for (let i = 0; i < points.length - 1; i++) {
      dir.subVectors(points[i + 1], points[i])
      const len = dir.length()
      if (len < 0.02) continue
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, len, this.segs(14, 8)), mat)
      mesh.position.copy(points[i]).add(points[i + 1]).multiplyScalar(0.5)
      mesh.quaternion.setFromUnitVectors(up, dir.normalize())
      group.add(mesh)
      const joint = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.15, this.segs(12, 8), this.segs(8, 6)), mat)
      joint.position.copy(points[i + 1])
      group.add(joint)
    }
  }

  private addFlange(group: THREE.Group, pos: THREE.Vector3, axis: 'x' | 'z') {
    const flange = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.16, 0.05, this.segs(16, 8)),
      this.steel(0xc5ccd1, 0.78, 0.28),
    )
    flange.position.copy(pos)
    flange.rotation[axis === 'x' ? 'z' : 'x'] = Math.PI / 2
    group.add(flange)
  }

  private addValve(group: THREE.Group, pos: THREE.Vector3, id: InstrumentId, kind: LoopKind, tag: PlantTag) {
    const valve = new THREE.Group()
    valve.position.copy(pos)
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.14, 0.26, this.segs(14, 8)),
      this.steel(0x1c2430, 0.72, 0.34),
    )
    body.rotation.z = Math.PI / 2
    valve.add(body)
    const wheel = new THREE.Mesh(
      new THREE.TorusGeometry(0.16, 0.022, this.segs(8, 6), this.segs(18, 10)),
      this.steel(0xd7dee6, 0.85, 0.22),
    )
    wheel.position.y = 0.2
    valve.add(wheel)
    for (const rot of [0, Math.PI / 2]) {
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.015, 0.015), this.steel(0xd7dee6, 0.8, 0.25))
      spoke.position.y = 0.2
      spoke.rotation.y = rot
      wheel.add(spoke)
    }
    const label = this.tagLabel(tag, kind === 'chw' ? '#2ec4c4' : kind === 'cw' ? '#ffb020' : '#c4b5fd')
    label.position.y = 0.46
    valve.add(label)
    valve.userData.instrument = id
    valve.traverse((c) => {
      c.userData.instrument = id
    })
    group.add(valve)
    this.instruments.push({ id, mesh: valve, wheel, kind })
  }

  private addGauge(group: THREE.Group, pos: THREE.Vector3, kind: 'p' | 't') {
    const gauge = new THREE.Group()
    gauge.position.copy(pos)
    const stem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.018, 0.018, 0.16, 6),
      this.steel(0x9aa4ad, 0.6, 0.3),
    )
    stem.position.y = 0.1
    gauge.add(stem)
    const dial = new THREE.Mesh(
      new THREE.CylinderGeometry(0.085, 0.085, 0.035, this.segs(16, 8)),
      new THREE.MeshStandardMaterial({
        color: kind === 'p' ? 0xf4f7fb : 0xf0a202,
        metalness: 0.25,
        roughness: 0.4,
        emissive: kind === 't' ? 0x7c4a03 : 0x000000,
        emissiveIntensity: kind === 't' ? 0.25 : 0,
      }),
    )
    dial.rotation.x = Math.PI / 2
    dial.position.y = 0.2
    gauge.add(dial)
    group.add(gauge)
  }

  private tagLabel(text: PlantTag, color: string) {
    const root = document.createElement('div')
    root.className = 'plant-tag'
    root.style.borderColor = color
    const name = document.createElement('span')
    name.className = 'plant-tag-name'
    name.textContent = text
    const value = document.createElement('span')
    value.className = 'plant-tag-value'
    if (this.readings) value.textContent = readingText(text, this.readings)
    root.append(name, value)
    this.labelValues.set(text, value)
    return new CSS2DObject(root)
  }

  private placeProxyHotspots(box: THREE.Box3) {
    const min = box.min
    const size = box.getSize(new THREE.Vector3())
    const region = (id: ComponentId, nx: number, ny: number, nz: number, nw: number, nh: number, nd: number) => {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(Math.max(size.x * nw, 0.2), Math.max(size.y * nh, 0.2), Math.max(size.z * nd, 0.2)),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
      )
      mesh.position.set(
        min.x + size.x * (nx + nw / 2),
        min.y + size.y * (ny + nh / 2),
        min.z + size.z * (nz + nd / 2),
      )
      this.addHotspot(id, mesh)
    }
    // Fractions of the fitted package. Front is +Z (camera side).
    region('vsd', 0.0, 0.05, 0.15, 0.16, 0.85, 0.7)
    region('waterboxes', 0.14, 0.12, 0.08, 0.1, 0.55, 0.84)
    region('evaporator', 0.22, 0.08, 0.48, 0.56, 0.42, 0.46)
    region('condenser', 0.22, 0.08, 0.06, 0.56, 0.42, 0.42)
    region('compressor', 0.28, 0.55, 0.22, 0.4, 0.4, 0.56)
    region('mbc', 0.46, 0.62, 0.18, 0.16, 0.28, 0.3)
    region('optiview', 0.82, 0.42, 0.35, 0.16, 0.48, 0.4)
    region('power', 0.82, 0.05, 0.2, 0.16, 0.4, 0.45)
  }

  private buildChiller() {
    const skid = new THREE.Mesh(new THREE.BoxGeometry(7.0, 0.16, 3.0), this.steel(0x1b2734, 0.5, 0.5))
    skid.position.set(0, 0.1, 0)
    this.root.add(skid)

    const evap = this.shell(5.2, 0.68, 0x3a8f9a)
    evap.position.set(0, 1.0, 0.8)
    this.addHotspot('evaporator', evap)

    const cond = this.shell(5.2, 0.68, 0xb8860b)
    cond.position.set(0, 1.0, -0.8)
    this.addHotspot('condenser', cond)

    const wbGroup = new THREE.Group()
    const wbMat = this.steel(0x3d6ea8, 0.5, 0.45)
    for (const z of [0.8, -0.8]) {
      for (const x of [-2.85, 2.85]) {
        const box = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.0, 0.95), wbMat)
        box.position.set(x, 1.0, z)
        wbGroup.add(box)
      }
    }
    this.addHotspot('waterboxes', wbGroup)

    const comp = new THREE.Group()
    const housing = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.56, 1.45, this.segs(28, 14)),
      this.steel(0x6ec6e0, 0.8, 0.25),
    )
    housing.rotation.z = Math.PI / 2
    comp.add(housing)
    const volute = new THREE.Mesh(
      new THREE.SphereGeometry(0.62, this.segs(24, 12), this.segs(16, 10)),
      this.steel(0x8ad7ef, 0.75, 0.28),
    )
    volute.scale.set(1.05, 0.85, 1)
    volute.position.set(0.9, 0, 0)
    comp.add(volute)

    this.rotor = new THREE.Group()
    const hub = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.1, 0.9, this.segs(16, 8)),
      this.steel(0xe8f6ff, 0.85, 0.2),
    )
    hub.rotation.z = Math.PI / 2
    this.rotor.add(hub)
    const bladeCount = this.lowPower ? 3 : 5
    for (let i = 0; i < bladeCount; i++) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.3, 0.1), this.steel(0xd4f0ff, 0.85, 0.25))
      blade.position.set(0.5, 0, 0)
      const pivot = new THREE.Group()
      pivot.rotation.x = (i / bladeCount) * Math.PI * 2
      pivot.add(blade)
      this.rotor.add(pivot)
    }
    comp.add(this.rotor)

    for (const x of [-0.4, 0.4]) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.38, 0.03, this.segs(10, 6), this.segs(24, 12)),
        new THREE.MeshStandardMaterial({
          color: 0xfb7185,
          emissive: 0xfb7185,
          emissiveIntensity: 0.45,
          metalness: 0.35,
          roughness: 0.35,
        }),
      )
      ring.rotation.y = Math.PI / 2
      ring.position.set(x, 0, 0)
      comp.add(ring)
    }
    comp.position.set(-0.15, 2.4, 0)
    this.addHotspot('compressor', comp)

    const vsd = new THREE.Group()
    vsd.add(new THREE.Mesh(new THREE.BoxGeometry(1.05, 1.7, 0.62), this.steel(0x2d2450, 0.4, 0.5)))
    const led = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.1, 0.03),
      new THREE.MeshStandardMaterial({ color: 0xa78bfa, emissive: 0xa78bfa, emissiveIntensity: 0.55 }),
    )
    led.position.set(0, 0.55, 0.34)
    vsd.add(led)
    vsd.position.set(-2.55, 1.05, 0)
    this.addHotspot('vsd', vsd)

    const panel = new THREE.Group()
    panel.add(new THREE.Mesh(new THREE.BoxGeometry(0.78, 1.05, 0.32), this.steel(0x1f3d32, 0.35, 0.55)))
    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(0.55, 0.36),
      new THREE.MeshStandardMaterial({
        color: 0x34d399,
        emissive: 0x0f766e,
        emissiveIntensity: 0.7,
        metalness: 0.15,
        roughness: 0.45,
      }),
    )
    screen.position.set(0, 0.15, 0.17)
    panel.add(screen)
    panel.position.set(2.45, 1.45, 0)
    this.addHotspot('optiview', panel)

    const mbc = new THREE.Group()
    mbc.add(new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.75, 0.35), this.steel(0x4a2030, 0.4, 0.5)))
    const face = new THREE.Mesh(
      new THREE.PlaneGeometry(0.42, 0.28),
      new THREE.MeshStandardMaterial({ color: 0xfb7185, emissive: 0x9f1239, emissiveIntensity: 0.5 }),
    )
    face.position.set(0, 0.08, 0.185)
    mbc.add(face)
    mbc.position.set(1.9, 2.2, -0.9)
    this.addHotspot('mbc', mbc)

    const power = new THREE.Group()
    power.add(new THREE.Mesh(new THREE.BoxGeometry(0.62, 1.25, 0.4), this.steel(0x3f3a18, 0.4, 0.5)))
    const bolt = new THREE.Mesh(
      new THREE.PlaneGeometry(0.18, 0.3),
      new THREE.MeshStandardMaterial({ color: 0xfbbf24, emissive: 0xb45309, emissiveIntensity: 0.55 }),
    )
    bolt.position.set(0, 0.2, 0.21)
    power.add(bolt)
    power.position.set(2.45, 0.95, -1.05)
    this.addHotspot('power', power)
  }

  private buildParticles() {
    const count = 90
    const positions = new Float32Array(count * 3)
    this.particleVel = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      const t = i / count
      positions[i * 3] = Math.cos(t * Math.PI * 2) * 1.5
      positions[i * 3 + 1] = 1.5 + Math.sin(t * Math.PI * 4) * 0.3
      positions[i * 3 + 2] = Math.sin(t * Math.PI * 2) * 0.9
      this.particleVel[i] = 0.4 + Math.random() * 0.5
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    this.particles = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        color: 0x3ecfcf,
        size: 0.06,
        transparent: true,
        opacity: 0.75,
        depthWrite: false,
      }),
    )
    this.root.add(this.particles)
  }

  private buildHighlight() {
    this.highlightRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.9, 0.03, 8, this.segs(32, 16)),
      new THREE.MeshBasicMaterial({ color: 0x3ecfcf, transparent: true, opacity: 0.8 }),
    )
    this.highlightRing.rotation.x = Math.PI / 2
    this.highlightRing.visible = false
    this.root.add(this.highlightRing)
  }

  select(id: ComponentId | null) {
    const hs = this.hotspots.find((h) => h.id === id)
    if (!hs) {
      this.highlightRing.visible = false
      this.needsRender = true
      return
    }
    const box = new THREE.Box3().setFromObject(hs.mesh)
    const center = box.getCenter(new THREE.Vector3())
    const size = box.getSize(new THREE.Vector3())
    this.highlightRing.visible = true
    this.highlightRing.position.copy(center)
    this.highlightRing.position.y = box.min.y + 0.05
    this.highlightRing.scale.setScalar(Math.max(Math.max(size.x, size.z) * 0.55, 0.55))
    this.needsRender = true
  }

  focus(id: ComponentId) {
    const hs = this.hotspots.find((h) => h.id === id)
    if (!hs) return
    const center = new THREE.Box3().setFromObject(hs.mesh).getCenter(new THREE.Vector3())
    this.controls.target.copy(center)
    this.select(id)
    this.needsRender = true
  }

  private onPointer = (e: PointerEvent) => {
    const rect = this.renderer.domElement.getBoundingClientRect()
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
    this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
    this.raycaster.setFromCamera(this.pointer, this.camera)
    const valves: THREE.Object3D[] = []
    for (const item of this.instruments) item.mesh.traverse((c) => valves.push(c))
    const valveHit = this.raycaster.intersectObjects(valves, false)[0]
    const instrument = valveHit?.object.userData.instrument as InstrumentId | undefined
    if (instrument) {
      this.onInstrument?.(instrument)
      return
    }
    const meshes: THREE.Object3D[] = []
    for (const h of this.hotspots) h.mesh.traverse((c) => meshes.push(c))
    const hits = this.raycaster.intersectObjects(meshes, false)
    if (hits.length) {
      const id = hits[0].object.userData.componentId as ComponentId | undefined
      if (id) {
        this.select(id)
        this.focus(id)
        this.onSelect(id)
      }
    }
  }

  private onResize = () => {
    if (this.disposed) return
    const canvas = this.renderer.domElement
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    if (!w || !h) return
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(w, h, false)
    this.labelRenderer.setSize(w, h)
    this.needsRender = true
  }

  private onVisibility = () => {
    if (document.hidden) {
      this.labelRenderer.domElement.style.visibility = 'hidden'
      return
    }
    this.labelRenderer.domElement.style.visibility = ''
    this.needsRender = true
  }

  /** Labels track the canvas. Hidden with the tab, a display:none canvas, or an unmounted view. */
  private labelsInView() {
    const canvas = this.renderer.domElement
    if (document.hidden || !canvas.isConnected) return false
    return canvas.style.display !== 'none'
  }

  private tick = () => {
    if (this.disposed) return
    this.animId = requestAnimationFrame(this.tick)
    if (document.hidden) {
      this.labelRenderer.domElement.style.visibility = 'hidden'
      return
    }

    const t = this.clock.getElapsedTime()
    const animate = !this.lowPower || this.interacting || this.highlightRing.visible
    const fansMoving = this.drySpin > 0.15 || this.towerSpin > 0.15
    if (animate || fansMoving) {
      this.controls.update()
      if (this.rotor) this.rotor.rotation.x = t * (this.lowPower ? 3.5 : 6)
      for (const fan of this.fans) {
        fan.mesh.rotation.y = t * (fan.sink === 'dry' ? this.drySpin : this.towerSpin)
      }
      if (this.highlightRing.visible) {
        this.highlightRing.rotation.z = t * 1.1
        ;(this.highlightRing.material as THREE.MeshBasicMaterial).opacity =
          0.55 + Math.sin(t * 3) * 0.2
      }
      if (this.particles && this.particleVel) {
        const pos = this.particles.geometry.getAttribute('position') as THREE.BufferAttribute
        for (let i = 0; i < pos.count; i++) {
          const a = Math.atan2(pos.getZ(i), pos.getX(i)) + 0.01 * this.particleVel[i]
          const r = 1.3 + 0.3 * Math.sin(a * 2 + t)
          const y = 1.4 + 0.45 * Math.sin(a * 2) + 0.1 * Math.sin(t * 2 + i)
          pos.setXYZ(i, Math.cos(a) * r, y, Math.sin(a) * r * 0.85)
        }
        pos.needsUpdate = true
      }
      this.needsRender = true
    } else if (this.controls.enableDamping) {
      this.controls.update()
    }

    if (this.needsRender) {
      this.renderer.render(this.scene, this.camera)
      if (this.labelsInView()) {
        this.labelRenderer.domElement.style.visibility = ''
        this.labelRenderer.render(this.scene, this.camera)
      } else {
        this.labelRenderer.domElement.style.visibility = 'hidden'
      }
      if (this.lowPower && !this.interacting) this.needsRender = false
    }
  }

  dispose() {
    this.disposed = true
    cancelAnimationFrame(this.animId)
    window.removeEventListener('resize', this.onResize)
    document.removeEventListener('visibilitychange', this.onVisibility)
    this.renderer.domElement.removeEventListener('pointerdown', this.onPointer)
    this.labelRenderer.domElement.remove()
    this.labelValues.clear()
    this.controls.dispose()
    this.scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh
      if (mesh.isMesh) {
        mesh.geometry?.dispose()
        const mat = mesh.material
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose())
        else mat?.dispose?.()
      }
    })
    this.renderer.dispose()
  }
}

function readingText(tag: PlantTag, readings: SceneReadings): string {
  switch (tag) {
    case 'CHWS':
      return `${readings.chwsF}°F · ${readings.chwValvePct}%`
    case 'CHWR':
      return `${readings.chwrF}°F · ${readings.chwValvePct}%`
    case 'CWS':
      return `${readings.cwsF}°F · ${readings.cwValvePct}%`
    case 'CWR':
      return `${readings.cwrF}°F · ${readings.cwValvePct}%`
    case 'GLS':
      return `${readings.glyS}°F · ${readings.glycolValvePct}%`
    case 'GLR':
      return `${readings.glyR}°F · ${readings.glycolValvePct}%`
    case 'TOWER · WATER':
      return `fans ${readings.towerFanPct}%`
    case 'GLYCOL DRY':
      return `fans ${readings.dryFanPct}%`
    default: {
      const unknown: never = tag
      return unknown
    }
  }
}
