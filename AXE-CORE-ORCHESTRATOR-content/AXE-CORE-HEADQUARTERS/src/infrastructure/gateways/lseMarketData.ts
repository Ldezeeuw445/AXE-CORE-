/**
 * LSE als koersbron: catalogus → symbool → minuutbalken → gevouwen balken.
 *
 * ## Waarom LSE hier hoort
 *
 * De cascade in marketDataService was: de broker, anders Binance, anders
 * Stooq, anders een verzonnen reeks. Binance is voor alles behalve crypto de
 * verkeerde bron — het levert `AUDUSDT`, een ander instrument met een andere
 * order book, en dat is precies het soort fout dat er niet uitziet als een
 * fout. LSE levert wél de instrumenten die AXE handelt: XAU/USD, EUR/USD,
 * NAS100/USD, US30/USD.
 *
 * ## Wat het NIET is
 *
 * Geen bron om op te handelen. `assertTradeable` eist de prijs van de rekening
 * die de order vult, en dat blijft zo — een stop die is berekend op een candle
 * van een andere aanbieder staat op een niveau dat de broker nooit geprint
 * heeft. LSE is voor de GRAFIEK, voor backtests en voor context. Vandaar dat
 * `source` hier `lse` is en niet `metaapi`: de bewaker mag hem herkennen en
 * weigeren.
 *
 * ## Twee dingen die gemeten zijn, niet aangenomen (10 september 2026)
 *
 * LSE levert ALTIJD minuutbalken. `resolution=1h`, `resolution=60` en
 * `interval=1h` geven alle drie dezelfde rijen van één minuut, dus het vouwen
 * gebeurt hier (zie domain/tradingIntel/candleAggregation.ts).
 *
 * Zonder `start` krijg je de OUDSTE data — de eerste rij van XAU/USD is van
 * 19 maart 2006. Een aanvraag zonder venster geeft dus keurig antwoord met
 * prijzen van twintig jaar geleden, en niets in de vorm verraadt dat.
 */
import { lseCandles, lseCatalog } from '@/infrastructure/gateways/lseGateway';
import { minutenNodig, vouwBalken } from '@/domain/tradingIntel/candleAggregation';
import { zoekLseSymbool, type LseCatalogusRegel } from '@/domain/tradingIntel/lseSymbolMatch';
import type { OhlcBar } from '@/domain/tradingIntel/demoTypes';

interface LseCandleRij {
  ts?: string;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  volume?: number;
}

/**
 * `"2026-09-08 00:00:00.000000"` → epoch-ms.
 *
 * Zonder tijdzone in de string, en als UTC gelezen. Dat is de aanname die deze
 * regel maakt: een marktdata-API die tijden zonder zone teruggeeft doet dat
 * vrijwel altijd in UTC, en de gemeten prijzen van 8 september kloppen met wat
 * de broker die dag printte. Zat het er een zone naast, dan schoven alle
 * balken even ver op en zou de vergelijking met de broker dat laten zien.
 */
function naEpoch(ts: string | undefined): number {
  if (!ts) return NaN;
  const genormaliseerd = ts.includes('T') ? ts : ts.replace(' ', 'T');
  return Date.parse(genormaliseerd.endsWith('Z') ? genormaliseerd : `${genormaliseerd}Z`);
}

/* De catalogus is 22.700 regels en verandert niet per uur. Eén keer per sessie
   halen is genoeg; hem per grafiek ophalen zou het duurste deel van deze bron
   maken voor het antwoord dat het minst verandert. */
let catalogus: LseCatalogusRegel[] | null = null;
let catalogusOp = 0;
const CATALOGUS_TTL_MS = 6 * 60 * 60 * 1000;

export function __resetLseCatalogus(): void {
  catalogus = null; catalogusOp = 0; dagCache.clear();
}

/**
 * Balken van één kalenderdag, blijvend bewaard.
 *
 * Geen TTL, met opzet. Wat de koers op 6 juni om 14:30 deed verandert nooit
 * meer, en LSE's gratis laag geeft tien downloads per uur — een dag opnieuw
 * ophalen kost dus een tiende van je uur voor een antwoord dat je al had.
 */
const dagCache = new Map<string, OhlcBar[] | null>();

async function haalCatalogus(): Promise<LseCatalogusRegel[]> {
  if (catalogus && Date.now() - catalogusOp < CATALOGUS_TTL_MS) return catalogus;
  const res = await lseCatalog({});
  if (!res.ok || !Array.isArray(res.data)) return catalogus ?? [];
  catalogus = (res.data as LseCatalogusRegel[]).filter(r => r?.symbol && r?.dataset);
  catalogusOp = Date.now();
  return catalogus;
}

/**
 * Balken van LSE, gevouwen naar `timeframe`, of null als LSE dit niet heeft.
 *
 * Null en geen fout: dit is één stap in een cascade, en "ik heb dit niet" moet
 * de volgende bron niet in de weg zitten.
 */
