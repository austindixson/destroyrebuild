import { expect, test, type Page } from '@playwright/test'
import { INFO } from '../york-chiller/src/data/content'

const CARD_SEL =
  '.kpi, .card, .pipe-card, .gauge, .step, .quiz-card, .trouble-card, .mission, .mimic-node, .plant-node, .match-tile, .maint-item, .detail-pane, .weather-seg'

async function assertCovered(page: Page) {
  const problems = await page.evaluate((cardSel) => {
    const found: string[] = []
    document.querySelectorAll(cardSel).forEach((el) => {
      const host = el.classList.contains('info-host')
        ? el
        : el.parentElement?.classList.contains('info-host')
          ? el.parentElement
          : null
      const button = host?.querySelector(':scope > .info-btn')
      const id = host instanceof HTMLElement ? host.dataset.info : ''
      if (!button) found.push(`missing button: ${el.className}`)
      else if (!id) found.push(`missing id: ${el.className}`)
    })
    document.querySelectorAll('input[type="range"]').forEach((input) => {
      const label = input.closest('label')
      const button = label?.querySelector(':scope > .info-btn')
      if (!label?.classList.contains('info-host') || !button) found.push(`slider ${input.id || 'range'}`)
    })
    return {
      found,
      ids: [...document.querySelectorAll('[data-info]')].map((el) => (el as HTMLElement).dataset.info ?? ''),
    }
  }, CARD_SEL)
  expect(problems.found, problems.found.join('\n')).toEqual([])
  for (const id of problems.ids) expect(id in INFO, id).toBe(true)
  return problems.ids
}

async function openView(page: Page, id: string) {
  await page.locator(`.nav [data-nav="${id}"]`).click()
}

test('every card and slider has an info button, and one opens and closes', async ({ page }) => {
  test.setTimeout(90_000)
  for (const [id, entry] of Object.entries(INFO)) {
    expect(entry.points.length, id).toBeGreaterThanOrEqual(3)
    expect(entry.points.length, id).toBeLessThanOrEqual(5)
    expect(entry.title.length, id).toBeGreaterThan(0)
  }

  await page.goto('/york-chiller/')
  const seen = new Set<string>()
  const take = async () => {
    for (const id of await assertCovered(page)) seen.add(id)
  }

  await take()
  const learn = page.getByRole('button', { name: 'Information about Hall supply' })
  const dialog = page.getByRole('dialog')
  await learn.click()
  await expect(dialog).toBeVisible()
  await expect(dialog.locator('#info-title')).toHaveText('Hall supply')
  await expect(dialog.locator('.info-now')).toContainText('°F')
  await expect(dialog.locator('.info-foot')).toContainText('This text is not a site procedure or a replacement for approved service.')
  await expect(dialog).not.toHaveClass(/sheet/)
  const close = dialog.getByRole('button', { name: 'Close' })
  await expect(close).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(close).not.toBeFocused()
  await page.keyboard.press('Tab')
  await expect(close).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(learn).toBeFocused()

  const lchlt = page.getByRole('button', { name: 'Information about LCHLT' })
  await lchlt.click()
  await expect(dialog.locator('#info-title')).toHaveText('LCHLT')
  await expect(learn).toHaveAttribute('aria-expanded', 'false')
  await expect(lchlt).toHaveAttribute('aria-expanded', 'true')
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(lchlt).toBeFocused()

  await learn.click()
  await dialog.getByRole('button', { name: 'Close' }).click()
  await expect(dialog).toBeHidden()
  await expect(learn).toBeFocused()

  await learn.click()
  await page.locator('.info-backdrop').click({ position: { x: 8, y: 8 } })
  await expect(dialog).toBeHidden()

  await openView(page, 'plant')
  await take()

  await openView(page, 'explorer')
  await take()
  for (const hotspot of await page.locator('#hotspot-rail [data-focus]').all()) {
    await hotspot.click()
    await take()
  }

  await openView(page, 'cycle')
  await take()
  for (let i = 0; i < 3; i++) {
    await page.getByRole('button', { name: /Next stage|Finish the loop/ }).click()
    await take()
  }

  await openView(page, 'operation')
  await take()
  await page.getByRole('button', { name: 'Stop steps', exact: true }).click()
  await take()

  await openView(page, 'optiview')
  await take()
  await page.locator('[data-otab="mbc"]').click()
  await take()

  await openView(page, 'match')
  await take()

  await openView(page, 'quiz')
  for (let i = 0; i < 12; i++) {
    await take()
    if (await page.locator('[data-quiz-restart]').count()) break
    await page.locator('[data-choice]').first().click()
    await page.locator('[data-quiz-next]').click()
  }

  await openView(page, 'trouble')
  for (let i = 0; i < 5; i++) {
    await take()
    if (i < 4) await page.locator('[data-tr-next]').click()
  }

  await openView(page, 'maintenance')
  await take()

  const missing = Object.keys(INFO).filter((id) => !seen.has(id))
  expect(missing, `unseen info ids: ${missing.join(', ')}`).toEqual([])
})

test('info panel is a bottom sheet on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/york-chiller/')
  const learn = page.getByRole('button', { name: 'Information about Hall supply' })
  const box = await learn.boundingBox()
  expect(box?.width).toBeGreaterThanOrEqual(44)
  expect(box?.height).toBeGreaterThanOrEqual(44)
  await learn.click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog).toHaveClass(/sheet/)
  await expect(dialog.locator('.info-now')).toContainText('°F')
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
})
