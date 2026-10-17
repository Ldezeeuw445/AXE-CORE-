import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const shots = join(here, 'shots');
mkdirSync(shots, { recursive: true });

const TABS: ReadonlyArray<{ route: string; naam: string }> = [
  { route: '/mobile', naam: 'home' },
  { route: '/trading', naam: 'trading' },
  { route: '/maps-3d', naam: 'desk' },
  { route: '/browser', naam: 'browser' },
  { route: '/companion', naam: 'companion' },
  { route: '/memory', naam: 'memory' },
  { route: '/code-editor', naam: 'developer' },
  { route: '/tasks', naam: 'tasks' },
  { route: '/infrastructure', naam: 'systems' },
];

const MENU = [
  'Home', 'Trading', 'NorthSea Desk', 'Browser', 'AXE Companion',
  'AXON Memory', 'AXE Developer', 'Tasks', 'Systems',
];

const ZONDER_COMPOSER = new Set(['/memory', '/companion', '/code-editor']);

/** Alle AppShell-routes die na unlock bereikbaar zijn. /lock en /lock/pin sturen Android naar Home. */
const ALLE_TABS: readonly string[] = [
  '/mobile', '/maps-3d', '/agents', '/trading', '/memory', '/tasks', '/calendar',
  '/settings', '/browser', '/status', '/ai-core', '/apps', '/ledger', '/obsidian',
  '/knowledge', '/trading-intel', '/finance', '/mcp', '/infrastructure', '/terminals',
  '/table-editor', '/cron-manager', '/control-plane', '/crewai', '/developer',
  '/code-editor', '/eve', '/computer-use', '/organization', '/thinkthanks',
  '/device', '/devices', '/lock', '/lock/pin', '/companion', '/notifications',
];

type AxeOntwerp = {
  __AXE_ANDROID__?: { v: number };
  __axeZetPin?: (pin: string) => Promise<void>;
  __axeWisPin?: () => Promise<void>;
  __axeVergrendel?: () => void;
};

