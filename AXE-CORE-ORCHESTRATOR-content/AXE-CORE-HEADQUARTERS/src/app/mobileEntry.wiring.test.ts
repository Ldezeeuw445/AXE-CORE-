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
    expect(html).toContain("if (window.navigator.standalone === true) document.documentElement.dataset.iosPwa = '1';");
    expect(css).toContain(':root[data-look][data-ios-pwa] body { background-color: #000 !important; }');
    // Tauri blijft doorzichtig: de algemene regel staat er nog.
    expect(css).toContain(':root[data-look] #root { background: transparent !important; }');
  });
});
