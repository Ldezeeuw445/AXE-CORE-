import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const shots = join(here, 'shots');

test('Agents tab toont het MANAGERS-blok naast de bestaande roster', async ({ page }) => {
  mkdirSync(shots, { recursive: true });
  await page.addInitScript(() => {
    try { localStorage.setItem('axe_look', 'black'); } catch { /* */ }
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto('/?ontwerp=1#/agents', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.axe-shell', { timeout: 45_000 });
  await expect(page.locator('.axe-sectie-titel', { hasText: 'MANAGERS' })).toBeVisible({ timeout: 30_000 });
  const blok = page.locator('#axe-sectie-managers');
  await expect(blok.getByText('AXE CORE Manager').first()).toBeVisible();
  await expect(blok.getByText('Projects Manager').first()).toBeVisible();
  await expect(blok.getByText('AXE Companion Manager').first()).toBeVisible();
  await expect(blok.getByText('AXON Memory Manager').first()).toBeVisible();
  await expect(blok.getByText('Trading OS Manager').first()).toBeVisible();
  await expect(blok.getByText('Northsea Desk Manager').first()).toBeVisible();
  await expect(page.locator('.axe-sectie-titel', { hasText: 'Approvals for Luka' })).toBeVisible();
  await expect(page.locator('.axe-sectie-titel', { hasText: "Wingman's crew" })).toBeVisible();
  await blok.scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(shots, 'agents-managers.png'), fullPage: true });
});
