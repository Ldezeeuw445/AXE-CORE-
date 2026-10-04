/**
 * De meldingen-handlers zitten echt in de gebouwde worker.
 *
 * Gemeten op 4 okt 2026 na `npm run build:web`: `dist/public/sw.js` bevat
 * `importScripts("/axe-push-sw.js")` en dat bestand ligt ernaast. Dat was een
 * meting van één middag; deze test maakt er een afspraak van.
 *
 * Waarom dat nodig is: `generateSW` schrijft de worker zelf, dus onze twee
 * handlers komen er alleen in via die ene regel in `vite.config.ts`. Valt die
 * weg -- bij een upgrade van vite-plugin-pwa, of omdat iemand de workbox-opties
 * herschikt -- dan bouwt alles door, blijft de app werken, en komt er alleen
 * nooit meer een melding aan. Precies het soort stilte dat hier al vaker
 * maanden onopgemerkt bleef.
 *
 * Deze test leest de bron en niet de bouwuitvoer: `dist/` staat niet in git en
 * bestaat niet op een verse checkout, dus een test die daarop leunt is groen om
 * de verkeerde reden (of rood zonder dat er iets mis is).
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

const ROOT = join(__dirname, '../..');

describe('de meldingen-worker is aangesloten', () => {
  it('vite.config.ts laadt axe-push-sw.js in de gegenereerde worker', () => {
    const config = readFileSync(join(ROOT, 'vite.config.ts'), 'utf8');
    expect(config).toMatch(/importScripts:\s*\['\/axe-push-sw\.js'\]/);
  });

  it('en dat bestand bestaat, in public/ zodat het meegekopieerd wordt', () => {
    expect(existsSync(join(ROOT, 'public/axe-push-sw.js'))).toBe(true);
  });

  it('de worker toont een melding en opent de juiste route bij een tik', () => {
    const sw = readFileSync(join(ROOT, 'public/axe-push-sw.js'), 'utf8');
    expect(sw).toContain("addEventListener('push'");
    expect(sw).toContain('showNotification');
    expect(sw).toContain("addEventListener('notificationclick'");
    // HashRouter: zonder de # landt elke tik op de homepagina.
    expect(sw).toMatch(/`\/#\$\{route\}`/);
  });

  it('een Tauri-bouw houdt de worker uit, zoals hij al deed', () => {
    // De APK en de Mac-app hebben geen service worker; stond die registratie er
    // wel, dan kwam hij als rode foutbanner over de app.
    const config = readFileSync(join(ROOT, 'vite.config.ts'), 'utf8');
    expect(config).toMatch(/disable:\s*isAndroidShell \|\| process\.env\.AXE_TAURI_BUILD === '1'/);
    expect(config).toMatch(/selfDestroying:\s*isTauriBuild/);
  });
});
