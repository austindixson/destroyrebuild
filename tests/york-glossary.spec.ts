import { expect, test } from '@playwright/test'
import { GLOSSARY } from '../york-chiller/src/data/content'
import { glossaryIdsIn } from '../york-chiller/src/ui/glossary'

function sentences(text: string) {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
}

test('glossary definitions stay short and aliases do not collide', () => {
  const seen = new Map<string, string>()
  for (const [id, entry] of Object.entries(GLOSSARY)) {
    expect(entry.term.length, id).toBeGreaterThan(0)
    expect(entry.aliases.length, id).toBeGreaterThan(0)
    expect(sentences(entry.definition).length, entry.definition).toBeGreaterThanOrEqual(1)
    expect(sentences(entry.definition).length, entry.definition).toBeLessThanOrEqual(2)
    if (entry.why) expect(sentences(entry.why).length, entry.why).toBe(1)
    for (const alias of entry.aliases) {
      const key = alias.toLowerCase()
      expect(seen.has(key), `${key} on ${id} and ${seen.get(key)}`).toBe(false)
      seen.set(key, id)
    }
  }

  expect(glossaryIdsIn('CHWS return beside the CHW header')).toEqual(['chws', 'chw'])
  expect(glossaryIdsIn('CHW only, not the condenser')).toEqual(['chw'])
  expect(glossaryIdsIn('N+1 / 2N')).toEqual(['n-plus-1'])
  expect(glossaryIdsIn('delta T, then ΔT again')).toEqual(['delta-t'])
  expect(glossaryIdsIn('cooling towers, then the tower')).toEqual(['cooling-tower'])
  expect(glossaryIdsIn('setpoints and a setpoint')).toEqual(['setpoint'])
  expect(glossaryIdsIn('CRAHs and one CRAH')).toEqual(['crah'])
  expect(glossaryIdsIn('OptiView™ panel')).toEqual(['optiview'])
  expect(glossaryIdsIn('IT LOAD is 1.2 MW')).toEqual(['it-load', 'mw'])
  expect(glossaryIdsIn('xNOCx')).toEqual([])
  expect(glossaryIdsIn('Tell the NOC.')).toEqual(['noc'])
})

test('NOC is clickable and shows its definition', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/york-chiller/')
  await page.locator('.nav [data-nav="operation"]').click()

  const noc = page.locator('.step').getByRole('button', { name: 'Show the meaning of NOC' }).first()
  await expect(noc).toBeVisible()
  const decoration = await noc.evaluate((el) => {
    const style = getComputedStyle(el)
    return { line: style.textDecorationLine, kind: style.textDecorationStyle, color: style.textDecorationColor }
  })
  expect(decoration.line).toContain('underline')
  expect(decoration.kind).toBe('dotted')
  expect(decoration.color).toBe('rgb(46, 230, 214)')

  await noc.click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(1)
  await expect(dialog.locator('#info-title')).toHaveText('NOC')
  await expect(dialog).toContainText('owns the incident clock')
  await expect(dialog).toContainText('Why this is important')
  await expect(dialog).not.toHaveClass(/sheet/)
  await expect(page.locator('.choice .jargon, button .jargon, .plant-labels .jargon')).toHaveCount(0)

  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(noc).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(dialog).toBeVisible()
  await page.keyboard.press('Escape')

  await page.setViewportSize({ width: 390, height: 844 })
  await noc.click()
  await expect(dialog).toBeVisible()
  await expect(dialog).toHaveClass(/sheet/)
  await expect(dialog.locator('#info-title')).toHaveText('NOC')
  await page.screenshot({ path: '/opt/cursor/artifacts/glossary-mobile-390x844.png', fullPage: false })
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
})

test('quiz choices and inputs are not glossary links', async ({ page }) => {
  await page.goto('/york-chiller/')
  await page.locator('.nav [data-nav="quiz"]').click()
  await expect(page.locator('.choice')).toHaveCount(4)
  await expect(page.locator('.choice .jargon, button .jargon')).toHaveCount(0)
  await expect(page.locator('input .jargon, textarea .jargon, a .jargon')).toHaveCount(0)

  await page.locator('.nav [data-nav="explorer"]').click()
  await expect(page.locator('.plant-labels .jargon, .plant-tag .jargon')).toHaveCount(0)
})
