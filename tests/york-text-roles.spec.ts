import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const INK = {
  title: 'rgb(244, 248, 252)',
  label: 'rgb(168, 189, 208)',
  value: 'rgb(103, 243, 230)',
  body: 'rgb(198, 212, 226)',
  alert: 'rgb(255, 213, 220)',
  prompt: 'rgb(255, 227, 166)',
  chrome: 'rgb(242, 247, 251)',
  jargon: 'rgb(210, 196, 255)',
}

test('text roles stay distinct on the board, a control card, an alert, and a quiz', async ({ page }) => {
  test.setTimeout(90_000)
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/york-chiller/')
  await expect(page.locator('.view-head h2')).toBeVisible()

  const board = await page.evaluate(() => {
    const read = (selector: string) => {
      const el = document.querySelector(selector)
      if (!el) return null
      const style = getComputedStyle(el)
      return {
        color: style.color,
        weight: style.fontWeight,
        family: style.fontFamily,
        transform: style.textTransform,
      }
    }
    return {
      title: read('.view-head h2'),
      cardTitle: read('#plant-controls h3'),
      label: read('.kpi .label'),
      value: read('[data-k="lchlt"]'),
      body: read('.view-head p'),
      controlLabel: read('#plant-controls label'),
      controlValue: read('#it-load-out'),
      readout: read('#capacity-read'),
      chrome: read('#plant-controls .btn'),
    }
  })

  expect(board.title?.color).toBe(INK.title)
  expect(board.cardTitle?.color).toBe(INK.title)
  expect(board.label?.color).toBe(INK.label)
  expect(board.label?.transform).toBe('uppercase')
  expect(board.value?.color).toBe(INK.value)
  expect(board.value?.family.toLowerCase()).toContain('mono')
  expect(board.body?.color).toBe(INK.body)
  expect(Number(board.title?.weight)).toBeGreaterThan(Number(board.body?.weight))
  expect(board.controlLabel?.color).toBe(INK.label)
  expect(board.controlLabel?.transform).toBe('uppercase')
  expect(board.controlValue?.color).toBe(INK.value)
  expect(board.readout?.color).toBe(INK.value)
  expect(board.chrome?.color).toBe(INK.chrome)
  expect(board.title?.color).not.toBe(board.label?.color)
  expect(board.label?.color).not.toBe(board.value?.color)
  expect(board.value?.color).not.toBe(board.body?.color)
  expect(board.body?.color).not.toBe(board.chrome?.color)

  const outdoor = page.locator('[data-k="cwet"]')
  await page.locator('[data-oat="100"]').click()
  await expect(outdoor).toHaveText('100°F')

  await page.locator('[data-incident="high-head"]').click()
  const banner = page.locator('#alarm-banner.show')
  await expect(banner).toBeVisible()
  await expect(banner).toHaveCSS('color', INK.alert)

  await page.locator('[data-ch-safety="CH-01"]').click()
  const confirm = page.locator('#confirm-copy')
  await expect(confirm).toBeVisible()
  await expect(confirm).toHaveCSS('color', INK.alert)
  await expect(confirm).not.toHaveText('')
  await page.locator('#confirm-no').click()
  await expect(page.locator('#confirm-card')).toBeHidden()

  const jargon = page.locator('.nav-note button.jargon').first()
  await expect(jargon).toBeVisible()
  const decoration = await jargon.evaluate((el) => {
    const style = getComputedStyle(el)
    return { color: style.color, line: style.textDecorationLine, kind: style.textDecorationStyle, ink: style.textDecorationColor }
  })
  expect(decoration.color).toBe(INK.jargon)
  expect(decoration.line).toContain('underline')
  expect(decoration.kind).toBe('dotted')
  expect(decoration.ink).toBe('rgb(46, 230, 214)')

  await page.locator('.nav [data-nav="quiz"]').click()
  await expect(page.locator('.quiz-card h3')).toBeVisible()
  const quiz = await page.evaluate(() => {
    const prompt = getComputedStyle(document.querySelector('.quiz-card h3')!)
    const choice = getComputedStyle(document.querySelector('.choice')!)
    return {
      prompt: prompt.color,
      choice: choice.color,
      promptWeight: Number(prompt.fontWeight),
      choiceWeight: Number(choice.fontWeight),
      promptSize: Number.parseFloat(prompt.fontSize),
      choiceSize: Number.parseFloat(choice.fontSize),
    }
  })
  expect(quiz.prompt).toBe(INK.prompt)
  expect(quiz.choice).toBe(INK.body)
  expect(quiz.promptWeight).toBeGreaterThan(quiz.choiceWeight)
  expect(quiz.promptSize).toBeGreaterThan(quiz.choiceSize)

  await page.locator('.nav [data-nav="trouble"]').click()
  await expect(page.locator('.trouble-card h3.york-prompt')).toBeVisible()
  await expect(page.locator('.trouble-card .choice').first()).toBeVisible()
  await expect(page.locator('.alarm-banner.show')).toHaveCSS('color', INK.alert)
  await expect(page.locator('.trouble-card h3.york-prompt')).toHaveCSS('color', INK.prompt)
  await expect(page.locator('.trouble-card .choice').first()).toHaveCSS('color', INK.body)
  await expect.poll(() => page.locator('.main').evaluate((el) => getComputedStyle(el).opacity)).toBe('1')

  const axe = await new AxeBuilder({ page })
    .include('.view-head')
    .include('.kpi-strip')
    .include('.alarm-banner')
    .include('.trouble-card')
    .withRules(['color-contrast'])
    .analyze()
  expect(axe.violations).toEqual([])

  await page.locator('.nav [data-nav="explorer"]').click()
  await expect(page.locator('.plant-tag')).toHaveCount(8, { timeout: 20_000 })
  await expect(page.locator('.plant-tag-name').first()).toHaveCSS('color', INK.label)
  await expect(page.locator('.plant-tag-value').first()).toHaveCSS('color', INK.value)
  await expect(page.locator('.plant-tag-value').first()).not.toHaveText('')
  await expect(page.locator('.pipe-card h3').first()).toHaveCSS('color', INK.title)
  await expect(page.locator('.pt-row span').first()).toHaveCSS('color', INK.label)
  await expect(page.locator('.pt-row span').first()).toHaveCSS('text-transform', 'uppercase')
  await expect(page.locator('.pt-row b').first()).toHaveCSS('color', INK.value)
})
