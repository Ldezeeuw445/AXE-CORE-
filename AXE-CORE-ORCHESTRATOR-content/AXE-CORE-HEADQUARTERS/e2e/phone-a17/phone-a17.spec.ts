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
];

async function openRoute(page: Page, route: string, look: 'black' | 'glass' = 'black', android = false) {
  if (android) {
    await page.addInitScript(() => {
      (window as unknown as { __AXE_ANDROID__: { v: number } }).__AXE_ANDROID__ = { v: 1 };
    });
  }
  await page.addInitScript((stand) => {
    try { localStorage.setItem('axe_look', stand); } catch { /* */ }
  }, look);
  await page.goto(`/?ontwerp=1#${route}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.axe-shell', { timeout: 45_000 });
  await page.waitForTimeout(900);
}

async function zetStem(page: Page, listening: boolean) {
  await page.evaluate((aan) => {
    const w = window as unknown as { __axeZetStem?: (s: Record<string, unknown>) => void };
    w.__axeZetStem?.({
      voiceStatus: aan ? 'listening' : 'idle',
      liveCall: aan,
      transcript: aan ? 'live' : '',
    });
  }, listening);
  await page.waitForTimeout(200);
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
    await openRoute(page, '/lock/pin', 'black', true);
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

  test('Home: één TelefoonSphere, geen extra particle-PIN of desktop-Home-bol', async ({ page }) => {
    await openRoute(page, '/mobile');
    await expect(page.locator('.axe-mobile-home')).toBeVisible();
    await expect(page.locator('[data-axe-plaat]')).toHaveAttribute('data-axe-plaat', 'ja');
    await expect(page.getByText('Draw your code')).toHaveCount(0);
    await expect(page.locator('[data-axe-lock-pin]')).toHaveCount(0);
    await expect(page.locator('[aria-label="Particle gesture field"]')).toHaveCount(0);
    await expect(page.locator('.axe-scene')).toHaveCount(0);
    await expect(page.locator('[data-axe-phone-tabs]')).toBeVisible();
    const homeCanvases = page.locator('.axe-mobile-home canvas');
    await expect(homeCanvases).toHaveCount(1);
    await page.screenshot({ path: join(shots, 'home.png'), fullPage: false });
    const maat = await overflowEnOverlap(page);
    expect(maat.docOverflow, maat.over.join('; ')).toBe(false);
    expect(maat.overlaps, maat.overlaps.join('; ')).toEqual([]);
  });

  test('Home light + dark, mic uit en aan', async ({ page }) => {
    await openRoute(page, '/mobile', 'black');
    await expect(page.locator('[data-axe-mic]').first()).toHaveAttribute('data-axe-mic', 'uit');
    await page.screenshot({ path: join(shots, 'home-dark-mic-off.png'), fullPage: false });
    await zetStem(page, true);
    await expect(page.locator('[data-axe-mic]').first()).toHaveAttribute('data-axe-mic', 'aan');
    await expect(page.locator('[data-axe-luistert="ja"]')).toBeVisible();
    await page.screenshot({ path: join(shots, 'home-dark-mic-on.png'), fullPage: false });
    await zetStem(page, false);

    await openRoute(page, '/mobile', 'glass');
    await expect(page.locator('html')).toHaveAttribute('data-look', 'glass');
    await page.screenshot({ path: join(shots, 'home-light-mic-off.png'), fullPage: false });
    await zetStem(page, true);
    await expect(page.locator('[data-axe-mic]').first()).toHaveAttribute('data-axe-mic', 'aan');
    await page.screenshot({ path: join(shots, 'home-light-mic-on.png'), fullPage: false });
  });

  for (const tab of TABS.filter((t) => t.route !== '/mobile')) {
    test(`${tab.naam} ${tab.route}: randloos, geen kader, geen overflow`, async ({ page }) => {
      await openRoute(page, tab.route);
      await expect(page.locator('.axe-shell')).toBeVisible();
      await expect(page.locator('[data-axe-lock-pin]')).toHaveCount(0);
      if (tab.route !== '/maps-3d') {
        await expect(page.locator('[data-axe-randloos]')).toHaveAttribute('data-axe-randloos', 'ja');
        await expect(page.locator('.axe-plaat-mobiel')).toHaveCount(0);
        const kader = await page.evaluate(() => {
          const el = document.querySelector('.axe-shell');
          if (!el) return { radius: 'missing', left: -1 };
          const cs = getComputedStyle(el);
          const r = el.getBoundingClientRect();
          return { radius: cs.borderRadius, left: Math.round(r.left), right: Math.round(window.innerWidth - r.right) };
        });
        expect(kader.left, `${tab.route} left inset`).toBe(0);
        expect(kader.right, `${tab.route} right inset`).toBe(0);
        expect(kader.radius === '0px' || kader.radius === '0' || kader.radius === '', kader.radius).toBeTruthy();
      }
      await page.screenshot({ path: join(shots, `${tab.naam}.png`), fullPage: false });
      if (tab.naam === 'agents' || tab.naam === 'trading' || tab.naam === 'settings') {
        await openRoute(page, tab.route, 'glass');
        await page.screenshot({ path: join(shots, `${tab.naam}-light.png`), fullPage: false });
      }
      const maat = await overflowEnOverlap(page);
      expect(maat.docOverflow, `${tab.route} doc: ${maat.over.join('; ')}`).toBe(false);
      expect(maat.overlaps, `${tab.route} overlap: ${maat.overlaps.join('; ')}`).toEqual([]);
    });
  }
});
