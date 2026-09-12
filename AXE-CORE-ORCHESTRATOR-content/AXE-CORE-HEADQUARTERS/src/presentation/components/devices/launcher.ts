/**
 * Wat er op de telefoon staat, en wat de telefoon zich herinnert.
 *
 * De telefoon op Home is een beginscherm met Luka's eigen apps als tegels.
 * Twee soorten: een ROUTE is deze app zelf, live in het frame (dezelfde
 * bundel, dezelfde opslag -- wat je ziet is wat de echte telefoon toont); een
 * URL is een van zijn andere sites. Die laden ook in het frame: geen van de
 * drie stuurt X-Frame-Options of een frame-ancestors-CSP (gemeten 12 sep met
 * curl -D -). Weigert er later toch een, dan blijft het frame zwart en zegt
 * de kop welke site het is -- daarom staat de url ook in de kop.
 *
 * Wat hier NIET staat, en waarom: Trading OS heeft geen bevestigde uitrol
 * (ECOSYSTEM.md: laatste push mei), en de Android-app is een schil om deze
 * bundel en dus al de tegel "AXE Mobile".
 *
 * Los van React, zodat de lijst en het geheugen zonder browser te testen zijn.
 */

export type AppSoort = 'route' | 'url';

export interface TelefoonApp {
  id: string;
  naam: string;
  /** Twee letters op de tegel; het logo komt niet van buiten. */
  glyph: string;
  /** Kleur zit in de letters van de tegel, nooit in het vlak. */
  kleur: string;
  soort: AppSoort;
  /** Hash-route (route) of volledige url (url). */
  doel: string;
  /** In het dok onderaan in plaats van in het raster. */
  dok?: boolean;
}

export const TELEFOON_APPS: readonly TelefoonApp[] = [
  { id: 'mobile', naam: 'AXE Mobile', glyph: 'AX', kleur: '#22D3EE', soort: 'route', doel: '/mobile', dok: true },
  { id: 'chart', naam: 'Chart', glyph: 'CH', kleur: '#2EF2C2', soort: 'route', doel: '/trading-intel?tab=chart&bare=1', dok: true },
  { id: 'algo', naam: 'Algo', glyph: 'AL', kleur: '#A78BFA', soort: 'route', doel: '/trading-intel?tab=brain&nochart=1', dok: true },
  { id: 'web', naam: 'Browser', glyph: 'WW', kleur: '#9AA3B5', soort: 'route', doel: '/browser', dok: true },
  { id: 'northsea', naam: 'NorthSea Desk', glyph: 'NS', kleur: '#C49B78', soort: 'url', doel: 'https://northsea-commodity-partners.lukadezeeuw1994.chatgpt.site/desk' },
  { id: 'companion', naam: 'Companion', glyph: 'CO', kleur: '#22D3EE', soort: 'url', doel: 'https://axecompanion.com/' },
  { id: 'axon', naam: 'Axon Memory', glyph: 'AXN', kleur: '#E8ECF5', soort: 'url', doel: 'https://app.axon-memory.com/' },
  { id: 'code', naam: 'Code', glyph: '</>', kleur: '#FFCC66', soort: 'route', doel: '/code-editor' },
];

export function appMetId(id: string | null | undefined): TelefoonApp | null {
  if (!id) return null;
  return TELEFOON_APPS.find((a) => a.id === id) ?? null;
}

export interface Herkomst { origin: string; pathname: string; search: string }

/**
 * De url die in het frame gaat. Een route neemt de eigen herkomst mee,
 * inclusief de zoekparameters (zodat `?ontwerp=1` in de dev-server ook in de
 * telefoon geldt), en zet de route achter de hash.
 */
export function appUrl(app: TelefoonApp, herkomst: Herkomst): string {
  if (app.soort === 'url') return app.doel;
  return `${herkomst.origin}${herkomst.pathname}${herkomst.search}#${app.doel}`;
}

type Opslag = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const SLEUTEL = 'axe_zwever_telefoon_app';

/** De app die open stond, of niets (beginscherm). Een onbekende id is niets. */
export function laadOpenApp(opslag: Opslag): TelefoonApp | null {
  try { return appMetId(opslag.getItem(SLEUTEL)); } catch { return null; }
}

export function bewaarOpenApp(app: TelefoonApp | null, opslag: Opslag): void {
  try {
    if (app) opslag.setItem(SLEUTEL, app.id); else opslag.removeItem(SLEUTEL);
  } catch { /* privémodus */ }
}

/**
 * Of de telefoon beweegt. Drie redenen om stil te staan, alle drie expliciet:
 * de gebruiker vraagt minder beweging, `?anim=0` staat in de url (voor een
 * screenshot die niet op de entree hoeft te wachten), of hij zit in een frame
 * (dan is er niets om binnen te zweven).
 */
export interface AnimatieVlaggen { entree: boolean; zweef: boolean }

export function animatieVlaggen(bron: { search: string; minderBeweging: boolean }): AnimatieVlaggen {
  let uit: boolean;
  try { uit = new URLSearchParams(bron.search).get('anim') === '0'; } catch { uit = false; }
  const aan = !uit && !bron.minderBeweging;
  return { entree: aan, zweef: aan };
}

/**
 * De schaal van de telefoon op dit venster. Streef .69 (271x588 van 393x852),
 * maar nooit hoger dan wat er onder de topbalk past met de kop erboven en de
 * marge eronder -- anders steekt hij op een laag scherm in de dok.
 */
export const SCHAAL_DOEL = 0.69;
export const TELEFOON_ECHT = { b: 393, h: 852 } as const;
export const KOP_HOOGTE = 43;

export function telefoonSchaal(vensterHoogte: number, topbalk = 66, marge = 26): number {
  const ruimte = vensterHoogte - topbalk - marge - KOP_HOOGTE;
  const past = ruimte / TELEFOON_ECHT.h;
  return Math.max(0.4, Math.min(SCHAAL_DOEL, Math.round(past * 100) / 100));
}
