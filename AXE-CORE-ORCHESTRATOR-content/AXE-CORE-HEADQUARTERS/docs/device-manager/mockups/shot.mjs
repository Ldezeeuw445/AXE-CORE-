import { chromium } from '@playwright/test';
import { readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const skip = new Set(['home.html']); // real /mobile capture, not a sketch
const pages = readdirSync(here)
  .filter((f) => f.endsWith('.html') && !f.startsWith('contact-') && !skip.has(f))
  .sort();

const APPS = {
  trading: ['trading-watchlist', 'trading-chart', 'trading-positions', 'trading-algo', 'trading-intel'],
  northsea: ['northsea-pipeline', 'northsea-deal', 'northsea-counterparties', 'northsea-drafts', 'northsea-approvals'],
  browser: ['browser-start', 'browser-page', 'browser-tabs', 'browser-bookmarks', 'browser-reader'],
  companion: ['companion-home', 'companion-markets', 'companion-chart', 'companion-axe', 'companion-account'],
  axon: ['axon-home', 'axon-capture', 'axon-thread', 'axon-cores', 'axon-obsidian', 'axon-trading'],
  developer: ['developer-projects', 'developer-files', 'developer-editor', 'developer-agent', 'developer-preview', 'developer-builder', 'developer-git'],
  shell: ['more', 'more-pins', 'agents', 'systems', 'tasks', 'notifications', 'settings'],
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 384, height: 832 }, deviceScaleFactor: 2 });

for (const look of ['black', 'glass']) {
  for (const file of pages) {
    const url = pathToFileURL(join(here, file)).href;
    await page.goto(url);
    await page.evaluate((stand) => { document.documentElement.dataset.look = stand; }, look);
    await page.waitForTimeout(60);
    const stem = file.replace(/\.html$/, '');
    const uit = look === 'black' ? `${stem}-dark.png` : `${stem}-light.png`;
    await page.screenshot({ path: join(here, uit), fullPage: false });
  }
}

await page.setViewportSize({ width: 1280, height: 900 });
for (const look of ['dark', 'light']) {
  for (const [app, screens] of Object.entries(APPS)) {
    const cols = 3;
    const tw = 192;
    const th = 416;
    const w = 24 + cols * tw + (cols - 1) * 10;
    const rows = Math.ceil(screens.length / cols);
    const h = 56 + rows * th + (rows - 1) * 10;
    const html = `<!doctype html>
<html><head><meta charset="utf-8" />
<style>
  html,body{margin:0;background:#050608;color:#e8eaee;font-family:Inter,sans-serif}
  .sheet{padding:16px}
  h1{font-size:13px;letter-spacing:.14em;text-transform:uppercase;margin:0 0 12px;font-weight:650}
  .grid{display:grid;grid-template-columns:repeat(${cols},${tw}px);gap:10px}
  figure{margin:0}
  img{width:${tw}px;height:${th}px;object-fit:cover;border-radius:10px;display:block}
  figcaption{font-size:10px;opacity:.6;margin-top:4px}
</style></head>
<body><div class="sheet"><h1>${app} · ${look}</h1>
<div class="grid">
${screens.map((s) => `<figure><img src="${s}-${look}.png" alt="${s}" /><figcaption>${s}</figcaption></figure>`).join('\n')}
</div></div></body></html>`;
    const contactFile = join(here, `contact-${app}.html`);
    writeFileSync(contactFile, html);
    await page.setViewportSize({ width: w, height: h + 24 });
    await page.goto(pathToFileURL(contactFile).href);
    await page.waitForLoadState('networkidle');
    await page.screenshot({
      path: join(here, `contact-${app}-${look}.png`),
      fullPage: true,
    });
  }
}

await browser.close();
console.log(`shots: ${pages.length} html × 2 looks + ${Object.keys(APPS).length} contact × 2`);
