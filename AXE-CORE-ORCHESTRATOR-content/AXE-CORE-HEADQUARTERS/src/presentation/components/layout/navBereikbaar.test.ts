/**
 * Elke route is ergens te vinden.
 *
 * /terminals was gebouwd, geregistreerd in navRegistry, in beide routers gezet
 * -- en stond nergens op het scherm. De zichtbare balk is namelijk een
 * HANDMATIGE lijst in BottomNav.tsx die losstaat van allebei. Je kunt dus een
 * tab afmaken, hem pushen, en er niet bij kunnen.
 *
 * Dat is geen fout die je ziet in een build of in een typecheck: alles klopt,
 * er is alleen geen deur. Vandaar deze test.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const ROUTER = 'src/app/App.tsx';
const NAV = 'src/presentation/components/layout/BottomNav.tsx';
const SNELTOETSEN = 'src/presentation/hooks/useKeyboardShortcuts.ts';
const VENSTERS = 'src/infrastructure/gateways/windowManagerService.ts';

/**
 * Routes die met opzet niet in de balk staan.
 *
 * Elk met een reden, want een lijst zonder redenen wordt een plek om dingen in
 * te laten verdwijnen -- en dan bewaakt deze test niets meer.
 */
const BEWUST_VERBORGEN: Record<string, string> = {
  '/': 'Home — primary nav (v3)',
  '/managers': 'Primary nav (Managers)',
  '/calendar': 'Primary nav (Calendar)',
  '/code-editor': 'Primary nav (Code)',
  '/tasks': 'Primary nav (Tasks)',
  '/settings': 'Primary nav (Settings)',
  '/northsea': 'Command palette + hubs / radial dock (was primary pre-v3)',
  '/trading': 'Command palette + Trading hub (was primary pre-v3)',
  '/bouwen': 'Command palette + Bouwen hub (was primary pre-v3)',
  '/systeem': 'Command palette + Systeem hub (was primary pre-v3)',
  // Deep routes: reachable from hubs / redirects / dedicated doors, not BottomNav
  '/device': 'Systeem hub + SchuifVoet',
  '/devices': 'Redirect → /device',
  '/lock': 'SchuifVoet',
  '/lock/pin': 'AndroidLockGate',
  '/companion': 'Telefoon / Apps',
  '/notifications': 'Telefoon alerts / AwarenessCenter',
  '/mobile': 'Telefoon Home',
  '/login': 'Signed-out only',
  '/developer': 'Bouwen hub',
  '/organization': 'Redirect → /managers',
  '/memory': 'Systeem hub · Geheugen',
  '/memory/trading': 'Sub van Memory',
  '/memory/explore': 'Sub van Memory',
  '/terminal': 'Redirect → /terminals',
  '/terminals': 'Bouwen hub',
  '/stub': 'Plaatshouder',
  '/apps': 'Bouwen hub',
  '/trading-desk': 'Legacy Trading page under hub',
  '/trading-intel': 'Trading demo hub deep link',
  '/float/notes': 'Zwevend venster',
  '/float/axe': 'Zwevend venster',
  '/float/phone': 'Zwevend venster',
  '/dev-map-preview': 'Ontwikkelvoorbeeld',
  '/dev-memory-scene-preview': 'Ontwikkelvoorbeeld',
  '/dev-strategy-lab-preview': 'Ontwikkelvoorbeeld',
  '/dev-browser-preview': 'Ontwikkelvoorbeeld',
  '/dev-browser-standalone': 'Ontwikkelvoorbeeld',
  '/computer-use-overlay': 'Los venster',
  '/northsea-desktop': 'Los venster',
  '/computer-use': 'Bouwen hub',
  '/browser': 'Bouwen hub',
  '/control-plane': 'Bouwen hub',
  '/cron-manager': 'Systeem hub',
  '/mcp': 'Systeem hub',
  '/finance': 'Systeem hub',
  '/table-editor': 'Systeem hub',
  '/obsidian': 'Systeem hub · Geheugen',
  '/knowledge': 'Systeem hub · Geheugen',
  '/infrastructure': 'Systeem hub',
  '/ledger': 'Systeem hub',
  '/brief': 'Systeem hub',
  '/crewai': 'Systeem hub',
  '/agents': 'Redirect → /managers',
  '/ai-core': 'Redirect → /managers',
  '/maps-3d': 'Redirect → /northsea',
  '/thinkthanks': 'Redirect → Home',
  '/eve': 'Redirect → /bouwen',
  '/status': 'ONBEREIKBAAR — nul verwijzingen; te beslissen',
  '/browser-desktop': 'ONBEREIKBAAR — nul verwijzingen; te beslissen',
};

