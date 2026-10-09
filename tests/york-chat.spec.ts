import { expect, test } from '@playwright/test'

test('trainer chat opens, answers, and confirms a stop', async ({ page }) => {
  const posts: Array<Record<string, unknown>> = []
  await page.route('**/api/york/chat', async (route) => {
    const body = JSON.parse(route.request().postData() || '{}') as Record<string, unknown>
    posts.push(body)
    const results = body.toolResults as unknown[] | undefined
    if (Array.isArray(results) && results.length > 0) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'answer',
          answer: 'The soft stop is complete. Live numbers are trainer-model values.',
          sources: [],
          provider: 'mock',
          model: 'mock',
        }),
      })
      return
    }
    const question = String(body.question ?? '')
    if (question.includes('Stop')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'confirm',
          confirm: { name: 'chiller.stop', args: { unit: 'CH-01', mode: 'soft' } },
          round: 1,
        }),
      })
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'answer',
        answer: 'The hall supply follows the chilled water. Live numbers are trainer-model values.',
        sources: [{ id: 'trainer:info:kpi-hall', title: 'Hall supply', href: '/york-chiller/#trainer:info:kpi-hall' }],
        provider: 'mock',
        model: 'mock',
      }),
    })
  })

  await page.goto('/york-chiller/')
  await page.getByRole('button', { name: 'Ask the trainer' }).click()
  await expect(page.locator('[data-chat-panel]')).toBeVisible()
  await page.locator('[data-chat-input]').fill('Why is the hall supply high?')
  await page.locator('[data-chat-send]').click()
  await expect(page.locator('[data-chat-answer]').last()).toContainText('hall supply follows the chilled water')
  await expect(page.locator('[data-chat-sources] a')).toHaveAttribute('href', '/york-chiller/#trainer:info:kpi-hall')

  const first = posts[0]
  const snapshot = first?.snapshot as { view?: string; plant?: { hallSupplyF?: number; ch01?: { rla?: number } }; shown?: Record<string, string>; units?: unknown[] }
  expect(snapshot.view).toBe('home')
  expect(typeof snapshot.plant?.hallSupplyF).toBe('number')
  expect(typeof snapshot.plant?.ch01?.rla).toBe('number')
  expect(snapshot.shown?.['kpi.hallSupply']).toContain('°F')
  expect(snapshot.shown?.['kpi.ch01Fla']).toContain('%')
  expect(snapshot.shown?.['mimic.ch01']).toContain('% FLA')
  expect(Array.isArray(snapshot.units)).toBe(true)
  expect(first?.previousQuestions).toEqual([])

  await page.locator('[data-chat-input]').fill('Stop CH-01')
  await page.locator('[data-chat-send]').click()
  const card = page.locator('[data-chat-confirm]')
  await expect(card).toBeVisible()
  await expect(card).toContainText('Do a soft stop on CH-01?')
  await page.locator('[data-chat-confirm-yes]').click()
  await expect(page.locator('[data-chat-answer]').last()).toContainText('soft stop is complete')
  await expect(page.locator('[data-unit="CH-01"] [data-unit-state]')).toHaveText('Standby')
  expect(posts[1]?.previousQuestions).toEqual(['Why is the hall supply high?'])
})
