import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Locator, type Page } from '@playwright/test'

const FAULTS = [
  'Peak weather, high head',
  'Hot hall, low chiller load',
  'ATS landing',
  'Lead trip and failover',
] as const

function chaosButton(page: Page, name: string): Locator {
  return page.locator('#view button[data-incident]').filter({ hasText: name })
}

test('inject chaos shows the active fault and the clear state', async ({ page }) => {
  await page.goto('/york-chiller/')
  const status = page.locator('#chaos-status')
  const clear = chaosButton(page, 'Clear the incident')
  const peak = page.locator('#view button[data-incident="high-head"]')

  await expect(status).toHaveText('No fault is active.')
  await expect(clear).toHaveAttribute('aria-pressed', 'true')
  await expect(clear).toHaveClass(/on/)
  for (const name of FAULTS) {
    const button = chaosButton(page, name)
    await expect(button).toHaveAttribute('aria-pressed', 'false')
    await expect(button).not.toHaveClass(/\bon\b/)
  }

  await peak.focus()
  await peak.evaluate((el) => {
    el.dataset.sameNode = 'yes'
  })
  await page.keyboard.press('Enter')
  await expect(peak).toBeFocused()
  await expect(peak).toHaveAttribute('data-same-node', 'yes')
  await expect(peak).toHaveAttribute('aria-pressed', 'true')
  await expect(peak).toHaveClass(/\bon\b/)
  await expect(peak.locator('.chaos-flag')).toHaveText('On')
  await expect(status).toHaveText('Active fault: Peak weather, high head.')
  await expect(clear).toHaveAttribute('aria-pressed', 'false')
  await expect(page.locator('#alarm-banner')).toContainText('High condenser pressure')
  for (const name of FAULTS.slice(1)) {
    await expect(chaosButton(page, name)).toHaveAttribute('aria-pressed', 'false')
  }

  const info = page.getByRole('button', { name: 'Information about Peak weather high head' })
  await info.click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog.locator('#info-title')).toHaveText('Peak weather high head')
  await expect(peak).toHaveAttribute('aria-pressed', 'true')
  await expect(peak).toHaveAttribute('data-same-node', 'yes')
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(info).toBeFocused()

  await peak.focus()
  await page.keyboard.press('Enter')
  await expect(peak).toBeFocused()
  await expect(peak).toHaveAttribute('data-same-node', 'yes')
  await expect(peak).toHaveAttribute('aria-pressed', 'false')
  await expect(status).toHaveText('No fault is active.')
  await expect(clear).toHaveAttribute('aria-pressed', 'true')

  await peak.click()
  await clear.click()
  await expect(status).toHaveText('No fault is active.')
  await expect(clear).toHaveAttribute('aria-pressed', 'true')
  await expect(peak).toHaveAttribute('aria-pressed', 'false')
  await expect(peak).toHaveAttribute('data-same-node', 'yes')
  await expect(page.locator('#alarm-banner')).not.toHaveClass(/show/)

  const landing = page.locator('#view button[data-incident="landing"]')
  await landing.click()
  await expect(page.locator('[data-k="ch1"]')).toHaveText('0%')
  await peak.click()
  const rla = Number((await page.locator('[data-k="ch1"]').innerText()).replace('%', ''))
  expect(rla).toBeGreaterThan(40)
  await expect(status).toHaveText('Active fault: Peak weather, high head.')
  await expect(landing).toHaveAttribute('aria-pressed', 'false')

  await chaosButton(page, 'Hot hall, low chiller load').click()
  await expect(status).toHaveText('Active fault: Hot hall, low chiller load.')
  await page.locator('.nav [data-nav="trouble"]').click()
  await expect(page.locator('h2')).toHaveText('Incident clock')
  await expect(page.locator('.trouble-card h3')).toHaveText('Hot hall and unloaded chiller')
  await page.locator('[data-tr-next]').click()
  await page.locator('[data-tr-next]').click()
  await expect(page.locator('.trouble-card h3')).toHaveText('The BMS and OptiView disagree on the setpoint')
  await page.locator('.nav [data-nav="home"]').click()
  await expect(page.locator('h2')).toHaveText('Central plant, live board')
  await expect(status).toHaveText('No fault is active.')
  await expect(clear).toHaveAttribute('aria-pressed', 'true')
  await expect(chaosButton(page, 'Hot hall, low chiller load')).toHaveAttribute('aria-pressed', 'false')
})

test('rose On mark contrast passes at desktop and phone', async ({ page }) => {
  await page.goto('/york-chiller/')
  const landing = page.locator('#view button[data-incident="landing"]')
  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport)
    if ((await landing.getAttribute('aria-pressed')) !== 'true') await landing.click()
    await expect(landing).toHaveAttribute('aria-pressed', 'true')
    const ratio = await landing.locator('.chaos-flag').evaluate((flag) => {
      const parse = (value: string) => value.match(/[\d.]+/g)?.map(Number) ?? []
      const lum = (channels: number[]) => {
        const linear = channels.slice(0, 3).map((channel) => {
          const s = channel / 255
          return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
        })
        return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]
      }
      const button = flag.closest('button')
      if (!button) return 0
      const flagStyle = getComputedStyle(flag)
      const text = parse(flagStyle.color)
      const chip = parse(flagStyle.backgroundColor)
      const base = parse(getComputedStyle(button).backgroundColor)
      const alpha = chip[3] ?? 1
      const bg = [0, 1, 2].map((i) => chip[i] * alpha + base[i] * (1 - alpha))
      const lighter = Math.max(lum(text), lum(bg))
      const darker = Math.min(lum(text), lum(bg))
      return (lighter + 0.05) / (darker + 0.05)
    })
    expect(ratio).toBeGreaterThan(7)
    const axe = await new AxeBuilder({ page }).include('.btn.rose.on .chaos-flag').withRules(['color-contrast']).analyze()
    expect(axe.violations).toEqual([])
  }
})
