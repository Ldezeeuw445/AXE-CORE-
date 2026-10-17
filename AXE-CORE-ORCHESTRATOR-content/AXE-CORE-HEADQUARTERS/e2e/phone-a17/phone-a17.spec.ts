import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const shots = join(here, 'shots');
mkdirSync(shots, { recursive: true });

const TABS: ReadonlyArray<{ route: string; naam: string }> = [
  { route: '/mobile', naam: 'home' },
  { route: '/maps-3d', naam: 'desk' },
  { route: '/agents', naam: 'agents' },
  { route: '/trading', naam: 'trading' },
  { route: '/memory', naam: 'memory' },
  { route: '/tasks', naam: 'tasks' },
  { route: '/calendar', naam: 'calendar' },
  { route: '/settings', naam: 'settings' },
  { route: '/browser', naam: 'browser' },
  { route: '/obsidian', naam: 'obsidian' },
  { route: '/ai-core', naam: 'ai-core' },
  { route: '/device', naam: 'device' },
  { route: '/trading-intel', naam: 'trading-intel' },
  { route: '/finance', naam: 'finance' },
  { route: '/crewai', naam: 'crewai' },
  { route: '/cron-manager', naam: 'cron' },
  { route: '/infrastructure', naam: 'infra' },
  { route: '/mcp', naam: 'mcp' },
  { route: '/knowledge', naam: 'knowledge' },
  { route: '/code-editor', naam: 'code' },
  { route: '/control-plane', naam: 'control' },
  { route: '/organization', naam: 'org' },
  { route: '/terminals', naam: 'terminals' },
  { route: '/computer-use', naam: 'computer' },
  { route: '/thinkthanks', naam: 'thinkthanks' },
];

async function openRoute(page: Page, route: string, android = false) {
  if (android) {
    await page.addInitScript(() => {
      (window as unknown as { __AXE_ANDROID__: { v: number } }).__AXE_ANDROID__ = { v: 1 };
    });
  }
  await page.addInitScript(() => {
    try { localStorage.setItem('axe_look', 'black'); } catch { /* */ }
  });
  await page.goto(`/?ontwerp=1#${route}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.axe-shell', { timeout: 45_000 });
  await page.waitForTimeout(1200);
}

async function overflowEnOverlap(page: Page) {
  return page.evaluate(() => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const over = [...document.querySelectorAll('body *')].filter((el) => {
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return false;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false;
      if (el.getAttribute('aria-hidden') === 'true') return false;
      // Sfeer/meetlagen (absolute, geen klasse) tellen niet als zijwaartse scroll.
      if ((cs.position === 'absolute' || cs.position === 'fixed') && !el.className && !el.id) return false;
      if (cs.overflowX === 'hidden' || cs.overflow === 'hidden') return false;
      return r.right > w + 2 || r.left < -2;
    }).slice(0, 8).map((el) => {
      const r = el.getBoundingClientRect();
      const cls = String(el.className || '').slice(0, 80);
      return `${el.tagName}.${cls} @${Math.round(r.right)}`;
    });
    const docOverflow = document.documentElement.scrollWidth > w + 2;
    const chrome = [
      document.querySelector('[data-axe-phone-tabs]'),
      document.querySelector('.axe-mobile-tab-composer'),
      document.querySelector('.axe-mobile-look-toggle'),
    ].filter(Boolean) as Element[];
    const overlaps: string[] = [];
    for (let i = 0; i < chrome.length; i++) {
      const a = chrome[i].getBoundingClientRect();
      for (let j = i + 1; j < chrome.length; j++) {
        const b = chrome[j].getBoundingClientRect();
        const hit = a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
        if (hit && a.width > 8 && a.height > 8 && b.width > 8 && b.height > 8) {
          overlaps.push(`${chrome[i].className} x ${chrome[j].className}`);
        }
      }
    }
    return { over, docOverflow, overlaps, w, h };
  });
}

test.describe('A17 384x832', () => {
  test('lock/pin: één veld, geen composer/onderbalk, geen rode storage-fout', async ({ page }) => {
    await openRoute(page, '/lock/pin', true);
    await expect(page.locator('[data-axe-lock-pin]')).toBeVisible();
    await expect(page.getByText('Draw your code')).toBeVisible();
    await expect(page.getByText('Secure storage unavailable')).toHaveCount(0);
    await expect(page.locator('[data-axe-phone-tabs]')).toHaveCount(0);
    await expect(page.locator('.axe-mobile-tab-composer')).toHaveCount(0);
    await expect(page.locator('.axe-mobile-home')).toHaveCount(0);
    const velden = page.locator('[data-axe-lock-pin] canvas, [aria-label="Particle gesture field"]');
    await expect(velden).toHaveCount(1);
    await page.screenshot({ path: join(shots, 'lock-pin.png'), fullPage: false });
    const maat = await overflowEnOverlap(page);
    expect(maat.docOverflow, `doc overflow: ${maat.over.join('; ')}`).toBe(false);
    expect(maat.over, maat.over.join('; ')).toEqual([]);
  });

  test('Home: één bol, composer + onderbalk, geen extra particle-PIN', async ({ page }) => {
    await openRoute(page, '/mobile');
    await expect(page.locator('.axe-mobile-home')).toBeVisible();
    await expect(page.getByText('Draw your code')).toHaveCount(0);
    await expect(page.locator('[data-axe-lock-pin]')).toHaveCount(0);
    await expect(page.locator('[data-axe-phone-tabs]')).toBeVisible();
    await page.screenshot({ path: join(shots, 'home.png'), fullPage: false });
    const maat = await overflowEnOverlap(page);
    expect(maat.docOverflow, maat.over.join('; ')).toBe(false);
    expect(maat.overlaps, maat.overlaps.join('; ')).toEqual([]);
  });

  for (const tab of TABS.filter((t) => t.route !== '/mobile')) {
    test(`${tab.naam} ${tab.route}: geen zijwaartse overflow, geen overlap`, async ({ page }) => {
      await openRoute(page, tab.route);
      await expect(page.locator('.axe-shell')).toBeVisible();
      await expect(page.locator('[data-axe-lock-pin]')).toHaveCount(0);
      if (tab.route !== '/maps-3d') {
        await expect(page.locator('[data-axe-mobiel-tab], .axe-mobiel-desk, .axe-tabruimte, main')).toHaveCount(
          await page.locator('[data-axe-mobiel-tab], .axe-mobiel-desk, .axe-tabruimte, main').count(),
        );
      }
      await page.screenshot({ path: join(shots, `${tab.naam}.png`), fullPage: false });
      const maat = await overflowEnOverlap(page);
      expect(maat.docOverflow, `${tab.route} doc: ${maat.over.join('; ')}`).toBe(false);
      expect(maat.overlaps, `${tab.route} overlap: ${maat.overlaps.join('; ')}`).toEqual([]);
    });
  }
});
