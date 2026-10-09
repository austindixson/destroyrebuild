import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { CSS2DObject, CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { ComponentId } from '../data/content'

export type HotspotSelect = (id: ComponentId | null) => void

export type BootNotice = (text: string) => void

/**
 * Idle limit for the GLB transfer. The window starts again only when the boot
 * line changes (percent, or whole MB when the length is not known).
 */
const MODEL_TIMEOUT_MS = 25_000

/** Hard stop from the start of the transfer. Idle re-arms cannot extend past this. */
const MODEL_CAP_MS = 180_000

const MB = 1_048_576

/** Desktop and phone both stay under this. A 2× buffer costs four times the pixels. */
const MAX_PIXEL_RATIO = 1.5

/**
 * Fleet meshes by CSS pixels. Each band has about 20% hysteresis.
 * Near is the 51,080 mesh. Mid is the 26,980 mesh. Tiny is the small mesh.
 * A framed 18-unit extra is about 61–74 CSS pixels, so the tiny band covers that view.
 */
const LOD_TINY_IN_PX = 80
const LOD_TINY_OUT_PX = 96
const LOD_NEAR_IN_PX = 160
const LOD_NEAR_OUT_PX = 128

/** 0 = full mesh (focused unit), 1 = near, 2 = mid, 3 = tiny. */
const LOD_FULL = 0
const LOD_NEAR = 1
const LOD_MID = 2
const LOD_TINY = 3

/** Boot line while the GLB bytes arrive. Total 0 means the length is not known. */
export function plantModelProgressText(loaded: number, total: number): string {
  if (!Number.isFinite(loaded) || loaded < 0) return 'The plant model starts.'
  if (total > 0) {
    const pct = Math.min(100, Math.max(0, Math.round((loaded / total) * 100)))
    return `The plant model file is at ${pct} percent.`
  }
  if (loaded > 0) {
    const mb = Math.floor(loaded / MB)
    return `The plant model file is at ${mb} MB.`
  }
  return 'The plant model starts.'
}

function modelTimeoutMs(): number {
  const win = window as Window & { __YORK_MODEL_TIMEOUT_MS?: number }
  const override = win.__YORK_MODEL_TIMEOUT_MS
  if (typeof override === 'number' && Number.isFinite(override) && override >= 250 && override <= 60_000) {
    return override
  }
  return MODEL_TIMEOUT_MS
}

/** Tests may shorten the cap. They cannot raise it past the 180 s product limit. */
function modelCapMs(): number {
  const win = window as Window & { __YORK_MODEL_CAP_MS?: number }
  const override = win.__YORK_MODEL_CAP_MS
  if (typeof override === 'number' && Number.isFinite(override) && override >= 250 && override <= MODEL_CAP_MS) {
    return override
  }
  return MODEL_CAP_MS
}

function mountDelayMs(): number {
  const win = window as Window & { __YORK_DELAY_MOUNT_MS?: number }
  const override = win.__YORK_DELAY_MOUNT_MS
  if (typeof override === 'number' && Number.isFinite(override) && override >= 0 && override <= 10_000) {
    return override
  }
  return 0
}

function isAbortError(err: unknown): boolean {
  if (typeof err !== 'object' || err === null || !('name' in err)) return false
  const name = String((err as { name?: unknown }).name)
  if (name === 'AbortError') return true
  if (name !== 'TypeError') return false
  const message = 'message' in err ? String((err as { message?: unknown }).message).toLowerCase() : ''
  return message.includes('abort')
}

export type InstrumentId =
  | 'chw-supply'
  | 'chw-return'
  | 'cw-supply'
  | 'cw-return'
  | 'gly-supply'
  | 'gly-return'

type LoopKind = 'chw' | 'cw' | 'gly'

type PlantTag = 'CHWS' | 'CHWR' | 'CWS' | 'CWR' | 'GLS' | 'GLR' | 'TOWER · WATER' | 'GLYCOL DRY'

/** Preferred screen-pixel nudge. fitTagsInView() then keeps each tag on the canvas. */
const TAG_OFFSET: Record<PlantTag, { x: number; y: number }> = {
  CHWS: { x: 28, y: -112 },
  CHWR: { x: 28, y: -56 },
  CWS: { x: 112, y: 4 },
  CWR: { x: 28, y: 62 },
  GLS: { x: -72, y: -24 },
  GLR: { x: -72, y: 52 },
  'TOWER · WATER': { x: -24, y: -40 },
  'GLYCOL DRY': { x: -16, y: -92 },
}

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

interface FleetLayout {
  cols: number
  gapX: number
  gapZ: number
  originX: number
  originZ: number
  baseY: number
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
  private labelAnchors = new Map<PlantTag, CSS2DObject>()
  private occlusionAt = 0
  /** Stays set until fadeOccludedLabels actually tests, not merely until it is asked. */
  private occlusionPending = false
  private labelsNeedDraw = true
  private viewW = -1
  private viewH = -1
  private viewPx = 0
  private viewPy = 0
  private viewPz = 0
  private viewTx = 0
  private viewTy = 0
  private viewTz = 0
  private readonly geos = new Map<string, THREE.BufferGeometry>()
  private readonly materialCache = new Map<string, THREE.Material>()
  private readonly pipeParts = new Map<THREE.Material, THREE.BufferGeometry[]>()
  private fleetRoot: THREE.Group | null = null
  private lodNearGeo: THREE.BufferGeometry | null = null
  private lodMidGeo: THREE.BufferGeometry | null = null
  private lodTinyGeo: THREE.BufferGeometry | null = null
  private lodNearMesh: THREE.InstancedMesh | null = null
  private lodMidMesh: THREE.InstancedMesh | null = null
  private lodTinyMesh: THREE.InstancedMesh | null = null
  private focusMesh: THREE.Mesh | null = null
  private focusMat: THREE.MeshStandardMaterial | null = null
  private readonly focusBase = new THREE.Color()
  private fleetKey = ''
  private fleetRun = ''
  private fleetCount = 0
  private fleetFocus = -1
  private fleetX = new Float32Array(0)
  private fleetY = new Float32Array(0)
  private fleetZ = new Float32Array(0)
  private fleetMats = new Float32Array(0)
  private fleetShade = new Float32Array(0)
  private lodLevel = new Uint8Array(0)
  private lodSlot = new Uint16Array(0)
  /** Longest axis of one chiller, in world units, for the screen-size LOD test. */
  private fleetSpan = 1
  private fleetOffX = 0
  private fleetOffY = 0
  private fleetOffZ = 0
  private fog!: THREE.FogExp2
  private fogBase = 0.035
  /** Horizontal span of the lead plant. Larger fleets thin the fog against this. */
  private plantSpan = 0
  private groundFit = false
  private floor!: THREE.Mesh
  private floorRadius = 14
  private grid: THREE.GridHelper | null = null
  private backWall: THREE.Mesh | null = null
  private headerPipe: THREE.Mesh | null = null
  private ghost: THREE.Mesh | null = null
  private readonly fleetMatrix = new THREE.Matrix4()
  private readonly fleetPos = new THREE.Vector3()
  private readonly fleetQuat = new THREE.Quaternion()
  private readonly fleetScale = new THREE.Vector3()
  private readonly fleetColor = new THREE.Color()
  private readonly occlusionDir = new THREE.Vector3()
  private readonly occlusionAnchor = new THREE.Vector3()
  private readings: SceneReadings | null = null
  private instruments: { id: InstrumentId; mesh: THREE.Object3D; wheel: THREE.Object3D; kind: LoopKind }[] = []
  private fans: { mesh: THREE.Object3D; sink: 'dry' | 'tower' }[] = []
  private drySpin = 2
  private towerSpin = 2
  onInstrument: ((id: InstrumentId) => void) | null = null
  /** True when the GLB and the simple model both failed. The boot line stays up. */
  bootFailed = false
  /** True when the GLB did not mount and the simple model is in the view. */
  simpleModel = false
  readonly ready: Promise<void>
  private onBoot: BootNotice | null = null
  private modelLoader: THREE.FileLoader | null = null
  private finishLoad: ((useFallback: boolean) => void) | null = null
  private bootText = ''

  constructor(
    canvas: HTMLCanvasElement,
    onSelect: HotspotSelect,
    lowPower = isLowPowerClient(),
    onBoot?: BootNotice,
  ) {
    this.onSelect = onSelect
    this.onBoot = onBoot ?? null
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
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO))
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
    void document.fonts.ready.then(() => {
      if (this.disposed) return
      this.labelsNeedDraw = true
      this.needsRender = true
    })
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.0
    this.renderer.shadowMap.enabled = !lowPower
    // r186 removed PCFSoftShadowMap. PCFShadowMap is the soft filter, at 1024 on desktop.
    this.renderer.shadowMap.type = THREE.PCFShadowMap

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

    this.fogBase = lowPower ? 0.045 : 0.035
    this.fog = new THREE.FogExp2(0x071018, this.fogBase)
    this.scene.fog = this.fog
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
    this.publishStatsHook()
  }

  /** Dev-only handle so a real-app sample can read renderer.info. No effect otherwise. */
  private publishStatsHook() {
    if (!import.meta.env.DEV) return
    if (!new URLSearchParams(window.location.search).has('plantStats')) return
    const win = window as Window & { __YORK_SCENE?: ChillerScene }
    win.__YORK_SCENE = this
  }

  private segs(hi: number, lo: number) {
    if (this.lowPower) return lo
    return Math.min(hi, Math.max(lo, 10))
  }

  private steel(color: number, metalness = 0.65, roughness = 0.4) {
    const key = `${color}:${metalness}:${roughness}`
    const cached = this.materialCache.get(key)
    if (cached) return cached
    const mat = new THREE.MeshStandardMaterial({ color, metalness, roughness })
    this.materialCache.set(key, mat)
    return mat
  }

  private geo(key: string, make: () => THREE.BufferGeometry) {
    const cached = this.geos.get(key)
    if (cached) return cached
    const created = make()
    this.geos.set(key, created)
    return created
  }

  private hiddenMat() {
    const key = 'hidden'
    const cached = this.materialCache.get(key)
    if (cached) return cached
    const mat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
    this.materialCache.set(key, mat)
    return mat
  }

  private addHotspot(id: ComponentId, mesh: THREE.Object3D, cast = true) {
    mesh.userData.componentId = id
    mesh.traverse((c) => {
      c.userData.componentId = id
      if (cast && (c as THREE.Mesh).isMesh) {
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
      key.shadow.bias = -0.0004
      key.shadow.camera.near = 1
      key.shadow.camera.far = 30
      key.shadow.camera.left = -10
      key.shadow.camera.right = 10
      key.shadow.camera.top = 10
      key.shadow.camera.bottom = -10
    }
    this.scene.add(key)
    this.scene.add(new THREE.DirectionalLight(0x3ecfcf, 0.35).translateX(-5).translateY(3).translateZ(-4))

    this.floorRadius = this.lowPower ? 10 : 14
    this.floor = new THREE.Mesh(
      new THREE.CircleGeometry(this.floorRadius, this.segs(48, 24)),
      this.steel(0x121c28, 0.45, 0.55),
    )
    this.floor.rotation.x = -Math.PI / 2
    this.floor.receiveShadow = !this.lowPower
    this.scene.add(this.floor)

    if (!this.lowPower) {
      this.grid = new THREE.GridHelper(18, 28, 0x24384c, 0x152433)
      this.grid.position.y = 0.01
      this.scene.add(this.grid)
    }

    const wallMat = this.steel(0x1a2736, 0.15, 0.9)
    this.backWall = new THREE.Mesh(new THREE.BoxGeometry(16, 4.5, 0.15), wallMat)
    this.backWall.position.set(0, 2.25, -5.8)
    this.scene.add(this.backWall)

    this.headerPipe = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.14, 12, this.segs(16, 8)),
      this.steel(0x2a9d8f, 0.65, 0.35),
    )
    this.headerPipe.rotation.z = Math.PI / 2
    this.headerPipe.position.set(0, 3.1, -5.4)
    this.scene.add(this.headerPipe)

    if (!this.lowPower) {
      const ghostMat = new THREE.MeshStandardMaterial({
        color: 0x3ecfcf,
        transparent: true,
        opacity: 0.1,
        metalness: 0.2,
        roughness: 0.7,
      })
      this.ghost = new THREE.Mesh(new THREE.BoxGeometry(5.5, 1.6, 2.2), ghostMat)
      this.ghost.position.set(0, 1.1, -3.8)
      this.scene.add(this.ghost)
    }

    const stripe = new THREE.Mesh(
      new THREE.PlaneGeometry(14, 0.28),
      new THREE.MeshBasicMaterial({ color: 0xf0a202 }),
    )
    stripe.rotation.x = -Math.PI / 2
    stripe.position.set(0, 0.02, 3.2)
    this.scene.add(stripe)
  }

  statusLine(): string {
    if (this.simpleModel) return 'The view shows the simple plant model.'
    if (this.lowPower) return 'Low-detail 3D'
    return 'Turn the model. Select a part.'
  }

  /** Returns true when the boot line text changes. Callers re-arm the idle timer only then. */
  private reportBoot(text: string): boolean {
    if (this.disposed || text === this.bootText) return false
    this.bootText = text
    this.onBoot?.(text)
    return true
  }

  /**
   * Download ymc2.glb, then mount it. Progress updates the boot line.
   * The idle window restarts only when that line changes. A 180 s cap still
   * applies from the start. The promise always resolves. Dispose skips mount.
   */
  private loadModel() {
    const url = `${import.meta.env.BASE_URL}models/ymc2.glb`
    const gltfLoader = new GLTFLoader()
    gltfLoader.setMeshoptDecoder(MeshoptDecoder)
    const fileLoader = new THREE.FileLoader(gltfLoader.manager)
    fileLoader.setResponseType('arraybuffer')
    this.modelLoader = fileLoader

    return new Promise<void>((resolve) => {
      let settled = false
      let idleTimer: ReturnType<typeof setTimeout> | undefined
      let capTimer: ReturnType<typeof setTimeout> | undefined

      const finish = (useFallback: boolean) => {
        if (settled) return
        settled = true
        window.clearTimeout(idleTimer)
        window.clearTimeout(capTimer)
        this.finishLoad = null
        if (useFallback) this.modelLoader?.abort()
        if (useFallback && !this.disposed) {
          try {
            this.buildChiller()
            this.needsRender = true
            this.simpleModel = true
          } catch (err) {
            console.error(err)
            this.bootFailed = true
            this.reportBoot('The plant model did not open. Use the buttons.')
          }
        }
        resolve()
      }
      this.finishLoad = finish

      const armIdle = () => {
        window.clearTimeout(idleTimer)
        idleTimer = window.setTimeout(() => finish(true), modelTimeoutMs())
      }
      capTimer = window.setTimeout(() => finish(true), modelCapMs())
      armIdle()

      const logLoadError = (err: unknown) => {
        if (!settled && !isAbortError(err)) console.error(err)
      }

      fileLoader.load(
        url,
        (data) => {
          if (settled || this.disposed) {
            finish(false)
            return
          }
          if (this.reportBoot('The plant model opens.')) armIdle()
          try {
            gltfLoader.parse(
              data as ArrayBuffer,
              THREE.LoaderUtils.extractUrlBase(url),
              (gltf) => {
                if (settled || this.disposed) {
                  finish(false)
                  return
                }
                this.queueMount(gltf.scene, finish, () => settled)
              },
              (err) => {
                logLoadError(err)
                finish(!this.disposed)
              },
            )
          } catch (err) {
            console.error(err)
            finish(!this.disposed)
          }
        },
        (event) => {
          if (settled || this.disposed) return
          const total = event.lengthComputable ? event.total : 0
          if (this.reportBoot(plantModelProgressText(event.loaded, total))) armIdle()
        },
        (err) => {
          logLoadError(err)
          finish(!this.disposed)
        },
      )
    })
  }

  private queueMount(
    model: THREE.Object3D,
    finish: (useFallback: boolean) => void,
    isSettled: () => boolean,
  ) {
    const run = () => {
      if (isSettled() || this.disposed) {
        finish(false)
        return
      }
      try {
        this.mountModel(model)
        finish(false)
      } catch (err) {
        console.error(err)
        finish(true)
      }
    }
    const delay = mountDelayMs()
    if (delay > 0) {
      window.setTimeout(run, delay)
      return
    }
    run()
  }

  private noteMountForTest() {
    const win = window as Window & { __YORK_DELAY_MOUNT_MS?: number; __YORK_MOUNT_COUNT?: number }
    if (!win.__YORK_DELAY_MOUNT_MS) return
    win.__YORK_MOUNT_COUNT = (win.__YORK_MOUNT_COUNT ?? 0) + 1
  }

  /** Pull the fleet packages out of the lead so only the full mesh stays visible. */
  private captureLodMeshes(model: THREE.Object3D) {
    const drop: THREE.Mesh[] = []
    model.traverse((child) => {
      const mesh = child as THREE.Mesh
      if (!mesh.isMesh) return
      this.keepLodGeo(mesh, drop)
    })
    for (const mesh of drop) mesh.removeFromParent()
  }

  private keepLodGeo(mesh: THREE.Mesh, drop: THREE.Mesh[]) {
    if (mesh.name === 'lod-near') this.lodNearGeo = mesh.geometry
    if (mesh.name === 'lod-mid') this.lodMidGeo = mesh.geometry
    if (mesh.name === 'lod-tiny') this.lodTinyGeo = mesh.geometry
    if (mesh.name === 'lod-near' || mesh.name === 'lod-mid' || mesh.name === 'lod-tiny') drop.push(mesh)
  }

  /**
   * Fit the Meshy package. POSITION accessor on this GLB is about
   * 0.85 × 1.22 × 1.90, so the shells run on Z and Y is already up.
   * Yaw +90° maps that measured long axis onto X for the side camera.
   */
  private mountModel(model: THREE.Object3D) {
    if (this.disposed) return
    this.noteMountForTest()
    this.model = model
    this.captureLodMeshes(model)
    model.traverse((c) => {
      const mesh = c as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.castShadow = false
      mesh.receiveShadow = !this.lowPower
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
    if (!this.lowPower) this.addContactShadow(fitted)
    this.framePlant()
    this.needsRender = true
  }

  /** One invisible box casts the contact shadow. The package mesh receives it. */
  private addContactShadow(box: THREE.Box3) {
    const size = box.getSize(new THREE.Vector3())
    const center = box.getCenter(new THREE.Vector3())
    const caster = new THREE.Mesh(
      new THREE.BoxGeometry(size.x * 0.9, Math.max(size.y * 0.8, 0.4), size.z * 0.9),
      this.hiddenMat(),
    )
    caster.position.copy(center)
    caster.castShadow = true
    caster.receiveShadow = false
    this.root.add(caster)
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
    this.fitAtmosphere(box)
  }

  /** Thin the fog and grow the pad once the bank is wider than the lead plant. */
  private fitAtmosphere(box: THREE.Box3) {
    const size = box.getSize(new THREE.Vector3())
    const span = Math.max(size.x, size.z)
    if (this.plantSpan === 0) this.plantSpan = span
    const basis = Math.max(this.plantSpan, 1)
    this.fog.density = this.fogBase * (basis / Math.max(span, basis))
    if (span <= basis * 1.05) {
      this.resetGround()
      return
    }
    this.fitGround(span, box.getCenter(new THREE.Vector3()), box)
  }

  private fitGround(span: number, center: THREE.Vector3, box: THREE.Box3) {
    this.groundFit = true
    const cover = Math.max(span + 8, 18)
    this.floor.scale.setScalar(cover / (this.floorRadius * 2))
    this.floor.position.set(center.x, 0, center.z)
    this.replaceGrid(cover, center)
    this.placeBackdrop(box, center, cover)
  }

  private replaceGrid(cover: number, center: THREE.Vector3) {
    if (!this.grid) return
    this.scene.remove(this.grid)
    disposeGrid(this.grid)
    const div = Math.min(64, Math.max(28, Math.round(cover / 0.9)))
    const grid = new THREE.GridHelper(cover, div, 0x24384c, 0x152433)
    grid.position.set(center.x, 0.01, center.z)
    this.scene.add(grid)
    this.grid = grid
  }

  private placeBackdrop(box: THREE.Box3, center: THREE.Vector3, cover: number) {
    const wall = this.backWall
    if (!wall) return
    const backZ = Math.min(-5.8, box.min.z - 1.4)
    wall.position.set(center.x, wall.position.y, backZ)
    wall.scale.x = Math.max(1, cover / 16)
    const pipe = this.headerPipe
    if (pipe) {
      pipe.position.set(center.x, pipe.position.y, backZ + 0.4)
      pipe.scale.y = Math.max(1, cover / 12)
    }
    if (this.ghost) this.ghost.position.set(center.x, this.ghost.position.y, backZ + 2.2)
  }

  private resetGround() {
    if (!this.groundFit) return
    this.groundFit = false
    this.floor.scale.setScalar(1)
    this.floor.position.set(0, 0, 0)
    this.replaceGrid(18, new THREE.Vector3())
    if (this.backWall) {
      this.backWall.position.set(0, this.backWall.position.y, -5.8)
      this.backWall.scale.x = 1
    }
    const pipe = this.headerPipe
    if (pipe) {
      pipe.position.set(0, pipe.position.y, -5.4)
      pipe.scale.y = 1
    }
    if (this.ghost) this.ghost.position.set(0, this.ghost.position.y, -3.8)
  }

  setValve(kind: LoopKind, pct: number) {
    const turns = (pct / 100) * Math.PI * 3
    const attr = `data-valve-${kind}`
    let seen = false
    let moved = false
    for (const item of this.instruments) {
      if (item.kind !== kind) continue
      seen = true
      if (item.wheel.rotation.y === turns) continue
      item.wheel.rotation.y = turns
      moved = true
    }
    if (!seen) return
    if (!moved && this.renderer.domElement.hasAttribute(attr)) return
    this.renderer.domElement.setAttribute(attr, turns.toFixed(4))
    if (moved) this.needsRender = true
  }

  /** Fan rpm follows the sim. 100% is a full spin; 0% is stopped. */
  setFans(dryPct: number, towerPct: number) {
    const dry = (Math.max(0, dryPct) / 100) * 9
    const tower = (Math.max(0, towerPct) / 100) * 7
    if (dry === this.drySpin && tower === this.towerSpin) return
    this.drySpin = dry
    this.towerSpin = tower
    this.poseFans(this.clock.getElapsedTime())
    this.needsRender = true
  }

  /**
   * Draw the units after the lead machine. Two units keep the single package.
   * A larger bank puts each extra unit in one instanced mesh per LOD level.
   */
  setFleet(units: { running: boolean }[]) {
    if (units.length <= 2) {
      this.clearFleet(true)
      return
    }
    if (fleetCountKey(units.length) !== this.fleetKey) {
      this.rebuildFleet(units)
      return
    }
    this.paintFleetRunning(units)
  }

  /** New bank size reframes the hall. A start or stop only recolors the instances. */
  private rebuildFleet(units: { running: boolean }[]) {
    this.clearFleet(false)
    if (!this.spawnFleet(units.slice(1))) return
    this.fleetKey = fleetCountKey(units.length)
    this.fleetRun = runBits(units.slice(1))
    this.framePlant()
    this.updateFleetLod()
    this.labelsNeedDraw = true
    this.occlusionPending = true
    this.needsRender = true
  }

  private paintFleetRunning(units: { running: boolean }[]) {
    if (this.fleetCount === 0) return
    const bits = runBits(units.slice(1))
    if (bits === this.fleetRun) return
    this.fleetRun = bits
    const extras = units.slice(1)
    for (let i = 0; i < extras.length && i < this.fleetCount; i++) this.paintUnit(i, extras[i].running)
    this.needsRender = true
  }

  private paintUnit(index: number, running: boolean) {
    const shade = running ? 1 : 0.72
    if (this.fleetShade[index] === shade) return
    this.fleetShade[index] = shade
    this.fleetColor.setRGB(shade, shade, shade)
    const mesh = this.bucketFor(this.lodLevel[index])
    if (mesh) {
      mesh.setColorAt(this.lodSlot[index], this.fleetColor)
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    }
    if (index === this.fleetFocus) this.poseFocusMesh()
  }

  private clearFleet(reframe: boolean) {
    if (!this.fleetRoot) return
    this.disposeFleetMeshes()
    this.fleetKey = ''
    this.fleetRun = ''
    if (reframe) this.framePlant()
    this.labelsNeedDraw = true
    this.occlusionPending = true
    this.needsRender = true
  }

  private disposeFleetMeshes() {
    this.fleetRoot?.removeFromParent()
    this.lodNearMesh?.dispose()
    this.lodMidMesh?.dispose()
    this.lodTinyMesh?.dispose()
    this.focusMat?.dispose()
    this.fleetRoot = null
    this.lodNearMesh = null
    this.lodMidMesh = null
    this.lodTinyMesh = null
    this.focusMesh = null
    this.focusMat = null
    this.fleetCount = 0
    this.fleetFocus = -1
  }

  /** Fleet geometries leave the scene at load, so dispose them even when no fleet was built. */
  private disposeLodGeometries() {
    this.lodNearGeo?.dispose()
    this.lodMidGeo?.dispose()
    this.lodTinyGeo?.dispose()
    this.lodNearGeo = null
    this.lodMidGeo = null
    this.lodTinyGeo = null
  }

  private spawnFleet(units: { running: boolean }[]) {
    const hero = this.heroMesh()
    const material = hero ? singleMaterial(hero) : null
    if (!hero || !material || units.length === 0) return false
    const layout = this.fleetLayout(hero, units.length)
    this.allocFleet(units.length)
    this.fleetRoot = new THREE.Group()
    this.root.add(this.fleetRoot)
    this.lodNearMesh = this.makeBucket(this.lodNearGeo ?? hero.geometry, material, units.length)
    this.lodMidMesh = this.makeBucket(this.lodMidGeo ?? hero.geometry, material, units.length)
    this.lodTinyMesh = this.makeBucket(this.lodTinyGeo ?? hero.geometry, material, units.length)
    this.focusMesh = this.makeFocusMesh(hero.geometry, material)
    this.fleetRoot.add(this.lodNearMesh, this.lodMidMesh, this.lodTinyMesh, this.focusMesh)
    for (let i = 0; i < units.length; i++) this.storeFleetUnit(i, units[i].running, layout)
    this.rememberFleetSpan(hero)
    this.lodLevel.fill(LOD_TINY)
    this.writeLodBuckets()
    return true
  }

  private fleetLayout(hero: THREE.Mesh, count: number) {
    hero.updateMatrixWorld(true)
    hero.matrixWorld.decompose(this.fleetPos, this.fleetQuat, this.fleetScale)
    const box = new THREE.Box3().setFromObject(hero)
    const size = box.getSize(new THREE.Vector3())
    const gapZ = size.z + 1.15
    return {
      cols: fleetColumns(count),
      gapX: size.x + 0.9,
      gapZ,
      originX: box.min.x,
      originZ: box.min.z - gapZ,
      baseY: this.fleetPos.y,
    }
  }

  private allocFleet(count: number) {
    this.fleetCount = count
    this.fleetFocus = -1
    this.fleetX = new Float32Array(count)
    this.fleetY = new Float32Array(count)
    this.fleetZ = new Float32Array(count)
    this.fleetMats = new Float32Array(count * 16)
    this.fleetShade = new Float32Array(count)
    this.lodLevel = new Uint8Array(count)
    this.lodSlot = new Uint16Array(count)
  }

  private storeFleetUnit(index: number, running: boolean, layout: FleetLayout) {
    const col = index % layout.cols
    const row = Math.floor(index / layout.cols)
    this.fleetPos.set(layout.originX + col * layout.gapX, layout.baseY, layout.originZ - row * layout.gapZ)
    this.fleetX[index] = this.fleetPos.x
    this.fleetY[index] = this.fleetPos.y
    this.fleetZ[index] = this.fleetPos.z
    this.fleetShade[index] = running ? 1 : 0.72
    this.fleetMatrix.compose(this.fleetPos, this.fleetQuat, this.fleetScale)
    this.fleetMatrix.toArray(this.fleetMats, index * 16)
  }

  private makeBucket(geo: THREE.BufferGeometry, material: THREE.Material, count: number) {
    const mesh = new THREE.InstancedMesh(geo, material, count)
    mesh.castShadow = false
    mesh.receiveShadow = !this.lowPower
    mesh.count = 0
    mesh.visible = false
    return mesh
  }

  private makeFocusMesh(geo: THREE.BufferGeometry, material: THREE.Material) {
    const src = material as THREE.MeshStandardMaterial
    const mat = src.clone()
    this.focusMat = mat
    this.focusBase.copy(src.color)
    const mesh = new THREE.Mesh(geo, mat)
    mesh.castShadow = false
    mesh.receiveShadow = !this.lowPower
    mesh.visible = false
    mesh.matrixAutoUpdate = false
    return mesh
  }

  private bucketFor(level: number) {
    if (level === LOD_NEAR) return this.lodNearMesh
    if (level === LOD_MID) return this.lodMidMesh
    if (level === LOD_TINY) return this.lodTinyMesh
    return null
  }

  private writeLodBuckets() {
    const near = this.lodNearMesh
    const mid = this.lodMidMesh
    const tiny = this.lodTinyMesh
    if (!near || !mid || !tiny) return
    this.fillBucket(near, LOD_NEAR, this.countLevel(LOD_NEAR))
    this.fillBucket(mid, LOD_MID, this.countLevel(LOD_MID))
    this.fillBucket(tiny, LOD_TINY, this.countLevel(LOD_TINY))
    this.poseFocusMesh()
    this.needsRender = true
  }

  private countLevel(level: number) {
    let count = 0
    for (let i = 0; i < this.fleetCount; i++) if (this.lodLevel[i] === level) count++
    return count
  }

  private fillBucket(mesh: THREE.InstancedMesh, level: number, count: number) {
    mesh.count = count
    mesh.visible = count > 0
    let slot = 0
    for (let i = 0; i < this.fleetCount; i++) {
      if (this.lodLevel[i] !== level) continue
      this.lodSlot[i] = slot
      this.writeInstance(mesh, slot, i)
      slot++
    }
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    if (count > 0) {
      mesh.computeBoundingBox()
      mesh.computeBoundingSphere()
    }
  }

  private writeInstance(mesh: THREE.InstancedMesh, slot: number, unit: number) {
    this.fleetMatrix.fromArray(this.fleetMats, unit * 16)
    mesh.setMatrixAt(slot, this.fleetMatrix)
    const shade = this.fleetShade[unit]
    this.fleetColor.setRGB(shade, shade, shade)
    mesh.setColorAt(slot, this.fleetColor)
  }

  private poseFocusMesh() {
    const mesh = this.focusMesh
    if (!mesh) return
    if (this.fleetFocus < 0) {
      mesh.visible = false
      return
    }
    mesh.visible = true
    mesh.matrix.fromArray(this.fleetMats, this.fleetFocus * 16)
    mesh.matrixWorldNeedsUpdate = true
    const shade = this.fleetShade[this.fleetFocus]
    this.focusMat?.color.copy(this.focusBase).multiplyScalar(shade)
  }

  /** World size of one banked unit, measured from the lead mesh. */
  private rememberFleetSpan(hero: THREE.Mesh) {
    const geo = hero.geometry
    if (!geo.boundingBox) geo.computeBoundingBox()
    const box = geo.boundingBox
    if (!box) return
    const center = box.getCenter(new THREE.Vector3()).multiply(this.fleetScale).applyQuaternion(this.fleetQuat)
    this.fleetOffX = center.x
    this.fleetOffY = center.y
    this.fleetOffZ = center.z
    const size = box.getSize(new THREE.Vector3()).multiply(this.fleetScale)
    this.fleetSpan = Math.max(size.x, size.y, size.z, 0.001)
  }

  private unitPixels(index: number) {
    const dx = this.camera.position.x - (this.fleetX[index] + this.fleetOffX)
    const dy = this.camera.position.y - (this.fleetY[index] + this.fleetOffY)
    const dz = this.camera.position.z - (this.fleetZ[index] + this.fleetOffZ)
    const dist = Math.hypot(dx, dy, dz)
    const height = this.renderer.domElement.clientHeight || 1
    const half = Math.tan((this.camera.fov * Math.PI) / 360)
    return (this.fleetSpan * height) / (2 * Math.max(dist, 0.05) * half)
  }

  private updateFleetLod() {
    if (this.fleetCount === 0) return
    let changed = false
    for (let i = 0; i < this.fleetCount; i++) {
      const next = this.lodFor(i, this.unitPixels(i))
      if (next === this.lodLevel[i]) continue
      this.lodLevel[i] = next
      changed = true
    }
    if (changed) this.writeLodBuckets()
  }

  private lodFor(index: number, pixels: number) {
    if (index === this.fleetFocus) return LOD_FULL
    const level = this.lodLevel[index]
    if (level === LOD_NEAR && pixels >= LOD_NEAR_OUT_PX) return LOD_NEAR
    if (level === LOD_TINY && pixels <= LOD_TINY_OUT_PX) return LOD_TINY
    if (pixels >= LOD_NEAR_IN_PX) return LOD_NEAR
    if (pixels <= LOD_TINY_IN_PX) return LOD_TINY
    return LOD_MID
  }

  private focusFleetUnit(index: number) {
    if (index === this.fleetFocus) return
    this.fleetFocus = index
    this.updateFleetLod()
  }

  private pickFleetUnit() {
    const list: THREE.Object3D[] = []
    if (this.lodNearMesh?.visible) list.push(this.lodNearMesh)
    if (this.lodMidMesh?.visible) list.push(this.lodMidMesh)
    if (this.lodTinyMesh?.visible) list.push(this.lodTinyMesh)
    if (this.focusMesh?.visible) list.push(this.focusMesh)
    if (list.length === 0) return
    const hit = this.raycaster.intersectObjects(list, false)[0]
    if (!hit || hit.object === this.focusMesh) return
    if (hit.instanceId === undefined) return
    const unit = this.unitForSlot(hit.object as THREE.InstancedMesh, hit.instanceId)
    if (unit >= 0) this.focusFleetUnit(unit)
  }

  private unitForSlot(mesh: THREE.InstancedMesh, slot: number) {
    const level = this.levelForBucket(mesh)
    for (let i = 0; i < this.fleetCount; i++) {
      if (this.lodLevel[i] === level && this.lodSlot[i] === slot) return i
    }
    return -1
  }

  private levelForBucket(mesh: THREE.InstancedMesh) {
    if (mesh === this.lodNearMesh) return LOD_NEAR
    if (mesh === this.lodMidMesh) return LOD_MID
    return LOD_TINY
  }

  private heroMesh(): THREE.Mesh | null {
    const model = this.model
    if (!model) return null
    let found: THREE.Mesh | null = null
    model.traverse((child) => {
      const mesh = child as THREE.Mesh
      if (!found && mesh.isMesh) found = mesh
    })
    return found
  }

  /** Refresh label text from the latest sim snapshot. Nodes stay put; only textContent changes. */
  setReadings(readings: SceneReadings) {
    this.readings = readings
    let changed = false
    for (const [tag, el] of this.labelValues) {
      const next = readingText(tag, readings)
      if (el.textContent === next) continue
      el.textContent = next
      changed = true
    }
    if (changed) this.labelsNeedDraw = true
  }

  /**
   * Bore centers of the drive-end water-box nozzles, in ymc2.glb local space.
   * The package is one mesh. These were measured from the flange faces: local +Z
   * is the nozzle axis, and after mountModel()'s +90° yaw that axis is world +X.
   * Evaporator nozzles are the local -X pair (CHW). Condenser nozzles are the local +X pair (CW).
   */
  private readonly nozzleLocal: Record<'chws' | 'chwr' | 'cws' | 'cwr', THREE.Vector3> = {
    chws: new THREE.Vector3(-0.2382, -0.165, 0.903),
    chwr: new THREE.Vector3(-0.238, -0.3625, 0.895),
    cwr: new THREE.Vector3(0.0049, -0.224, 0.945),
    cws: new THREE.Vector3(0.1634, -0.3529, 0.937),
  }

  /**
   * Three loops. CHW and CW leave the water-box nozzles. The GLB has no glycol
   * nozzles, so GLS/GLR leave a floor-mounted header beside the opposite end.
   */
  private buildFieldPiping(box: THREE.Box3) {
    const group = new THREE.Group()
    const zMid = (box.min.z + box.max.z) / 2
    const front = box.max.z + 1.05
    const towerX = box.max.x + 3.15
    const towerZ = zMid - 0.1
    const coolX = box.min.x - 2.55
    const coolZ = front - 0.15
    const outward = new THREE.Vector3(0, 0, 1).transformDirection(this.model!.matrixWorld).normalize()

    const chw: { key: 'chws' | 'chwr'; id: InstrumentId; color: number; rackY: number; tag: PlantTag }[] = [
      { key: 'chwr', id: 'chw-return', color: 0x146e78, rackY: 0.42, tag: 'CHWR' },
      { key: 'chws', id: 'chw-supply', color: 0x2ec4c4, rackY: 1.14, tag: 'CHWS' },
    ]
    for (const line of chw) {
      const seat = this.seatNozzle(this.nozzleLocal[line.key])
      const out = seat.face.clone().addScaledVector(outward, 0.78)
      const rack = out.clone()
      rack.y = line.rackY
      this.layLine(group, [
        seat.into,
        seat.face.clone().addScaledVector(outward, 0.24),
        out,
        rack,
        new THREE.Vector3(out.x, line.rackY, front),
        new THREE.Vector3(box.min.x + 0.5, line.rackY, front),
      ], line, 'chw', seat.face, 'x')
    }

    const cw: { key: 'cws' | 'cwr'; id: InstrumentId; color: number; rackY: number; tag: PlantTag }[] = [
      { key: 'cws', id: 'cw-supply', color: 0xd4a017, rackY: 1.2, tag: 'CWS' },
      { key: 'cwr', id: 'cw-return', color: 0x8a5a12, rackY: 1.46, tag: 'CWR' },
    ]
    for (const line of cw) {
      const seat = this.seatNozzle(this.nozzleLocal[line.key])
      const out = seat.face.clone().addScaledVector(outward, 0.62)
      const rack = out.clone()
      rack.y = line.rackY
      this.layLine(group, [
        seat.into,
        seat.face.clone().addScaledVector(outward, 0.22),
        out,
        rack,
        new THREE.Vector3(towerX - 0.95, line.rackY, out.z),
        new THREE.Vector3(towerX - 0.95, line.rackY, towerZ),
        new THREE.Vector3(towerX - 0.7, 1.25, towerZ),
      ], line, 'cw', seat.face, 'x')
    }
    this.buildTower(group, towerX, towerZ)

    const header = new THREE.Vector3(box.min.x - 0.95, 0, box.max.z + 0.2)
    const faces = this.buildGlycolHeader(group, header)
    const gly: { id: InstrumentId; color: number; rackY: number; tag: PlantTag; face: THREE.Vector3 }[] = [
      { id: 'gly-supply', color: 0x7c5cff, rackY: 1.82, tag: 'GLS', face: faces[0] },
      { id: 'gly-return', color: 0xb9a6ff, rackY: 2.06, tag: 'GLR', face: faces[1] },
    ]
    for (const line of gly) {
      const tip = line.face.clone()
      const away = tip.clone()
      away.x -= 0.7
      const rack = away.clone()
      rack.y = line.rackY
      this.layLine(group, [
        tip,
        new THREE.Vector3(tip.x - 0.28, tip.y, tip.z),
        away,
        rack,
        new THREE.Vector3(away.x, line.rackY, coolZ),
        new THREE.Vector3(coolX + 1.05, line.rackY, coolZ),
        new THREE.Vector3(coolX + 1.05, 1.15, coolZ),
      ], line, 'gly', tip, 'x')
    }
    this.buildDryCooler(group, coolX, coolZ)
    this.flushPipes(group)
    this.root.add(group)
  }

  /**
   * Project a model-local nozzle onto its flange. A ring of rays around the bore
   * finds the face so the pipe meets the opening and does not stop in mid-air
   * or run through the shell. `into` steps a short way down the bore.
   */
  private seatNozzle(localFace: THREE.Vector3): { face: THREE.Vector3; into: THREE.Vector3 } {
    const model = this.model!
    const outward = new THREE.Vector3(0, 0, 1).transformDirection(model.matrixWorld).normalize()
    const axisX = new THREE.Vector3(1, 0, 0).transformDirection(model.matrixWorld).normalize()
    const axisY = new THREE.Vector3(0, 1, 0).transformDirection(model.matrixWorld).normalize()
    const nominal = localFace.clone().applyMatrix4(model.matrixWorld)
    const dir = outward.clone().negate()
    const savedFar = this.raycaster.far
    this.raycaster.far = 2
    let shift = 0
    let samples = 0
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2
      const origin = nominal
        .clone()
        .addScaledVector(outward, 0.85)
        .addScaledVector(axisX, Math.cos(angle) * 0.15)
        .addScaledVector(axisY, Math.sin(angle) * 0.15)
      this.raycaster.set(origin, dir)
      const hits = this.raycaster.intersectObject(model, true)
      for (const hit of hits) {
        const along = hit.point.clone().sub(nominal).dot(outward)
        if (along < -0.25 || along > 0.12) continue
        shift += along
        samples += 1
        break
      }
    }
    this.raycaster.far = savedFar
    const face = nominal.clone()
    if (samples > 0) face.addScaledVector(outward, shift / samples)
    return { face, into: face.clone().addScaledVector(outward, -0.045) }
  }

  /** Floor-mounted glycol header. The package mesh has no glycol flanges of its own. */
  private buildGlycolHeader(group: THREE.Group, origin: THREE.Vector3): THREE.Vector3[] {
    const g = new THREE.Group()
    g.position.copy(origin)
    const legMat = this.steel(0x2a2438, 0.45, 0.5)
    for (const lz of [-0.42, 0.42]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.38, 0.08), legMat)
      leg.position.set(0, 0.19, lz)
      g.add(leg)
    }
    const drum = new THREE.Mesh(
      new THREE.CylinderGeometry(0.11, 0.11, 1.15, this.segs(16, 10)),
      this.steel(0x4c3d6e, 0.5, 0.42),
    )
    drum.rotation.x = Math.PI / 2
    drum.position.y = 0.49
    g.add(drum)
    const faces: THREE.Vector3[] = []
    for (const spec of [
      { z: -0.28, y: 0.47 },
      { z: 0.28, y: 0.525 },
    ]) {
      const nozzle = new THREE.Mesh(
        new THREE.CylinderGeometry(0.075, 0.075, 0.2, this.segs(12, 8)),
        this.steel(0x6d5a96, 0.55, 0.38),
      )
      nozzle.rotation.z = Math.PI / 2
      nozzle.position.set(-0.14, spec.y, spec.z)
      g.add(nozzle)
      faces.push(origin.clone().add(new THREE.Vector3(-0.24, spec.y, spec.z)))
    }
    group.add(g)
    return faces
  }

  private layLine(
    group: THREE.Group,
    points: THREE.Vector3[],
    line: { id: InstrumentId; color: number; tag: PlantTag },
    kind: LoopKind,
    flangeAt: THREE.Vector3,
    flangeAxis: 'x' | 'z',
  ) {
    this.runPipe(points, kind === 'gly' ? 0.068 : 0.082, this.steel(line.color, 0.62, 0.32))
    this.addFlange(group, flangeAt, flangeAxis)
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
    const tube = this.segs(6, 4)
    const around = this.segs(16, 10)
    const ring = new THREE.Mesh(
      this.geo(`fan-ring-${radius}-${tube}-${around}`, () => new THREE.TorusGeometry(radius, 0.028, tube, around)),
      this.steel(0xd7dee6, 0.65, 0.3),
    )
    ring.rotation.x = Math.PI / 2
    fan.add(ring)
    const bladeGeo = this.geo(`fan-blade-${radius}`, () => new THREE.BoxGeometry(radius * 0.85, 0.02, radius * 0.22))
    for (let i = 0; i < 4; i++) {
      const theta = (i * Math.PI) / 2
      const blade = new THREE.Mesh(bladeGeo, this.steel(0xe7eef4, 0.55, 0.35))
      blade.position.set(Math.cos(theta) * radius * 0.42, 0, Math.sin(theta) * radius * 0.42)
      blade.rotation.y = theta
      fan.add(blade)
    }
    return fan
  }

  private runPipe(points: THREE.Vector3[], radius: number, mat: THREE.Material) {
    const radial = this.segs(10, 6)
    const jointW = this.segs(8, 6)
    const jointH = this.segs(6, 4)
    for (let i = 0; i < points.length - 1; i++) {
      this.stashPipe(points[i], points[i + 1], radius, mat, radial, jointW, jointH)
    }
  }

  private stashPipe(
    a: THREE.Vector3,
    b: THREE.Vector3,
    radius: number,
    mat: THREE.Material,
    radial: number,
    jointW: number,
    jointH: number,
  ) {
    const dir = new THREE.Vector3().subVectors(b, a)
    const len = dir.length()
    if (len < 0.02) return
    const mid = a.clone().add(b).multiplyScalar(0.5)
    const tube = new THREE.CylinderGeometry(radius, radius, len, radial, 1, true)
    tube.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()))
    tube.translate(mid.x, mid.y, mid.z)
    pushGeo(this.pipeParts, mat, tube)
    const joint = new THREE.SphereGeometry(radius * 1.15, jointW, jointH)
    joint.translate(b.x, b.y, b.z)
    pushGeo(this.pipeParts, mat, joint)
  }

  private flushPipes(group: THREE.Group) {
    for (const [mat, parts] of this.pipeParts) {
      const merged = mergePipe(parts)
      if (!merged) continue
      const mesh = new THREE.Mesh(merged, mat)
      mesh.castShadow = false
      mesh.receiveShadow = false
      group.add(mesh)
    }
    this.pipeParts.clear()
  }

  private addFlange(group: THREE.Group, pos: THREE.Vector3, axis: 'x' | 'z') {
    const sides = this.segs(16, 8)
    const flange = new THREE.Mesh(
      this.geo(`flange-${sides}`, () => new THREE.CylinderGeometry(0.16, 0.16, 0.05, sides)),
      this.steel(0xc5ccd1, 0.78, 0.28),
    )
    flange.position.copy(pos)
    flange.rotation[axis === 'x' ? 'z' : 'x'] = Math.PI / 2
    group.add(flange)
  }

  private addValve(group: THREE.Group, pos: THREE.Vector3, id: InstrumentId, kind: LoopKind, tag: PlantTag) {
    const valve = new THREE.Group()
    valve.position.copy(pos)
    const bodySides = this.segs(14, 8)
    const body = new THREE.Mesh(
      this.geo(`valve-body-${bodySides}`, () => new THREE.CylinderGeometry(0.14, 0.14, 0.26, bodySides)),
      this.steel(0x1c2430, 0.72, 0.34),
    )
    body.rotation.z = Math.PI / 2
    valve.add(body)
    const tube = this.segs(8, 6)
    const ring = this.segs(18, 10)
    const wheel = new THREE.Mesh(
      this.geo(`valve-wheel-${tube}-${ring}`, () => new THREE.TorusGeometry(0.16, 0.022, tube, ring)),
      this.steel(0xd7dee6, 0.85, 0.22),
    )
    wheel.position.y = 0.2
    valve.add(wheel)
    const spokeGeo = this.geo('valve-spoke', () => new THREE.BoxGeometry(0.28, 0.015, 0.015))
    for (const rot of [0, Math.PI / 2]) {
      const spoke = new THREE.Mesh(spokeGeo, this.steel(0xd7dee6, 0.8, 0.25))
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
      this.geo('gauge-stem', () => new THREE.CylinderGeometry(0.018, 0.018, 0.16, 6)),
      this.steel(0x9aa4ad, 0.6, 0.3),
    )
    stem.position.y = 0.1
    gauge.add(stem)
    const dialSides = this.segs(16, 8)
    const dial = new THREE.Mesh(
      this.geo(`gauge-dial-${dialSides}`, () => new THREE.CylinderGeometry(0.085, 0.085, 0.035, dialSides)),
      this.gaugeMat(kind),
    )
    dial.rotation.x = Math.PI / 2
    dial.position.y = 0.2
    gauge.add(dial)
    group.add(gauge)
  }

  private gaugeMat(kind: 'p' | 't') {
    const key = `gauge-${kind}`
    const cached = this.materialCache.get(key)
    if (cached) return cached
    const mat = new THREE.MeshStandardMaterial({
      color: kind === 'p' ? 0xf4f7fb : 0xf0a202,
      metalness: 0.25,
      roughness: 0.4,
      emissive: kind === 't' ? 0x7c4a03 : 0x000000,
      emissiveIntensity: kind === 't' ? 0.25 : 0,
    })
    this.materialCache.set(key, mat)
    return mat
  }

  private tagLabel(text: PlantTag, color: string) {
    const anchor = document.createElement('div')
    anchor.className = 'plant-tag-anchor'
    const leader = document.createElement('span')
    leader.className = 'plant-leader'
    leader.style.background = color
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
    anchor.append(leader, root)
    this.labelValues.set(text, value)
    const object = new CSS2DObject(anchor)
    this.labelAnchors.set(text, object)
    this.placeTag(text)
    return object
  }

  private tagOffset(tag: PlantTag) {
    const width = this.renderer.domElement.clientWidth || 800
    if (width >= 480) return TAG_OFFSET[tag]
    if (tag === 'TOWER · WATER') return { x: -8, y: 108 }
    const base = TAG_OFFSET[tag]
    return { x: Math.round(base.x * 0.42), y: Math.round(base.y * 0.74) }
  }

  private tagNodes(tag: PlantTag) {
    const object = this.labelAnchors.get(tag)
    if (!object) return null
    const tagEl = object.element.querySelector('.plant-tag')
    const leader = object.element.querySelector('.plant-leader')
    if (!(tagEl instanceof HTMLElement) || !(leader instanceof HTMLElement)) return null
    return { tagEl, leader }
  }

  private placeTag(tag: PlantTag) {
    const nodes = this.tagNodes(tag)
    if (!nodes) return
    const offset = this.tagOffset(tag)
    this.writeTagOffset(nodes.tagEl, nodes.leader, offset.x, offset.y)
  }

  private writeTagOffset(tagEl: HTMLElement, leader: HTMLElement, x: number, y: number) {
    tagEl.style.left = `${x}px`
    tagEl.style.top = `${y}px`
    const length = Math.hypot(x, y)
    leader.hidden = length < 8
    leader.style.width = `${length}px`
    leader.style.transform = `rotate(${Math.atan2(y, x)}rad)`
  }

  /** Pull every tag inside the canvas and off the HUD chips. Skips repeat frames. */
  private fitTagsInView() {
    const canvas = this.renderer.domElement
    const view = canvas.getBoundingClientRect()
    if (view.width < 8 || view.height < 8) return
    const bounds = insetBox(domBox(view), 4)
    const hud = this.hudBoxes().map((box) => padBox(box, 4))
    const fitted: FittedTag[] = []
    for (const tag of this.labelAnchors.keys()) {
      const fit = this.fitTag(tag, bounds, hud)
      if (fit) fitted.push(fit)
    }
    untangleTags(fitted, bounds, hud)
    for (const fit of fitted) {
      this.writeTagOffset(fit.tagEl, fit.leader, Math.round(fit.baseX + fit.dx), Math.round(fit.baseY + fit.dy))
    }
  }

  private hudBoxes(): ScreenBox[] {
    const root = this.renderer.domElement.parentElement
    if (!root) return []
    const boxes: ScreenBox[] = []
    for (const el of root.querySelectorAll('.canvas-hud .pill')) {
      if (!(el instanceof HTMLElement)) continue
      const rect = el.getBoundingClientRect()
      if (rect.width < 1 || rect.height < 1) continue
      boxes.push(domBox(rect))
    }
    return boxes
  }

  private fitTag(tag: PlantTag, bounds: ScreenBox, hud: ScreenBox[]): FittedTag | null {
    const nodes = this.tagNodes(tag)
    if (!nodes) return null
    const base = this.tagOffset(tag)
    this.writeTagOffset(nodes.tagEl, nodes.leader, base.x, base.y)
    const start = domBox(nodes.tagEl.getBoundingClientRect())
    const into = clampShift(start, bounds)
    let dx = into.dx
    let dy = into.dy
    let cursor = shiftBox(start, dx, dy)
    for (const block of hud) {
      if (!boxesOverlap(cursor, block)) continue
      const move = separateBox(cursor, block, bounds)
      if (!move) continue
      dx += move.dx
      dy += move.dy
      cursor = shiftBox(cursor, move.dx, move.dy)
    }
    return { tagEl: nodes.tagEl, leader: nodes.leader, baseX: base.x, baseY: base.y, dx, dy, box: cursor }
  }

  private placeAllTags() {
    for (const tag of this.labelAnchors.keys()) this.placeTag(tag)
  }

  private placeProxyHotspots(box: THREE.Box3) {
    const min = box.min
    const size = box.getSize(new THREE.Vector3())
    const region = (id: ComponentId, nx: number, ny: number, nz: number, nw: number, nh: number, nd: number) => {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(Math.max(size.x * nw, 0.2), Math.max(size.y * nh, 0.2), Math.max(size.z * nd, 0.2)),
        this.hiddenMat(),
      )
      mesh.position.set(
        min.x + size.x * (nx + nw / 2),
        min.y + size.y * (ny + nh / 2),
        min.z + size.z * (nz + nd / 2),
      )
      this.addHotspot(id, mesh, false)
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
    if (this.disposed) return
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
        this.focusFleetUnit(-1)
      }
      return
    }
    this.pickFleetUnit()
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
    this.placeAllTags()
    this.labelsNeedDraw = true
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

  /** Low-power clients stay idle unless the operator is moving the view or a part is selected. */
  private frameIsAwake() {
    if (!this.lowPower) return true
    return this.interacting || this.highlightRing.visible
  }

  private poseFans(t: number) {
    for (const fan of this.fans) {
      fan.mesh.rotation.y = t * (fan.sink === 'dry' ? this.drySpin : this.towerSpin)
    }
  }

  private spinAssemblies(t: number) {
    if (this.rotor) this.rotor.rotation.x = t * (this.lowPower ? 3.5 : 6)
    this.poseFans(t)
    if (this.highlightRing.visible) {
      this.highlightRing.rotation.z = t * 1.1
      ;(this.highlightRing.material as THREE.MeshBasicMaterial).opacity = 0.55 + Math.sin(t * 3) * 0.2
    }
    if (!this.particles || !this.particleVel) return
    const pos = this.particles.geometry.getAttribute('position') as THREE.BufferAttribute
    for (let i = 0; i < pos.count; i++) {
      const a = Math.atan2(pos.getZ(i), pos.getX(i)) + 0.01 * this.particleVel[i]
      const r = 1.3 + 0.3 * Math.sin(a * 2 + t)
      const y = 1.4 + 0.45 * Math.sin(a * 2) + 0.1 * Math.sin(t * 2 + i)
      pos.setXYZ(i, Math.cos(a) * r, y, Math.sin(a) * r * 0.85)
    }
    pos.needsUpdate = true
  }

  private animateFrame(t: number) {
    if (!this.frameIsAwake()) {
      if (this.controls.enableDamping) this.controls.update()
      return
    }
    this.controls.update()
    this.spinAssemblies(t)
    this.needsRender = true
  }

  private syncLabelLayer() {
    const layer = this.labelRenderer.domElement
    if (!this.labelsInView()) {
      layer.style.visibility = 'hidden'
      return
    }
    layer.style.visibility = ''
    this.labelRenderer.render(this.scene, this.camera)
    this.fitTagsInView()
  }

  /**
   * Ray from the camera to each anchor. A hit well in front of the anchor means the chiller hides the tag.
   * Returns false when the throttle skips the test, so the caller keeps the request.
   */
  private fadeOccludedLabels(now: number): boolean {
    if (now - this.occlusionAt < 0.25) return false
    this.occlusionAt = now
    const model = this.model
    if (!model) return true
    const origin = this.camera.position
    const savedFar = this.raycaster.far
    for (const object of this.labelAnchors.values()) {
      object.getWorldPosition(this.occlusionAnchor)
      this.occlusionDir.subVectors(this.occlusionAnchor, origin)
      const dist = this.occlusionDir.length()
      if (dist < 0.5) continue
      this.occlusionDir.multiplyScalar(1 / dist)
      this.raycaster.set(origin, this.occlusionDir)
      this.raycaster.far = dist - 0.35
      const blocked = this.raycaster.intersectObject(model, true).length > 0
      object.element.classList.toggle('is-occluded', blocked)
    }
    this.raycaster.far = savedFar
    return true
  }

  private viewDirty() {
    const canvas = this.renderer.domElement
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    const p = this.camera.position
    const t = this.controls.target
    const dirty =
      this.viewW !== w ||
      this.viewH !== h ||
      Math.abs(this.viewPx - p.x) > 0.004 ||
      Math.abs(this.viewPy - p.y) > 0.004 ||
      Math.abs(this.viewPz - p.z) > 0.004 ||
      Math.abs(this.viewTx - t.x) > 0.004 ||
      Math.abs(this.viewTy - t.y) > 0.004 ||
      Math.abs(this.viewTz - t.z) > 0.004
    if (!dirty) return false
    this.viewW = w
    this.viewH = h
    this.viewPx = p.x
    this.viewPy = p.y
    this.viewPz = p.z
    this.viewTx = t.x
    this.viewTy = t.y
    this.viewTz = t.z
    return true
  }

  private renderFrame(t: number) {
    if (this.viewDirty()) {
      this.needsRender = true
      this.labelsNeedDraw = true
      this.occlusionPending = true
      this.updateFleetLod()
    }
    if (this.needsRender) {
      this.renderer.render(this.scene, this.camera)
      if (this.lowPower && !this.interacting) this.needsRender = false
    }
    this.drawLabels(t)
  }

  private drawLabels(t: number) {
    if (this.labelsNeedDraw) {
      this.labelsNeedDraw = false
      this.syncLabelLayer()
      this.occlusionPending = true
    }
    if (!this.occlusionPending) return
    if (this.fadeOccludedLabels(t)) this.occlusionPending = false
  }

  private tick = () => {
    if (this.disposed) return
    this.animId = requestAnimationFrame(this.tick)
    if (document.hidden) {
      this.labelRenderer.domElement.style.visibility = 'hidden'
      return
    }
    const t = this.clock.getElapsedTime()
    this.animateFrame(t)
    this.renderFrame(t)
  }

  dispose() {
    this.disposed = true
    this.finishLoad?.(false)
    this.modelLoader?.abort()
    cancelAnimationFrame(this.animId)
    window.removeEventListener('resize', this.onResize)
    document.removeEventListener('visibilitychange', this.onVisibility)
    this.renderer.domElement.removeEventListener('pointerdown', this.onPointer)
    this.labelRenderer.domElement.remove()
    this.labelValues.clear()
    this.labelAnchors.clear()
    this.controls.dispose()
    disposeSceneResources(this.scene)
    this.disposeFleetMeshes()
    this.disposeLodGeometries()
    this.renderer.dispose()
  }
}

