import { test, expect } from '@playwright/test';
import path from 'node:path';

const shots = path.resolve('/opt/cursor/artifacts/screenshots');

const VIEWS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'wide', width: 2560, height: 1360 },
] as const;

const SCENES = [
  { id: 'terrain-overview', qs: 'view=terrain&seed=1' },
  { id: 'terrain-hub', qs: 'view=terrain&seed=1&hub=resources' },
  { id: 'neural-overview', qs: 'view=neural&seed=1' },
  { id: 'neural-hub', qs: 'view=neural&seed=1&hub=resources' },
] as const;

test.describe('Memory Terrain + Neural', () => {
  for (const view of VIEWS) {
    for (const scene of SCENES) {
      test(`${scene.id} @ ${view.name}`, async ({ page }) => {
        await page.setViewportSize({ width: view.width, height: view.height });
        await page.goto(`/#/dev-memory-scene-preview?${scene.qs}`, { waitUntil: 'domcontentloaded' });
        await expect(page.getByTestId('memory-scene-preview')).toBeVisible();
        if (scene.id.endsWith('-hub')) {
          await expect(page.getByTestId('memory-hub-detail')).toBeVisible({ timeout: 20_000 });
          await expect(page.getByTestId('memory-hub-search')).toBeVisible();
        }
        await expect(page.getByTestId('memory-type-legend').or(page.getByTestId('memory-hub-detail'))).toBeVisible({ timeout: 20_000 });
        if (scene.id.endsWith('-overview')) {
          await page.waitForTimeout(2800);
        } else {
          await page.waitForTimeout(2200);
        }
        await page.screenshot({
          path: path.join(shots, `memory-${scene.id}-${view.name}.png`),
          fullPage: false,
        });
      });
    }
  }
});
