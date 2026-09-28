/**
 * De hartslag die de bureaufeiten meet, zodat de agents ze kunnen lezen.
 *
 * ## Waarom de agents het niet zelf uitrekenen
 *
 * De gratis laag van LSE geeft tien downloads per uur. Eén correlatiematrix
 * over acht paren is er acht. Een autopilot die elk kwartier wakker wordt en
 * per lane zijn eigen matrix bouwt, staat na de eerste ronde stil — en dan is
 * het je datalimiet die je 24/7-bureau tegenhoudt, niet je code.
 *
 * Dus omgekeerd: hier wordt één keer gemeten en weggeschreven naar
 * `core_desk_feiten`; elke agentrun leest die regel. Nul LSE-aanroepen per run,
 * en alle lanes zien hetzelfde cijfer.
 *
 * ## Waarom twee uur en niet elk uur
 *
 * Acht aanroepen per meting bij tien per uur laat niets over. Op twee uur kost
 * de hartslag gemiddeld vier per uur en houdt de Correlatie-tab ruimte over om
 * te verversen zonder dat een van beide de ander droogzet. Een correlatie over
 * tweehonderd balken verandert bovendien niet zinvol in een uur; wie hem elke
 * tien minuten opnieuw meet, meet ruis.
 *
 * ## Gebeurtenisimpact: via de MetaAPI-cache, in een beurtrol
 *
 * Zes dagen koersdata per (release × paar) via LSE was een veelvoud van het
 * uurquotum. Daarom komt de impactmeting niet uit LSE maar uit de M15-historie
 * van MetaAPI via historyService: één aaneengesloten reeks per paar in de
 * candle-cache, die na de eerste backfill alleen nog de nieuwe pagina's haalt,
 * met achtergrondprioriteit door het MetaAPI-budget. Alle releases op één paar
 * delen die reeks.
 *
 * Gemeten wordt alleen wat eraan komt: releases binnen zeven dagen, op paren
 * die de valuta raken. Per hartslag hooguit `IMPACT_PER_SLAG` combinaties,
 * en een combinatie die in de laatste twintig uur gemeten is wordt overgeslagen
 * — een beurtrol, geen stortvloed.
 *
 * ## En wat er nog niet 24/7 aan is
 *
 * Dit draait in de app. Staat AXE CORE dicht, dan slaat de hartslag over, en de
 * feiten verouderen tot `leesDeskFeiten` ze weigert — waarna de agents "niet
 * gemeten" te horen krijgen in plaats van iets ouds. Echt onafhankelijk van de
 * app worden vraagt om dezelfde meting op de VPS. Dat is de volgende stap, en
 * het is er expres een aparte: een hartslag die stiekem stilstaat is erger dan
 * geen hartslag.
 */
import { lseBalken } from '@/infrastructure/gateways/lseMarketData';
import type { OhlcBar } from '@/domain/tradingIntel/demoTypes';
import { bouwCorrelatieMatrix, correlatieVoorAgent } from '@/domain/tradingIntel/correlatie';
import { schrijfDeskFeit } from '@/infrastructure/persistence/deskFeitenService';
import { fetchEconomicReleases, fetchPastReleases } from '@/infrastructure/gateways/researchSources';
import { getHistory } from '@/application/tradingIntel/historyService';
import { impactGeschiedenis, impactVoorAgent, kiesImpactCombos, type ImpactCombo } from '@/domain/tradingIntel/gebeurtenisImpact';
import { COVERED_CURRENCIES, currenciesOf, isHighImpact } from '@/domain/tradingIntel/economicCalendar';

/** Dezelfde paren als de Correlatie-tab, zodat scherm en agent één mand delen. */
const PAREN = [
  'XAUUSD', 'XAGUSD', 'EURUSD', 'GBPUSD', 'BTCUSD', 'US500', 'USDJPY', 'USDCHF',
];

/** H1: kort genoeg om vandaag te beschrijven, lang genoeg om geen ruis te meten. */
const TIMEFRAME = 'H1';

export const HARTSLAG_INTERVAL_MS = 2 * 60 * 60 * 1000;

