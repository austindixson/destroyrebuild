import { expect, test, type Locator, type Page } from '@playwright/test'

function valveYaw(pct: number) {
  return ((pct / 100) * Math.PI * 3).toFixed(4)
}

async function openExplorer(page: Page) {
  await page.goto('/york-chiller/')
  await page.locator('.nav [data-nav="explorer"]').click()
  await expect(page.locator('#canvas-status')).toHaveText(/Low-detail 3D|Turn the model|simple plant model/, {
    timeout: 20_000,
  })
}

async function setRange(slider: Locator, value: string) {
  await slider.evaluate((el, next) => {
    if (!(el instanceof HTMLInputElement)) return
    el.value = next
    el.dispatchEvent(new Event('input', { bubbles: true }))
  }, value)
}

test('valve wheels follow an outdoor change with the 3D view open', async ({ page }) => {
  test.setTimeout(60_000)
  await openExplorer(page)
  const canvas = page.locator('#chiller-canvas')
  await expect(canvas).toHaveAttribute('data-valve-chw', valveYaw(72), { timeout: 20_000 })
  await expect(canvas).toHaveAttribute('data-valve-cw', valveYaw(78))
  await expect(canvas).toHaveAttribute('data-valve-gly', valveYaw(70))

  await setRange(page.locator('#oat'), '100')
  await expect(page.locator('#chw-valve-out')).toHaveText('77%')
  await expect(page.locator('#cw-valve-out')).toHaveText('90%')
  await expect(page.locator('#gly-valve-out')).toHaveText('25%')
  await expect(canvas).toHaveAttribute('data-valve-chw', valveYaw(77))
  await expect(canvas).toHaveAttribute('data-valve-cw', valveYaw(90))
  await expect(canvas).toHaveAttribute('data-valve-gly', valveYaw(25))

  await page.locator('.nav [data-nav="home"]').click()
  await page.locator('.nav [data-nav="explorer"]').click()
  await expect(page.locator('#chiller-canvas')).toHaveAttribute('data-valve-chw', valveYaw(77), { timeout: 20_000 })
  await expect(page.locator('#chiller-canvas')).toHaveAttribute('data-valve-cw', valveYaw(90))
  await expect(page.locator('#chiller-canvas')).toHaveAttribute('data-valve-gly', valveYaw(25))
})

test('a balance valve dragged into red shows one alert until it leaves', async ({ page }) => {
  test.setTimeout(60_000)
  await openExplorer(page)
  const alert = page.locator('#valve-alert')
  await expect(alert).toBeHidden()

  const slider = page.locator('#chw-valve')
  await setRange(slider, '40')
  await expect(alert).toBeVisible()
  await expect(alert).toContainText('hall supply temperature rises')
  await expect(alert).toContainText('too far closed')
  await expect(alert).toContainText('below the trainer limit of 12 psi')
  const dialog = page.getByRole('dialog')
  await alert.getByRole('button', { name: 'Show the meaning of CHW' }).click()
  await expect(dialog.locator('#info-title')).toHaveText('CHW')
  await expect(dialog).toContainText('chilled water')
  await page.keyboard.press('Escape')
  await expect(alert).toBeVisible()

  await setRange(slider, '30')
  await setRange(slider, '20')
  await expect(alert).toHaveCount(1)
  await expect(alert).toContainText('hall supply temperature rises')

  await page.locator('#valve-alert-dismiss').click()
  await expect(alert).toBeHidden()
  await setRange(slider, '15')
  await expect(alert).toBeHidden()

  await setRange(slider, '72')
  await expect(alert).toBeHidden()
  await setRange(slider, '25')
  await expect(alert).toBeVisible()
  await expect(alert).toContainText('CRAHs do not get enough flow')
})

const HALL_HOT_NOTE = 'The hall-hot fault holds the CHW ΔP at 9.5 psi.'

test('hall-hot prints 9.5 psi in red and the note does not ask for a valve move', async ({ page }) => {
  test.setTimeout(60_000)
  await page.goto('/york-chiller/')
  await page.locator('#view button[data-incident="hall-hot"]').click()
  await page.locator('.nav [data-nav="explorer"]').click()
  const read = page.locator('#chw-dp-read')
  const note = page.locator('#pipe-note')
  await expect(page.locator('#chw-valve-out')).toHaveText('72%')
  await expect(read).toContainText('ΔP 9.5 psi')
  await expect(read).toHaveClass(/bad/)
  await expect(page.locator('#pt-chw-enter-p')).toHaveText('52.0 psi')
  await expect(page.locator('#pt-chw-leave-p')).toHaveText('42.5 psi')
  await expect(note).toContainText(HALL_HOT_NOTE)
  await expect(note).not.toContainText('Open the CHW valve')
  await expect(note).not.toContainText('Examine the CHW pumps')

  await setRange(page.locator('#chw-valve'), '100')
  await expect(page.locator('#chw-valve-out')).toHaveText('100%')
  await expect(read).toContainText('ΔP 9.5 psi')
  await expect(read).toHaveClass(/bad/)
  await expect(page.locator('#pt-chw-enter-p')).toHaveText('52.0 psi')
  await expect(page.locator('#pt-chw-leave-p')).toHaveText('42.5 psi')
  await expect(note).toContainText(HALL_HOT_NOTE)
  await expect(note).not.toContainText('Open the CHW valve')
  await expect(note).not.toContainText('Examine the CHW pumps')
})

test('CHW at 41% prints 12.0 psi and does not raise the low banner', async ({ page }) => {
  test.setTimeout(60_000)
  await openExplorer(page)
  await setRange(page.locator('#chw-valve'), '41')
  const read = page.locator('#chw-dp-read')
  await expect(read).toContainText('ΔP 12.0 psi')
  await expect(read).not.toHaveClass(/bad/)
  await expect(page.locator('#pipe-note')).not.toContainText('The CHW ΔP is low')
  await page.locator('.nav [data-nav="home"]').click()
  await expect(page.locator('#alarm-banner')).not.toContainText('The CHW ΔP is low')
})

test('the first CHW opening that prints below 12.0 psi is red on the board and the banner', async ({ page }) => {
  test.setTimeout(60_000)
  await openExplorer(page)
  await setRange(page.locator('#chw-valve'), '40')
  const read = page.locator('#chw-dp-read')
  await expect(read).toContainText('ΔP 11.8 psi')
  await expect(read).toHaveClass(/bad/)
  await expect(page.locator('#pipe-note')).toContainText('The CHW ΔP is low. Open the CHW valve before the hall gets hot.')
  await page.locator('.nav [data-nav="home"]').click()
  await expect(page.locator('#alarm-banner')).toContainText('The CHW ΔP is low')
})

test('a CW valve at 44% prints 8.0 psi and does not alert below 8', async ({ page }) => {
  test.setTimeout(60_000)
  await openExplorer(page)
  await setRange(page.locator('#cw-valve'), '44')
  const read = page.locator('#cw-dp-read')
  await expect(read).toContainText('ΔP 8.0 psi')
  await expect(read).not.toHaveClass(/bad/)
  await expect(page.locator('#valve-alert')).toBeHidden()
})
