import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '../..');
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8');

describe('mobile PWA entry', () => {
  it('redirects phone-sized root launches to the canonical mobile Home', () => {
    const app = read('src/app/App.tsx');
    expect(app).toContain('function HomeEntry()');
    expect(app).toContain('if (isMobile) return <Navigate to="/mobile" replace />;');
    expect(app).toContain('<Route index element={<HomeEntry />} />');
  });

  it('keeps the PWA install identity stable and starts on mobile', () => {
    const manifest = JSON.parse(read('public/manifest.json')) as {
      id?: string;
      scope?: string;
      start_url?: string;
    };
    expect(manifest.id).toBe('/');
    expect(manifest.scope).toBe('/');
    expect(manifest.start_url).toBe('/#/mobile');
  });

  // iOS 26 (WebKit 301108): met black-translucent + viewport-fit=cover is het
  // venster van een geïnstalleerde PWA een statusbalk te kort, en de onderste
  // 62pt tekent geen CSS. Alleen `black` laat het venster tot de onderrand lopen.
  it('asks iOS for the opaque black status bar so the window reaches the bottom edge', () => {
    const html = read('index.html');
    expect(html).toContain('<meta name="apple-mobile-web-app-status-bar-style" content="black" />');
    expect(html).not.toContain('content="black-translucent"');
    expect(html).toContain('viewport-fit=cover');
  });

  // iOS 26 kleurt de statusbalk naar body (theme-color negeert hij). Body is
  // voor het Mac-glas doorzichtig, wat op de iPhone een lichtblauwe balk gaf.
  it('paints html/body black only in the installed iPhone app, so the status bar is black', () => {
    const html = read('index.html');
    const css = read('src/design/axe-look.css');
    expect(html).toMatch(/if \(window\.navigator\.standalone === true\) \{\s*document\.documentElement\.dataset\.iosPwa = '1';/);
    expect(css).toContain(':root[data-look][data-ios-pwa] body { background-color: #000 !important; }');
    // Tauri blijft doorzichtig: de algemene regel staat er nog.
    expect(css).toContain(':root[data-look] #root { background: transparent !important; }');
  });

  // iOS 26 leest de balkkleur van het vaste element bovenaan, alleen bij
  // opstarten en als zo'n element verschijnt. Na installeren bleef hij
  // lichtblauw tot de zijlade open en dicht ging (28 sep).
  it('puts a black fixed strip at the top of the iPhone app from the first frame', () => {
    const html = read('index.html');
    expect(html).toContain('<div id="axe-ios-balk" aria-hidden="true"></div>');
    expect(html).toContain('#axe-ios-balk { display: none; }');
    expect(html).toMatch(/html\[data-ios-pwa\] #axe-ios-balk \{[^}]*position: fixed;[^}]*top: 0;[^}]*background-color: #000;/);
    // WebKit telt een element van 10px of lager niet mee voor de balkkleur
    // (2 okt: 2px gaf een lichte balk). Het vak is 12px, alleen 2px zwart.
    const balk = html.match(/html\[data-ios-pwa\] #axe-ios-balk \{([^}]*)\}/)?.[1] ?? '';
    expect(balk).toContain('padding-bottom: 10px;');
    expect(balk).toContain('box-sizing: content-box;');
    expect(balk).toContain('background-clip: content-box;');
    expect(balk).toContain('pointer-events: none;');
    // Verse installatie start donker, niet in de lichte standaardlook.
    expect(html).toMatch(/if \(!localStorage\.getItem\('axe_look'\)\) \{\s*localStorage\.setItem\('axe_look', 'black'\);/);
  });
});
