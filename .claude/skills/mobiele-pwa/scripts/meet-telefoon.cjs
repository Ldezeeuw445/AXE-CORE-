#!/usr/bin/env node
/*
 * Meet een AXE CORE-tab zoals hij op Luka's iPhone staat, en maak er een
 * plaatje van op de echte schermmaat.
 *
 * Waarom dit bestaat: op 26/27 sep gingen acht commits naar de onderkant van
 * de mobiele Home zonder dat iemand kon zien wat de telefoon deed. Chromium
 * kan de iOS safe-area nabootsen (CDP Emulation.setSafeAreaInsetsOverride);
 * dan zijn env(safe-area-inset-*) en dus de plaat-geometrie echt te meten.
 *
 * Gebruik (dev-server moet draaien, zie SKILL.md):
 *   node meet-telefoon.cjs --route /mobile --uit na.png
 *   node meet-telefoon.cjs --route /mobile --tauri --uit tauri.png   (zwevende telefoon, geen safe-area)
 * Opties:
 *   --route      hash-route, standaard /mobile
 *   --look       black (donker, standaard) | glass (licht)
 *   --statusbar  black (standaard, wat index.html nu vraagt) | translucent (de iOS 26-bug nabootsen)
 *   --tauri      393x852 zonder safe-area, zoals ZwevendeTelefoon /mobile in Tauri toont
 *   --selector   extra CSS-selector om te meten (mag vaker)
 *   --basis      standaard http://127.0.0.1:5199
 * Uitvoer: JSON met rechthoeken in SCHERMcoördinaten (statusbalk meegeteld),
 * plus <uit> = het scherm als telefoon (statusbalk, home-indicator, ronde hoeken).
 */
const { chromium } = require('playwright');

// iPhone 16/17 Pro, gemeten op Luka's screenshot van 27 sep (1206x2622 @3x).
const SCHERM = { b: 402, h: 874, statusbalk: 62, onder: 34, streep: { x: 129, b: 144, y: 861, h: 5 }, hoek: 55 };

function args() {
  const a = process.argv.slice(2); const o = { route: '/mobile', look: 'black', statusbar: 'black', tauri: false, selector: [], uit: 'telefoon.png', basis: 'http://127.0.0.1:5199' };
  for (let i = 0; i < a.length; i++) {
    const k = a[i].replace(/^--/, '');
    if (k === 'tauri') o.tauri = true;
    else if (k === 'selector') o.selector.push(a[++i]);
    else o[k] = a[++i];
  }
  return o;
}

(async () => {
  const o = args();
  const exe = process.env.CHROMIUM || require('fs').readdirSync('/opt/pw-browsers').filter((d) => /^chromium-\d+$/.test(d)).map((d) => `/opt/pw-browsers/${d}/chrome-linux/chrome`)[0];
  const browser = await chromium.launch(exe ? { executablePath: exe } : {});
  // black: venster begint ONDER de statusbalk, inset boven 0.
  // translucent: venster begint bovenaan, inset boven 62 -- en iOS 26 tekent
  // dan maar 812pt (de bug). Tauri-telefoon: geen safe-area.
  const venster = o.tauri ? { b: 393, h: 852, boven: 0, onder: 0, y: 0 }
    : o.statusbar === 'translucent' ? { b: SCHERM.b, h: SCHERM.h - SCHERM.statusbalk, boven: SCHERM.statusbalk, onder: SCHERM.onder, y: 0 }
    : { b: SCHERM.b, h: SCHERM.h - SCHERM.statusbalk, boven: 0, onder: SCHERM.onder, y: SCHERM.statusbalk };
  const ctx = await browser.newContext({
    viewport: { width: venster.b, height: venster.h }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1',
  });
  await ctx.addInitScript((look) => {
    Object.defineProperty(navigator, 'standalone', { get: () => true });
    try { localStorage.setItem('axe_look', look); } catch { /* privémodus */ }
  }, o.look);
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: venster.boven, topMax: venster.boven, bottom: venster.onder, bottomMax: venster.onder, left: 0, leftMax: 0, right: 0, rightMax: 0 } });
  // ?ontwerp=1 slaat in dev het inloggen over (ontwerpModus.ts).
  await page.goto(`${o.basis}/?ontwerp=1#${o.route}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.axe-shell', { timeout: 45000 });
  await page.waitForTimeout(2500);
  const sels = { plaat: '.axe-shell.axe-plaat-mobiel', home: '.axe-mobile-home', composer: '.axe-mobile-home .axe-vak', ...Object.fromEntries(o.selector.map((s) => [s, s])) };
  const m = await page.evaluate(({ sels, dy }) => {
    const uit = {};
    for (const [naam, sel] of Object.entries(sels)) {
      const e = document.querySelector(sel); if (!e) { uit[naam] = null; continue; }
      const r = e.getBoundingClientRect();
      uit[naam] = { top: Math.round(r.top + dy), bottom: Math.round(r.bottom + dy), left: Math.round(r.left), right: Math.round(r.right) };
    }
    const p = document.createElement('div'); p.style.cssText = 'position:fixed;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)';
    document.body.appendChild(p); const cs = getComputedStyle(p); uit.env = { top: cs.paddingTop, bottom: cs.paddingBottom }; p.remove();
    uit.venster = { innerHeight, dy }; uit.route = location.hash;
    return uit;
  }, { sels, dy: venster.y });
  const shot = await page.screenshot();
  if (o.tauri) {
    require('fs').writeFileSync(o.uit, shot);
  } else {
    // Het scherm als telefoon: venster op zijn plek, zwarte statusbalk of
    // dode band, home-indicator, ronde hoeken.
    const tel = await ctx.newPage();
    await tel.setViewportSize({ width: SCHERM.b, height: SCHERM.h });
    const s = SCHERM.streep;
    await tel.setContent(`<meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0;background:#28282c"><div style="position:relative;width:${SCHERM.b}px;height:${SCHERM.h}px;border-radius:${SCHERM.hoek}px;overflow:hidden;background:#000">
      <img src="data:image/png;base64,${shot.toString('base64')}" style="position:absolute;left:0;top:${venster.y}px;width:${venster.b}px;height:${venster.h}px">
      <div style="position:absolute;left:${s.x}px;top:${s.y}px;width:${s.b}px;height:${s.h}px;border-radius:3px;background:#fff"></div></div></body>`);
    await tel.screenshot({ path: o.uit });
  }
  m.ruimte = m.plaat && !o.tauri ? { plaatTotStreep: SCHERM.streep.y - m.plaat.bottom, composerTotPlaat: m.composer ? m.plaat.bottom - m.composer.bottom : null, getekendTot: venster.y + venster.h } : undefined;
  console.log(JSON.stringify(m));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
