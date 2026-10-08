import { expect, test } from '@playwright/test'
import { plantModelProgressText } from '../york-chiller/src/3d/chillerScene'

const SIMPLE_MODEL = 'The view shows the simple plant model.'

test('plant model progress text names the percent or the bytes', () => {
  expect(plantModelProgressText(0, 0)).toBe('The plant model starts.')
  expect(plantModelProgressText(42, 100)).toBe('The plant model file is at 42 percent.')
  expect(plantModelProgressText(150, 100)).toBe('The plant model file is at 100 percent.')
  expect(plantModelProgressText(Number.NaN, 100)).toBe('The plant model starts.')
  expect(plantModelProgressText(4096, 0)).toBe('Received 4096 bytes.')
})

test('boot overlay shows download percent, then the full plant model', async ({ page }) => {
  test.setTimeout(45_000)
  await page.setViewportSize({ width: 390, height: 844 })
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
  await expect(page.locator('#canvas-boot')).toHaveText(/The plant model file is at \d+ percent\./, {
    timeout: 12_000,
  })
  await expect(page.locator('#canvas-boot')).toHaveCount(0, { timeout: 30_000 })
  await expect(page.locator('.plant-tag')).toHaveCount(8, { timeout: 20_000 })
  await expect(page.locator('#canvas-status')).toHaveText('Low-detail 3D')
  await expect(page.locator('#canvas-status')).not.toHaveText(SIMPLE_MODEL)
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
