// Samples the live York plant. Pass "desktop" to exercise the high-power path
// (8 cores, devicePixelRatio 2). This machine has 4 cores, so the app otherwise
// takes the low-power path. Open /york-chiller/?plantStats=1 and read renderer.info.
import { chromium } from '@playwright/test'
import fs from 'node:fs'

const url = process.argv[2] || 'http://127.0.0.1:5173/york-chiller/?plantStats=1'
const outDir = process.argv[3] || '/tmp/york-baseline'
const desktop = process.argv[4] === 'desktop'
fs.mkdirSync(outDir, { recursive: true })

const browser = await chromium.launch({
  executablePath: '/usr/local/bin/google-chrome',
  headless: true,
  args: [
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-webgl',
    '--ignore-gpu-blocklist',
    '--enable-precise-memory-info',
    '--disable-dev-shm-usage',
    '--no-sandbox',
  ],
})

const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: desktop ? 2 : 1 })
if (desktop) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 })
    Object.defineProperty(window, 'devicePixelRatio', { get: () => 2 })
  })
}
const errors = []
page.on('pageerror', (err) => errors.push(String(err)))
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(msg.text())
})

await page.goto(url, { waitUntil: 'networkidle' })
await page.locator('.nav [data-nav="explorer"]').click()
await page.locator('.plant-tag').nth(7).waitFor({ timeout: 60_000 })
await page.locator('#canvas-boot').waitFor({ state: 'detached', timeout: 60_000 }).catch(() => {})
await page.waitForTimeout(800)

const sample = await page.evaluate(async () => {
  const scene = window.__YORK_SCENE
  if (!scene) return { error: 'no scene' }
  const renderer = scene.renderer
  const gl = renderer.getContext()
  const dbg = gl.getExtension('WEBGL_debug_renderer_info')
  const gpu = dbg
    ? {
        vendor: gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL),
        renderer: gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL),
      }
    : { vendor: gl.getParameter(gl.VENDOR), renderer: gl.getParameter(gl.RENDERER) }

  function geometryTris(geo) {
    if (!geo) return 0
    if (geo.index) return geo.index.count / 3
    const pos = geo.getAttribute('position')
    return pos ? pos.count / 3 : 0
  }

  const geometries = new Set()
  const materials = new Set()
  const meshes = []
  let logicalTris = 0
  scene.scene.traverse((obj) => {
    const mesh = obj
    if (!mesh.isMesh && !mesh.isPoints && !mesh.isLine) return
    if (mesh.geometry) geometries.add(mesh.geometry.uuid)
    const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : []
    for (const mat of mats) materials.add(mat.uuid)
    const instances = mesh.isInstancedMesh ? mesh.count : 1
    const tris = geometryTris(mesh.geometry) * instances
    logicalTris += tris
    meshes.push({
      name: mesh.name || mesh.type,
      tris,
      instances,
      castShadow: Boolean(mesh.castShadow),
      receiveShadow: Boolean(mesh.receiveShadow),
      visible: mesh.visible,
    })
  })
  meshes.sort((a, b) => b.tris - a.tris)

  async function frameSample(ms) {
    const info = renderer.info
    const prev = info.autoReset
    info.autoReset = false
    info.reset()
    const heap0 = performance.memory ? performance.memory.usedJSHeapSize : 0
    const times = []
    const t0 = performance.now()
    let last = t0
    await new Promise((resolve) => {
      function step(now) {
        times.push(now - last)
        last = now
        if (now - t0 < ms) requestAnimationFrame(step)
        else resolve()
      }
      requestAnimationFrame(step)
    })
    const frames = info.render.frame
    const result = {
      rafFrames: times.length,
      rafMs: times.slice(1),
      renderedFrames: frames,
      triangles: frames ? info.render.triangles / frames : 0,
      calls: frames ? info.render.calls / frames : 0,
      points: frames ? info.render.points / frames : 0,
      lines: frames ? info.render.lines / frames : 0,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      programs: info.programs ? info.programs.length : 0,
      heapDelta: performance.memory ? performance.memory.usedJSHeapSize - heap0 : null,
    }
    info.autoReset = prev
    info.reset()
    return result
  }

  function summarize(sample) {
    const ms = sample.rafMs.slice().sort((a, b) => a - b)
    const avg = ms.reduce((s, n) => s + n, 0) / Math.max(ms.length, 1)
    const p95 = ms[Math.min(ms.length - 1, Math.floor(ms.length * 0.95))] ?? 0
    return {
      ...sample,
      rafMs: undefined,
      avgFrameMs: avg,
      p95FrameMs: p95,
      minFrameMs: ms[0] ?? 0,
      maxFrameMs: ms[ms.length - 1] ?? 0,
      fps: avg > 0 ? 1000 / avg : 0,
    }
  }

  const canvas = renderer.domElement
  const camera = {
    px: scene.camera.position.x,
    py: scene.camera.position.y,
    pz: scene.camera.position.z,
    tx: scene.controls.target.x,
    ty: scene.controls.target.y,
    tz: scene.controls.target.z,
    fov: scene.camera.fov,
    aspect: scene.camera.aspect,
  }

  renderer.info.autoReset = true
  renderer.info.reset()
  renderer.render(scene.scene, scene.camera)
  const oneFrame = {
    triangles: renderer.info.render.triangles,
    calls: renderer.info.render.calls,
    points: renderer.info.render.points,
    lines: renderer.info.render.lines,
    geometries: renderer.info.memory.geometries,
    textures: renderer.info.memory.textures,
  }

  const baseline = summarize(await frameSample(2000))
  const shadowWas = renderer.shadowMap.enabled
  renderer.shadowMap.enabled = false
  const noShadow = summarize(await frameSample(1200))
  renderer.shadowMap.enabled = shadowWas

  const ratioWas = renderer.getPixelRatio()
  renderer.setPixelRatio(1)
  const ratio1 = summarize(await frameSample(1200))
  renderer.setPixelRatio(ratioWas)

  const model = scene.model
  let noModel = null
  if (model) {
    const vis = model.visible
    model.visible = false
    noModel = summarize(await frameSample(1200))
    model.visible = vis
  }

  const labels = scene.labelRenderer.domElement
  const labelDisplay = labels.style.display
  labels.style.display = 'none'
  const noLabels = summarize(await frameSample(1200))
  labels.style.display = labelDisplay

  return {
    gpu,
    pixelRatio: ratioWas,
    devicePixelRatio: window.devicePixelRatio,
    cores: navigator.hardwareConcurrency ?? null,
    canvas: { cssWidth: canvas.clientWidth, cssHeight: canvas.clientHeight, width: canvas.width, height: canvas.height },
    shadow: shadowWas,
    shadowMapSize: null,
    logicalTris,
    uniqueGeometries: geometries.size,
    uniqueMaterials: materials.size,
    meshCount: meshes.length,
    topMeshes: meshes.slice(0, 12),
    camera,
    oneFrame,
    baseline,
    noShadow,
    ratio1,
    noModel,
    noLabels,
    status: scene.statusLine(),
    simpleModel: scene.simpleModel,
    lowPower: scene.lowPower,
  }
})

await page.screenshot({ path: `${outDir}/plant.png`, fullPage: false })
const canvas = page.locator('#chiller-canvas')
await canvas.screenshot({ path: `${outDir}/canvas.png` })
fs.writeFileSync(`${outDir}/sample.json`, JSON.stringify({ sample, errors }, null, 2))
console.log(JSON.stringify({ sample, errors }, null, 2))
await browser.close()
