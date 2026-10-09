import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { expect, test } from '@playwright/test'
import { plantModelProgressText } from '../york-chiller/src/3d/chillerScene'

const SIMPLE_MODEL = 'The view shows the simple plant model.'

test('plant model progress text names the percent or the MB count', () => {
  expect(plantModelProgressText(0, 0)).toBe('The plant model starts.')
  expect(plantModelProgressText(42, 100)).toBe('The plant model file is at 42 percent.')
  expect(plantModelProgressText(150, 100)).toBe('The plant model file is at 100 percent.')
  expect(plantModelProgressText(Number.NaN, 100)).toBe('The plant model starts.')
  expect(plantModelProgressText(4096, 0)).toBe('The plant model file is at 0 MB.')
  expect(plantModelProgressText(1_048_576, 0)).toBe('The plant model file is at 1 MB.')
  expect(plantModelProgressText(2_500_000, 0)).toBe('The plant model file is at 2 MB.')
  expect(plantModelProgressText(4096, 0)).toBe(plantModelProgressText(900_000, 0))
})

test('boot overlay shows download percent, then the full plant model', async ({ page }) => {
  test.setTimeout(45_000)
  await page.addInitScript(() => {
    ;(window as Window & { __YORK_MODEL_TIMEOUT_MS?: number }).__YORK_MODEL_TIMEOUT_MS = 3000
  })
  await page.setViewportSize({ width: 390, height: 844 })
  let releaseDownload = () => {}
  const held = new Promise<void>((resolve) => {
    releaseDownload = resolve
  })
  await page.route('**/models/ymc2.glb', async (route) => {
    await held
    await route.continue()
  })
  const client = await page.context().newCDPSession(page)
  await client.send('Network.enable')
  await client.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 40,
    downloadThroughput: 1_500_000,
    uploadThroughput: 1_500_000,
  })
  await page.goto('/york-chiller/')
  await page.locator('.nav [data-nav="explorer"]').click()
  await expect(page.locator('#canvas-boot')).toHaveText('The plant model starts.')
  releaseDownload()
  await expect(page.locator('#canvas-boot')).toHaveText(/The plant model file is at \d+ percent\./, {
    timeout: 12_000,
  })
  await expect(page.locator('#canvas-boot')).toHaveCount(0, { timeout: 30_000 })
  await expect(page.locator('.plant-tag')).toHaveCount(8, { timeout: 20_000 })
  await expect(page.locator('#canvas-status')).toHaveText('Low-detail 3D')
  await expect(page.locator('#canvas-status')).not.toHaveText(SIMPLE_MODEL)
})

test('a trickle download falls back to the simple plant model', async ({ page }) => {
  test.setTimeout(40_000)
  await page.addInitScript(() => {
    ;(window as Window & { __YORK_MODEL_TIMEOUT_MS?: number }).__YORK_MODEL_TIMEOUT_MS = 6000
  })
  await page.setViewportSize({ width: 390, height: 844 })
  let releaseDownload = () => {}
  const held = new Promise<void>((resolve) => {
    releaseDownload = resolve
  })
  await page.route('**/models/ymc2.glb', async (route) => {
    await held
    await route.continue()
  })
  await page.goto('/york-chiller/')
  await page.locator('.nav [data-nav="explorer"]').click()
  await expect(page.locator('#canvas-boot')).toHaveText('The plant model starts.')
  const client = await page.context().newCDPSession(page)
  await client.send('Network.enable')
  await client.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 20,
    downloadThroughput: 2000,
    uploadThroughput: 2000,
  })
  releaseDownload()
  await expect(page.locator('#canvas-boot')).toHaveText('The plant model file is at 0 percent.', {
    timeout: 6_000,
  })
  await expect(page.locator('#canvas-status')).toHaveText(SIMPLE_MODEL, { timeout: 12_000 })
  await expect(page.locator('#canvas-boot')).toHaveCount(0)
  await expect(page.locator('.plant-tag')).toHaveCount(0)
})

test('boot overlay clears when the plant model download stalls', async ({ page }) => {
  test.setTimeout(20_000)
  await page.addInitScript(() => {
    ;(window as Window & { __YORK_MODEL_TIMEOUT_MS?: number }).__YORK_MODEL_TIMEOUT_MS = 1500
  })
  await page.route('**/models/ymc2.glb', () => new Promise(() => {}))
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/york-chiller/')
  await page.locator('.nav [data-nav="explorer"]').click()
  await expect(page.locator('#canvas-boot')).toHaveText('The plant model starts.')
  await expect(page.locator('#canvas-boot')).toHaveCount(0, { timeout: 8_000 })
  await expect(page.locator('#canvas-status')).toHaveText(SIMPLE_MODEL)
  await expect(page.locator('.plant-tag')).toHaveCount(0)
})