/** Onder dit aantal bruikbare reeksen is de matrix te dun om iets te beweren. */
const MIN_REEKSEN = 4;

let bezig = false;
let laatsteMeting = 0;

/** Zoveel (release × paar) per hartslag; de rest komt in een volgende beurt. */
const IMPACT_PER_SLAG = 4;
/** Een combinatie die zo kort geleden gemeten is, gaat niet opnieuw. */
const IMPACT_OPNIEUW_NA_MS = 20 * 60 * 60 * 1000;
const IMPACT_VENSTER_MIN = 60;
let impactBezig = false;
const impactGemeten = new Map<string, number>();

export function __resetHartslag(): void { bezig = false; laatsteMeting = 0; impactBezig = false; impactGemeten.clear(); }

export interface HartslagUitslag {
  gedaan: boolean;
  reden?: string;
  symbolen?: number;
  gemist?: string[];
}

/**
 * Meet de correlatie en schrijf hem weg.
 *
 * @param force sla de intervalcontrole over — voor een knop, niet voor de timer.
 */
export async function draaiDeskHartslag(force = false): Promise<HartslagUitslag> {
  if (bezig) return { gedaan: false, reden: 'vorige meting loopt nog' };
  if (!force && Date.now() - laatsteMeting < HARTSLAG_INTERVAL_MS) {
    return { gedaan: false, reden: 'nog binnen het interval' };
  }

  bezig = true;
  try {
    // Serieel, niet parallel: acht gelijktijdige aanroepen tegen een bron met
    // tien per uur is de snelste manier om je uur op te maken aan één tik.
    const reeksen: Record<string, OhlcBar[] | null> = {};
    const gemist: string[] = [];
    for (const sym of PAREN) {
      const bars = await lseBalken(sym, TIMEFRAME, 200).catch(() => null);
      reeksen[sym] = bars;
      if (!bars?.length) gemist.push(sym);
    }

    const bruikbaar = PAREN.length - gemist.length;
    if (bruikbaar < MIN_REEKSEN) {
      // Niets wegschrijven. Een matrix over drie paren die als "de correlatie
      // van het bureau" de agents in gaat, is smaller dan hij eruitziet.
      return { gedaan: false, reden: `maar ${bruikbaar} reeks(en) opgehaald`, gemist };
    }

    const matrix = bouwCorrelatieMatrix(reeksen);
    let tekst = correlatieVoorAgent(matrix, TIMEFRAME);
    if (gemist.length) {
      // Expliciet: een paar dat ontbreekt is niet ongecorreleerd, het is
      // ongemeten, en het verschil hoort de agent te bereiken.
      tekst += `\nNiet opgehaald (dus onbekend, niet ongecorreleerd): ${gemist.join(', ')}`;
    }

    const ok = await schrijfDeskFeit({
      soort: 'correlatie',
      sleutel: TIMEFRAME,
      agentTekst: tekst,
      data: {
        symbolen: matrix.symbolen,
        cellen: matrix.cellen,
        samenvatting: matrix.samenvatting,
        gemist,
      },
    });

    // De tijd pas bijwerken als het écht gelukt is. Anders wacht de volgende
    // poging twee uur op een meting die nooit is opgeslagen.
    if (ok) laatsteMeting = Date.now();

    return { gedaan: ok, symbolen: matrix.symbolen.length, gemist };
  } finally {
    bezig = false;
  }
}

export interface ImpactUitslag {
  gemeten: string[];
  overgeslagen: string[];
  reden?: string;
}

const comboSleutel = (c: ImpactCombo) => `${c.naam}|${c.symbool}|${IMPACT_VENSTER_MIN}`;

/**
 * Meet de gebeurtenisimpact voor de releases die eraan komen en schrijf elke
 * combinatie weg als bureaufeit 'gebeurtenis_impact'. Zo bereikt hij AXE Algo
 * via hetzelfde `deskFeitenBlok` als de correlatie, en staat hij in de trace.
 *
 * Een combinatie zonder genoeg metingen wordt óók weggeschreven: "te weinig
 * gemeten — onbekend, niet rustig" is informatie, stilte is dat niet.
 */
