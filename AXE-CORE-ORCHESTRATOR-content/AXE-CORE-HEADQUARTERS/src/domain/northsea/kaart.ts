/**
 * De NorthSea-kaart: welke deal waar ligt, en wat er NIET op de kaart kan.
 *
 * ## Het uitgangspunt
 *
 * Het bedrijf draait, en op deze kaart worden beslissingen genomen. Een lijn
 * van "Zambia / DRC (supplier claim)" naar Hamburg doet alsof de herkomst
 * vaststaat, terwijl de data letterlijk zegt dat het een bewering is. Dus:
 *
 *   - alleen tekenen wat EENDUIDIG te plaatsen is;
 *   - zeggen HOE zeker een punt is (een haven is exacter dan een land);
 *   - tellen wat er niet op staat, met de reden erbij.
 *
 * Een kaart die de helft van de deals stil weglaat leest als "hier gebeurt
 * weinig". Vandaar de teller van wat ontbreekt.
 *
 * ## Waar een eindpunt vandaan komt, in volgorde
 *
 *   leverancierskant: laadhaven → herkomst → vestiging van de leverancier
 *   koperskant:       bestemming → vestiging van de koper
 *
 * De vestiging van een bedrijf is NIET waar de goederen vandaan komen of
 * heen gaan. Valt een eindpunt daarop terug, dan staat dat in `bron`, en de
 * lijn telt als benaderd.
 *
 * Puur: de landmiddelpunten komen als argument binnen, zodat dit zonder
 * kaartbibliotheek te testen is.
 */
import { LAND_ALIAS, PLAATSEN, REGIO_WOORDEN, type PlaatsSoort } from '@/domain/northsea/plaatsen';

export interface KaartDeal {
  id: string;
  stage?: string | null;
  execution_state?: string | null;
  geblokkeerd?: boolean | null;
  code?: string | null;
  product?: string | null;
  koper?: string | null;
  leverancier?: string | null;
  herkomst?: string | null;
  laadhaven?: string | null;
  bestemming?: string | null;
  leverancier_land?: string | null;
  leverancier_stad?: string | null;
  koper_land?: string | null;
  koper_stad?: string | null;
  /* Voor de dealtabel en de kaartjes (zie domain/northsea/desk.ts). */
  volume_mt?: number | string | null;
  gereedheid?: number | null;
  kwalificatie?: string | null;
  commissie_pct?: number | string | null;
  commissie_soort?: string | null;
  commissie_bedrag?: number | string | null;
  waarde?: number | string | null;
  valuta?: string | null;
  volgende?: string | null;
  akkoord_nodig?: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
}

/** De stand van een deal, in de kleuren van de legenda. */
export type DealStand = 'actief' | 'gematcht' | 'geblokkeerd' | 'afgerond' | 'overig';

export type LocatieSoort = PlaatsSoort | 'land';

export interface Locatie {
  sleutel: string;
  label: string;
  soort: LocatieSoort;
  land: string;
  lonlat: [number, number];
}

export type Onplaatsbaar = 'leeg' | 'meerdere' | 'regio' | 'onbekend';

export type EindpuntBron = 'laadhaven' | 'herkomst' | 'bestemming' | 'vestiging';

export interface Eindpunt {
  locatie: Locatie | null;
  reden?: Onplaatsbaar;
  bron?: EindpuntBron;
}

/** Landnaam (zoals in de landvormen) → middelpunt [lon, lat]. */
export type Middelpunten = ReadonlyMap<string, [number, number]>;

const ACTIEVE_UITVOERING = new Set(['', 'discovered', 'matched']);

/**
 * Dezelfde definitie van "actief" als de teller bovenin (northsea.py). Maar
 * een blokkade gaat voor: die deal vraagt aandacht, hoe ver hij ook is. Een
 * geblokkeerde actieve deal is in de legenda dus rood, niet groen.
 *
 * Daardoor noemen de desk en de legenda een ANDER getal voor "actief", en dat
 * leek eerst te voorkomen. Gemeten 14 september: bovenin 24 actief, in de
 * legenda 2. Beide kloppen -- 22 van de actieve deals hebben een blokkade. De
 * kaart houdt dat getal daarom apart bij (`geblokkeerdActief`), zodat de
 * legenda het erbij kan zeggen in plaats van dat een van beide fout lijkt.
 */
export function isActief(d: Pick<KaartDeal, 'stage' | 'execution_state'>): boolean {
  const stage = (d.stage ?? '').trim();
  const uitvoering = (d.execution_state ?? '').trim();
  if (stage === 'won' || stage === 'lost') return false;
  return stage !== 'identified' || !ACTIEVE_UITVOERING.has(uitvoering);
}

export function dealStand(d: Pick<KaartDeal, 'stage' | 'execution_state' | 'geblokkeerd'>): DealStand {
  const stage = (d.stage ?? '').trim();
  const uitvoering = (d.execution_state ?? '').trim();
  if (d.geblokkeerd) return 'geblokkeerd';
  if (stage === 'won') return 'afgerond';
  if (stage === 'lost') return 'overig';
  if (isActief(d)) return 'actief';
  if (uitvoering === 'matched') return 'gematcht';
  return 'overig';
}

