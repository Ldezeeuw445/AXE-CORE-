#!/usr/bin/env node
/**
 * Screenshot + geometrie van elke tab, voor/na de plaat-fix.
 *
 * --fase voor   injecteert de oude squeeze-regel (composer-breedte)
 * --fase na     meet de huidige CSS (Browser-plaat)
 * --basis       http://127.0.0.1:5199
 * --uit         map voor PNG's
 *
 * Hash-routes, ?ontwerp=1 vóór de # (UI-MAATSTAF.md).
 */
const fs = require('fs');
const path = require('path');

const TABS = [
  { id: 'browser-home', route: '/browser' },
  { id: 'browser-plaat', route: '/browser', site: 'https://example.com' },
  { id: 'mcp', route: '/mcp' },
  { id: 'agents', route: '/agents' },
  { id: 'tasks', route: '/tasks' },
  { id: 'settings', route: '/settings' },
  { id: 'finance', route: '/finance' },
  { id: 'status', route: '/status' },
  { id: 'calendar', route: '/calendar' },
  { id: 'ledger', route: '/ledger' },
  { id: 'memory', route: '/memory' },
  { id: 'memory-explore', route: '/memory/explore' },
  { id: 'memory-trading', route: '/memory/trading' },
  { id: 'obsidian', route: '/obsidian' },
  { id: 'knowledge', route: '/knowledge' },
  { id: 'trading', route: '/trading' },
  { id: 'trading-intel', route: '/trading-intel' },
  { id: 'infrastructure', route: '/infrastructure' },
  { id: 'terminal', route: '/terminal' },
  { id: 'terminals', route: '/terminals' },
  { id: 'table-editor', route: '/table-editor' },
  { id: 'cron-manager', route: '/cron-manager' },
  { id: 'control-plane', route: '/control-plane' },
  { id: 'maps-3d', route: '/maps-3d' },
  { id: 'crewai', route: '/crewai' },
  { id: 'developer', route: '/developer' },
  { id: 'code-editor', route: '/code-editor' },
  { id: 'eve', route: '/eve' },
  { id: 'computer-use', route: '/computer-use' },
  { id: 'organization', route: '/organization' },
  { id: 'thinkthanks', route: '/thinkthanks' },
  { id: 'device', route: '/device' },
  { id: 'ai-core', route: '/ai-core' },
  { id: 'apps', route: '/apps' },
  { id: 'home', route: '/' },
  { id: 'mobile-home', route: '/mobile' },
];

const SQUEEZE = `
:root[data-look] .axe-tabruimte:not(.axe-tabruimte--vullen) {
  width: min(var(--axe-barw, 1520px), calc(100% - 2 * var(--axe-onder, 75px)));
  max-width: 100%;
  margin-inline: auto;
  align-self: center;
}
`;

function args() {
  const a = process.argv.slice(2);
  const o = {
    fase: 'na',
    basis: 'http://127.0.0.1:5199',
    uit: '/tmp/axe-plaat',
    vw: '1440',
  };
  for (let i = 0; i < a.length; i++) {
    const k = a[i].replace(/^--/, '');
    o[k] = a[++i];
  }
  o.vw = Number(o.vw);
  return o;
}

function playwrightMod() {
  try { return require('playwright'); } catch { /* */ }
  try { return require('playwright-core'); } catch { /* */ }
  return null;
}

function chromiumPad() {
  const root = '/opt/pw-browsers';
  if (!fs.existsSync(root)) return undefined;
  const dirs = fs.readdirSync(root).filter((d) => /^chromium-\d+$/.test(d));
  if (!dirs.length) return undefined;
  const exe = path.join(root, dirs[0], 'chrome-linux/chrome');
  return fs.existsSync(exe) ? exe : undefined;
}

(async () => {
  const o = args();
  const pw = playwrightMod();
  if (!pw) {
    console.error('SKIP: geen playwright');
    process.exit(2);
  }
  fs.mkdirSync(o.uit, { recursive: true });
  const exe = process.env.CHROMIUM || chromiumPad();
  const browser = await pw.chromium.launch(exe ? { executablePath: exe } : {});
  const ctx = await browser.newContext({
    viewport: { width: o.vw, height: 900 },
    deviceScaleFactor: 1,
  });
  await ctx.addInitScript(() => {
    try { localStorage.setItem('axe_look', 'black'); } catch { /* */ }
  });
  const page = await ctx.newPage();
  const metingen = [];

  for (const tab of TABS) {
    const url = `${o.basis}/?ontwerp=1#${tab.route}`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForSelector('.axe-shell', { timeout: 45000 }).catch(() => null);
    if (o.fase === 'voor') {
      await page.addStyleTag({ content: SQUEEZE });
    }
    if (tab.site) {
      const zoek = page.locator('form').filter({ has: page.locator('input, button') }).first();
      const knop = page.getByPlaceholder(/Ask anything|navigate/i);
      try {
        const zichtbaar = await knop.count();
        if (zichtbaar) {
          await knop.click({ timeout: 3000 });
        } else {
          await page.locator('form button, form [type="text"]').first().click({ timeout: 3000 });
        }
        const invoer = page.locator('input[placeholder*="Ask anything"], input[placeholder*="navigate"]');
        await invoer.fill(tab.site, { timeout: 4000 });
        await invoer.press('Enter');
        await page.waitForTimeout(1200);
      } catch {
        await page.evaluate((u) => {
          const form = document.querySelector('form');
          const input = form && form.querySelector('input');
          if (input) {
            input.focus();
            input.value = u;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
          }
        }, tab.site);
        await page.waitForTimeout(800);
      }
      if (o.fase === 'voor') await page.addStyleTag({ content: SQUEEZE });
    }
    await page.waitForTimeout(tab.route === '/mobile' || tab.route === '/' ? 1800 : 900);
    const geo = await page.evaluate(() => {
      const box = (sel) => {
        const e = document.querySelector(sel);
        if (!e) return null;
        const r = e.getBoundingClientRect();
        return {
          sel,
          width: Math.round(r.width),
          left: Math.round(r.left),
          right: Math.round(r.right),
          top: Math.round(r.top),
          height: Math.round(r.height),
        };
      };
      return {
        inner: window.innerWidth,
        hash: location.hash,
        tabruimte: box('.axe-tabruimte'),
        vak: box('.axe-browser-vak'),
        band: box('.axe-bandbreed'),
        home: box('.axe-scene'),
        mobile: box('.axe-mobile-home'),
      };
    });
    const bestand = path.join(o.uit, `${o.fase}_${tab.id}_${o.vw}.png`);
    await page.screenshot({ path: bestand, fullPage: false });
    metingen.push({ tab: tab.id, route: tab.route, bestand, geo });
    process.stderr.write(`${o.fase} ${tab.id} tab=${geo.tabruimte?.width ?? '-'} vak=${geo.vak?.width ?? '-'} band=${geo.band?.width ?? '-'}\n`);
  }

  await browser.close();
  const jsonPad = path.join(o.uit, `${o.fase}_${o.vw}.json`);
  fs.writeFileSync(jsonPad, JSON.stringify(metingen, null, 2));
  process.stdout.write(`${JSON.stringify({ fase: o.fase, vw: o.vw, n: metingen.length, json: jsonPad })}\n`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
