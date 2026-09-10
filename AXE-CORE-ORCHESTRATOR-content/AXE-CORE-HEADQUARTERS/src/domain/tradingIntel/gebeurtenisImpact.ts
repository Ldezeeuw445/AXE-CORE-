/**
 * Wat deed dit paar de vorige keren dat deze cijfers uitkwamen?
 *
 * ## Waarom dit naast economicCalendar.ts staat en niet erin
 *
 * `economicCalendar.ts` is een poort: komt er binnen 48 uur iets hoog-impact
 * aan, ja of nee. Dat antwoord stopt de desk. Dit bestand beantwoordt de andere
 * helft van dezelfde vraag — hoe erg is "hoog-impact" hier eigenlijk? — en die
 * is niet met ja of nee te beantwoorden maar met een verdeling.
 *
 * "NFP om 14:30" weet je zelf. "De vorige zes NFP's bewogen XAUUSD mediaan
 * 0,74% in het uur erna, vijf van de zes omhoog" is iets anders: dat is een
 * maat waar een positiegrootte uit volgt.
 *
 * ## Het tijdstip dat FRED niet geeft
 *
 * FRED publiceert een datum, geen klokslag. Voor een poort die de hele dag
 * bezet verklaart is dat genoeg — dat staat zo in economicCalendar.ts. Voor een
 * venster van een uur ná de publicatie is het precies wat je nodig hebt, en het
 * ontbreekt.
 *
 * Alle zes de releases op die lijst komen om **08:30 in New York** uit. Dat is
 * geen gok maar het vaste publicatiemoment van BLS, BEA en Census; het staat op
 * hun eigen releasekalenders en het is al decennia hetzelfde. Daarom staat het
 * hier als één constante en niet als zes.
 *
 * De zomertijd is wél een valkuil: New York is de halve winter UTC-5 en de
 * halve zomer UTC-4. Een vast verschil aanhouden schuift je meetvenster in
 * maart en november een uur op, precies over de publicatie heen, en dan meet je
 * de rust ervoor of de staart erna. Daarom wordt de omrekening per datum
 * gedaan, via de tijdzonedatabase van de omgeving.
 *
 * ## Wat het weigert te zeggen
 *
 * Drie dingen geven `null` in plaats van een cijfer, en om dezelfde reden als
 * in correlatie.ts: een getal dat je niet mag geloven is duurder dan geen
 * getal.
 *
 * 1. Geen balk die volledig vóór het publicatiemoment ligt — dan is er geen
 *    beginprijs en valt er niets te meten. Niet 0%.
 * 2. Geen balk op of na het einde van het venster. Een reeks die ophoudt om
 *    14:30 kan niet zeggen wat er om 15:30 gebeurde, en het verschil tussen
 *    "de markt stond stil" en "de data hield op" moet zichtbaar blijven.
 * 3. Minder dan `MIN_METINGEN` bruikbare gebeurtenissen. Twee NFP's zijn een
 *    anekdote; daar hoort geen mediaan bij die eruitziet als een verwachting.
 */
import type { OhlcBar } from '@/domain/tradingIntel/demoTypes';

/** Onder dit aantal gemeten gebeurtenissen is een samenvatting een anekdote. */
export const MIN_METINGEN = 3;

/** Publicatiemoment van de releases op de hoog-impact lijst, lokale tijd New York. */
export const RELEASE_UUR_ET = 8;
export const RELEASE_MINUUT_ET = 30;

const ZONE = 'America/New_York';

export interface ImpactMeting {
  /** De releasedatum zoals FRED hem geeft, YYYY-MM-DD. */
  datum: string;
  /** Naam van de release, letterlijk. */
  naam: string;
  /** Slotkoers van de laatste balk op of vóór publicatie. */
  voor: number;
  /** Slotkoers aan het eind van het venster. */
  na: number;
  /** Verandering in procenten, positief is omhoog. */
  procent: number;
  /**
   * Grootste uitslag binnen het venster, in procenten van de beginprijs.
   *
   * Apart van `procent` omdat ze verschillende dingen zeggen: een print die
   * eerst 1,2% omlaag duikt en op +0,1% sluit heeft je stop geraakt terwijl de
   * nettoverandering niets voorstelt. Wie alleen naar het slot kijkt ziet die
   * duik niet.
   */
  uitslag: number;
}

export interface ImpactSamenvatting {
  /** Aantal gebeurtenissen waar een meting uit kwam. */
  gemeten: number;
  /** Aantal dat wel op de kalender stond maar niet te meten was. */
  ongemeten: number;
  /**
   * Mediaan van de absolute verandering, in procenten.
   *
   * Mediaan en geen gemiddelde: één uitzonderlijke print — een NFP die er
   * 3% naast zat — trekt een gemiddelde omhoog en zet daarmee een verwachting
   * neer die de andere vijf keer niet uitkwam.
   */
  medianeBeweging: number | null;
  /** Mediaan van de grootste uitslag binnen het venster. */
  medianeUitslag: number | null;
  /** Hoe vaak het dezelfde kant op ging, als aandeel 0..1 van de metingen. */
  richtingVastheid: number | null;
  /** De kant waar `richtingVastheid` over gaat. */
  richting: 'omhoog' | 'omlaag' | null;
  /** De heftigste meting, om te zien hoe erg het kan worden. */
  grootste: ImpactMeting | null;
}