function normaal(tekst: string): string {
  return tekst.toLowerCase().normalize('NFC').replace(/\s+/g, ' ').trim();
}

function isRegio(stuk: string): boolean {
  return REGIO_WOORDEN.some(w => stuk.includes(w));
}

/** Eén stuk tekst zonder alternatieven: "Hamburg, Germany", "Qinzhou Port, China", "Thailand". */
function losEnkelOp(stuk: string, middelpunten: Middelpunten): Locatie | 'regio' | null {
  // Van links naar rechts de delen tussen komma's: het eerste herkenbare deel
  // is het meest precieze ("Jebel Ali, Dubai, UAE" → Jebel Ali).
  const delen = stuk.split(',').map(d => normaal(d).replace(/\s+port$/, '').trim()).filter(Boolean);
  for (const deel of delen) {
    const plaats = PLAATSEN.get(deel);
    if (plaats) {
      return { sleutel: `plaats:${plaats.naam}`, label: plaats.naam, soort: plaats.soort, land: plaats.land, lonlat: plaats.lonlat };
    }
  }
  for (const deel of delen) {
    const naam = LAND_ALIAS.get(deel) ?? [...middelpunten.keys()].find(k => normaal(k) === deel);
    const punt = naam ? middelpunten.get(naam) : undefined;
    if (naam && punt) return { sleutel: `land:${naam}`, label: naam, soort: 'land', land: naam, lonlat: punt };
  }
  return delen.some(isRegio) ? 'regio' : null;
}

/**
 * Een tekstveld uit de data → een plaats, of de reden waarom niet.
 *
 * Meerdere mogelijkheden ("Mersin / Jebel Ali", "Austria or Italy", "Zambia /
 * DRC") zijn geen plaats: de data weet het zelf niet. Een toelichting tussen
 * haakjes of na een puntkomma ("; exact port unconfirmed") telt niet als
 * alternatief, maar noemt hij een gebied naast een land, dan is het wél
 * onzeker.
 */
export function losOp(tekst: string | null | undefined, middelpunten: Middelpunten): { locatie: Locatie | null; reden?: Onplaatsbaar } {
  if (!tekst || !tekst.trim()) return { locatie: null, reden: 'leeg' };
  const zonderHaakjes = tekst.replace(/\([^)]*\)/g, ' ');
  // Wat na "stated" komt is uitleg over de bron, geen plaats.
  const kern = zonderHaakjes.replace(/\bstated\b.*$/i, ' ');
  const alternatieven = kern.split(/\s+or\s+|\/|;/i).map(a => a.trim()).filter(Boolean);

  const gevonden = new Map<string, Locatie>();
  let regio = false;
  for (const alt of alternatieven) {
    const uit = losEnkelOp(alt, middelpunten);
    if (uit === 'regio') regio = true;
    else if (uit) gevonden.set(uit.sleutel, uit);
  }

  if (gevonden.size > 1 || (gevonden.size === 1 && regio)) return { locatie: null, reden: 'meerdere' };
  if (gevonden.size === 1) return { locatie: [...gevonden.values()][0] };
  return { locatie: null, reden: regio ? 'regio' : 'onbekend' };
}

const REDEN_ERNST: Record<Onplaatsbaar, number> = { meerdere: 3, regio: 2, onbekend: 1, leeg: 0 };

function eersteDie(velden: Array<[EindpuntBron, string | null | undefined]>, middelpunten: Middelpunten): Eindpunt {
  let ergste: Onplaatsbaar = 'leeg';
  for (const [bron, tekst] of velden) {
    const { locatie, reden } = losOp(tekst, middelpunten);
    if (locatie) return { locatie, bron };
    if (reden && REDEN_ERNST[reden] > REDEN_ERNST[ergste]) ergste = reden;
  }
  return { locatie: null, reden: ergste };
}

/** Een vestiging: de stad als die bekend is, anders het land. Samen, want "London" alleen is niet genoeg om te weten welk land. */
function vestiging(stad?: string | null, land?: string | null): string | null {
  const s = stad?.trim();
  const l = land?.trim();
  if (s && l) return `${s}, ${l}`;
  return s || l || null;
}

export function leverancierskant(d: KaartDeal, middelpunten: Middelpunten): Eindpunt {
  return eersteDie([
    ['laadhaven', d.laadhaven],
    ['herkomst', d.herkomst],
    ['vestiging', vestiging(d.leverancier_stad, d.leverancier_land)],
  ], middelpunten);
}

export function koperskant(d: KaartDeal, middelpunten: Middelpunten): Eindpunt {
  return eersteDie([
    ['bestemming', d.bestemming],
    ['vestiging', vestiging(d.koper_stad, d.koper_land)],
  ], middelpunten);
}

