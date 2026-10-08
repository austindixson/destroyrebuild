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

const STATUS = {
  mint: 'rgb(61, 255, 168)',
  amber: 'rgb(255, 176, 32)',
  rose: 'rgb(255, 93, 122)',
  value: 'rgb(103, 243, 230)',
  jargon: 'rgb(210, 196, 255)',
}

test('status color beats role ink on KPIs, pipe delta P, and chaos status', async ({ page }) => {
  test.setTimeout(90_000)
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/york-chiller/')
  await expect(page.locator('#chaos-status')).toHaveText('No fault is active.')
  await expect(page.locator('#chaos-status')).toHaveCSS('color', STATUS.mint)
  await expect(page.locator('#chaos-status')).not.toHaveCSS('color', STATUS.value)

  const okValue = page.locator('.kpi.ok .val').first()
  await expect(okValue).toBeVisible()
  await expect(okValue).toHaveCSS('color', STATUS.mint)
  const okJargon = okValue.locator('button.jargon')
  if ((await okJargon.count()) > 0) await expect(okJargon.first()).toHaveCSS('color', STATUS.mint)

  await page.locator('[data-incident="high-head"]').click()
  const fault = page.locator('#chaos-status')
  await expect(fault).toHaveClass(/is-fault/)
  await expect(fault).toHaveCSS('color', STATUS.amber)
  await expect(fault).not.toHaveCSS('color', STATUS.value)

  const head = page.locator('[data-k="head"]')
  await expect(head.locator('xpath=..')).toHaveClass(/warn|bad/)
  let headColor = ''
  await expect
    .poll(async () => (headColor = await head.evaluate((el) => (el.isConnected ? getComputedStyle(el).color : ''))))
    .toMatch(/^rgb\(255, (176, 32|93, 122)\)$/)
  expect([STATUS.amber, STATUS.rose]).toContain(headColor)
  expect(headColor).not.toBe(STATUS.value)
  const headTerm = head.locator('button.jargon')
  await expect(headTerm).toHaveCount(1)
  await expect(headTerm).toHaveCSS('color', headColor)
  await expect(headTerm).not.toHaveCSS('color', STATUS.jargon)

  await page.locator('.nav [data-nav="explorer"]').click()
  const chw = page.locator('#chw-dp-read')
  await expect(chw).toContainText(/ΔP \d/)
  await expect(chw).not.toHaveClass(/bad/)
  await expect(chw).toHaveCSS('color', STATUS.mint)
  await expect(chw).not.toHaveCSS('color', STATUS.value)

  await page.locator('.nav [data-nav="home"]').click()
  await page.locator('[data-incident="hall-hot"]').click()
  await page.locator('.nav [data-nav="explorer"]').click()
  await expect(chw).toContainText(/ΔP \d/)
  await expect(chw).toHaveClass(/bad/)
  await expect(chw).toHaveCSS('color', STATUS.rose)
  await expect(chw).not.toHaveCSS('color', STATUS.value)
  await expect(chw).not.toHaveCSS('color', STATUS.mint)
})

test('active cycle step sits on the solid disc in title ink', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/york-chiller/')
  await page.locator('.nav [data-nav="cycle"]').click()
  const step = page.locator('.cycle-svg .node.active .sub')
  await expect(step).toHaveText('01')
  await expect(step).toHaveCSS('fill', INK.title)
  await expect(page.locator('.cycle-svg .node.active circle')).toHaveCSS('fill', 'rgb(22, 72, 82)')
  await expect(step).not.toHaveCSS('fill', INK.label)
})
