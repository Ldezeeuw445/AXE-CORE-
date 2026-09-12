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

/** De iconen die TelefoonScherm kent; lucide-paden, één per app. */
export type AppIcoon =
  | 'telefoon' | 'grafiek' | 'brein' | 'wereld' | 'schip' | 'gesprek'
  | 'geheugen' | 'code' | 'taken' | 'agenda' | 'instellingen' | 'kaart';

export interface TelefoonApp {
  id: string;
  naam: string;
  /** Het icoon op de tegel: een pad, geen letters -- die zijn op 56 px onleesbaar. */
  icoon: AppIcoon;
  /** Eén tint per app, alleen in het icoon; het vlak is kaart. */
  kleur: string;
  soort: AppSoort;
  /** Hash-route (route) of volledige url (url). */
  doel: string;
  /** In het dok onderaan in plaats van in het raster. */
  dok?: boolean;
}

/** Chips op het beginscherm: een zin, een app. Dat is het AI-gebaar —
 *  je zegt wat je wilt en AXE opent het, in plaats van een raster te zoeken. */
export interface TelefoonChip {
  id: string;
  tekst: string;
  appId: string;
}

export const TELEFOON_CHIPS: readonly TelefoonChip[] = [
  { id: 'chart', tekst: 'Show the chart', appId: 'chart' },
  { id: 'desk', tekst: 'Open the NorthSea desk', appId: 'northsea' },
  { id: 'mem', tekst: 'What do we remember?', appId: 'memory' },
];

export const TELEFOON_APPS: readonly TelefoonApp[] = [
  { id: 'mobile', naam: 'AXE Mobile', icoon: 'telefoon', kleur: '#22D3EE', soort: 'route', doel: '/mobile', dok: true },
  { id: 'chart', naam: 'Chart', icoon: 'grafiek', kleur: '#2EF2C2', soort: 'route', doel: '/trading-intel?tab=chart&bare=1', dok: true },
  { id: 'algo', naam: 'Algo', icoon: 'brein', kleur: '#A78BFA', soort: 'route', doel: '/trading-intel?tab=brain&nochart=1', dok: true },
  { id: 'web', naam: 'Browser', icoon: 'wereld', kleur: '#9AA3B5', soort: 'route', doel: '/browser', dok: true },
  { id: 'northsea', naam: 'NorthSea', icoon: 'schip', kleur: '#C49B78', soort: 'url', doel: 'https://northsea-commodity-partners.lukadezeeuw1994.chatgpt.site/desk' },
  { id: 'companion', naam: 'Companion', icoon: 'gesprek', kleur: '#22D3EE', soort: 'url', doel: 'https://axecompanion.com/' },
  { id: 'axon', naam: 'Axon', icoon: 'geheugen', kleur: '#E8ECF5', soort: 'url', doel: 'https://app.axon-memory.com/' },
  { id: 'code', naam: 'Code', icoon: 'code', kleur: '#FFCC66', soort: 'route', doel: '/code-editor' },
  /* De tweede rij: de tabs van deze app die op een telefoon zin hebben. Het
     zijn dezelfde routes als in de nav, live in het frame. */
  { id: 'memory', naam: 'Memory', icoon: 'kaart', kleur: '#2EF2C2', soort: 'route', doel: '/memory' },
  { id: 'tasks', naam: 'Tasks', icoon: 'taken', kleur: '#22D3EE', soort: 'route', doel: '/tasks' },
  { id: 'calendar', naam: 'Calendar', icoon: 'agenda', kleur: '#FF4D6D', soort: 'route', doel: '/calendar' },
  { id: 'settings', naam: 'Settings', icoon: 'instellingen', kleur: '#9AA3B5', soort: 'route', doel: '/settings' },
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
 * De schaal van de telefoon op dit venster. Streef .92 (361×784 van 393×852):
 * groot genoeg om een app te lezen, niet een gadget in de kantlijn. Hij
 * zweeft OVER composer en dok — die laag is de zweeflaag — dus het chroom
 * onderin telt niet mee als plafond. Alleen de topbalk en een voetmarge
 * houden hem in het venster.
 */
export const SCHAAL_DOEL = 0.92;
export const TELEFOON_ECHT = { b: 393, h: 852 } as const;
export const KOP_HOOGTE = 43;
export const TOPBALK = 66;
export const MARGE_ONDER = 16;

export function telefoonSchaal(vensterHoogte: number, topbalk = TOPBALK, marge = MARGE_ONDER): number {
  const ruimte = vensterHoogte - topbalk - marge - KOP_HOOGTE;
  const past = Math.floor((ruimte / TELEFOON_ECHT.h) * 100) / 100;
  return Math.max(0.55, Math.min(SCHAAL_DOEL, past));
}

/** De kop plus het geschaalde toestel: wat de zwever hoog is. */
export function telefoonHoogte(schaal: number): number {
  return KOP_HOOGTE + Math.round(TELEFOON_ECHT.h * schaal);
}
