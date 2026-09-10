import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('all collections navigate to real articles, refresh, and return through browser history', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  for (const collection of ['portfolio', 'blog', 'tutorials']) {
    await page.goto('/');
    await page.locator(`nav a[href="/${collection}"]`).click();
    await expect(page.locator('nav [aria-current="page"]')).toHaveAttribute('href', `/${collection}`);
    await expect(page.locator('main')).toBeFocused();
    await page.locator('.entry-row').first().click();
    await expect(page.locator('.prose')).toBeVisible();
    const title = await page.locator('h1').innerText();
    await page.reload();
    await expect(page.locator('h1')).toHaveText(title);
    await expect(page).toHaveTitle(`${title} — Destroy / Rebuild`);
    await page.goBack();
    await expect(page.locator('.entry-list')).toBeVisible();
  }
  expect(errors).toEqual([]);
});

test('external destinations are explicit placeholders without invented outbound links', async ({ page }) => {
  for (const channel of ['youtube', 'patreon']) {
    await page.goto('/');
    await page.locator(`footer a[href="/${channel}"]`).click();
    await expect(page.locator('.placeholder-token code')).toHaveText(`PLACEHOLDER_${channel.toUpperCase()}_URL`);
    await expect(page.locator('main a[href^="https://"]')).toHaveCount(0);
  }
});

test('reduced motion is honored, controls work, and motion sleeps on reading routes', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    const original = window.requestAnimationFrame.bind(window);
    (window as unknown as { framesRendered: number }).framesRendered = 0;
    window.requestAnimationFrame = (callback) => original((time) => {
      (window as unknown as { framesRendered: number }).framesRendered++;
      callback(time);
    });
  });
  await page.goto('/');
  await expect(page.locator('body')).not.toHaveClass(/no-webgl/);
  await expect(page.locator('[data-motion]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-cycle]')).toHaveText('STILL / MOTION PAUSED');
  await page.waitForTimeout(300);
  const count = () => page.evaluate(() => (window as unknown as { framesRendered: number }).framesRendered);
  const pausedFrames = await count();
  await page.waitForTimeout(300);
  expect(await count()).toBe(pausedFrames);
  await page.locator('[data-motion]').click();
  await expect(page.locator('[data-motion]')).toHaveAttribute('aria-pressed', 'false');
  await page.locator('[data-fracture]').click();
  await expect(page.locator('[data-cycle]')).toHaveText('DECONSTRUCTING');
  await page.waitForTimeout(200);
  expect(await count()).toBeGreaterThan(pausedFrames);
  await page.locator('nav a[href="/blog"]').click();
  await page.waitForTimeout(200);
  const readingFrames = await count();
  await page.waitForTimeout(300);
  expect(await count()).toBe(readingFrames);
});

test('content survives a WebGL initialization failure', async ({ page }) => {
  await page.addInitScript(() => {
    HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext;
  });
  await page.goto('/');
  await expect(page.locator('body')).toHaveClass(/no-webgl/);
  await expect(page.locator('h1')).toContainText('DESTROY');
  await page.locator('nav a[href="/portfolio"]').click();
  await page.locator('.entry-row').first().click();
  await expect(page.locator('.prose')).toBeVisible();
});

test('missing content is explained and valid entries remain reachable', async ({ page }) => {
  await page.goto('/blog/does-not-exist');
  await expect(page.locator('h1')).toHaveText('This piece is missing.');
  await page.locator('.entry-row').first().click();
  await expect(page.locator('.prose')).toBeVisible();
});

test('keyboard skip link and principal pages pass accessibility checks', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Tab');
  await expect(page.locator('.skip')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('main')).toBeFocused();
  for (const path of ['/', '/portfolio', '/blog/rebuild-the-workshop', '/tutorials/living-threejs-page', '/patreon']) {
    await page.goto(path);
    expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
  }
});

for (const width of [320, 390, 768, 1024, 1440]) {
  test(`layout stays inside the viewport at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ['/', '/portfolio', '/tutorials/living-threejs-page', '/youtube']) {
      await page.goto(path);
      await page.evaluate(() => document.fonts.ready);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    }
  });
}