function pushGeo(batches: Map<THREE.Material, THREE.BufferGeometry[]>, mat: THREE.Material, geo: THREE.BufferGeometry) {
  const list = batches.get(mat)
  if (list) list.push(geo)
  else batches.set(mat, [geo])
}

function mergePipe(parts: THREE.BufferGeometry[]) {
  if (parts.length === 0) return null
  if (parts.length === 1) return parts[0]
  const merged = mergeGeometries(parts, false)
  for (const part of parts) part.dispose()
  return merged
}

function fleetColumns(count: number) {
  if (count > 24) return 9
  if (count > 12) return 6
  return 4
}

function fleetCountKey(count: number) {
  return String(count)
}

function runBits(units: { running: boolean }[]) {
  let bits = ''
  for (const unit of units) bits += unit.running ? '1' : '0'
  return bits
}

function disposeGrid(grid: THREE.GridHelper) {
  grid.geometry.dispose()
  const mats = Array.isArray(grid.material) ? grid.material : [grid.material]
  for (const mat of mats) mat.dispose()
}

function singleMaterial(mesh: THREE.Mesh) {
  return Array.isArray(mesh.material) ? mesh.material[0] ?? null : mesh.material
}

function hasGeometry(obj: THREE.Object3D): obj is THREE.Mesh {
  const mesh = obj as THREE.Mesh
  return Boolean(mesh.isMesh || (obj as THREE.Points).isPoints || (obj as THREE.Line).isLine)
}

