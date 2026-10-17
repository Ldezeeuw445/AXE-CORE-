import { test, expect, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = join(here, 'fixture.html');
const shots = join(here, 'shots');

const MATEN = [
  { naam: '1100x680', width: 1100, height: 680 },
  { naam: '1440x900', width: 1440, height: 900 },
  { naam: '1920x1080', width: 1920, height: 1080 },
  { naam: '2048x1080', width: 2048, height: 1080 },
  { naam: '2560x1440', width: 2560, height: 1440 },
] as const;

function overlap(a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }): number {
  const x = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const y = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return x * y;
}

async function box(page: Page, sel: string) {
  const el = page.locator(sel).first();
  const r = await el.boundingBox();
  if (!r) throw new Error(`geen box voor ${sel}`);
  return r;
}

async function open(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await page.goto(`file://${fixture}`);
}

test.describe('Home live layout blijft uit de composer', () => {
  test.beforeAll(() => { mkdirSync(shots, { recursive: true }); });

  for (const maat of MATEN) {
    test(`${maat.naam}: rails, live strip, feed en toast overlappen composer/chips/orb/dock niet`, async ({ page }) => {
      await open(page, maat.width, maat.height);
      const live = await box(page, '[data-axe-home-live]');
      const composer = await box(page, '[data-axe-composer]');
      const chips = await box(page, '[data-axe-snelacties]');
      const links = await box(page, '[data-axe-home-rail="links"]');
      const rechts = await box(page, '[data-axe-home-rail="rechts"]');
      const toast = await box(page, '[data-axe-toast]');
      const ok = await box(page, '[data-axe-home-ok]');
      const feed = await box(page, '[data-axe-home-feed]');
      const orb = await box(page, '[data-axe-orb]');
      const dock = await box(page, '[data-axe-dock]');

      expect(overlap(live, composer), 'live strip vs composer').toBe(0);
      expect(overlap(live, chips), 'live strip vs chips').toBe(0);
      expect(overlap(live, orb), 'live strip vs orb').toBe(0);
      expect(overlap(live, dock), 'live strip vs dock').toBe(0);
      expect(overlap(ok, composer), 'NEEDS YOUR OK vs composer').toBe(0);
      expect(overlap(feed, chips), 'activity feed vs chips').toBe(0);
      expect(overlap(links, composer), 'left rail vs composer').toBe(0);
      expect(overlap(rechts, composer), 'right rail vs composer').toBe(0);
      expect(overlap(links, live), 'left rail vs live').toBe(0);
      expect(overlap(rechts, live), 'right rail vs live').toBe(0);
      expect(overlap(toast, rechts), 'toast vs right rail').toBe(0);
      expect(live.y + live.height).toBeLessThanOrEqual(composer.y + 0.5);
      expect(await page.locator('.axe-home-rail-rij').count()).toBe(13);
      expect(await page.locator('[data-axe-home-live-cluster]').count()).toBe(2);
      expect(await page.locator('[data-axe-home-pill]').count()).toBe(2);
      const takenTekst = await page.locator('[data-axe-home-pill="taken"]').innerText();
      expect(takenTekst).toMatch(/NorthSea Desk Manager failed/);
      expect(takenTekst).not.toMatch(/needsmy/);
      const sceneTekst = await page.locator('[data-axe-home-scene]').innerText();
      expect(sceneTekst).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
      expect(sceneTekst).not.toMatch(/\{\s*"at"/);

      const firstLinks = await box(page, '[data-axe-home-rail="links"] .axe-home-rail-rij');
      const secondLinks = await page.locator('[data-axe-home-rail="links"] .axe-home-rail-rij').nth(1).boundingBox();
      const lastLinks = await page.locator('[data-axe-home-rail="links"] .axe-home-rail-rij').last().boundingBox();
      const firstRechts = await box(page, '[data-axe-home-rail="rechts"] .axe-home-rail-rij');
      const lastRechts = await page.locator('[data-axe-home-rail="rechts"] .axe-home-rail-rij').last().boundingBox();
      if (!lastLinks || !lastRechts || !secondLinks) throw new Error('rail row missing');
      expect(firstLinks.y, `left first clipped at ${maat.naam}`).toBeGreaterThanOrEqual(links.y - 1);
      expect(firstRechts.y, `right first clipped at ${maat.naam}`).toBeGreaterThanOrEqual(rechts.y - 1);
      expect(lastLinks.y + lastLinks.height, `left last clipped at ${maat.naam}`).toBeLessThanOrEqual(links.y + links.height + 1);
      expect(lastRechts.y + lastRechts.height, `right last clipped at ${maat.naam}`).toBeLessThanOrEqual(rechts.y + rechts.height + 1);
      const rijGap = secondLinks.y - (firstLinks.y + firstLinks.height);
      expect(rijGap, `rail gap at ${maat.naam}`).toBeGreaterThanOrEqual(7);
      expect(rijGap, `rail gap at ${maat.naam}`).toBeLessThanOrEqual(13);

      const lopendBox = await box(page, '[data-axe-home-kaart="lopend"]');
      const recentBox = await box(page, '[data-axe-home-kaart="recent"]');
      const okBox = await box(page, '[data-axe-home-kaart="ok"]');
      const seatsBox = await box(page, '[data-axe-home-kaart="seats"]');
      expect(recentBox.y, `RECENT stacked under WORKING NOW at ${maat.naam}`).toBeGreaterThan(lopendBox.y + 20);
      expect(seatsBox.y, `SEATS stacked under OK at ${maat.naam}`).toBeGreaterThan(okBox.y + 20);
      expect(Math.abs(lopendBox.x - recentBox.x), `left pair same column at ${maat.naam}`).toBeLessThan(8);
      expect(Math.abs(okBox.x - seatsBox.x), `right pair same column at ${maat.naam}`).toBeLessThan(8);
      expect(Math.abs(lopendBox.x - links.x), `left pair under left rail at ${maat.naam}`).toBeLessThan(12);
      expect(Math.abs((okBox.x + okBox.width) - (rechts.x + rechts.width)), `right pair under right rail at ${maat.naam}`).toBeLessThan(12);
      expect(lopendBox.width, `left cards not stretched at ${maat.naam}`).toBeLessThanOrEqual(links.width + 4);
      expect(okBox.width, `right cards not stretched at ${maat.naam}`).toBeLessThanOrEqual(rechts.width + 4);
      expect(okBox.x, `not a 4-across band at ${maat.naam}`).toBeGreaterThan(lopendBox.x + lopendBox.width + 24);

      const lopend = await page.locator('[data-axe-home-kaart="lopend"]').innerText();
      expect(lopend).toMatch(/WORKING NOW/i);
      expect(lopend).toMatch(/Developer/);
      expect(lopend).toMatch(/Trading OS/);
      expect(lopend).toMatch(/and 1 more/);
      const recent = await page.locator('[data-axe-home-kaart="recent"]').innerText();
      expect(recent).toMatch(/NorthSea/);
      expect(recent).toMatch(/Copper PO/);
      expect(recent).toMatch(/Cron/);
      expect(recent).toMatch(/and 21 more/);
      const seats = await page.locator('[data-axe-home-kaart="seats"]').innerText();
      expect(seats).toMatch(/claude4/);
      expect(seats).toMatch(/Wingman/);
      expect(seats).toMatch(/and 14 more/);

      const kaarten = page.locator('[data-axe-home-kaart]');
      expect(await kaarten.count()).toBe(4);
      const n = await kaarten.count();
      for (let i = 0; i < n; i++) {
        const maatKaart = await kaarten.nth(i).evaluate((el) => {
          const node = el as HTMLElement;
          return { sh: node.scrollHeight, ch: node.clientHeight, overflow: getComputedStyle(node).overflow };
        });
        expect(maatKaart.overflow, `kaart ${i} overflow at ${maat.naam}`).toMatch(/hidden|clip/);
        expect(
          maatKaart.sh,
          `kaart ${i} scrollHeight<=clientHeight at ${maat.naam} (${maatKaart.sh} vs ${maatKaart.ch})`,
        ).toBeLessThanOrEqual(maatKaart.ch + 1);
      }
      const liveMaat = await page.locator('[data-axe-home-live]').evaluate((el) => ({
        sh: (el as HTMLElement).scrollHeight,
        ch: (el as HTMLElement).clientHeight,
      }));
      expect(liveMaat.sh, `live strip scrollHeight<=clientHeight at ${maat.naam}`).toBeLessThanOrEqual(liveMaat.ch + 1);

      await page.screenshot({
        path: join(shots, `home-${maat.naam}.png`),
        fullPage: true,
      });
    });
  }
});