export async function lseBalken(
  symbool: string,
  timeframe: string,
  aantal = 120,
): Promise<OhlcBar[] | null> {
  const cat = await haalCatalogus().catch(() => [] as LseCatalogusRegel[]);
  if (!cat.length) return null;

  const treffer = zoekLseSymbool(symbool, cat);
  if (!treffer) return null;

  const minuten = minutenNodig(aantal, timeframe);

  /* ── `limit` kapt aan het BEGIN van het venster, niet aan het eind ───────
   *
   * Hier stond `start` op 2,5x het venster terug en `limit` op het aantal
   * minuten dat we nodig hadden. Dat leek ruim, en het gaf gemeten op 10
   * september balken die eindigden op 8 september 16:00 -- twee dagen oud, en
   * niets in het antwoord verraadde dat. LSE geeft de rijen vanaf `start`
   * OPLOPEND, dus een limiet die korter is dan het venster levert het begin en
   * niet het eind.
   *
   * Dus: het venster bepaalt de limiet, niet het doel. `start` is een datum
   * (LSE neemt geen tijd aan), dus tellen we vanaf middernacht van die dag tot
   * nu, met een kleine marge erbij. */
  const vanafMs = Date.now() - minuten * 60_000 * 1.5;
  const vanaf = new Date(vanafMs).toISOString().slice(0, 10);
  const middernacht = Date.parse(`${vanaf}T00:00:00Z`);
  const minutenInVenster = Math.ceil((Date.now() - middernacht) / 60_000);
  const limit = Math.min(20_000, Math.max(minuten, Math.ceil(minutenInVenster * 1.05)));

  const res = await lseCandles({
    symbol: treffer.symbol,
    dataset: treffer.dataset,
    start: vanaf,
    limit,
  }).catch(() => null);
  if (!res?.ok || !Array.isArray(res.data)) return null;

  const rauw: OhlcBar[] = (res.data as LseCandleRij[])
    .map(r => ({
      t: naEpoch(r.ts),
      o: Number(r.open), h: Number(r.high), l: Number(r.low), c: Number(r.close),
      v: Number.isFinite(Number(r.volume)) ? Number(r.volume) : 0,
    }))
    .filter(b => Number.isFinite(b.t) && Number.isFinite(b.c) && b.c > 0);

  if (rauw.length < 5) return null;
  const gevouwen = vouwBalken(rauw, timeframe);
  return gevouwen.length >= 5 ? gevouwen.slice(-aantal) : null;
}

/**
 * De balken van één kalenderdag (UTC), gevouwen naar `timeframe`.
 *
 * ## Waarom dit naast lseBalken staat
 *
 * `lseBalken` is verankerd aan nu: hij rekent terug vanaf `Date.now()`. Voor
 * "wat deed goud op de dag van de NFP in maart" is dat het verkeerde eind van
 * de reeks. Een jaar M15-balken in één keer ophalen is geen alternatief — dat
 * zijn er zo'n achtendertigduizend, voor zes momenten die je wilt weten.
 *
 * Dus per publicatiedag één aanvraag van 1440 minuten. Zes publicaties zijn zes
 * aanroepen, en daarna nooit meer: het verleden verandert niet, dus de cache
 * hierboven kent geen vervaltijd.
 *
 * `limit` kapt bij LSE aan het BEGIN van het venster — dat staat gemeten in
 * lseBalken hierboven — en dat is hier precies goed: `start` is de dag zelf, en
 * 1440 minuten is die dag.
 */
export async function lseBalkenOpDag(
  symbool: string,
  datum: string,
  timeframe = 'M15',
): Promise<OhlcBar[] | null> {
  const sleutel = `${symbool}|${datum}|${timeframe}`;
  const gezet = dagCache.get(sleutel);
  if (gezet !== undefined) return gezet;

  const cat = await haalCatalogus().catch(() => [] as LseCatalogusRegel[]);
  const treffer = cat.length ? zoekLseSymbool(symbool, cat) : null;
  if (!treffer) { dagCache.set(sleutel, null); return null; }

  const res = await lseCandles({
    symbol: treffer.symbol,
    dataset: treffer.dataset,
    start: datum,
    limit: 1440,
  }).catch(() => null);

  if (!res?.ok || !Array.isArray(res.data)) { dagCache.set(sleutel, null); return null; }

  const rauw: OhlcBar[] = (res.data as LseCandleRij[])
    .map(r => ({
      t: naEpoch(r.ts),
      o: Number(r.open), h: Number(r.high), l: Number(r.low), c: Number(r.close),
      v: Number.isFinite(Number(r.volume)) ? Number(r.volume) : 0,
    }))
    .filter(b => Number.isFinite(b.t) && Number.isFinite(b.c) && b.c > 0);

  // Een dag met een handvol balken is een feestdag of een gat in de reeks. Die
  // teruggeven levert een meting op één tick, en dat leest als een rustige
  // markt terwijl er niet gehandeld werd.
  if (rauw.length < 60) { dagCache.set(sleutel, null); return null; }

  const gevouwen = vouwBalken(rauw, timeframe);
  const uit = gevouwen.length >= 5 ? gevouwen : null;
  dagCache.set(sleutel, uit);
  return uit;
}