function disposeSceneResources(scene: THREE.Scene) {
  const geometries = new Set<THREE.BufferGeometry>()
  const materials = new Set<THREE.Material>()
  scene.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    if (!hasGeometry(mesh)) return
    if (mesh.geometry) geometries.add(mesh.geometry)
    const mat = mesh.material
    if (Array.isArray(mat)) {
      for (const item of mat) materials.add(item)
    } else if (mat) materials.add(mat)
  })
  for (const geo of geometries) geo.dispose()
  for (const mat of materials) mat.dispose()
}

interface ScreenBox {
  left: number
  right: number
  top: number
  bottom: number
}

interface FittedTag {
  tagEl: HTMLElement
  leader: HTMLElement
  baseX: number
  baseY: number
  dx: number
  dy: number
  box: ScreenBox
}

function domBox(rect: Pick<DOMRect, 'left' | 'right' | 'top' | 'bottom'>): ScreenBox {
  return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom }
}

function shiftBox(box: ScreenBox, dx: number, dy: number): ScreenBox {
  return { left: box.left + dx, right: box.right + dx, top: box.top + dy, bottom: box.bottom + dy }
}

function insetBox(box: ScreenBox, pad: number): ScreenBox {
  return { left: box.left + pad, right: box.right - pad, top: box.top + pad, bottom: box.bottom - pad }
}

