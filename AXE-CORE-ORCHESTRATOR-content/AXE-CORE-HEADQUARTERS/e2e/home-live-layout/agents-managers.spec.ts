import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const shots = join(here, 'shots');

test('Managers tab is a Grok-style chat room (six managers)', async ({ page }) => {
  mkdirSync(shots, { recursive: true });
  await page.addInitScript(() => {
    try { localStorage.setItem('axe_look', 'black'); } catch { /* */ }
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto('/?ontwerp=1#/managers', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.axe-shell', { timeout: 45_000 });
  await expect(page.locator('.axe-managers-room')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.axe-managers-room-rij')).toHaveCount(6);
  await expect(page.locator('.axe-managers-room-draad')).toBeVisible();
  await page.screenshot({ path: join(shots, 'agents-managers.png'), fullPage: true });
});
