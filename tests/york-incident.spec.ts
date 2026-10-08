import { expect, test, type Locator, type Page } from '@playwright/test'
import { MATCH_PAIRS, QUIZ, TROUBLE_CASES } from '../york-chiller/src/data/content'
import { shuffleChoices } from '../york-chiller/src/troubleOrder'

const SEED = 11

function rngFrom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0
    return state / 0x100000000
  }
}

/** Same random draws the app uses before each incident is shown: two match shuffles, the quiz shuffle, then each case. */
function seededCases(seed: number) {
  const random = rngFrom(seed)
  shuffleChoices(MATCH_PAIRS, random)
  shuffleChoices(MATCH_PAIRS, random)
  shuffleChoices(QUIZ, random)
  return TROUBLE_CASES.map((item) => shuffleChoices(item.options, random))
}

async function choiceTexts(card: Locator) {
  return card.locator('.choice').allTextContents()
}

async function openIncident(page: Page) {
  await page.locator('.nav [data-nav="trouble"]').click()
}

test('incident clock shuffles, grades the picked choice, and stops after 5 of 5', async ({ page }) => {
  test.setTimeout(60_000)
  const presented = seededCases(SEED)
  const positions = presented.map((options) => options.findIndex((option) => option.correct))
  expect(positions.some((index) => index !== 0)).toBe(true)

  await page.addInitScript((seed) => {
    let state = seed >>> 0
    Math.random = () => {
      state = (Math.imul(1664525, state) + 1013904223) >>> 0
      return state / 0x100000000
    }
  }, SEED)
  await page.goto('/york-chiller/')
  await openIncident(page)

  let xp = (await page.locator('[data-xp]').textContent()) ?? ''
  let gradedOffFirst = false

  for (let index = 0; index < TROUBLE_CASES.length; index += 1) {
    const card = page.locator('.trouble-card')
    const options = presented[index] ?? []
    await expect(card.locator('.choice')).toHaveText(options.map((option) => option.text))
    const correctAt = options.findIndex((option) => option.correct)
    expect(correctAt).toBeGreaterThanOrEqual(0)
    const button = card.locator('.choice').nth(correctAt)
    await button.click()
    await expect(button).toHaveClass(/correct/)
    await expect(card.locator('.feedback')).toContainText(options[correctAt]?.feedback ?? '')
    if (correctAt !== 0) {
      await expect(page.locator('[data-xp]')).not.toHaveText(xp)
      gradedOffFirst = true
    }
    xp = (await page.locator('[data-xp]').textContent()) ?? ''

    if (index === 0) {
      const order = await choiceTexts(card)
      await openIncident(page)
      await expect(page.locator('.trouble-card .choice')).toHaveText(order)
      await expect(page.locator('.feedback')).toBeVisible()
      await expect(page.locator('#incident-timer')).toHaveText('45s')
      await page.locator('.nav [data-nav="home"]').click()
      await openIncident(page)
      await expect(page.locator('.trouble-card .choice')).toHaveText(order)
      await expect(page.locator('.trouble-card .choice.correct')).toHaveCount(1)
    }

    if (index < TROUBLE_CASES.length - 1) await page.locator('[data-tr-next]').click()
  }

  expect(gradedOffFirst).toBe(true)
  await page.locator('[data-tr-next]').click()
  await expect(page.getByRole('heading', { name: 'Gate complete' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Practice again' })).toBeVisible()
  const cleared = (await page.locator('[data-xp]').textContent()) ?? ''

  await page.getByRole('button', { name: 'Practice again' }).click()
  const first = TROUBLE_CASES[0]
  const correct = first?.options.find((option) => option.correct)?.text ?? ''
  await page.getByRole('button', { name: correct, exact: true }).click()
  await expect(page.locator('[data-xp]')).toHaveText(cleared)
  await expect(page.locator('.trouble-card .choice.correct')).toHaveCount(1)
})