function routes(): string[] {
  const s = readFileSync(ROUTER, 'utf8');
  // `<Route index>` IS '/'. Zonder deze regel meldt de test dat de Home-knop
  // naar een route wijst die niet bestaat -- en een test die onzin roept wordt
  // uitgezet in plaats van gelezen.
  const uit = /<Route\s+index\b/.test(s) ? ['/'] : [];
  return [...uit, ...[...s.matchAll(/<Route\s+path="([^"]+)"/g)]
    .map(m => m[1])
    .filter(p => p !== '*' && !p.includes(':'))
    .map(p => (p.startsWith('/') ? p : `/${p}`))];
}

function navPaden(): string[] {
  const s = readFileSync(NAV, 'utf8');
  return [...s.matchAll(/path:\s*'([^']+)'/g)].map(m => m[1]);
}

describe('elke route heeft een deur', () => {
  it('staat in de balk, of met een reden op de lijst van verborgen routes', () => {
    const inNav = new Set(navPaden());
    const verdwaald = routes().filter(p => !inNav.has(p) && !(p in BEWUST_VERBORGEN));
    expect(verdwaald, `Deze routes bestaan maar zijn nergens aan te klikken:\n  ${verdwaald.join('\n  ')}\n\nZet ze in BottomNav.tsx, of in BEWUST_VERBORGEN met een reden.`)
      .toEqual([]);
  });

  it('de balk verwijst niet naar een route die niet bestaat', () => {
    // De andere kant op: een pad in de balk zonder route geeft een lege pagina.
    const bestaat = new Set(routes());
    const dood = navPaden().filter(p => !bestaat.has(p));
    expect(dood, `Deze knoppen wijzen naar een route die niet bestaat: ${dood.join(', ')}`).toEqual([]);
  });

  it('primary shell heeft v3 bottom nav (6 tabs + orb, geen hubs in balk)', () => {
    const paden = navPaden();
    expect(paden).toEqual(['/', '/managers', '/calendar', '/code-editor', '/tasks', '/settings']);
  });
});

/* ── De andere twee lijsten met routes (4 okt 2026) ─────────────────────────
   De balk was niet de enige handgemaakte kopie. Er zijn er nog twee, en in
   allebei stond `/command` -- een route die niet meer bestaat:

     * TAB_SHORTCUTS: de sneltoets `t` navigeerde naar niets. Je drukt, er
       gebeurt niks, en er is geen fout om op te zoeken.
     * OPENABLE_PAGES: `openPageOnMonitor('command', ...)` opende een VENSTER
       op een lege pagina. Erger dan niets, want het ziet eruit alsof het werkte.

   Allebei met dezelfde `routes()`-lezer hierboven: één bron voor wat een route
   is, drie lijsten die zich eraan moeten houden. */
/** Commentaar eruit: een uitleg die het oude pad noemt ("was '/command'") is
 *  geen regel in de lijst, en een lezer die dat niet ziet meldt een fout die
 *  er niet is -- en dan zet je de test uit in plaats van hem te lezen. */
function zonderCommentaar(bron: string): string {
  return bron
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter(r => !/^\s*(\/\/|\*)/.test(r))
    .join('\n');
}

function sneltoetsPaden(): string[] {
  const s = zonderCommentaar(readFileSync(SNELTOETSEN, 'utf8'));
  const blok = /const TAB_SHORTCUTS[^=]*=\s*\{([\s\S]*?)\n\};/.exec(s);
  if (!blok) throw new Error('TAB_SHORTCUTS niet gevonden — is hij hernoemd?');
  return [...blok[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
}

function vensterPaginas(): string[] {
  const s = zonderCommentaar(readFileSync(VENSTERS, 'utf8'));
  const blok = /export const OPENABLE_PAGES\s*=\s*\[([\s\S]*?)\]\s*as const;/.exec(s);
  if (!blok) throw new Error('OPENABLE_PAGES niet gevonden — is hij hernoemd?');
  return [...blok[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
}

describe('de andere lijsten wijzen ook naar bestaande routes', () => {
  it('elke sneltoets gaat ergens heen', () => {
    const bestaat = new Set(routes());
    const dood = sneltoetsPaden().filter(p => !bestaat.has(p));
    expect(dood, `Deze sneltoetsen navigeren naar een route die niet bestaat: ${dood.join(', ')}`)
      .toEqual([]);
  });

  it('elke pagina die in een eigen venster kan, bestaat', () => {
    // OPENABLE_PAGES noemt pagina's zonder schuine streep ('ai-core'), en
    // `home` is de wortel -- zie de URL die openPageOnMonitor zelf bouwt.
    const bestaat = new Set(routes());
    const dood = vensterPaginas()
      .map(p => (p === 'home' ? '/' : `/${p}`))
      .filter(p => !bestaat.has(p));
    expect(dood, `Deze vensters openen op een route die niet bestaat: ${dood.join(', ')}`)
      .toEqual([]);
  });
});
