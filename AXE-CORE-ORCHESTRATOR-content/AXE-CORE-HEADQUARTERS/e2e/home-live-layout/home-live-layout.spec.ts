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
  { naam: '1560x940', width: 1560, height: 940 },
  { naam: '1560x985', width: 1560, height: 985 },
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

/** Elke tekst in een railkaart blijft binnen de kaart; geen verticale overflow. */
async function assertTekstInKaart(page: Page, waar: string) {
  const rijen = await page.locator('.axe-home-rail-rij').evaluateAll((nodes) =>
    nodes.map((n) => {
      const kaart = n as HTMLElement;
      const kr = kaart.getBoundingClientRect();
      const teksten = [...kaart.querySelectorAll(
        '.axe-home-rail-naam, .axe-home-rail-regel, .axe-home-rail-tegel-naam, .axe-home-rail-label, .axe-home-rail-tier',
      )].map((el) => {
        const t = el as HTMLElement;
        const r = t.getBoundingClientRect();
        return {
          sel: t.className,
          tekst: (t.textContent || '').trim().slice(0, 40),
          sh: t.scrollHeight,
          ch: t.clientHeight,
          top: r.top,
          bottom: r.bottom,
        };
      });
      return {
        agent: kaart.getAttribute('data-axe-agent') || '',
        sh: kaart.scrollHeight,
        ch: kaart.clientHeight,
        top: kr.top,
        bottom: kr.bottom,
        teksten,
      };
    }),
  );
  for (const rij of rijen) {
    expect(rij.sh, `kaart ${rij.agent} scrollHeight at ${waar} (${rij.sh} vs ${rij.ch})`).toBeLessThanOrEqual(rij.ch + 1);
    for (const t of rij.teksten) {
      expect(t.top, `tekst "${t.tekst}" top in kaart ${rij.agent} at ${waar}`).toBeGreaterThanOrEqual(rij.top - 0.75);
      expect(t.bottom, `tekst "${t.tekst}" bottom in kaart ${rij.agent} at ${waar}`).toBeLessThanOrEqual(rij.bottom + 0.75);
      expect(t.ch, `tekst "${t.tekst}" zichtbaar in kaart ${rij.agent} at ${waar}`).toBeGreaterThan(0);
    }
  }
}

