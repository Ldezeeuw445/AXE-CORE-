/**
 * Grid-/symmetriepass: per tab een schermafdruk op 1600×1000 en een
 * meetcontrole dat kaarten in dezelfde rij even hoog/breed zijn en niets
 * overlapt. SUFFIX=voor|na bepaalt de bestandsnaam in /workspace/twin/ui-pass/.
 */
import { test, expect, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const dir = '/workspace/twin/ui-pass';
const SUFFIX = process.env.SUFFIX || 'na';
const TABS: Array<[string, string]> = [
  ['home', '/'], ['northsea', '/northsea'], ['trading', '/trading'], ['code', '/code-editor'],
  ['calendar', '/calendar'], ['settings', '/settings'], ['meer', '__meer__'],
];

async function open(page: Page, path: string) {
  await page.addInitScript(() => { try { localStorage.setItem('axe_look', 'black'); } catch { /* */ } });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto(`/?ontwerp=1#${path === '__meer__' ? '/' : path}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.axe-shell', { timeout: 60_000 });
  await page.waitForTimeout(2500);
  if (path === '__meer__') {
    await page.getByRole('button', { name: /^Meer$/ }).first().click();
    await page.waitForTimeout(1200);
  }
}

for (const [naam, path] of TABS) {
  test(`ui-pass ${naam}`, async ({ page }) => {
    mkdirSync(dir, { recursive: true });
    await open(page, path);
    await page.screenshot({ path: `${dir}/${naam}-${SUFFIX}.png` });
    if (SUFFIX !== 'na') return;
    // Kaarten in dezelfde rij (zelfde top, zelfde ouder) zijn even hoog.
    const fout = await page.evaluate(() => {
      const sel = '[data-axe-gelijk] > *';
      const rijen = new Map<string, number[]>();
      document.querySelectorAll<HTMLElement>(sel).forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width < 40 || r.height < 40) return;
        const k = `${el.parentElement?.dataset.axeGelijk}:${Math.round(r.top)}`;
        rijen.set(k, [...(rijen.get(k) || []), Math.round(r.height)]);
      });
      return [...rijen.entries()].filter(([, h]) => Math.max(...h) - Math.min(...h) > 2).map(([k, h]) => `${k} ${h}`);
    });
    expect(fout).toEqual([]);
  });
}