test('boot overlay clears when the plant model file fails', async ({ page }) => {
  await page.route('**/models/ymc2.glb', (route) => route.abort('failed'))
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/york-chiller/')
  await page.locator('.nav [data-nav="explorer"]').click()
  await expect(page.locator('#canvas-boot')).toHaveCount(0, { timeout: 8_000 })
  await expect(page.locator('#canvas-status')).toHaveText(SIMPLE_MODEL)
  await expect(page.locator('.plant-tag')).toHaveCount(0)
})

test('leaving the plant room during load does not stick the next visit', async ({ page }) => {
  test.setTimeout(20_000)
  await page.addInitScript(() => {
    ;(window as Window & { __YORK_MODEL_TIMEOUT_MS?: number }).__YORK_MODEL_TIMEOUT_MS = 1200
  })
  await page.route('**/models/ymc2.glb', () => new Promise(() => {}))
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/york-chiller/')
  const modelRequest = page.waitForRequest('**/models/ymc2.glb')
  await page.locator('.nav [data-nav="explorer"]').click()
  await modelRequest
  await expect(page.locator('#canvas-boot')).toBeVisible()
  await page.locator('.nav [data-nav="home"]').click()
  await expect(page.locator('#canvas-boot')).toHaveCount(0)
  await page.locator('.nav [data-nav="explorer"]').click()
  await expect(page.locator('#canvas-boot')).toBeVisible()
  await expect(page.locator('#canvas-boot')).toHaveCount(0, { timeout: 8_000 })
  await expect(page.locator('#canvas-status')).toHaveText(SIMPLE_MODEL)
})

