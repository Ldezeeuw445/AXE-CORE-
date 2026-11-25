import { test, expect, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = join(here, 'podium-fixture.html');
const shots = join(here, 'shots');

async function open(page: Page, stand: string) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`file://${fixture}?stand=${stand}`);
}

function overlap(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): number {
  const x = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const y = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return x * y;
}

test.describe('Home podium — 3D stage in the core hole', () => {
  test('orb is centered in the kern on the empty stage', async ({ page }) => {
    await open(page, 'leeg');
    const kern = page.locator('[data-axe-podium]');
    const orb = page.locator('[data-orb]');
    const kr = await kern.boundingBox();
    const or = await orb.boundingBox();
    expect(kr, 'kern').toBeTruthy();
    expect(or, 'orb').toBeTruthy();
    const kx = kr!.x + kr!.width / 2;
    const ky = kr!.y + kr!.height / 2;
    const ox = or!.x + or!.width / 2;
    const oy = or!.y + or!.height / 2;
    expect(Math.abs(ox - kx), 'orb horizontal center').toBeLessThan(8);
    expect(Math.abs(oy - ky), 'orb vertical center').toBeLessThan(8);
    mkdirSync(shots, { recursive: true });
    await page.screenshot({ path: join(shots, 'podium-leeg.png') });
  });

  test('a short answer stays compact and centered over the orb', async ({ page }) => {
    await open(page, 'antwoord');
    const kaart = page.locator('[data-axe-podium-kaart="antwoord"]');
    const kern = page.locator('[data-axe-podium]');
    await expect(kaart).toHaveAttribute('data-maat', 'compact');
    const kr = await kern.boundingBox();
    const br = await kaart.boundingBox();
    expect(kr && br).toBeTruthy();
    const kx = kr!.x + kr!.width / 2;
    const bx = br!.x + br!.width / 2;
    expect(Math.abs(bx - kx), 'card horizontal center').toBeLessThan(12);
    expect(br!.width, 'compact stays smaller than the stage').toBeLessThan(kr!.width * 0.85);
    await page.screenshot({ path: join(shots, 'podium-antwoord.png') });
  });

  test('a table grows toward the full stage and still sits in the hole', async ({ page }) => {
    await open(page, 'tabel');
    const kaart = page.locator('[data-axe-podium-kaart="tabel"]');
    const kern = page.locator('[data-axe-podium]');
    await expect(kaart).toHaveAttribute('data-maat', 'vol');
    const kr = await kern.boundingBox();
    const br = await kaart.boundingBox();
    expect(kr && br).toBeTruthy();
    expect(overlap(kr!, br!), 'table inside stage').toBeGreaterThan(br!.width * br!.height * 0.95);
    await expect(page.getByText('Rotterdam')).toBeVisible();
    await expect(page.locator('[aria-label="chart"]')).toBeVisible();
    await expect(page.locator('[aria-label="image"]')).toBeVisible();
    await page.screenshot({ path: join(shots, 'podium-tabel.png') });
  });

  test('agent count is a chip on the stage, not a second dashboard', async ({ page }) => {
    await open(page, 'agenten');
    const chip = page.locator('[data-axe-podium-kaart="agenten"], .axe-podium-agenten');
    await expect(chip).toContainText('2 agents working');
    await expect(chip).toContainText('1 needs your OK');
    await page.screenshot({ path: join(shots, 'podium-agenten.png') });
  });
});
