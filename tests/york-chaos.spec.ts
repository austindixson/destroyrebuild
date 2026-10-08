import { expect, test, type Locator, type Page } from '@playwright/test'

const FAULTS = [
  'Peak weather, high head',
  'Hot hall, low chiller load',
  'ATS landing',
  'Lead trip and failover',
] as const

function chaosButton(page: Page, name: string): Locator {
  return page.locator(`#view button[data-incident]`).filter({ hasText: name })
}

test('inject chaos shows the active fault and the clear state', async ({ page }) => {
  await page.goto('/york-chiller/')
  const status = page.locator('#chaos-status')
  const clear = chaosButton(page, 'Clear the incident')

  await expect(status).toHaveText('No fault is active.')
  await expect(clear).toHaveAttribute('aria-pressed', 'true')
  await expect(clear).toHaveClass(/on/)
  for (const name of FAULTS) {
    const button = chaosButton(page, name)
    await expect(button).toHaveAttribute('aria-pressed', 'false')
    await expect(button).not.toHaveClass(/\bon\b/)
  }

  const peak = chaosButton(page, 'Peak weather, high head')
  await peak.click()
  await expect(status).toHaveText('Active fault: Peak weather, high head.')
  await expect(peak).toHaveAttribute('aria-pressed', 'true')
  await expect(peak).toHaveClass(/\bon\b/)
  await expect(peak.locator('.chaos-flag')).toHaveText('On')
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
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(info).toBeFocused()

  await clear.click()
  await expect(status).toHaveText('No fault is active.')
  await expect(clear).toHaveAttribute('aria-pressed', 'true')
  await expect(peak).toHaveAttribute('aria-pressed', 'false')
  await expect(page.locator('#alarm-banner')).not.toHaveClass(/show/)

  await chaosButton(page, 'Hot hall, low chiller load').click()
  await expect(status).toHaveText('Active fault: Hot hall, low chiller load.')
  await page.locator('.nav [data-nav="trouble"]').click()
  await expect(page.locator('h2')).toHaveText('Incident clock')
  await page.locator('.nav [data-nav="home"]').click()
  await expect(page.locator('h2')).toHaveText('Central plant, live board')
  await expect(status).toHaveText('Active fault: Peak weather, high head.')
  await expect(chaosButton(page, 'Peak weather, high head')).toHaveAttribute('aria-pressed', 'true')
  await expect(chaosButton(page, 'Hot hall, low chiller load')).toHaveAttribute('aria-pressed', 'false')
  await expect(clear).toHaveAttribute('aria-pressed', 'false')
})