export interface ImpactGeschiedenis {
  symbool: string;
  naam: string;
  vensterMinuten: number;
  metingen: ImpactMeting[];
  samenvatting: ImpactSamenvatting;
}

/**
 * Het verschil tussen een tijdstip in `zone` en UTC, op dat moment.
 *
 * Via Intl in plaats van een tabel met zomertijdregels: die regels veranderen
 * (de EU praat er al jaren over, Amerikaanse staten stappen eruit) en een tabel
 * in dit bestand zou dan stilletjes verouderen. De omgeving heeft de echte
 * database.
 */
function zoneVerschilMs(t: number, zone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: zone, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const d: Record<string, string> = {};
  for (const p of dtf.formatToParts(new Date(t))) d[p.type] = p.value;
  const alsUtc = Date.UTC(
    Number(d.year), Number(d.month) - 1, Number(d.day),
    Number(d.hour) % 24, Number(d.minute), Number(d.second),
  );
  return alsUtc - t;
}

/**
 * Het publicatiemoment van een release op `datum`, als UTC-milliseconden.
 *
 * Twee slagen, want de eerste omrekening kan zelf net over een zomertijdgrens
 * vallen: je corrigeert dan met het verschil van de verkeerde kant. De tweede
 * slag rekent met het verschil zoals het op het gecorrigeerde moment gold.
 */
export function publicatieMoment(datum: string): number | null {
  const uu = String(RELEASE_UUR_ET).padStart(2, '0');
  const mm = String(RELEASE_MINUUT_ET).padStart(2, '0');
  const gok = Date.parse(`${datum}T${uu}:${mm}:00Z`);
  if (!Number.isFinite(gok)) return null;
  const eerste = gok - zoneVerschilMs(gok, ZONE);
  return gok - zoneVerschilMs(eerste, ZONE);
}

/**
 * De laatste balk die volledig vóór `t` ligt, of null.
 *
 * Strikt ervóór, en dat is het hele punt. Een balk draagt de tijd van zijn
 * ópening — zo levert vrijwel elke koersbron ze, LSE inbegrepen. De balk die om
 * 08:30 opent is dus de balk waarin de publicatie valt: zijn slot bevat de
 * reactie al. Die als beginprijs nemen meet de sprong tegen zichzelf en levert
 * een keurig getal dat een fractie is van de werkelijke beweging.
 */
function balkVoor(gesorteerd: OhlcBar[], t: number): OhlcBar | null {
  let uit: OhlcBar | null = null;
  for (const b of gesorteerd) {
    if (b.t >= t) break;
    uit = b;
  }
  return uit;
}

/**
 * Wat deed deze reeks in `vensterMinuten` na `moment`?
 *
 * Geeft null zodra er geen beginprijs is of het venster niet gedekt wordt —
 * zie de kop: een ongedekt venster als 0% rapporteren maakt van ontbrekende
 * data een rustige markt.
 */
export function meetVenster(
  bars: OhlcBar[],
  moment: number,
  vensterMinuten: number,
): { voor: number; na: number; procent: number; uitslag: number } | null {
  if (!bars.length || !Number.isFinite(moment) || vensterMinuten <= 0) return null;

  const gesorteerd = [...bars].sort((a, b) => a.t - b.t);
  const start = balkVoor(gesorteerd, moment);
  if (!start || !Number.isFinite(start.c) || start.c <= 0) return null;

  const eind = moment + vensterMinuten * 60_000;

  // Het venster is [moment, eind): balken die in die tijd openen. Een balk die
  // precies op `eind` opent hoort er niet bij — die gaat over wat erna gebeurde.
  const venster = gesorteerd.filter(b => b.t >= moment && b.t < eind);
  if (!venster.length) return null;

  // En de reeks moet aantoonbaar tot voorbij het venster lopen. Zonder een balk
  // op of na `eind` weet je niet of de reeks daar ophield of de data ophield, en
  // dat verschil is precies het verschil tussen "rustig" en "niet gemeten".
  if (gesorteerd[gesorteerd.length - 1].t < eind) return null;

  const slot = venster[venster.length - 1];
  if (!Number.isFinite(slot.c)) return null;

  let hoog = start.c;
  let laag = start.c;
  for (const b of venster) {
    if (Number.isFinite(b.h)) hoog = Math.max(hoog, b.h);
    if (Number.isFinite(b.l)) laag = Math.min(laag, b.l);
  }

  const procent = ((slot.c - start.c) / start.c) * 100;
  const opUit = ((hoog - start.c) / start.c) * 100;
  const neerUit = ((start.c - laag) / start.c) * 100;

  return {
    voor: start.c,
    na: slot.c,
    procent,
    uitslag: Math.max(Math.abs(opUit), Math.abs(neerUit)),
  };
}