function padBox(box: ScreenBox, pad: number): ScreenBox {
  return { left: box.left - pad, right: box.right + pad, top: box.top - pad, bottom: box.bottom + pad }
}

function boxesOverlap(a: ScreenBox, b: ScreenBox) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
}

function boxInside(box: ScreenBox, bounds: ScreenBox) {
  return box.left >= bounds.left && box.right <= bounds.right && box.top >= bounds.top && box.bottom <= bounds.bottom
}

function clampShift(box: ScreenBox, bounds: ScreenBox) {
  let dx = 0
  let dy = 0
  if (box.left < bounds.left) dx = bounds.left - box.left
  else if (box.right > bounds.right) dx = bounds.right - box.right
  if (box.top < bounds.top) dy = bounds.top - box.top
  else if (box.bottom > bounds.bottom) dy = bounds.bottom - box.bottom
  return { dx, dy }
}

/** Smallest slide that clears one HUD chip and still sits inside the canvas. */
function separateBox(box: ScreenBox, block: ScreenBox, bounds: ScreenBox) {
  const moves = [
    { dx: block.right - box.left, dy: 0 },
    { dx: block.left - box.right, dy: 0 },
    { dx: 0, dy: block.bottom - box.top },
    { dx: 0, dy: block.top - box.bottom },
  ]
  let best: { dx: number; dy: number } | null = null
  let bestLen = Infinity
  for (const move of moves) {
    const shifted = shiftBox(box, move.dx, move.dy)
    const clamp = clampShift(shifted, bounds)
    const next = shiftBox(shifted, clamp.dx, clamp.dy)
    if (!boxInside(next, bounds) || boxesOverlap(next, block)) continue
    const dx = move.dx + clamp.dx
    const dy = move.dy + clamp.dy
    const len = dx * dx + dy * dy
    if (len < bestLen) {
      bestLen = len
      best = { dx, dy }
    }
  }
  return best
}

