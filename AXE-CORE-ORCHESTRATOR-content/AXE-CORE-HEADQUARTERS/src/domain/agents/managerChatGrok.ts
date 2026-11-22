/**
 * Managers-tab als Grokbot (Luka, 22 nov): reacties met een emoji, antwoorden op
 * één bubbel, en tijd als scheiding tussen gesprekken in plaats van onder elke
 * bubbel. Geen I/O hier.
 */

export const SNELLE_REACTIES = ['❤️', '👍', '😂', '🔥', '✅'] as const;

export type Reacties = Record<string, string>;

/** Zelfde emoji nog eens = weghalen; een andere = vervangen (één reactie per bubbel, zoals Grokbot). */
export function wisselReactie(r: Reacties, id: string, emoji: string): Reacties {
  const uit = { ...r };
  if (uit[id] === emoji) delete uit[id];
  else uit[id] = emoji;
  return uit;
}

export interface AntwoordOp {
  id: string;
  wie: string;
  tekst: string;
}

export function citaat(tekst: string, max = 90): string {
  const t = tekst.replace(/[*_`>]/g, '').replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

/** Wat er naar de manager gaat: het citaat voorop, zodat hij weet waarop je reageert. */
export function metAntwoord(tekst: string, op: AntwoordOp | null): string {
  if (!op) return tekst;
  return `> ${op.wie}: "${citaat(op.tekst, 200)}"\n\n${tekst}`;
}

/** Haal het citaat weer uit Luka's bubbel om het als klein blokje te tonen. */
export function leesAntwoord(tekst: string): { citaat: string | null; rest: string } {
  const m = /^> ([^\n]{1,240})\n\n([\s\S]*)$/.exec(tekst);
  return m ? { citaat: m[1], rest: m[2] } : { citaat: null, rest: tekst };
}

export const GESPREK_PAUZE_MS = 30 * 60_000;

/** Tijdscheiding boven deze bubbel? Eerste bericht, of na een pauze van een half uur. */
export function scheidingVoor(at: number | undefined, vorige: number | undefined): boolean {
  if (!at) return false;
  return !vorige || at - vorige >= GESPREK_PAUZE_MS;
}

/** "wo 18 nov 14:18" -- vandaag alleen de tijd, gisteren "Gisteren 11:50". */
export function scheidingTekst(at: number, nu = Date.now()): string {
  const tz = 'Europe/Amsterdam';
  const dag = (t: number) => new Date(t).toLocaleDateString('en-CA', { timeZone: tz });
  const tijd = new Date(at).toLocaleTimeString('nl-NL', { timeZone: tz, hour: '2-digit', minute: '2-digit' });
  if (dag(at) === dag(nu)) return tijd;
  if (dag(at) === dag(nu - 86_400_000)) return `Gisteren ${tijd}`;
  const datum = new Date(at).toLocaleDateString('nl-NL', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short' });
  return `${datum.replace(/\./g, '')} ${tijd}`;
}