test('a disposed scene does not mount the plant model', async ({ page }) => {
  test.setTimeout(20_000)
  const pageErrors: string[] = []
  page.on('pageerror', (err) => pageErrors.push(String(err)))
  await page.addInitScript(() => {
    ;(window as Window & { __YORK_DELAY_MOUNT_MS?: number }).__YORK_DELAY_MOUNT_MS = 2000
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/york-chiller/')
  await page.locator('.nav [data-nav="explorer"]').click()
  await expect(page.locator('#canvas-boot')).toHaveText('The plant model opens.', { timeout: 15_000 })
  await page.locator('.nav [data-nav="home"]').click()
  await expect(page.locator('#chiller-canvas')).toHaveCount(0)
  await page.waitForTimeout(2500)
  const mounts = await page.evaluate(() => {
    const win = window as Window & { __YORK_MOUNT_COUNT?: number }
    return win.__YORK_MOUNT_COUNT ?? 0
  })
  expect(mounts).toBe(0)
  expect(pageErrors).toEqual([])
})

test('a stale scene import timeout does not hide the next visit', async ({ page }) => {
  test.setTimeout(60_000)
  const visitOneMs = 12_000
  await page.addInitScript((ms) => {
    ;(window as Window & { __YORK_SCENE_IMPORT_TIMEOUT_MS?: number }).__YORK_SCENE_IMPORT_TIMEOUT_MS = ms
  }, visitOneMs)
  let releaseChunk = () => {}
  const gate = new Promise<void>((resolve) => {
    releaseChunk = resolve
  })
  await page.route('**/assets/chillerScene-*.js', async (route) => {
    await gate
    await route.continue()
  })
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/york-chiller/')
  const started = performance.now()
  await page.locator('.nav [data-nav="explorer"]').click()
  await expect(page.locator('#canvas-boot')).toHaveText('The plant model starts.')
  await page.locator('.nav [data-nav="home"]').click()
  await expect(page.locator('#canvas-boot')).toHaveCount(0)
  await page.evaluate(() => {
    ;(window as Window & { __YORK_SCENE_IMPORT_TIMEOUT_MS?: number }).__YORK_SCENE_IMPORT_TIMEOUT_MS = 60_000
  })
  await page.locator('.nav [data-nav="explorer"]').click()
  await expect(page.locator('#canvas-boot')).toHaveText('The plant model starts.')
  const returnedAt = performance.now() - started
  expect(returnedAt).toBeLessThan(visitOneMs - 1_500)
  const waitMs = visitOneMs + 1_500 - (performance.now() - started)
  expect(waitMs).toBeGreaterThan(0)
  await page.waitForTimeout(waitMs)
  await expect(page.locator('#canvas-boot')).toHaveText('The plant model starts.')
  await expect(page.locator('#chiller-canvas')).toBeVisible()
  await expect(page.locator('#canvas-status')).not.toHaveText('The 3D view failed.')
  releaseChunk()
  await expect(page.locator('.plant-tag')).toHaveCount(8, { timeout: 20_000 })
  await expect(page.locator('#chiller-canvas')).toBeVisible()
  await expect(page.locator('#canvas-status')).toHaveText(/Low-detail 3D|Turn the model/)
  await expect(page.locator('#canvas-status')).not.toHaveText('The 3D view failed.')
  await expect(page.locator('#canvas-boot')).toHaveCount(0)
})

test('the plant model falls back at the cap hook while percent still moves', async ({ page }) => {
  test.setTimeout(50_000)
  const capMs = 20_000
  await page.addInitScript((ms) => {
    ;(window as Window & { __YORK_MODEL_CAP_MS?: number }).__YORK_MODEL_CAP_MS = ms
  }, capMs)
  const drip = await dripModel(path.resolve('dist/york-chiller/models/ymc2.glb'), 6_500)
  try {
    await page.route('**/models/ymc2.glb', (route) => route.continue({ url: drip.url }))
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/york-chiller/')
    await page.locator('.nav [data-nav="explorer"]').click()
    const boot = page.locator('#canvas-boot')
    const status = page.locator('#canvas-status')
    await expect(boot).toHaveText('The plant model file is at 0 percent.', { timeout: 20_000 })
    const seenZero = performance.now()
    await expect(boot).toHaveText('The plant model file is at 1 percent.', { timeout: 15_000 })
    await expect(status).not.toHaveText(SIMPLE_MODEL)
    await expect(status).toHaveText(SIMPLE_MODEL, { timeout: 30_000 })
    const elapsed = performance.now() - seenZero
    expect(elapsed).toBeGreaterThan(12_000)
    expect(elapsed).toBeLessThan(36_000)
    await expect(page.locator('.plant-tag')).toHaveCount(0)
    await expect(boot).toHaveCount(0)
  } finally {
    drip.close()
  }
})

test('the plant model falls back at the 180 second cap while percent still moves @slow', async ({ page }) => {
  test.slow()
  test.setTimeout(240_000)
  const drip = await dripModel(path.resolve('dist/york-chiller/models/ymc2.glb'), 6_500)
  try {
    await page.route('**/models/ymc2.glb', (route) => route.continue({ url: drip.url }))
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/york-chiller/')
    await page.locator('.nav [data-nav="explorer"]').click()
    const boot = page.locator('#canvas-boot')
    const status = page.locator('#canvas-status')
    await expect(boot).toHaveText('The plant model file is at 0 percent.', { timeout: 30_000 })
    const seenZero = performance.now()
    await expect(boot).toHaveText('The plant model file is at 1 percent.', { timeout: 20_000 })
    await expect(status).not.toHaveText(SIMPLE_MODEL)
    const holdMs = 150_000 - (performance.now() - seenZero)
    expect(holdMs).toBeGreaterThan(120_000)
    await page.waitForTimeout(holdMs)
    await expect(boot).toHaveText(/The plant model file is at \d+ percent\./)
    await expect(status).not.toHaveText(SIMPLE_MODEL)
    await expect(status).toHaveText(SIMPLE_MODEL, { timeout: 60_000 })
    const elapsed = performance.now() - seenZero
    expect(elapsed).toBeGreaterThan(165_000)
    expect(elapsed).toBeLessThan(220_000)
    await expect(page.locator('.plant-tag')).toHaveCount(0)
    await expect(boot).toHaveCount(0)
  } finally {
    drip.close()
  }
})

function dripModel(file: string, bytesPerSec: number) {
  const body = fs.readFileSync(file)
  const server = http.createServer((_req, res) => {
    res.writeHead(200, {
      'Content-Type': 'model/gltf-binary',
      'Content-Length': String(body.length),
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
    })
    writeDrip(res, body, bytesPerSec)
  })
  return new Promise<{ url: string; close: () => void }>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      const port = typeof addr === 'object' && addr ? addr.port : 0
      resolve({ url: `http://127.0.0.1:${port}/ymc2.glb`, close: () => server.close() })
    })
  })
}

function writeDrip(res: http.ServerResponse, body: Buffer, bytesPerSec: number) {
  const chunk = Math.max(1024, Math.floor(bytesPerSec / 4))
  let offset = 0
  const timer = setInterval(() => {
    if (offset >= body.length || res.destroyed) {
      clearInterval(timer)
      if (!res.destroyed) res.end()
      return
    }
    const next = body.subarray(offset, Math.min(body.length, offset + chunk))
    offset += next.length
    res.write(next)
  }, 250)
  res.on('close', () => clearInterval(timer))
}

test('boot overlay fails when the scene chunk stalls', async ({ page }) => {
  test.setTimeout(20_000)
  await page.addInitScript(() => {
    ;(window as Window & { __YORK_SCENE_IMPORT_TIMEOUT_MS?: number }).__YORK_SCENE_IMPORT_TIMEOUT_MS = 1500
  })
  await page.route('**/assets/chillerScene-*.js', () => new Promise(() => {}))
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/york-chiller/')
  await page.locator('.nav [data-nav="explorer"]').click()
  await expect(page.locator('#canvas-boot')).toHaveText('The plant model starts.')
  await expect(page.locator('#canvas-boot')).toHaveText('The 3D view did not start. Use the buttons.', {
    timeout: 8_000,
  })
  await expect(page.locator('#canvas-status')).toHaveText('The 3D view failed.')
  await expect(page.locator('#chiller-canvas')).toBeHidden()
})