/** Slide the tag that already moved, or the later tag on a tie, until the two no longer cover each other. */
function untangleTags(tags: FittedTag[], bounds: ScreenBox, hud: ScreenBox[]) {
  const gap = 6
  for (let pass = 0; pass < tags.length; pass++) {
    let moved = false
    for (let i = 0; i < tags.length; i++) {
      for (let j = i + 1; j < tags.length; j++) {
        if (!boxesOverlap(tags[i].box, tags[j].box)) continue
        const moveI = Math.abs(tags[i].dx) + Math.abs(tags[i].dy)
        const moveJ = Math.abs(tags[j].dx) + Math.abs(tags[j].dy)
        const mover = moveI > moveJ ? tags[i] : tags[j]
        const other = mover === tags[i] ? tags[j] : tags[i]
        const slide = slideClear(mover, other.box, tags, bounds, hud, gap)
        if (!slide) continue
        mover.dx += slide.dx
        mover.dy += slide.dy
        mover.box = shiftBox(mover.box, slide.dx, slide.dy)
        moved = true
      }
    }
    if (!moved) break
  }
}

function slideClear(
  mover: FittedTag,
  other: ScreenBox,
  tags: FittedTag[],
  bounds: ScreenBox,
  hud: ScreenBox[],
  gap: number,
) {
  const box = mover.box
  const moves = [
    { dx: 0, dy: other.top - gap - box.bottom },
    { dx: 0, dy: other.bottom + gap - box.top },
    { dx: other.left - gap - box.right, dy: 0 },
    { dx: other.right + gap - box.left, dy: 0 },
  ]
  let best: { dx: number; dy: number } | null = null
  let bestLen = Infinity
  for (const move of moves) {
    const clamped = clampShift(shiftBox(box, move.dx, move.dy), bounds)
    const dx = move.dx + clamped.dx
    const dy = move.dy + clamped.dy
    const next = shiftBox(box, dx, dy)
    if (!boxInside(next, bounds) || boxesOverlap(next, other)) continue
    if (hud.some((block) => boxesOverlap(next, block))) continue
    if (tags.some((tag) => tag !== mover && boxesOverlap(next, tag.box))) continue
    const len = dx * dx + dy * dy
    if (len < bestLen) {
      bestLen = len
      best = { dx, dy }
    }
  }
  return best
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
      return `Fans ${readings.towerFanPct}%`
    case 'GLYCOL DRY':
      return `Fans ${readings.dryFanPct}%`
    default: {
      const unknown: never = tag
      return unknown
    }
  }
}