/** Visible box height must land on a whole line, not cut through a glyph. */
async function assertHeleRegels(page: Page, sel: string, waar: string) {
  const rijen = await page.locator(sel).evaluateAll((nodes) =>
    nodes.map((n) => {
      const el = n as HTMLElement;
      const cs = getComputedStyle(el);
      const lh = parseFloat(cs.lineHeight);
      const h = el.getBoundingClientRect().height;
      const wrap = cs.overflowWrap;
      const brk = cs.wordBreak;
      const rest = lh > 0 ? Math.min(h % lh, lh - (h % lh)) : 0;
      return { h, lh, wrap, brk, rest, tekst: (el.textContent || '').slice(0, 48) };
    }),
  );
  for (const r of rijen) {
    expect(r.wrap, `${waar} overflow-wrap (${r.tekst})`).not.toBe('anywhere');
    expect(r.brk, `${waar} word-break (${r.tekst})`).not.toMatch(/break-all|break-word/);
    if (r.h < 2 || !(r.lh > 0)) continue;
    expect(r.rest, `${waar} partial line h=${r.h} lh=${r.lh} (${r.tekst})`).toBeLessThan(1.25);
  }
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
      const kop = await box(page, '[data-axe-header]');

      expect(overlap(links, kop), `left rail vs header at ${maat.naam}`).toBe(0);
      expect(overlap(rechts, kop), `right rail vs header at ${maat.naam}`).toBe(0);
      const kopOnder = kop.y + kop.height;
      const zijMarge = links.x;
      expect(links.y, `left rail below header+margin at ${maat.naam}`).toBeGreaterThanOrEqual(kopOnder + zijMarge - 1.5);
      expect(rechts.y, `right rail below header+margin at ${maat.naam}`).toBeGreaterThanOrEqual(kopOnder + zijMarge - 1.5);

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
      const scherm = await page.evaluate(() => ({
        sh: document.documentElement.scrollHeight,
        ch: window.innerHeight,
      }));
      expect(scherm.sh, `no page scroll at ${maat.naam}`).toBeLessThanOrEqual(scherm.ch + 1);

      const rijenLinks = await page.locator('[data-axe-home-rail="links"] .axe-home-rail-rij').evaluateAll((nodes) =>
        nodes.map((n) => {
          const r = (n as HTMLElement).getBoundingClientRect();
          return { x: r.x, y: r.y, width: r.width, height: r.height };
        }),
      );
      const rijenRechts = await page.locator('[data-axe-home-rail="rechts"] .axe-home-rail-rij').evaluateAll((nodes) =>
        nodes.map((n) => {
          const r = (n as HTMLElement).getBoundingClientRect();
          return { x: r.x, y: r.y, width: r.width, height: r.height };
        }),
      );
      expect(rijenLinks.length, `left rail count at ${maat.naam}`).toBe(6);
      expect(rijenRechts.length, `right rail count at ${maat.naam}`).toBe(7);
      const firstLinks = rijenLinks[0];
      const lastLinks = rijenLinks[rijenLinks.length - 1];
      const firstRechts = rijenRechts[0];
      const lastRechts = rijenRechts[rijenRechts.length - 1];
      expect(firstLinks.y, `left first clipped at ${maat.naam}`).toBeGreaterThanOrEqual(links.y - 1);
      expect(firstRechts.y, `right first clipped at ${maat.naam}`).toBeGreaterThanOrEqual(rechts.y - 1);
      expect(lastLinks.y + lastLinks.height, `left last clipped at ${maat.naam}`).toBeLessThanOrEqual(links.y + links.height + 1);
      expect(lastRechts.y + lastRechts.height, `right last clipped at ${maat.naam}`).toBeLessThanOrEqual(rechts.y + rechts.height + 1);
      expect(Math.abs(firstLinks.height - firstRechts.height), `same card size at ${maat.naam}`).toBeLessThan(maat.width <= 1100 ? 6 : 2);

      const stapelLinks = await box(page, '[data-axe-home-rail="links"] .axe-home-rail-stapel');
      const stapelRechts = await box(page, '[data-axe-home-rail="rechts"] .axe-home-rail-stapel');
      const middenVan = (r: { y: number; height: number }) => r.y + r.height / 2;
      expect(Math.abs(middenVan(stapelLinks) - middenVan(links)), `left stack centered at ${maat.naam}`).toBeLessThanOrEqual(12);
      expect(Math.abs(middenVan(stapelRechts) - middenVan(rechts)), `right stack centered at ${maat.naam}`).toBeLessThanOrEqual(12);
      const companion = await box(page, '[data-axe-agent="companion"]');
      expect(await page.locator('[data-axe-agent="companion"]').innerText()).toMatch(/Companion/);
      expect(companion.y, `Companion top in rail at ${maat.naam}`).toBeGreaterThanOrEqual(rechts.y - 1);
      expect(companion.y + companion.height, `Companion visible at ${maat.naam}`).toBeLessThanOrEqual(rechts.y + rechts.height + 1);

      const gatenVan = (rijen: Array<{ y: number; height: number }>) =>
        rijen.slice(1).map((rij, i) => rij.y - (rijen[i].y + rijen[i].height));
      const gatenLinks = gatenVan(rijenLinks);
      const gatenRechts = gatenVan(rijenRechts);
      const ruim = maat.height >= 985 && maat.width >= 1560;
      for (const g of [...gatenLinks, ...gatenRechts]) {
        expect(g, `rail gap at ${maat.naam}`).toBeGreaterThanOrEqual(ruim ? 14 : 8);
        expect(g, `rail gap at ${maat.naam}`).toBeLessThanOrEqual(18);
      }
      const spreiding = (gaten: number[]) => Math.max(...gaten) - Math.min(...gaten);
      expect(spreiding(gatenLinks), `left gaps even at ${maat.naam}`).toBeLessThanOrEqual(2);
      expect(spreiding(gatenRechts), `right gaps even at ${maat.naam}`).toBeLessThanOrEqual(2);

      const lopendBox = await box(page, '[data-axe-home-kaart="lopend"]');
      const recentBox = await box(page, '[data-axe-home-kaart="recent"]');
      const okBox = await box(page, '[data-axe-home-kaart="ok"]');
      const seatsBox = await box(page, '[data-axe-home-kaart="seats"]');
      expect(lopendBox.y - (lastLinks.y + lastLinks.height), `left rail above live at ${maat.naam}`).toBeGreaterThanOrEqual(8);
      expect(okBox.y - (lastRechts.y + lastRechts.height), `right rail above live at ${maat.naam}`).toBeGreaterThanOrEqual(8);
      expect(Math.abs(lopendBox.y - recentBox.y), `left pair one row at ${maat.naam}`).toBeLessThan(4);
      expect(Math.abs(okBox.y - seatsBox.y), `right pair one row at ${maat.naam}`).toBeLessThan(4);
      expect(Math.abs(lopendBox.y - okBox.y), `both pairs same row at ${maat.naam}`).toBeLessThan(4);
      expect(recentBox.x, `RECENT right of WORKING NOW at ${maat.naam}`).toBeGreaterThan(lopendBox.x + lopendBox.width - 1);
      expect(seatsBox.x, `SEATS right of OK at ${maat.naam}`).toBeGreaterThan(okBox.x + okBox.width - 1);
      expect(Math.abs(lopendBox.x - links.x), `left pair under left rail at ${maat.naam}`).toBeLessThan(12);
      expect(Math.abs((seatsBox.x + seatsBox.width) - (rechts.x + rechts.width)), `right pair under right rail at ${maat.naam}`).toBeLessThan(16);
      expect(lopendBox.width, `left cards not a full-band at ${maat.naam}`).toBeLessThanOrEqual(links.width / 2 + 12);
      expect(okBox.width, `right cards not a full-band at ${maat.naam}`).toBeLessThanOrEqual(rechts.width / 2 + 12);
      expect(okBox.x, `gap between pairs at ${maat.naam}`).toBeGreaterThan(recentBox.x + recentBox.width + 16);
      expect(lopendBox.height, `live cards taller at ${maat.naam}`).toBeGreaterThanOrEqual(maat.width <= 1100 ? 100 : 160);
      for (const kaart of [lopendBox, recentBox, okBox, seatsBox]) {
        const verhouding = kaart.width / kaart.height;
        expect(verhouding, `live aspect ${verhouding.toFixed(2)} at ${maat.naam}`).toBeGreaterThanOrEqual(0.8);
        expect(verhouding, `live aspect ${verhouding.toFixed(2)} at ${maat.naam}`).toBeLessThanOrEqual(1.4);
      }

      const lopend = await page.locator('[data-axe-home-kaart="lopend"]').innerText();
      expect(lopend).toMatch(/WORKING NOW/i);
      expect(lopend).toMatch(/Developer/);
      expect(lopend).toMatch(/Trading OS/);
      expect(lopend).toMatch(/and 1 more/);
      const recent = await page.locator('[data-axe-home-kaart="recent"]').innerText();
      expect(recent).toMatch(/NorthSea/);
      expect(recent).toMatch(/Copper PO/);
      expect(recent).toMatch(/Cron/);
      const seats = await page.locator('[data-axe-home-kaart="seats"]').innerText();
      expect(seats).toMatch(/claude4/);
      expect(seats).toMatch(/Wingman/);

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

      await assertHeleRegels(page, '.axe-home-rail-regel', `rail regel at ${maat.naam}`);
      await assertHeleRegels(page, '[data-axe-home-kaart] .axe-home-live-regel, [data-axe-home-kaart] .axe-home-live-meer, [data-axe-ok-chip]', `live regel at ${maat.naam}`);
      await assertTekstInKaart(page, maat.naam);

      const north = await page.locator('[data-axe-agent="northsea"]').innerText();
      expect(north, `NorthSea title at ${maat.naam}`).toMatch(/NorthSea/);
      expect(north, `NorthSea seat at ${maat.naam}`).toMatch(/T2/);
      expect(north, `NorthSea chip at ${maat.naam}`).toMatch(/needs your OK: DEAL-002 Copper Cathode/);
      expect(north, `NorthSea dump at ${maat.naam}`).not.toMatch(/Dit is:/);
      expect(north, `NorthSea waarom at ${maat.naam}`).not.toMatch(/Waarom/);
      expect(north, `NorthSea buttons closed at ${maat.naam}`).not.toMatch(/Approve|Decline/);
      const okKaart = await page.locator('[data-axe-home-kaart="ok"]').innerText();
      expect(okKaart, `OK chip at ${maat.naam}`).toMatch(/needs your OK: DEAL-002 Copper Cathode/);
      expect(okKaart, `OK dump at ${maat.naam}`).not.toMatch(/Dit is:/);
      expect(okKaart, `OK waarom at ${maat.naam}`).not.toMatch(/Waarom/);
      expect(okKaart, `OK buttons closed at ${maat.naam}`).not.toMatch(/Approve|Decline/);

      const tegelNamen = await page.locator('.axe-home-rail-tegel-naam').evaluateAll((nodes) =>
        nodes.map((n) => {
          const el = n as HTMLElement;
          return { t: (el.textContent || '').trim(), sw: el.scrollWidth, cw: el.clientWidth };
        }),
      );
      expect(tegelNamen.map((n) => n.t)).toEqual(expect.arrayContaining(['Trade', 'Dev', 'Mem', 'Comp', 'North']));
      for (const n of tegelNamen) {
        expect(n.sw, `tegel label clipped "${n.t}" at ${maat.naam}`).toBeLessThanOrEqual(n.cw + 1);
      }
      const agentNamen = await page.locator('.axe-home-rail-naam').evaluateAll((nodes) =>
        nodes.map((n) => {
          const el = n as HTMLElement;
          const cs = getComputedStyle(el);
          return {
            t: (el.textContent || '').trim(),
            sw: el.scrollWidth,
            cw: el.clientWidth,
            fs: parseFloat(cs.fontSize),
          };
        }),
      );
      expect(agentNamen.map((n) => n.t)).toEqual(expect.arrayContaining(['Wingman', 'NorthSea', 'Companion', 'Developer']));
      for (const n of agentNamen) {
        expect(n.fs, `name size "${n.t}" at ${maat.naam}`).toBeGreaterThanOrEqual(maat.width <= 1100 ? 11.5 : 12.5);
        expect(n.sw, `name clipped "${n.t}" at ${maat.naam}`).toBeLessThanOrEqual(n.cw + 1);
      }

      const lijven = page.locator('[data-axe-home-kaart] .axe-kaart-lijf');
      const ln = await lijven.count();
      for (let i = 0; i < ln; i++) {
        const rijen = await lijven.nth(i).evaluate((lijf) => {
          const box = (lijf as HTMLElement).getBoundingClientRect();
          return [...(lijf as HTMLElement).querySelectorAll('.axe-home-live-regel, .axe-home-live-meer, .axe-ok-chip')].map((el) => {
            const b = el.getBoundingClientRect();
            const zicht = Math.min(b.bottom, box.bottom) - Math.max(b.top, box.top);
            return { t: (el.textContent || '').slice(0, 40), zicht, h: b.height };
          });
        });
        for (const rij of rijen) {
          if (rij.zicht <= 1) continue;
          expect(rij.zicht, `halve rij "${rij.t}" at ${maat.naam}`).toBeGreaterThanOrEqual(rij.h - 1);
        }
      }

      await page.screenshot({
        path: join(shots, `home-${maat.naam}.png`),
        fullPage: true,
      });
    });
  }
});
