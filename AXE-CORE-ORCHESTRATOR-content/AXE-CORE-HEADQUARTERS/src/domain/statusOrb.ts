/**
 * Eén afbeelding van "wat doet AXE nu" op een orb-stand.
 *
 * ## Waarom dit een functie is en geen tabel in de component
 *
 * De stand komt straks uit drie hoeken: de stemlus (voiceStore), de chat die
 * streamt, en werk dat elders loopt (zoeken, verbinden). Zolang de vertaling in
 * één functie staat, kan de topbalk (20px) niet iets anders zeggen dan de
 * onderbalk (64px) -- en dat is precies het soort verschil dat je pas opvalt
 * als je het al een tijd verkeerd hebt gelezen.
 *
 * ## Waarom `speaking` geen orb is
 *
 * thinking-orbs kent negen standen; praten zit er niet bij, en terecht: die
 * negen gaan over denken, niet over geluid. De equalizer die AXE al had IS de
 * spreekstand, dus die blijft -- als eigen teken, niet als negende orb.
 */
/* Eigen type en geen import uit de store: het domein mag niet van de
   presentatielaag afhangen (src/architecture.test.ts bewaakt dat, en die sloeg
   hier terecht aan). De stemlus levert precies deze vier woorden. */
export type StemStand = 'idle' | 'listening' | 'processing' | 'speaking';

/** De standen die thinking-orbs voert (zie hun types.d.ts). */
export type OrbStand =
  | 'working' | 'searching' | 'solving' | 'listening'
  | 'connecting' | 'weaving' | 'composing' | 'breathing' | 'shaping';

/** Wat er te tonen is: een orb-stand, of de equalizer voor spreken. */
export type StatusTeken = { soort: 'orb'; stand: OrbStand } | { soort: 'equalizer' };

/** Werk dat buiten de stemlus loopt en de stand mag overrulen. */
export interface WerkSignalen {
  /** Een zoekopdracht loopt (web, kennisbank). */
  zoekt?: boolean;
  /** Een verbinding wordt opgezet (MCP, VPS, apparaat). */
  verbindt?: boolean;
  /** Er wordt tekst geschreven (chat streamt). */
  schrijft?: boolean;
}

/**
 * De volgorde is de bedoeling: een lopende zoekopdracht zegt meer dan "bezig",
 * en praten wint van alles -- als AXE praat, is dát wat je hoort.
 */
export function statusTeken(status: StemStand, werk: WerkSignalen = {}): StatusTeken {
  if (status === 'speaking') return { soort: 'equalizer' };
  if (status === 'listening') return { soort: 'orb', stand: 'listening' };
  if (werk.zoekt) return { soort: 'orb', stand: 'searching' };
  if (werk.verbindt) return { soort: 'orb', stand: 'connecting' };
  if (werk.schrijft) return { soort: 'orb', stand: 'composing' };
  if (status === 'processing') return { soort: 'orb', stand: 'working' };
  return { soort: 'orb', stand: 'breathing' };
}

/** Het woord eronder. Hetzelfde woord op elke plek waar het teken staat. */
export const TEKEN_LABEL: Record<OrbStand | 'equalizer', string> = {
  working: 'Working',
  searching: 'Searching',
  solving: 'Solving',
  listening: 'Listening',
  connecting: 'Connecting',
  weaving: 'Weaving',
  composing: 'Composing',
  breathing: 'Ready',
  shaping: 'Shaping',
  equalizer: 'Speaking',
};

export function tekenLabel(teken: StatusTeken): string {
  return teken.soort === 'equalizer' ? TEKEN_LABEL.equalizer : TEKEN_LABEL[teken.stand];
}