async function openRoute(page: Page, route: string, look: 'black' | 'glass' = 'black', android = false) {
  if (android) {
    await page.addInitScript(() => {
      (window as unknown as AxeOntwerp).__AXE_ANDROID__ = { v: 1 };
    });
  }
  await page.addInitScript((stand) => {
    try { localStorage.setItem('axe_look', stand); } catch { /* */ }
  }, look);
  await page.goto(`/?ontwerp=1#${route}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => {
    const wacht = document.querySelector('[data-axe-lock-wacht]');
    const shell = document.querySelector('.axe-shell');
    const pin = document.querySelector('[data-axe-lock-pin]');
    return (!wacht && !!shell) || !!pin;
  }, { timeout: 45_000 });
  await page.evaluate((stand) => {
    document.documentElement.dataset.look = stand;
    try { localStorage.setItem('axe_look', stand); } catch { /* */ }
  }, look);
  await page.waitForTimeout(400);
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

async function sfeerTelling(page: Page) {
  return page.evaluate(() => {
    const bol = document.querySelectorAll('[data-axe-bol]').length;
    const gesture = document.querySelectorAll('[aria-label="Particle gesture field"]').length;
    const pinCanvas = document.querySelectorAll('[data-axe-lock-pin] canvas').length;
    const scene = document.querySelectorAll('.axe-scene, .axe-shell-sphere').length;
    const holographic = document.querySelectorAll('[class*="holographic"]').length;
    return { bol, gesture, pinCanvas, scene, holographic };
  });
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
      if (cs.overflowX === 'hidden' || cs.overflow === 'hidden' || cs.overflowX === 'auto' || cs.overflowX === 'scroll') return false;
      let p: HTMLElement | null = el.parentElement;
      while (p) {
        const pcs = getComputedStyle(p);
        if (pcs.overflowX === 'auto' || pcs.overflowX === 'scroll' || pcs.overflowX === 'hidden' || pcs.overflow === 'hidden') return false;
        p = p.parentElement;
      }
      return r.right > w + 2 || r.left < -2;
    }).slice(0, 8).map((el) => {
      const r = el.getBoundingClientRect();
      const cls = String(el.className || '').slice(0, 80);
      return `${el.tagName}.${cls} @${Math.round(r.right)}`;
    });
    const docOverflow = document.documentElement.scrollWidth > w + 2;
    const chrome = [
      document.querySelector('[data-axe-phone-appbar]'),
      document.querySelector('.axe-mobile-tab-composer'),
      document.querySelector('.axe-mobile-look-toggle'),
      document.querySelector('.axe-taak-toast'),
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
  test.describe.configure({ mode: 'serial' });
  test('lockscreen blijft glance: geen PIN, geen particle, geen Home-bol', async ({ page }) => {
    await openRoute(page, '/lock', 'black', false);
    await expect(page.locator('.axe-lock-pad')).toBeVisible();
    await expect(page.getByText('Draw your code')).toHaveCount(0);
    await expect(page.locator('[aria-label="Particle gesture field"]')).toHaveCount(0);
    await expect(page.locator('[data-axe-bol]')).toHaveCount(0);
    await expect(page.locator('[data-axe-phone-tabs]')).toHaveCount(0);
    await page.screenshot({ path: join(shots, 'lock-glance.png'), fullPage: false });
  });

  test('Android zonder PIN: swipe-pad (lock → Home), nooit particle-PIN', async ({ page }) => {
    await openRoute(page, '/lock', 'black', true);
    await expect(page.locator('.axe-mobile-home')).toBeVisible({ timeout: 45_000 });
    await expect(page.locator('[data-axe-lock-pin]')).toHaveCount(0);
    await expect(page.getByText('Draw your code')).toHaveCount(0);
    await expect(page.locator('[aria-label="Particle gesture field"]')).toHaveCount(0);
    await expect(page.locator('[data-axe-bol]')).toHaveCount(1);
    await page.screenshot({ path: join(shots, 'unlock-no-pin-home.png'), fullPage: false });
  });

  test('Android met PIN: keypad zonder canvas, ontgrendelen bereikt Home', async ({ page }) => {
    await openRoute(page, '/mobile', 'black', true);
    await expect(page.locator('.axe-mobile-home')).toBeVisible();
    await page.waitForFunction(() => typeof (window as unknown as AxeOntwerp).__axeZetPin === 'function');
    await page.evaluate(async () => {
      const w = window as unknown as AxeOntwerp;
      await w.__axeZetPin?.('1472');
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-axe-pin-pad]', { timeout: 45_000 });
    await expect(page.locator('[data-axe-pin-soort="numeric"]')).toBeVisible();
    await expect(page.getByText('Enter PIN')).toBeVisible();
    await expect(page.getByText('Draw your code')).toHaveCount(0);
    await expect(page.locator('[data-axe-lock-pin] canvas')).toHaveCount(0);
    await expect(page.locator('[aria-label="Particle gesture field"]')).toHaveCount(0);
    await expect(page.locator('[data-axe-bol]')).toHaveCount(0);
    await page.screenshot({ path: join(shots, 'lock-pin.png'), fullPage: false });

    for (const d of ['1', '4', '7', '2']) {
      await page.locator(`[data-axe-pin-toets="${d}"]`).click();
    }
    await expect(page.locator('.axe-mobile-home')).toBeVisible({ timeout: 45_000 });
    await expect(page.locator('[data-axe-bol]')).toHaveCount(1);
    await expect(page.locator('[data-axe-lock-pin]')).toHaveCount(0);
    await page.screenshot({ path: join(shots, 'unlock-pin-home.png'), fullPage: false });
  });

  test('Android opslag faalt: geen particle-PIN, schil blijft bereikbaar', async ({ page }) => {
    await openRoute(page, '/mobile', 'black', true);
    await page.waitForFunction(() => typeof (window as unknown as AxeOntwerp).__axeZetPin === 'function');
    await page.evaluate(async () => {
      await (window as unknown as AxeOntwerp).__axeZetPin?.('1472');
      const proto = Object.getPrototypeOf(localStorage) as Storage;
      const orig = proto.getItem;
      proto.getItem = function (this: Storage, k: string) {
        if (String(k).includes('axe_android') || String(k).includes('gesture')) {
          throw new Error('Secure storage unavailable');
        }
        return orig.call(this, k);
      };
    });
    await page.evaluate(() => { (window as unknown as AxeOntwerp).__axeVergrendel?.(); });
    await page.goto('/?ontwerp=1#/agents', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => {
      const wacht = document.querySelector('[data-axe-lock-wacht]');
      const shell = document.querySelector('.axe-shell');
      const overslaan = document.querySelector('[data-axe-pin-overslaan]');
      return (!wacht && !!shell) || !!overslaan;
    }, { timeout: 45_000 });
    const overslaan = page.locator('[data-axe-pin-overslaan]');
    if (await overslaan.count()) await overslaan.click();
    await expect(page.locator('.axe-shell')).toBeVisible();
    await expect(page.locator('[aria-label="Particle gesture field"]')).toHaveCount(0);
    await expect(page.getByText('Draw your code')).toHaveCount(0);
  });

  test('geen particle/canvas-bol behalve TelefoonSphere: lock → Home → elke tab', async ({ page }) => {
    await openRoute(page, '/lock', 'black', true);
    await expect(page.locator('.axe-mobile-home')).toBeVisible({ timeout: 45_000 });
    let sfeer = await sfeerTelling(page);
    expect(sfeer, 'Home na unlock').toMatchObject({ bol: 1, gesture: 0, pinCanvas: 0, scene: 0 });

    for (const route of ALLE_TABS) {
      await page.goto(`/?ontwerp=1#${route}`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => {
        const wacht = document.querySelector('[data-axe-lock-wacht]');
        return !wacht && !!document.querySelector('.axe-shell');
      }, { timeout: 45_000 });
      await page.waitForTimeout(250);
      sfeer = await sfeerTelling(page);
      const opHome = await page.locator('.axe-mobile-home').count();
      if (opHome) {
        expect(sfeer, `${route} (Home)`).toMatchObject({ bol: 1, gesture: 0, pinCanvas: 0, scene: 0 });
      } else {
        expect(sfeer.bol, `${route} bol`).toBe(0);
        expect(sfeer.gesture, `${route} gesture`).toBe(0);
        expect(sfeer.pinCanvas, `${route} pin canvas`).toBe(0);
        expect(sfeer.scene, `${route} scene`).toBe(0);
      }
      await expect(page.locator('[aria-label="Particle gesture field"]')).toHaveCount(0);
      await expect(page.getByText('Draw your code')).toHaveCount(0);
    }
  });

  test('Home: één TelefoonSphere, geen extra particle-PIN of desktop-Home-bol', async ({ page }) => {
    await openRoute(page, '/mobile');
    await expect(page.locator('.axe-mobile-home')).toBeVisible();
    await expect(page.locator('[data-axe-plaat]')).toHaveAttribute('data-axe-plaat', 'ja');
    await expect(page.getByText('Draw your code')).toHaveCount(0);
    await expect(page.locator('[data-axe-lock-pin]')).toHaveCount(0);
    await expect(page.locator('[aria-label="Particle gesture field"]')).toHaveCount(0);
    await expect(page.locator('.axe-scene')).toHaveCount(0);
    await expect(page.locator('[data-axe-phone-tabs]')).toHaveCount(0);
    await expect(page.locator('[data-axe-phone-appbar]')).toHaveCount(0);
    await expect(page.locator('[data-axe-bol]')).toHaveCount(1);
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
    await page.evaluate(() => {
      document.documentElement.dataset.look = 'glass';
      try { localStorage.setItem('axe_look', 'glass'); } catch { /* */ }
    });
    const naarLicht = page.locator('.axe-mobile-look-toggle button[aria-label="Naar licht"]');
    if (await naarLicht.count()) await naarLicht.click();
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
      await expect(page.locator('[data-axe-bol]')).toHaveCount(0);
      if (tab.route !== '/browser') {
        await expect(page.locator('[data-axe-randloos]')).toHaveAttribute('data-axe-randloos', 'ja');
      }
      await expect(page.locator('.axe-plaat-mobiel')).toHaveCount(0);
      await expect(page.locator('[data-axe-phone-tabs]')).toHaveCount(0);
      await expect(page.locator('[data-axe-phone-appbar]')).toHaveCount(1);
      await expect(page.locator('.axe-taak-toast')).toHaveCount(0);
      await expect(page.getByText('‹ More')).toHaveCount(0);
      const pijlen = await page.locator('.axe-railtoggle').evaluateAll((els) =>
        els.filter((el) => getComputedStyle(el).display !== 'none').length,
      );
      expect(pijlen, `${tab.route} edge chevrons`).toBe(0);
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
      if (tab.route === '/companion' || tab.route === '/memory') {
        await page.waitForTimeout(2800);
      }
      await page.screenshot({ path: join(shots, `${tab.naam}.png`), fullPage: false });
      await openRoute(page, tab.route, 'glass');
      if (tab.route === '/companion' || tab.route === '/memory') {
        await page.waitForTimeout(2800);
      }
      await page.screenshot({ path: join(shots, `${tab.naam}-light.png`), fullPage: false });
      const maat = await overflowEnOverlap(page);
      expect(maat.docOverflow, `${tab.route} doc: ${maat.over.join('; ')}`).toBe(false);
      expect(maat.overlaps, `${tab.route} overlap: ${maat.overlaps.join('; ')}`).toEqual([]);
    });
  }

  test('bel opent de in-app meldingenlijst', async ({ page }) => {
    await openRoute(page, '/mobile', 'black', true);
    await page.locator('.axe-phone-bel').click();
    await expect(page.locator('[data-axe-phone-meldingen]')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Notifications' })).toBeVisible();
    await expect(page.getByText('Yes needed').first()).toBeVisible();
    await expect(page.getByText('Stuck').first()).toBeVisible();
    await expect(page.getByText('Done').first()).toBeVisible();
    await expect(page.getByText('Goedkeuring nodig').first()).toBeVisible();
    await page.screenshot({ path: join(shots, 'notifications.png'), fullPage: false });
    await page.getByText('Close', { exact: true }).click();
    await openRoute(page, '/mobile', 'glass', true);
    await page.locator('.axe-phone-bel').click();
    await expect(page.locator('[data-axe-phone-meldingen]')).toBeVisible();
    await page.screenshot({ path: join(shots, 'notifications-light.png'), fullPage: false });
  });

  test('hamburger toont precies de negen telefoon-apps', async ({ page }) => {
    await openRoute(page, '/trading', 'black', true);
    await page.locator('[aria-label="Menu openen"]').first().click();
    const namen = await page.locator('[data-axe-phone-menu-lijst] [data-axe-menu-item]').allTextContents();
    expect(namen.map((n) => n.trim())).toEqual(MENU);
    await expect(page.getByText('Favourites')).toHaveCount(0);
    await expect(page.getByText('Code Editor')).toHaveCount(0);
  });

  test('Companion en AXON zijn vol-scherm zonder ‹ More', async ({ page }) => {
    for (const route of ['/companion', '/memory'] as const) {
      await openRoute(page, route, 'black', true);
      await expect(page.locator('[data-axe-phone-appbar]')).toHaveCount(1);
      await expect(page.locator('[data-axe-embed-frame]')).toBeVisible();
      await expect(page.getByText('‹ More')).toHaveCount(0);
      await expect(page.locator('[data-axe-embed-terug]')).toHaveCount(0);
      await expect(page.locator('[data-axe-phone-tabs]')).toHaveCount(0);
      await expect(page.locator('.axe-mobile-tab-composer')).toHaveCount(0);
    }
  });

  test('composer aanwezig behalve AXON, Companion en Developer', async ({ page }) => {
    const routes = [
      '/trading', '/maps-3d', '/browser', '/infrastructure', '/tasks',
      '/memory', '/companion', '/code-editor',
    ];
    for (const route of routes) {
      await openRoute(page, route, 'black', true);
      const n = await page.locator('.axe-mobile-tab-composer').count();
      if (ZONDER_COMPOSER.has(route)) {
        expect(n, `${route} composer`).toBe(0);
      } else {
        expect(n, `${route} composer`).toBeGreaterThan(0);
        await expect(page.locator('[data-axe-mic]').first()).toBeVisible();
        const flush = await page.locator('.axe-mobile-tab-composer').evaluate((el) => {
          const r = el.getBoundingClientRect();
          return Math.round(window.innerHeight - r.bottom);
        });
        expect(flush, `${route} composer flush`).toBeLessThanOrEqual(8);
      }
    }
  });

  test('Trading heeft geen Buy/Sell', async ({ page }) => {
    await openRoute(page, '/trading', 'black', true);
    await expect(page.getByText('Read-only')).toBeVisible();
    await expect(page.getByRole('button', { name: /^buy$/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^sell$/i })).toHaveCount(0);
  });

  test('Browser navigeert via de adresbalk', async ({ page }) => {
    await openRoute(page, '/browser', 'black', true);
    await expect(page.locator('[data-axe-browser-adres]')).toBeVisible();
    await page.locator('[data-axe-browser-adres]').fill('example.com');
    await page.locator('[data-axe-browser-adres]').press('Enter');
    await expect(page.locator('[data-axe-browser-adres]')).toHaveValue(/example\.com/);
    await expect(page.locator('[data-axe-phone-app="browser"]')).toBeVisible();
  });

  test('contact sheets van de gebouwde app', async ({ page }) => {
    const groepen: Record<string, string[]> = {
      shell: ['home', 'systems', 'tasks'],
      trading: ['trading'],
      northsea: ['desk'],
      browser: ['browser'],
      companion: ['companion'],
      axon: ['memory'],
      developer: ['developer'],
    };
    for (const look of ['black', 'glass'] as const) {
      for (const [groep, namen] of Object.entries(groepen)) {
        const html = `<!doctype html><meta charset="utf-8"><style>
          body{margin:0;background:#111;color:#eee;font:12px sans-serif}
          .g{display:flex;flex-wrap:wrap;gap:8px;padding:8px}
          img{width:192px;height:416px;object-fit:cover;border:1px solid #333}
        </style><div class="g">${namen.map((n) => {
          const file = look === 'glass'
            ? (n === 'home' ? 'home-light-mic-off.png' : `${n}-light.png`)
            : (n === 'home' ? 'home.png' : `${n}.png`);
          return `<div><img src="${file}"><div>${n}</div></div>`;
        }).join('')}</div>`;
        writeFileSync(join(shots, `contact-${groep}-${look}.html`), html);
      }
    }
    await page.setViewportSize({ width: 1400, height: 900 });
    for (const look of ['dark', 'light'] as const) {
      const key = look === 'dark' ? 'black' : 'glass';
      for (const groep of Object.keys(groepen)) {
        await page.goto(`file://${join(shots, `contact-${groep}-${key}.html`)}`);
        await page.screenshot({ path: join(shots, `contact-${groep}-${look}.png`), fullPage: true });
      }
    }
  });
});
