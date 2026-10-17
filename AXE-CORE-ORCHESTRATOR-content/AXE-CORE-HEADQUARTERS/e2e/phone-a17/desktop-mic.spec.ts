import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const shots = join(here, 'shots');
mkdirSync(shots, { recursive: true });

test.use({
  viewport: { width: 1440, height: 900 },
  isMobile: false,
  hasTouch: false,
  deviceScaleFactor: 1,
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
});

test.describe('desktop 1440x900 mic', () => {
  test('mic uit en aan op de composer, geen auto-listen', async ({ page }) => {
    await page.addInitScript(() => {
      try { localStorage.setItem('axe_look', 'black'); } catch { /* */ }
    });
    await page.goto('/?ontwerp=1#/', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.axe-shell', { timeout: 45_000 });
    await page.waitForTimeout(1000);

    await expect(page.locator('.axe-mobile-home')).toHaveCount(0);
    const mic = page.locator('[data-axe-mic]').first();
    await expect(mic).toBeVisible();
    await expect(mic).toHaveAttribute('data-axe-mic', 'uit');
    await page.screenshot({ path: join(shots, 'desktop-mic-off.png'), fullPage: false });

    await page.evaluate(() => {
      const w = window as unknown as { __axeZetStem?: (s: Record<string, unknown>) => void };
      w.__axeZetStem?.({ voiceStatus: 'listening', liveCall: true, transcript: 'live' });
    });
    await expect(mic).toHaveAttribute('data-axe-mic', 'aan');
    await expect(page.locator('[data-axe-luistert="ja"]')).toBeVisible();
    await page.screenshot({ path: join(shots, 'desktop-mic-on.png'), fullPage: false });
  });
});
