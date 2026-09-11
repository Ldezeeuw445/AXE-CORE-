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

/**
 * Routes die met opzet niet in de balk staan.
 *
 * Elk met een reden, want een lijst zonder redenen wordt een plek om dingen in
 * te laten verdwijnen -- en dan bewaakt deze test niets meer.
 */
const BEWUST_VERBORGEN: Record<string, string> = {
  '/': 'Home heeft zijn eigen icoon, staat als eerste in leftItems',
  '/mobile': 'Alleen voor het telefoonoppervlak',
  '/login': 'Voor wie niet ingelogd is; dan is er geen balk',
  '/developer': 'Command Center, bereikbaar via de kopbalk',
  '/organization': 'Bereikbaar vanuit AI Core',
  '/memory/trading': 'Subweergave van Memory',
  '/terminal': 'De oude enkele terminal — vervangen door /terminals, blijft alleen bestaan zolang er nog ergens naar verwezen wordt',
  '/stub': 'Plaatshouder',
  '/apps': 'Staat er wel, maar met een eigen label',
  '/trading': 'Sneltoets r, en de ThinkThanks-router linkt ernaartoe',
  '/memory/explore': 'Vanuit Terrain — NeuralMemorySystem linkt de hubs ernaartoe',
  '/dev-map-preview': 'Ontwikkelvoorbeeld',
  '/dev-browser-preview': 'Ontwikkelvoorbeeld',
  '/dev-browser-standalone': 'Ontwikkelvoorbeeld',

  // NAGEMETEN 11-9-2026: deze twee hebben NUL verwijzingen in de hele broncode
  // en staan niet in de balk. Ze zijn dus vanuit de app niet te bereiken --
  // alleen door de URL met de hand te typen. Dat is geen keuze maar een
  // vergetelheid, en het staat hier zodat het een vergetelheid BLIJFT heten in
  // plaats van stilletjes normaal te worden. Luka beslist of ze een plek
  // krijgen of weg mogen.
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

  it('/terminals is bereikbaar', () => {
    // De aanleiding, expliciet vastgelegd.
    expect(navPaden()).toContain('/terminals');
  });
});
