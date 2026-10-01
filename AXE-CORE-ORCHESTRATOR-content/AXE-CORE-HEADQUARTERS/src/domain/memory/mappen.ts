/**
 * De vier vaste mappen van AXE: inbox, projects, content, wiki.
 *
 * ## Waarom dit geen nieuwe opslag is
 *
 * Bouwlijst 6.6 vraagt "vaste mappen". De verleiding is een tabel of echte
 * directories; beide zijn een tweede waarheid naast het geheugen dat AXE al
 * leest. `AGENTS.md` is daar kort over: geen tweede geheugenstore.
 *
 * En het hoeft niet. De `memory`-tabel (`infra/migrations/001_unified_memory.sql`)
 * heeft alles al: `kind` ('fact' | 'lesson' | 'event' | 'doc'), een vrije
 * `category`, `tags[]`, en een `key` met een unieke index op `(agent, key)`. Een
 * map is dus een `category`, en een document in die map is een `key` van de vorm
 * `<map>/<slug>`. Nul schemawijzigingen. De CLI doet dit trouwens al: `axe report`
 * schrijft `category: 'report'` met sleutel `report/<tijd>`.
 *
 * ## Waarom er een hub bij staat
 *
 * Gemeten 1 okt 2026: de `memory`-tabel wordt voor de Memory-tab en de 3D-weergaven
 * geclassificeerd door `hubForAgentRow`, en die kijkt alleen naar de namespace --
 * alles wat niet de trader, intel of companion is, valt in `insights`. Zonder
 * iets te doen zouden alle vier de mappen dus als "Insights" op het landschap
 * staan: een wiki-artikel en een inbox-item op dezelfde berg.
 *
 * Daarom wijst elke map hier naar een bestaande hub. Geen nieuwe hubs: die
 * taxonomie is met opzet conceptueel ("Insights" is iets waar Luka over kan
 * denken) en niet een spiegel van de opslag, dus vier mappen erbij horen te
 * landen in wat er al is.
 */
import type { MemoryKind } from './memoryKind';
import type { HubId } from './memoryHubs';

export type AxeMap = 'inbox' | 'projects' | 'content' | 'wiki';

export interface MapDef {
  id: AxeMap;
  /** Wat erin hoort, in één regel. */
  waarvoor: string;
  /** De `kind`-waarde waarmee een stuk in deze map wordt opgeslagen. */
  kind: MemoryKind;
  /** Op welke berg het terecht hoort te komen. Zie de kop. */
  hub: HubId;
}

export const MAPPEN: readonly MapDef[] = [
  {
    id: 'inbox',
    waarvoor: 'Wat binnenkwam en nog niet gewogen is: briefjes, meldingen, losse vondsten.',
    kind: 'event',
    // Dingen die gebeurd zijn, op het moment dat ze gebeurden.
    hub: 'events',
  },
  {
    id: 'projects',
    waarvoor: 'Lopend werk, en het rapport dat elke klare taak achterlaat.',
    kind: 'doc',
    // 'projects' bestaat al als hub; deze map valt er precies in.
    hub: 'projects',
  },
  {
    id: 'content',
    waarvoor: 'Wat gemaakt is of verzameld: teksten, stukken, materiaal.',
    kind: 'doc',
    hub: 'resources',
  },
  {
    id: 'wiki',
    waarvoor: 'Wat blijft staan: de geoogste uitkomst van een afgerond project.',
    kind: 'doc',
    hub: 'knowledge',
  },
];

const OP_ID = new Map<AxeMap, MapDef>(MAPPEN.map((m) => [m.id, m]));

export function mapDef(id: string | null | undefined): MapDef | null {
  if (!id) return null;
  return OP_ID.get(id as AxeMap) ?? null;
}

export function isAxeMap(v: unknown): v is AxeMap {
  return typeof v === 'string' && OP_ID.has(v as AxeMap);
}

/**
 * Een leesbare, stabiele sleutel. Stabiel is het punt: de unieke index op
 * `(agent, key)` maakt hier een upsert van, dus hetzelfde briefje twee keer
 * schrijven geeft één rij in plaats van twee.
 */
export function mapSleutel(map: AxeMap, slug: string): string {
  const schoon = (slug || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `${map}/${schoon || 'zonder-naam'}`;
}

/** Uit welke map een sleutel komt, of null als hij niet van een map is. */
export function mapVanSleutel(key: string | null | undefined): AxeMap | null {
  if (!key) return null;
  const eerste = key.split('/')[0]?.toLowerCase();
  return isAxeMap(eerste) ? eerste : null;
}

/** De hub waar een rij uit deze map op hoort te landen. */
export function hubVoorMap(map: AxeMap): HubId {
  return OP_ID.get(map)!.hub;
}