export async function draaiImpactMeting(nu = Date.now()): Promise<ImpactUitslag> {
  if (impactBezig) return { gemeten: [], overgeslagen: [], reden: 'vorige meting loopt nog' };
  impactBezig = true;
  try {
    const [komend, verleden] = await Promise.all([
      fetchEconomicReleases().catch(() => []),
      fetchPastReleases(400).catch(() => []),
    ]);
    if (!komend.length || !verleden.length) {
      return { gemeten: [], overgeslagen: [], reden: 'geen kalender (komend of verleden) beschikbaar' };
    }

    const combos = kiesImpactCombos({
      komend, verleden, paren: PAREN, nu,
      isRelease: isHighImpact,
      isGedekt: sym => currenciesOf(sym).some(c => COVERED_CURRENCIES.has(c)),
    });
    const aanDeBeurt = combos
      .filter(c => nu - (impactGemeten.get(comboSleutel(c)) ?? 0) >= IMPACT_OPNIEUW_NA_MS)
      .slice(0, IMPACT_PER_SLAG);
    if (!aanDeBeurt.length) {
      return { gemeten: [], overgeslagen: [], reden: combos.length ? 'alles recent gemeten' : 'geen high-impact release binnen 7 dagen' };
    }

    const gemeten: string[] = [];
    const overgeslagen: string[] = [];
    for (const c of aanDeBeurt) {
      const oudste = c.publicaties[c.publicaties.length - 1];
      const hist = await getHistory({
        symbol: c.symbool, timeframe: 'm15', provider: 'metaapi',
        from: new Date(Date.parse(`${oudste}T00:00:00Z`) - 86_400_000).toISOString(),
      }).catch(e => ({ ok: false as const, error: e instanceof Error ? e.message : String(e) }));
      if (!hist.ok) { overgeslagen.push(`${comboSleutel(c)}: ${hist.error}`); continue; }

      const bars: OhlcBar[] = hist.candles.map(k => ({
        t: Date.parse(k.time), o: k.open, h: k.high, l: k.low, c: k.close, v: k.volume ?? 0,
      }));
      const g = impactGeschiedenis({
        symbool: c.symbool, naam: c.naam, vensterMinuten: IMPACT_VENSTER_MIN,
        gebeurtenissen: c.publicaties.map(datum => ({ datum, naam: c.naam })),
        bars,
      });
      const tekst = `GEBEURTENISIMPACT — volgende publicatie ${c.volgende}\n${impactVoorAgent(g)}`;
      const ok = await schrijfDeskFeit({
        soort: 'gebeurtenis_impact',
        sleutel: comboSleutel(c),
        agentTekst: tekst,
        data: { volgende: c.volgende, samenvatting: g.samenvatting, metingen: g.metingen, bron: 'metaapi m15' },
      });
      if (ok) { impactGemeten.set(comboSleutel(c), nu); gemeten.push(comboSleutel(c)); }
      else overgeslagen.push(`${comboSleutel(c)}: wegschrijven mislukt`);
    }
    return { gemeten, overgeslagen };
  } finally {
    impactBezig = false;
  }
}

/** Eén tik: eerst de correlatie, dan een beurt gebeurtenisimpact. */
async function hartslagTik(): Promise<void> {
  await draaiDeskHartslag().catch(e => console.warn('[deskHartslag] correlatie:', e));
  await draaiImpactMeting().catch(e => console.warn('[deskHartslag] impact:', e));
}

/**
 * Start de hartslag en geef terug hoe je hem stopt.
 *
 * De eerste meting wacht een minuut. Direct bij het opstarten meten valt samen
 * met alles wat de app óók doet bij het opstarten, en de eerste minuut is
 * precies wanneer je aan het kijken bent of het scherm goed laadt.
 */
export function startDeskHartslag(): () => void {
  const eerste = setTimeout(() => { void hartslagTik(); }, 60_000);
  const timer = setInterval(() => { void hartslagTik(); }, HARTSLAG_INTERVAL_MS);
  return () => { clearTimeout(eerste); clearInterval(timer); };
}
