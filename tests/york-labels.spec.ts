import { expect, test, type Page } from '@playwright/test'

const VIEWPORTS = [
  { width: 1280, height: 800 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
  { width: 360, height: 800 },
]

test('plant tags stay on the canvas and clear of the HUD at the default camera', async ({ page }) => {
  test.setTimeout(90_000)
  await page.goto('/york-chiller/')
  await page.locator('.nav [data-nav="explorer"]').click()
  await expect(page.locator('.plant-tag')).toHaveCount(8, { timeout: 20_000 })
  await expect(page.locator('#canvas-status')).toHaveText(/Low-detail 3D|Turn the model/)

  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport)
    await expect
      .poll(async () => tagPlacementErrors(page), { timeout: 8_000, intervals: [100, 200, 400] })
      .toEqual([])
  }
})

async function tagPlacementErrors(page: Page) {
  return page.evaluate(() => {
    const canvasEl = document.querySelector('#chiller-canvas')
    if (!(canvasEl instanceof HTMLCanvasElement)) return ['missing canvas']
    const canvas = canvasEl.getBoundingClientRect()
    if (canvas.width < 8 || canvas.height < 8) return ['canvas has no size']
    const tags = [...document.querySelectorAll('.plant-tag')]
    if (tags.length !== 8) return [`expected 8 tags, saw ${tags.length}`]
    const hud = [...document.querySelectorAll('.canvas-hud .pill')].flatMap((el) => {
      const rect = el.getBoundingClientRect()
      if (rect.width < 1 || rect.height < 1) return []
      return [{ text: (el.textContent || '').trim(), ...rectBox(rect) }]
    })
    if (hud.length < 2) return [`expected HUD chips, saw ${hud.length}`]
    const slop = 1
    const errors: string[] = []
    const seen: { name: string; left: number; right: number; top: number; bottom: number }[] = []
    for (const el of tags) {
      if (!(el instanceof HTMLElement)) continue
      const name = el.querySelector('.plant-tag-name')?.textContent?.trim() || 'tag'
      const value = el.querySelector('.plant-tag-value')?.textContent?.trim() || ''
      if (!value) errors.push(`${name} has no reading`)
      const anchor = el.closest('.plant-tag-anchor')
      const opacity = anchor instanceof HTMLElement ? Number(getComputedStyle(anchor).opacity) : 1
      if (opacity < 0.9) errors.push(`${name} is hidden`)
      const box = rectBox(el.getBoundingClientRect())
      if (box.right - box.left < 8 || box.bottom - box.top < 8) errors.push(`${name} has no box`)
      if (box.left < canvas.left - slop) errors.push(`${name} past the left edge`)
      if (box.right > canvas.right + slop) errors.push(`${name} past the right edge`)
      if (box.top < canvas.top - slop) errors.push(`${name} past the top edge`)
      if (box.bottom > canvas.bottom + slop) errors.push(`${name} past the bottom edge`)
      for (const chip of hud) {
        const overlapX = Math.min(box.right, chip.right) - Math.max(box.left, chip.left)
        const overlapY = Math.min(box.bottom, chip.bottom) - Math.max(box.top, chip.top)
        if (overlapX > slop && overlapY > slop) errors.push(`${name} overlaps ${chip.text}`)
      }
      seen.push({ name, ...box })
    }
    for (let i = 0; i < seen.length; i++) {
      for (let j = i + 1; j < seen.length; j++) {
        const a = seen[i]
        const b = seen[j]
        const overlapX = Math.min(a.right, b.right) - Math.max(a.left, b.left)
        const overlapY = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
        if (overlapX > slop && overlapY > slop) errors.push(`${a.name} overlaps ${b.name}`)
      }
    }
    return errors

    function rectBox(rect: DOMRect) {
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom }
    }
  })
}
