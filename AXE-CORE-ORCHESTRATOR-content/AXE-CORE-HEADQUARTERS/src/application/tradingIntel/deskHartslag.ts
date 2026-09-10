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
 * ## Wat hier NIET gebeurt
 *
 * Gebeurtenisimpact wordt nog niet gemeten. Dat is zes dagen koersdata per
 * combinatie van release en paar, en met zes releases en zes paren zijn dat
 * zesendertig combinaties — een veelvoud van je uurquotum, ook al is elke dag
 * daarna blijvend gecached. Dat vraagt om een beurtrol over dagen heen of om
 * een betaalde laag, en dat is een keuze en geen detail. Zolang die er niet is
 * zegt het blok voor de agents eerlijk dat die meting ontbreekt.
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

export function __resetHartslag(): void { bezig = false; laatsteMeting = 0; }

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

/**
 * Start de hartslag en geef terug hoe je hem stopt.
 *
 * De eerste meting wacht een minuut. Direct bij het opstarten meten valt samen
 * met alles wat de app óók doet bij het opstarten, en de eerste minuut is
 * precies wanneer je aan het kijken bent of het scherm goed laadt.
 */
export function startDeskHartslag(): () => void {
  const eerste = setTimeout(() => { void draaiDeskHartslag(); }, 60_000);
  const timer = setInterval(() => { void draaiDeskHartslag(); }, HARTSLAG_INTERVAL_MS);
  return () => { clearTimeout(eerste); clearInterval(timer); };
}
