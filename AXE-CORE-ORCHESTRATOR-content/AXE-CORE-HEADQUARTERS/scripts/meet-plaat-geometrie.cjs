#!/usr/bin/env node
/**
 * Meet of .axe-tabruimte en .axe-browser-vak dezelfde breedte hebben.
 *
 * Laadt alleen axe-look.css in een leeg document — geen React, geen login.
 * Zo is de som de CSS-engine, niet een toevallige pagina-indeling.
 *
 * Exit 0 = JSON op stdout. Exit 2 = Playwright/Chromium ontbreekt (SKIP).
 */
const fs = require('fs');
const path = require('path');

function playwrightMod() {
  const kandidaten = [
    'playwright',
    'playwright-core',
    path.join(require('child_process').execSync('npm root -g', { encoding: 'utf8' }).trim(), 'playwright'),
  ];
  for (const k of kandidaten) {
    try {
      return require(k);
    } catch {
      /* volgende */
    }
  }
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
  const pw = playwrightMod();
  if (!pw) {
    process.stdout.write('SKIP: geen playwright\n');
    process.exit(2);
  }
  const cssPad = path.join(__dirname, '../src/design/axe-look.css');
  const css = fs.readFileSync(cssPad, 'utf8');
  const html = `<!doctype html>
<html data-look="black">
<head><meta charset="utf-8"><style>${css}
html, body { margin: 0; background: #000; }
</style></head>
<body>
  <div class="axe-tabruimte" id="tab">tab</div>
  <div class="axe-browser-vak" id="vak">vak</div>
</body>
</html>`;

  const exe = process.env.CHROMIUM || chromiumPad();
  let browser;
  try {
    browser = await pw.chromium.launch(exe ? { executablePath: exe } : {});
  } catch (e) {
    process.stdout.write(`SKIP: chromium start niet (${e && e.message ? e.message : e})\n`);
    process.exit(2);
  }

  const maten = [];
  try {
    for (const vw of [1440, 1920]) {
      const ctx = await browser.newContext({ viewport: { width: vw, height: 900 } });
      const page = await ctx.newPage();
      await page.setContent(html, { waitUntil: 'load' });
      const m = await page.evaluate(() => {
        const box = (sel) => {
          const e = document.querySelector(sel);
          if (!e) return null;
          const r = e.getBoundingClientRect();
          return { width: Math.round(r.width), left: Math.round(r.left), right: Math.round(r.right) };
        };
        return { tab: box('.axe-tabruimte'), vak: box('.axe-browser-vak'), inner: window.innerWidth };
      });
      maten.push({ vw, ...m });
      await ctx.close();
    }
  } finally {
    await browser.close();
  }

  process.stdout.write(`${JSON.stringify({ maten })}\n`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