export interface KaartRoute {
  id: string;
  deal: KaartDeal;
  stand: DealStand;
  van: Locatie;
  naar: Locatie;
  vanBron: EindpuntBron;
  naarBron: EindpuntBron;
  /**
   * Een eindpunt is de vestiging van een bedrijf in plaats van een plaats uit
   * de deal zelf. Een LAND uit de deal telt niet als benaderd: "Chile →
   * Germany" is wat de deal zegt, op de nauwkeurigheid van de data. Gemeten 14
   * september: met landen erbij was elke route benaderd (45 van 45), en een
   * onderscheid dat altijd aan staat zegt niets.
   */
  benaderd: boolean;
}

export interface KaartPunt {
  locatie: Locatie;
  deals: number;
  perStand: Record<DealStand, number>;
  /** Het vestigingspunt van een tegenpartij, los van routes. */
  tegenpartij: boolean;
  hub: boolean;
}

export interface NietGeplaatst {
  deal: KaartDeal;
  stand: DealStand;
  kant: 'leverancier' | 'koper' | 'beide';
  reden: Onplaatsbaar;
}

export interface Kaart {
  routes: KaartRoute[];
  punten: KaartPunt[];
  nietGeplaatst: NietGeplaatst[];
  tellers: Record<DealStand, number>;
  /** Hoeveel van de geblokkeerde deals óók actief zijn. Zie dealStand. */
  geblokkeerdActief: number;
}

/** Vanaf hoeveel deals een plaats een knooppunt (ster) is. */
export const HUB_DREMPEL = 3;

const LEGE_STAND = (): Record<DealStand, number> => ({ actief: 0, gematcht: 0, geblokkeerd: 0, afgerond: 0, overig: 0 });

export function bouwKaart(deals: readonly KaartDeal[], middelpunten: Middelpunten): Kaart {
  const routes: KaartRoute[] = [];
  const nietGeplaatst: NietGeplaatst[] = [];
  const tellers = LEGE_STAND();
  let geblokkeerdActief = 0;
  const punten = new Map<string, KaartPunt>();

  const tel = (locatie: Locatie, stand: DealStand, tegenpartij = false) => {
    const p = punten.get(locatie.sleutel) ?? { locatie, deals: 0, perStand: LEGE_STAND(), tegenpartij: false, hub: false };
    if (!tegenpartij) {
      p.deals += 1;
      p.perStand[stand] += 1;
    }
    p.tegenpartij ||= tegenpartij;
    punten.set(locatie.sleutel, p);
  };

  for (const deal of deals) {
    const stand = dealStand(deal);
    tellers[stand] += 1;
    if (stand === 'geblokkeerd' && isActief(deal)) geblokkeerdActief += 1;

    const van = leverancierskant(deal, middelpunten);
    const naar = koperskant(deal, middelpunten);

    // Vestigingen als tegenpartij-punten, ook als de route zelf niet te tekenen is.
    for (const [stad, land] of [[deal.leverancier_stad, deal.leverancier_land], [deal.koper_stad, deal.koper_land]] as const) {
      const v = losOp(vestiging(stad, land), middelpunten).locatie;
      if (v) tel(v, stand, true);
    }

    if (van.locatie && naar.locatie) {
      routes.push({
        id: deal.id, deal, stand, van: van.locatie, naar: naar.locatie,
        vanBron: van.bron!, naarBron: naar.bron!,
        benaderd: van.bron === 'vestiging' || naar.bron === 'vestiging',
      });
      tel(van.locatie, stand);
      if (naar.locatie.sleutel !== van.locatie.sleutel) tel(naar.locatie, stand);
    } else {
      const kant = !van.locatie && !naar.locatie ? 'beide' : !van.locatie ? 'leverancier' : 'koper';
      const redenen = [van.reden, naar.reden].filter((r): r is Onplaatsbaar => !!r);
      const reden = redenen.sort((a, b) => REDEN_ERNST[b] - REDEN_ERNST[a])[0] ?? 'onbekend';
      nietGeplaatst.push({ deal, stand, kant, reden });
    }
  }

  const lijst = [...punten.values()];
  // Alleen echte havens en steden. Een ster op het middelpunt van een land is
  // geen knooppunt: gemeten 14 september stonden er sterren op Duitsland,
  // Polen en midden in de Australische woestijn, omdat daar veel deals op
  // landniveau binnenkomen.
  for (const p of lijst) p.hub = p.locatie.soort !== 'land' && p.deals >= HUB_DREMPEL;
  return { routes, punten: lijst, nietGeplaatst, tellers, geblokkeerdActief };
}

/** Waarom deals niet op de kaart staan, gebundeld voor één regel onder de legenda. */
export function redenenNietGeplaatst(lijst: readonly NietGeplaatst[]): Array<{ reden: Onplaatsbaar; aantal: number }> {
  const aantal = new Map<Onplaatsbaar, number>();
  for (const n of lijst) aantal.set(n.reden, (aantal.get(n.reden) ?? 0) + 1);
  return [...aantal.entries()]
    .map(([reden, n]) => ({ reden, aantal: n }))
    .sort((a, b) => b.aantal - a.aantal);
}
