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
    if (entry.why) {
      expect(sentences(entry.why).length, entry.why).toBeGreaterThanOrEqual(1)
      expect(sentences(entry.why).length, entry.why).toBeLessThanOrEqual(2)
    }
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
  expect(glossaryIdsIn('Wet-bulb, then wet bulb, then WET BULB')).toEqual(['wet-bulb'])
  expect(glossaryIdsIn('A peak outdoor wet-bulb day')).toEqual(['wet-bulb'])
  expect(glossaryIdsIn('LCHLT setpoint')).toEqual(['lchlt', 'setpoint'])
  expect(glossaryIdsIn('% FLA')).toEqual(['fla'])
  expect(glossaryIdsIn('%FLA')).toEqual(['fla'])
  expect(glossaryIdsIn('45% FLA')).toEqual(['fla'])
  expect(glossaryIdsIn('low %RLA')).toEqual([])
  expect(glossaryIdsIn('%TSLA')).toEqual([])
  expect(glossaryIdsIn('xFLAx')).toEqual([])
})

test('NOC is clickable and shows its definition', async ({ page }, testInfo) => {
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
  await page.screenshot({ path: testInfo.outputPath('glossary-mobile-390x844.png'), fullPage: false })
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
})

test('wet-bulb, LCHLT, and % FLA open glossary definitions', async ({ page }) => {
  test.setTimeout(60_000)
  await page.goto('/york-chiller/')
  await page.getByRole('button', { name: 'Information about Outdoor temperature' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: 'Show the meaning of Wet-bulb' }).click()
  await expect(dialog.locator('#info-title')).toHaveText('Wet-bulb')
  await expect(dialog).toContainText('saturation')
  await expect(dialog).toContainText('cooling tower')
  await expect(dialog).toContainText('dry cooler follows the dry-bulb')
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()

  await page.locator('#kpi-strip').getByRole('button', { name: 'Show the meaning of LCHLT' }).click()
  await expect(dialog.locator('#info-title')).toHaveText('LCHLT')
  await expect(dialog).toContainText('leaving chilled liquid temperature')
  await expect(dialog).toContainText('55°F')
  await page.keyboard.press('Escape')

  await page.locator('.nav [data-nav="optiview"]').click()
  await page.locator('.gauge[data-info="gauge-rla"]').getByRole('button', { name: 'Show the meaning of % FLA' }).click()
  await expect(dialog.locator('#info-title')).toHaveText('% FLA')
  await expect(dialog).toContainText('percent of full load amps')
  await expect(dialog).toContainText('motor current')
  await expect(dialog).not.toContainText('%RLA')
  await expect(dialog).not.toContainText('TSLA')
  await page.keyboard.press('Escape')

  await page.locator('.nav [data-nav="explorer"]').click()
  const gain = page.locator('#cw-gain').getByRole('button', { name: 'Show the meaning of Wet-bulb' })
  await expect(gain).toBeVisible()
  const before = await page.locator('#cw-gain').innerText()
  await page.locator('#cw-valve').evaluate((el: HTMLInputElement) => {
    document.querySelector<HTMLButtonElement>('#cw-gain button.jargon')?.focus()
    el.value = '30'
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await expect(page.locator('#cw-gain')).not.toHaveText(before)
  const relinked = page.locator('#cw-gain').getByRole('button', { name: 'Show the meaning of Wet-bulb' })
  await expect(relinked).toBeVisible()
  await expect(relinked).toBeFocused()

  await relinked.click()
  await expect(dialog.locator('#info-title')).toHaveText('Wet-bulb')
  await expect(dialog).toContainText('dry-bulb')
  await page.locator('#cw-valve').evaluate((el: HTMLInputElement) => {
    el.value = '90'
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(page.locator('#cw-gain').getByRole('button', { name: 'Show the meaning of Wet-bulb' })).toBeFocused()
})

test('quiz and incident prompts can open glossary before a choice', async ({ page }) => {
  await page.goto('/york-chiller/')
  await page.locator('.nav [data-nav="quiz"]').click()
  const dialog = page.getByRole('dialog')
  let openedQuiz = false
  for (let i = 0; i < 10 && !openedQuiz; i++) {
    const card = page.locator('.quiz-card')
    await expect(card).toBeVisible()
    await expect(card).not.toHaveAttribute('data-info')
    const jargon = card.locator('h3 button.jargon')
    if ((await jargon.count()) > 0) {
      await jargon.first().click()
      await expect(dialog).toBeVisible()
      await expect(dialog.locator('#info-title')).not.toHaveText('')
      await page.keyboard.press('Escape')
      await expect(dialog).toBeHidden()
      await expect(card).not.toHaveAttribute('data-info')
      openedQuiz = true
      break
    }
    await card.locator('.choice').first().click()
    await page.locator('[data-quiz-next]').click()
  }
  expect(openedQuiz).toBe(true)

  await page.locator('.nav [data-nav="trouble"]').click()
  let openedTrouble = false
  for (let i = 0; i < 5 && !openedTrouble; i++) {
    const card = page.locator('.trouble-card')
    await expect(card).toBeVisible()
    await expect(card).not.toHaveAttribute('data-info')
    const jargon = card.locator('li button.jargon')
    if ((await jargon.count()) > 0) {
      await jargon.first().click()
      await expect(dialog).toBeVisible()
      await expect(dialog.locator('#info-title')).not.toHaveText('')
      await page.keyboard.press('Escape')
      await expect(dialog).toBeHidden()
      await expect(card).not.toHaveAttribute('data-info')
      openedTrouble = true
      break
    }
    await page.locator('[data-tr-next]').click()
  }
  expect(openedTrouble).toBe(true)
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
