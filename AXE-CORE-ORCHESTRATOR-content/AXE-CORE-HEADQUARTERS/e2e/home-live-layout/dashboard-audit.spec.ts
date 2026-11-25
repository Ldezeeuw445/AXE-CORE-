/**
 * Dashboard-audit (25 nov, Luka: "elke pagina één dashboard, niet scrollen").
 * Meet per route hoeveel er te scrollen valt: de grootste (scrollHeight -
 * clientHeight) van een zichtbare scrollcontainer > 200px breed. Schrijft
 * JSON naar /workspace/twin/ui-pass/dashboard-audit-<W>x<H>-<SUFFIX>.json en,
 * met SHOTS=1, een schermafdruk per route.
 */
import { test, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

const dir = '/workspace/twin/ui-pass';
const SUFFIX = process.env.SUFFIX || 'voor';
const SIZES = (process.env.SIZES || '1440x900,1280x800').split(',').map((s) => s.split('x').map(Number) as [number, number]);
const ROUTES = (process.env.ROUTES || [
  '/', '/status', '/wacht', '/apps', '/tasks', '/brief', '/calendar', '/ledger', '/companion',
  '/notifications', '/memory', '/memory/explore', '/memory/trading', '/obsidian', '/knowledge',
  '/trading', '/trading-desk', '/trading-intel', '/managers', '/dax', '/bouwen', '/systeem',
  '/northsea', '/finance', '/mcp', '/infrastructure', '/terminals', '/settings', '/table-editor',
  '/cron-manager', '/control-plane', '/crewai', '/developer', '/code-editor', '/browser',
  '/computer-use', '/mobile', '/device', '/portal',
].join(',')).split(',');

async function meet(page: Page) {
  return page.evaluate(() => {
    let max = 0; let wie = '';
    const doc = document.scrollingElement!;
    const docOver = doc.scrollHeight - doc.clientHeight;
    document.querySelectorAll<HTMLElement>('body *').forEach((el) => {
      const cs = getComputedStyle(el);
      if (!/(auto|scroll)/.test(cs.overflowY)) return;
      const r = el.getBoundingClientRect();
      if (r.width < 200 || r.height < 60 || cs.visibility === 'hidden' || cs.display === 'none') return;
      if (el.closest('.axe-schuifbalk, [data-lade], aside')) return; // lades tellen niet
      const over = el.scrollHeight - el.clientHeight;
      if (over > max) { max = over; wie = (el.className?.toString?.() || el.tagName).slice(0, 90); }
    });
    return { over: Math.max(max, docOver), wie, docOver, h: window.innerHeight };
  });
}

for (const [w, h] of SIZES) {
  test(`dashboard-audit ${w}x${h}`, async ({ page }) => {
    test.setTimeout(30 * 60_000);
    mkdirSync(dir, { recursive: true });
    await page.addInitScript(() => { try { localStorage.setItem('axe_look', 'black'); } catch { /* */ } });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: w, height: h });
    const uit: Record<string, unknown> = {};
    for (const r of ROUTES) {
      try {
        await page.goto(`/?ontwerp=1#${r}`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('.axe-shell', { timeout: 60_000 });
        await page.waitForTimeout(3000);
        uit[r] = await meet(page);
        if (process.env.SHOTS === '1') {
          const naam = r === '/' ? 'home' : r.slice(1).replace(/\//g, '-');
          await page.screenshot({ path: `${dir}/dashboard-${naam}-${SUFFIX}-${w}x${h}.png` });
        }
      } catch (e) { uit[r] = { fout: String(e).slice(0, 200) }; }
    }
    writeFileSync(`${dir}/dashboard-audit-${w}x${h}-${SUFFIX}.json`, JSON.stringify(uit, null, 1));
  });
}
