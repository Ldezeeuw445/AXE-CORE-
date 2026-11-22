/**
 * Geheugen tussen sessies.
 *
 * Het hoofdgesprek is één eeuwige draad, maar wat er naar het model gaat is
 * alleen de laatste paar beurten. "Ga verder waar we waren" werkt pas als AXE
 * van elke afgeronde sessie een korte notitie heeft: wat Luka vroeg, wat er
 * veranderde, waar het stopte. Het volgende gesprek begint met de laatste zes.
 *
 * Een sessie = een aaneengesloten stuk van de draad; een stilte van
 * SESSIE_STILTE_MS of meer begint een nieuwe. Geen I/O hier.
 */
import type { Beurt } from './hoofdgesprek';

export const SESSIE_STILTE_MS = 45 * 60_000;
export const NOTITIES_IN_PROMPT = 6;
export const SESSIE_PREFIX = 'sessie:';

export interface Sessie {
  start: number;
  eind: number;
  beurten: Beurt[];
}

export interface SessieNotitie {
  key: string;
  start: number;
  tekst: string;
}

/** Knip de draad op stiltes. Volgorde oud → nieuw, lege tekst telt niet mee. */
export function splitsSessies(draad: readonly Beurt[], stilteMs = SESSIE_STILTE_MS): Sessie[] {
  const sessies: Sessie[] = [];
  const gesorteerd = [...draad]
    .filter((b) => b && typeof b.timestamp === 'number' && (b.text ?? '').trim())
    .sort((a, b) => a.timestamp - b.timestamp);
  for (const b of gesorteerd) {
    const huidig = sessies[sessies.length - 1];
    if (huidig && b.timestamp - huidig.eind < stilteMs) {
      huidig.beurten.push(b);
      huidig.eind = b.timestamp;
    } else {
      sessies.push({ start: b.timestamp, eind: b.timestamp, beurten: [b] });
    }
  }
  return sessies;
}

/** Vaste sleutel per sessie, op de minuut -- beide Macs komen op dezelfde uit. */
export function sessieSleutel(s: Pick<Sessie, 'start'>): string {
  const d = new Date(Math.floor(s.start / 60_000) * 60_000);
  return `${SESSIE_PREFIX}${d.toISOString().slice(0, 16)}`;
}

/** Waard om te noteren: Luka zei iets en AXE antwoordde. */
export function isNoteerbaar(s: Sessie): boolean {
  return s.beurten.some((b) => b.role === 'user') && s.beurten.some((b) => b.role === 'axe');
}

/**
 * Welke sessies moeten nu een notitie krijgen? Afgerond (laatste beurt minstens
 * een stilte geleden), noteerbaar, en nog niet genoteerd. Hooguit `max`,
 * de nieuwste eerst -- oude geschiedenis inhalen is niet het doel.
 */
export function teNoteren(
  draad: readonly Beurt[],
  bekend: ReadonlySet<string>,
  nu: number,
  max = 2,
  stilteMs = SESSIE_STILTE_MS,
): Sessie[] {
  return splitsSessies(draad, stilteMs)
    .filter((s) => nu - s.eind >= stilteMs && isNoteerbaar(s) && !bekend.has(sessieSleutel(s)))
    .slice(-max)
    .reverse();
}

function kort(t: string, n: number): string {
  const schoon = t.replace(/\s+/g, ' ').trim();
  return schoon.length > n ? `${schoon.slice(0, n - 1).trimEnd()}…` : schoon;
}

/** De vraag aan het model: drie regels, Nederlands, niets verzinnen. */
export function notitieBerichten(s: Sessie): Array<{ role: 'system' | 'user'; content: string }> {
  const regels = s.beurten
    .slice(-24)
    .map((b) => `${b.role === 'user' ? 'Luka' : 'AXE'}: ${kort(b.text, 400)}`)
    .join('\n');
  return [
    {
      role: 'system',
      content:
        'Je schrijft een notitie over een afgerond gesprek tussen Luka en AXE, zodat AXE het volgende gesprek kan oppakken. ' +
        'Precies drie regels, elk hooguit 20 woorden, in het Nederlands:\n' +
        'Gevraagd: <wat Luka wilde>\nVeranderd: <wat er gedaan of besloten is, of "niets">\nGestopt bij: <wat nog open stond>\n' +
        'Alleen wat in het gesprek staat. Geen inleiding, geen opsomming daarna.',
    },
    { role: 'user', content: regels },
  ];
}

/** Haal de drie regels uit een modelantwoord; null als het er niet op lijkt. */
export function leesNotitie(antwoord: string): string | null {
  const regels = (antwoord ?? '')
    .split('\n')
    .map((r) => r.replace(/^[\s*\-•#]+/, '').replace(/\*\*/g, '').trim())
    .filter(Boolean);
  const pak = (kop: RegExp) => regels.find((r) => kop.test(r));
  const g = pak(/^gevraagd\s*:/i);
  const v = pak(/^veranderd\s*:/i);
  const s = pak(/^gestopt bij\s*:/i);
  if (!g || !s) return null;
  return [g, v ?? 'Veranderd: niets', s].map((r) => kort(r, 200)).join('\n');
}

/** Zonder model: eerste en laatste vraag, en AXE's laatste antwoord. Nooit leeg. */
export function simpeleNotitie(s: Sessie): string {
  const vragen = s.beurten.filter((b) => b.role === 'user');
  const antwoorden = s.beurten.filter((b) => b.role === 'axe');
  const eerste = vragen[0]?.text ?? '';
  const laatste = vragen[vragen.length - 1]?.text ?? eerste;
  const slot = antwoorden[antwoorden.length - 1]?.text ?? '';
  return [
    `Gevraagd: ${kort(eerste, 140)}`,
    `Veranderd: onbekend (notitie zonder model)`,
    `Gestopt bij: ${kort(laatste === eerste ? slot : laatste, 140)}`,
  ].join('\n');
}

function wanneer(ms: number, nu: number): string {
  const d = new Date(ms);
  const dagen = Math.floor((new Date(nu).setHours(0, 0, 0, 0) - new Date(ms).setHours(0, 0, 0, 0)) / 86_400_000);
  const tijd = d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
  if (dagen <= 0) return `vandaag ${tijd}`;
  if (dagen === 1) return `gisteren ${tijd}`;
  return `${d.toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' })} ${tijd}`;
}

/** Het blok voor AXE's systeemprompt: de laatste zes, oud → nieuw. '' als er geen zijn. */
export function notitiesBlok(notities: readonly SessieNotitie[], nu: number, n = NOTITIES_IN_PROMPT): string {
  const laatste = [...notities]
    .filter((x) => x.tekst.trim())
    .sort((a, b) => a.start - b.start)
    .slice(-n);
  if (!laatste.length) return '';
  const delen = laatste.map((x) => `### ${wanneer(x.start, nu)}\n${x.tekst.trim()}`);
  return (
    `\n\n## Waar we waren (laatste ${laatste.length} sessies)\n` +
    'Korte notities van eerdere gesprekken. Zegt Luka "ga verder waar we waren", pak dan de nieuwste op. ' +
    'Noem ze niet uit jezelf op.\n\n' +
    delen.join('\n\n')
  );
}

/** Start van een sessie terug uit de sleutel (voor rijen zonder metadata). */
export function startUitSleutel(key: string): number | null {
  if (!key.startsWith(SESSIE_PREFIX)) return null;
  const t = Date.parse(`${key.slice(SESSIE_PREFIX.length)}:00Z`);
  return Number.isFinite(t) ? t : null;
}
