import { chromium } from '@playwright/test';
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const pages = readdirSync(here).filter((f) => f.endsWith('.html')).sort();

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 384, height: 832 }, deviceScaleFactor: 2 });

for (const look of ['black', 'glass']) {
  for (const file of pages) {
    const url = pathToFileURL(join(here, file)).href;
    await page.goto(url);
    await page.evaluate((stand) => { document.documentElement.dataset.look = stand; }, look);
    await page.waitForTimeout(80);
    const stem = file.replace(/\.html$/, '');
    const uit = look === 'black' ? `${stem}-dark.png` : `${stem}-light.png`;
    await page.screenshot({ path: join(here, uit), fullPage: false });
  }
}

await browser.close();
console.log(`shots: ${pages.length} html × 2 looks`);
