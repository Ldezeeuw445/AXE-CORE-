/**
 * Eén eeuwig gesprek tussen Luka en AXE.
 *
 * AXE is geen chat-app met losse gesprekken: openen hervat hetzelfde gesprek,
 * op elk apparaat. Daarvoor is er één vaste, deterministische id -- geen
 * opzoeking op de server nodig, dus een telefoon zonder localStorage (iOS
 * wist die na ~7 dagen) komt toch in hetzelfde gesprek uit.
 *
 * Oude gesprekken blijven onaangeroerd in `messages` staan. Het hoofdgesprek
 * TOONT ze wel: het laadt de nieuwste 500 AXE-berichten van Luka over alle
 * gesprek-id's, oud → nieuw. Zo voelt het als één doorlopende draad zonder dat
 * er ook maar één rij herschreven wordt. Wat er naar het model gaat blijft de
 * laatste paar beurten plus geheugen en "sinds je weg was" -- de draad mag
 * eindeloos groeien zonder dat de prompt meegroeit.
 *
 * Geen I/O hier.
 */

/** Vast voor altijd. Verander dit nooit: het IS het gesprek. */
export const AXE_HOOFDGESPREK_ID = 'a8e00000-0000-4000-8000-00000000a8e0';

export function isHoofdgesprek(id: string | null | undefined): boolean {
  return id === AXE_HOOFDGESPREK_ID;
}

export interface Beurt {
  role: 'user' | 'axe';
  text: string;
  timestamp: number;
}

const GROET = /^(goedemorgen|goedemiddag|goedenavond|good (morning|afternoon|evening))\b/i;

/** Hoe lang een gesprek "nog bezig" is: binnen dit venster is openen geen nieuw begin. */
export const DOORLOPEND_MS = 3 * 60 * 60_000;

function zelfdeDag(a: number, b: number): boolean {
  const x = new Date(a);
  const y = new Date(b);
  return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate();
}

/**
 * Mag AXE nu begroeten? Alleen als het een echt nieuw begin is:
 *  - vandaag nog niet begroet (op géén apparaat -- het gesprek is gedeeld), en
 *  - het gesprek niet nog loopt (laatste bericht > 3 uur geleden).
 * De app opnieuw openen is geen gesprek-gebeurtenis.
 */
export function magBegroeten(gesprek: readonly Beurt[], nu: number): boolean {
  if (gesprek.some((b) => b.role === 'axe' && zelfdeDag(b.timestamp, nu) && GROET.test(b.text.trim()))) {
    return false;
  }
  const laatste = gesprek.length ? gesprek[gesprek.length - 1].timestamp : 0;
  return !(laatste && nu - laatste < DOORLOPEND_MS);
}

export interface SindsSamenvatting {
  summary: string;
  counts: Record<string, number>;
}

/** Iets dat Luka moet horen als hij terugkomt? Alleen echte, betekenisvolle events. */
export function betekenisvol(s: SindsSamenvatting | null | undefined): boolean {
  if (!s) return false;
  const c = s.counts || {};
  return (c.milestones_completed || 0) + (c.missions_completed || 0) + (c.blocked || 0)
    + (c.approvals_waiting || 0) + (c.failures || 0) > 0;
}

/**
 * De begroeting zelf, of null. Geen "AXE is online"-vulling meer: zonder
 * briefje en zonder echt nieuws zegt AXE niets bij het openen.
 */
export function begroeting(
  uur: number,
  briefje: string | null | undefined,
  sinds: SindsSamenvatting | null | undefined,
): string | null {
  const nieuws = betekenisvol(sinds) ? sinds!.summary : '';
  const kern = [nieuws, (briefje || '').trim()].filter(Boolean).join(' ');
  if (!kern) return null;
  const deel = uur < 12 ? 'Goedemorgen' : uur < 18 ? 'Goedemiddag' : 'Goedenavond';
  return `${deel}, Luka. ${kern}`;
}

/** Het blok voor AXE's systeemprompt: wat er echt gebeurde terwijl Luka weg was. */
export function terugkomstBlok(s: SindsSamenvatting | null | undefined): string {
  if (!betekenisvol(s)) return '';
  return `\n\n## While Luka was away (from real agent events, not guesses)\n${s!.summary}\n`
    + 'Mention this naturally if it is relevant to what he says; do not invent details beyond it.';
}
