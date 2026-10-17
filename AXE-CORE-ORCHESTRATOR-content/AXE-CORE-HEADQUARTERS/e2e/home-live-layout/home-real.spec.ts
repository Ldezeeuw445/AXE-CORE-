import { test, expect, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const shots = join(here, 'shots');

const IDS = [
  'wingman', 'northsea', 'trading', 'developer', 'thinktank', 'browser',
  'memory', 'task', 'cron', 'finance', 'apps', 'intel', 'companion',
] as const;

const LANG = '0 need OK, 7 queued, 1 blocked';

type AxeOntwerp = {
  __axeZetServerAgents?: (s: Record<string, unknown>) => void;
  __axeZetPanelen?: (open: boolean) => void;
};

function roosters() {
  const next = new Date(Date.now() + 4 * 60 * 1000).toISOString();
  return [{
    name: 'cycle',
    last_run_at: new Date(Date.now() - 3600_000).toISOString(),
    last_status: 'ok',
    next_run_at: next,
    running: false,
    failures: 0,
    summary: LANG,
  }];
}

function liveStand() {
  const agents: Record<string, unknown> = {};
  for (const id of IDS) {
    agents[id] = {
      agent: id,
      status: id === 'developer' ? 'QUEUED' : 'MONITORING',
      reason: id === 'developer' ? 'Queued behind a running job.' : 'Standing watch.',
      events: id === 'northsea' ? [
        { at: '2026-10-17T16:17:00Z', kind: 'task', event_type: 'task.completed', message: 'task.completed', task_id: 't1', mission_id: null, source: 'task' },
        { at: '2026-10-17T16:17:01Z', kind: 'task', event_type: 'task.completed', message: 'task.completed', task_id: 't1', mission_id: null, source: 'task' },
        { at: '2026-10-17T16:10:00Z', kind: 'task', event_type: 'task.completed', message: 'Copper PO filed', task_id: 't2', mission_id: null, source: 'task' },
      ] : [],
      task: id === 'developer' ? {
        id: 't-dev',
        title: 'Continue: Website Review Desk; verified CAS-natch en laser',
        status: 'queued',
      } : null,
      routines: roosters(),
    };
  }
  return {
    ok: true,
    agents,
    approvals: [],
    tiers: {
      agents: {
        wingman: { tier: 2, model: 'groq + claude-sonnet-seat' },
        northsea: { tier: 2, model: 'groq + claude-sonnet-seat' },
        trading: { tier: 2, model: 'groq + claude-sonnet-seat' },
        developer: { tier: 1, model: 'claude opus/sonnet via Mac' },
        thinktank: { tier: 2, model: 'groq + claude-sonnet-seat' },
        browser: { tier: 2, model: 'groq + ollama' },
        memory: { tier: 2, model: 'groq + ollama' },
        task: { tier: 2, model: 'groq + ollama' },
        cron: { tier: 3, model: 'groq / cerebras / ollama' },
        finance: { tier: 3, model: 'groq / ollama' },
        apps: { tier: 3, model: 'groq / ollama' },
        intel: { tier: 2, model: 'groq + claude-haiku' },
        companion: { tier: 2, model: 'groq + claude' },
      },
    },
  };
}

async function zetLive(page: Page) {
  await page.waitForFunction(() => typeof (window as unknown as AxeOntwerp).__axeZetServerAgents === 'function');
  await page.evaluate((stand) => {
    (window as unknown as AxeOntwerp).__axeZetServerAgents?.(stand);
  }, liveStand());
  await page.locator('[data-axe-home-rail="links"] .axe-home-rail-regel').first().waitFor({ state: 'visible' });
}

test.use({
  viewport: { width: 1560, height: 985 },
  isMobile: false,
  hasTouch: false,
  deviceScaleFactor: 2,
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
});

test.describe('echte Home-rails op 1560×985', () => {
  test.beforeAll(() => { mkdirSync(shots, { recursive: true }); });

  test('lange statusregels knippen niet, rails onder de kop, Companion boven live', async ({ page }) => {
    await page.addInitScript(() => {
      try { localStorage.setItem('axe_look', 'black'); } catch { /* */ }
    });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/?ontwerp=1#/', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.axe-shell', { timeout: 45_000 });
    await page.waitForFunction(() => typeof (window as unknown as AxeOntwerp).__axeZetPanelen === 'function');
    await page.evaluate(() => { (window as unknown as AxeOntwerp).__axeZetPanelen?.(false); });
    await expect(page.getByText('THINKTHANKS')).toHaveCount(0);
    await page.waitForSelector('[data-axe-home-rail="links"]', { timeout: 45_000 });
    await page.waitForFunction(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--axe-composer-hoog')) > 0);
    await zetLive(page);
    await expect(page.locator('[data-axe-agent="wingman"] .axe-home-rail-regel')).toContainText(/last:/, { timeout: 10_000 });

    const kop = page.locator('[data-axe-header]').first();
    const live = page.locator('[data-axe-home-live]').first();
    const links = page.locator('[data-axe-home-rail="links"]');
    const rechts = page.locator('[data-axe-home-rail="rechts"]');
    await expect(kop).toBeVisible();
    await expect(live).toBeVisible();

    const kopBox = await kop.boundingBox();
    const liveBox = await live.boundingBox();
    const linksBox = await links.boundingBox();
    if (!kopBox || !liveBox || !linksBox) throw new Error('geen kop/live/rail box');

    const eerste = await page.locator('[data-axe-home-rail="links"] .axe-home-rail-rij').first().boundingBox();
    const laatsteLinks = await page.locator('[data-axe-home-rail="links"] .axe-home-rail-rij').last().boundingBox();
    const laatsteRechts = await page.locator('[data-axe-home-rail="rechts"] .axe-home-rail-rij').last().boundingBox();
    const companion = await page.locator('[data-axe-agent="companion"]').boundingBox();
    const stapelLinks = await page.locator('[data-axe-home-rail="links"] .axe-home-rail-stapel').boundingBox();
    const stapelRechts = await page.locator('[data-axe-home-rail="rechts"] .axe-home-rail-stapel').boundingBox();
    const rechtsBox = await rechts.boundingBox();
    const lopendBox = await page.locator('[data-axe-home-kaart="lopend"]').boundingBox();
    const recentBox = await page.locator('[data-axe-home-kaart="recent"]').boundingBox();
    const okBox = await page.locator('[data-axe-home-kaart="ok"]').boundingBox();
    const seatsBox = await page.locator('[data-axe-home-kaart="seats"]').boundingBox();
    if (!eerste || !laatsteLinks || !laatsteRechts || !companion || !stapelLinks || !stapelRechts || !rechtsBox || !lopendBox || !recentBox || !okBox || !seatsBox) {
      throw new Error('geen kaartbox');
    }

    const marge = linksBox.x;
    expect(eerste.y, 'eerste kaart onder kop + zijmarge').toBeGreaterThanOrEqual(kopBox.y + kopBox.height + marge - 1.5);
    expect(laatsteLinks.y + laatsteLinks.height, 'linker stapel boven live').toBeLessThan(liveBox.y - 7.5);
    expect(laatsteRechts.y + laatsteRechts.height, 'rechter stapel boven live').toBeLessThan(liveBox.y - 7.5);
    expect(companion.y + companion.height, 'Companion boven live').toBeLessThan(liveBox.y - 7.5);

    const middenVan = (r: { y: number; height: number }) => r.y + r.height / 2;
    expect(Math.abs(middenVan(stapelLinks) - middenVan(linksBox)), 'linker stapel gecentreerd').toBeLessThanOrEqual(12);
    expect(Math.abs(middenVan(stapelRechts) - middenVan(rechtsBox)), 'rechter stapel gecentreerd').toBeLessThanOrEqual(12);
    for (const kaart of [lopendBox, recentBox, okBox, seatsBox]) {
      const verhouding = kaart.width / kaart.height;
      expect(verhouding, `live aspect ${verhouding.toFixed(2)}`).toBeGreaterThanOrEqual(0.8);
      expect(verhouding, `live aspect ${verhouding.toFixed(2)}`).toBeLessThanOrEqual(1.4);
    }
    expect(lopendBox.height, 'live kaart hoger').toBeGreaterThanOrEqual(160);

    const meting = await page.locator('.axe-home-rail-rij').evaluateAll((nodes) =>
      nodes.map((n) => {
        const kaart = n as HTMLElement;
        const kr = kaart.getBoundingClientRect();
        const teksten = [...kaart.querySelectorAll(
          '.axe-home-rail-naam, .axe-home-rail-regel, .axe-home-rail-tegel-naam, .axe-home-rail-label, .axe-home-rail-tier',
        )].map((el) => {
          const t = el as HTMLElement;
          const r = t.getBoundingClientRect();
          return {
            tekst: (t.textContent || '').trim().slice(0, 48),
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
    expect(meting.length).toBe(13);
    for (const rij of meting) {
      expect(rij.sh, `kaart ${rij.agent} scrollHeight<=clientHeight`).toBeLessThanOrEqual(rij.ch + 1);
      for (const t of rij.teksten) {
        expect(t.top, `"${t.tekst}" top in ${rij.agent}`).toBeGreaterThanOrEqual(rij.top - 0.75);
        expect(t.bottom, `"${t.tekst}" bottom in ${rij.agent}`).toBeLessThanOrEqual(rij.bottom + 0.75);
        expect(t.sh, `"${t.tekst}" scrollHeight<=kaart in ${rij.agent}`).toBeLessThanOrEqual(rij.ch + 1);
      }
    }

    const recent = await page.locator('[data-axe-home-kaart="recent"]').innerText();
    const northCompleted = recent.split('\n').filter((l) => /northsea/i.test(l) && /task completed/i.test(l));
    expect(northCompleted.length, `dubbele NorthSea task completed: ${recent}`).toBeLessThanOrEqual(1);
    expect(recent).toMatch(/Copper PO filed/);

    await page.screenshot({ path: join(shots, 'home-real-1560x985.png'), fullPage: false });

    for (const maat of [
      { naam: '1440x900', width: 1440, height: 900 },
      { naam: '1920x1080', width: 1920, height: 1080 },
    ] as const) {
      await page.setViewportSize({ width: maat.width, height: maat.height });
      await page.waitForFunction(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--axe-composer-hoog')) > 0);
      const rail = await page.locator('[data-axe-home-rail="links"]').boundingBox();
      const stapel = await page.locator('[data-axe-home-rail="links"] .axe-home-rail-stapel').boundingBox();
      const liveKaart = await page.locator('[data-axe-home-kaart="lopend"]').boundingBox();
      const liveRij = await page.locator('[data-axe-home-live]').boundingBox();
      if (!rail || !stapel || !liveKaart || !liveRij) throw new Error(`geen box at ${maat.naam}`);
      expect(Math.abs((stapel.y + stapel.height / 2) - (rail.y + rail.height / 2)), `stapel midden ${maat.naam}`).toBeLessThanOrEqual(12);
      const verhouding = liveKaart.width / liveKaart.height;
      expect(verhouding, `live aspect ${maat.naam}`).toBeGreaterThanOrEqual(0.8);
      expect(verhouding, `live aspect ${maat.naam}`).toBeLessThanOrEqual(1.4);
      expect(stapel.y + stapel.height, `stapel boven live ${maat.naam}`).toBeLessThan(liveRij.y - 7.5);
      await page.screenshot({ path: join(shots, `home-real-${maat.naam}.png`), fullPage: false });
    }
  });
});