function mediaan(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * De impactgeschiedenis van één release op één paar.
 *
 * @param gebeurtenissen kalenderregels; alleen de datum en de naam worden
 *        gebruikt, het tijdstip komt uit `publicatieMoment`.
 */
export function impactGeschiedenis(input: {
  symbool: string;
  naam: string;
  gebeurtenissen: { datum: string; naam: string }[];
  bars: OhlcBar[] | null | undefined;
  vensterMinuten?: number;
}): ImpactGeschiedenis {
  const vensterMinuten = input.vensterMinuten ?? 60;
  const metingen: ImpactMeting[] = [];
  let ongemeten = 0;

  for (const ev of input.gebeurtenissen) {
    if (ev.naam !== input.naam) continue;
    const moment = publicatieMoment(ev.datum);
    if (moment === null) { ongemeten++; continue; }

    const m = input.bars ? meetVenster(input.bars, moment, vensterMinuten) : null;
    if (!m) { ongemeten++; continue; }

    metingen.push({ datum: ev.datum, naam: ev.naam, ...m });
  }

  metingen.sort((a, b) => (a.datum < b.datum ? 1 : -1));

  return {
    symbool: input.symbool,
    naam: input.naam,
    vensterMinuten,
    metingen,
    samenvatting: vatSamen(metingen, ongemeten),
  };
}

function vatSamen(metingen: ImpactMeting[], ongemeten: number): ImpactSamenvatting {
  const leeg: ImpactSamenvatting = {
    gemeten: metingen.length, ongemeten,
    medianeBeweging: null, medianeUitslag: null,
    richtingVastheid: null, richting: null, grootste: null,
  };
  if (metingen.length < MIN_METINGEN) return leeg;

  const omhoog = metingen.filter(m => m.procent > 0).length;
  const omlaag = metingen.filter(m => m.procent < 0).length;
  const overheersend = omhoog >= omlaag ? omhoog : omlaag;

  return {
    gemeten: metingen.length,
    ongemeten,
    medianeBeweging: mediaan(metingen.map(m => Math.abs(m.procent))),
    medianeUitslag: mediaan(metingen.map(m => m.uitslag)),
    richtingVastheid: overheersend / metingen.length,
    richting: omhoog === omlaag ? null : omhoog > omlaag ? 'omhoog' : 'omlaag',
    grootste: [...metingen].sort((a, b) => b.uitslag - a.uitslag)[0] ?? null,
  };
}

/**
 * De geschiedenis als tekst, voor in de context van een handelende agent.
 *
 * Dezelfde afspraak als correlatie.ts: het scherm en de agent lezen dezelfde
 * berekening, zodat ze niet uit elkaar kunnen lopen. Bewust kort — een agent
 * die overweegt een positie open te laten staan over een print heen moet weten
 * hoe hard het pleegt te bewegen, niet de zes losse uitkomsten.
 */
export function impactVoorAgent(g: ImpactGeschiedenis): string {
  const s = g.samenvatting;
  const kop = `${g.naam} → ${g.symbool} (${g.vensterMinuten} min na publicatie)`;

  if (s.medianeBeweging === null) {
    return `${kop}: te weinig gemeten (${s.gemeten} van ${s.gemeten + s.ongemeten}, ` +
      `minimaal ${MIN_METINGEN} nodig) — onbekend, niet rustig.`;
  }

  const regels = [
    kop,
    `Mediaan ${s.medianeBeweging.toFixed(2)}% verandering, ` +
    `grootste uitslag onderweg mediaan ${s.medianeUitslag!.toFixed(2)}% — ` +
    'die tweede is wat een stop raakt.',
  ];

  if (s.richting && s.richtingVastheid !== null) {
    const n = Math.round(s.richtingVastheid * s.gemeten);
    regels.push(
      `${n} van de ${s.gemeten} keer ${s.richting}` +
      (s.richtingVastheid >= 0.8
        ? ' — vaak genoeg om op te vallen, te weinig om op te handelen.'
        : ' — geen richting om op te rekenen.'),
    );
  }

  if (s.grootste) {
    regels.push(`Heftigst: ${s.grootste.datum}, ${s.grootste.uitslag.toFixed(2)}% uitslag.`);
  }
  if (s.ongemeten > 0) {
    regels.push(`${s.ongemeten} publicatie(s) niet gemeten: geen koersdata over dat venster.`);
  }

  return regels.join('\n');
}
