/**
 * De regels van de leerlus, los van waar hij is opgeslagen.
 *
 * ## Wat een lus is, en wat een archief is
 *
 * De trading-agent had al geheugen: hij schreef beslissingen, lessen en
 * theses weg en las ze terug. Toch leerde hij niets, want nergens werd
 * vastgelegd WELKE herinneringen een beslissing voedden, en nergens kwam
 * terug of die beslissing goed uitpakte. Onthouden zonder terugkoppeling is
 * een archief.
 *
 * Een lus heeft drie schakels, en alle drie moeten er zijn:
 *
 *   1. openen    welke herinneringen gaan deze beslissing in
 *   2. sluiten   hoe liep het af
 *   3. versterken wat in de kamer stond toen het goed ging, telt zwaarder
 *
 * ## Waarom een goede afloop nudge't en een slechte niet straft
 *
 * "Deze trade was winst" is zwak bewijs dat een bepaalde les hielp -- er gingen
 * er vijf in en misschien deed er één iets. Dus een treffer verhoogt het
 * gewicht een beetje in plaats van het te zetten.
 *
 * Straffen doen we niet. Een verkeerde beslissing ligt veel vaker aan het
 * model, de markt of het toeval dan aan de herinnering die werd opgehaald.
 * Wie daarvoor het geheugen straft, leert het systeem minder te onthouden --
 * en dat is het tegenovergestelde van wat je wilt. Wat niet versterkt wordt,
 * vervaagt vanzelf; daar is verval voor.
 */

/** De agents die een lus hebben. Een naam die hier niet in staat, telt niet mee. */
export const LOOP_AGENTS = [
  'chat',
  'trading',
  'code-editor',
  'browser',
  'research',
] as const;

export type LoopAgent = (typeof LOOP_AGENTS)[number];

export type Verdict = 'good' | 'poor' | 'unknown';

export function isLoopAgent(v: unknown): v is LoopAgent {
  return typeof v === 'string' && (LOOP_AGENTS as readonly string[]).includes(v);
}

export interface Episode {
  id: string;
  agent: LoopAgent;
  subject: string;
  memoryIds: string[];
  memoryKeys: string[];
  verdict: Verdict;
  applied: boolean;
  openedAt: number;
  closedAt?: number;
}

/**
 * Hoeveel een enkele goede afloop het gewicht van een herinnering optilt.
 *
 * Eén, en niet meer. Twee zou betekenen dat vijf goede beurten een
 * herinnering van gemiddeld naar maximaal tillen, en dan is het geen signaal
 * meer maar een teller die vastloopt aan het plafond.
 */
export const BOOST_PER_HIT = 1;

/** Het plafond van `rag_memories.importance`. */
export const MAX_IMPORTANCE = 10;

/**
 * Het nieuwe gewicht na een aantal treffers.
 *
 * Begrensd, want zonder plafond wordt elke vaak opgehaalde herinnering
 * uiteindelijk belangrijker dan alles wat zeldzaam maar cruciaal is -- en dan
 * heb je populariteit gemeten in plaats van nut.
 */
export function reinforcedImportance(current: number, hits: number): number {
  const base = Number.isFinite(current) ? current : 5;
  return Math.min(MAX_IMPORTANCE, base + hits * BOOST_PER_HIT);
}

/**
 * Welke episodes voor versterking in aanmerking komen.
 *
 * Alleen goed afgelopen, nog niet toegepast, en met iets om te versterken.
 * Die laatste voorwaarde lijkt overbodig maar is het niet: een agent die
 * niets ophaalde en het goed deed, bewijst niets over het geheugen.
 */
export function pendingForReinforcement(episodes: Episode[]): Episode[] {
  return episodes.filter(e =>
    e.verdict === 'good'
    && !e.applied
    && (e.memoryIds.length > 0 || e.memoryKeys.length > 0));
}

/**
 * Telt hoe vaak elke herinnering in een goed afgelopen episode zat.
 *
 * Per episode één keer per herinnering: een agent die dezelfde les drie keer
 * in zijn context zet, heeft geen drie keer zoveel bewijs.
 */
export function tallyHits(episodes: Episode[]): Map<string, number> {
  const hits = new Map<string, number>();
  for (const e of episodes) {
    for (const id of new Set(e.memoryIds)) {
      hits.set(id, (hits.get(id) ?? 0) + 1);
    }
  }
  return hits;
}

export interface LoopHealth {
  agent: LoopAgent;
  opened: number;
  closed: number;
  good: number;
  poor: number;
  /** Aandeel geopende episodes dat ooit een oordeel kreeg. */
  closeRate: number;
}

/**
 * Of de lus van een agent echt rondloopt.
 *
 * `closeRate` is het getal dat ertoe doet. Een agent die episodes opent maar
 * nooit sluit, ziet er van buiten uit alsof hij leert -- er staan rijen, er
 * gebeurt iets -- terwijl er nooit een gewicht verandert. Dat is precies de
 * storing die deze hele codebase blijft tegenkomen: iets faalt en geeft een
 * geldig ogend, leeg antwoord terug.
 */
export function loopHealth(agent: LoopAgent, episodes: Episode[]): LoopHealth {
  const mine = episodes.filter(e => e.agent === agent);
  const closed = mine.filter(e => e.verdict !== 'unknown');
  return {
    agent,
    opened: mine.length,
    closed: closed.length,
    good: closed.filter(e => e.verdict === 'good').length,
    poor: closed.filter(e => e.verdict === 'poor').length,
    closeRate: mine.length ? closed.length / mine.length : 0,
  };
}
