import { test, expect } from '@playwright/test';
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const shots = join(here, 'shots');
const twinShot = '/workspace/twin/managers-grokbot.png';

test('Managers tab matches Grok Bot layout (Boss tile + groups + chat)', async ({ page }) => {
  mkdirSync(shots, { recursive: true });
  await page.addInitScript(() => {
    try { localStorage.setItem('axe_look', 'black'); } catch { /* */ }
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto('/?ontwerp=1#/managers', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.axe-shell', { timeout: 45_000 });
  await expect(page.locator('.axe-managers-room')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-axe-boss-tile="ja"]')).toBeVisible();
  await expect(page.locator('[data-axe-orch="ja"]')).toHaveCount(1);
  // Boss tile + Projects + 5 grouped managers
  await expect(page.locator('.axe-managers-room-rij')).toHaveCount(6);
  await expect(page.locator('.axe-managers-room-draad')).toBeVisible();
  await expect(page.locator('.axe-manager-composer')).toBeVisible();
  const out = join(shots, 'managers-grokbot.png');
  await page.screenshot({ path: out, fullPage: true });
  await page.screenshot({ path: join(shots, 'agents-managers.png'), fullPage: true });
  try {
    mkdirSync('/workspace/twin', { recursive: true });
    copyFileSync(out, twinShot);
  } catch {
    /* twin path may only exist on the box; e2e still keeps shots/ */
  }
});
