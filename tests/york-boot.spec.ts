import { expect, test } from '@playwright/test'
import { plantModelLoadText } from '../york-chiller/src/3d/chillerScene'

test('plant model progress text names the percent', () => {
  expect(plantModelLoadText(0, 0)).toBe('The plant model loads.')
  expect(plantModelLoadText(42, 100)).toBe('The plant model loads. 42 percent.')
  expect(plantModelLoadText(150, 100)).toBe('The plant model loads. 100 percent.')
  expect(plantModelLoadText(Number.NaN, 100)).toBe('The plant model loads.')
})

test('boot overlay shows download percent, then clears', async ({ page }) => {
  test.setTimeout(45_000)
  await page.setViewportSize({ width: 390, height: 844 })
  const client = await page.context().newCDPSession(page)
  await client.send('Network.enable')
  await client.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 40,
    downloadThroughput: 350_000,
    uploadThroughput: 350_000,
  })
  await page.goto('/york-chiller/')
  await page.locator('.nav [data-nav="explorer"]').click()
  await expect(page.locator('#canvas-boot')).toHaveText('The plant model starts.')
  await expect(page.locator('#canvas-boot')).toHaveText(/The plant model loads\. \d+ percent\./, { timeout: 12_000 })
  await expect(page.locator('#canvas-boot')).toHaveCount(0, { timeout: 30_000 })
  await expect(page.locator('#canvas-status')).toHaveText(/Low-detail 3D|Turn the model/)
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
  await expect(page.locator('#canvas-status')).toHaveText(/Low-detail 3D|Turn the model/)
})

test('boot overlay clears when the plant model file fails', async ({ page }) => {
  await page.route('**/models/ymc2.glb', (route) => route.abort('failed'))
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/york-chiller/')
  await page.locator('.nav [data-nav="explorer"]').click()
  await expect(page.locator('#canvas-boot')).toHaveCount(0, { timeout: 8_000 })
  await expect(page.locator('#canvas-status')).toHaveText(/Low-detail 3D|Turn the model/)
  await expect(page.locator('#canvas-boot')).toHaveCount(0)
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
  await expect(page.locator('#canvas-status')).toHaveText(/Low-detail 3D|Turn the model/)
})
