/**
 * Wat de compacte notch toont (Luka, 27 nov; de vormen uit PR #348).
 *
 * Eén kaart onder de strook, in één van vijf standen, in deze volgorde:
 *
 *   gesleept > fout > werkt > groet (eerste 6 s) > rust
 *
 * Alleen echte gegevens: taken uit /tasks, stappen uit /tasks/{id},
 * goedkeuringen uit /approvals. Niets hier keurt goed of stuurt iets.
 *
 * "Opnieuw" bij een mislukte taak mag alleen als die taak niets riskants
 * doet: geen trade, betaling, verzending, deploy of merge. Die gaan via
 * AXE CORE zelf, waar Luka ziet wat er precies opnieuw zou gaan.
 *
 * Geen DOM, geen React: puur, zodat elk geval te toetsen is.
 */

export type CompacteStand = 'gesleept' | 'fout' | 'werkt' | 'groet' | 'rust';

/** Zo lang staat de groet er na het openvouwen. */
export const GROET_MS = 6000;

/** Hoe lang een mislukte taak in de compacte foutkaart blijft staan. */
export const FOUT_VENSTER_MS = 2 * 3600 * 1000;

export interface NotchTaak {
  id: string;
  titel: string;
  status: string;
  wie: string;
  capability?: string;
  fout?: string;
  bijgewerkt?: string;
}

export interface NotchStap {
  id: string;
  volgorde: number;
  titel: string;
  status: string;
}

export function compacteStand(i: {
  gesleept: boolean;
  bereikbaar: boolean;
  mislukt: number;
  actief: number;
  openSindsMs: number;
}): CompacteStand {
  if (i.gesleept) return 'gesleept';
  if (!i.bereikbaar || i.mislukt > 0) return 'fout';
  if (i.actief > 0) return 'werkt';
  if (i.openSindsMs < GROET_MS) return 'groet';
  return 'rust';
}

export function groet(uur: number): string {
  if (uur < 5) return 'Still up, Luka';
  if (uur < 12) return 'Good morning, Luka';
  if (uur < 18) return 'Good afternoon, Luka';
  return 'Good evening, Luka';
}

const ACTIEF = /running|queued|active|in_progress|claimed|waiting/i;
const MISLUKT = /^(failed|error|dead|dead_letter)$/i;

/** Taken uit /tasks → actief en recent mislukt. Mislukt telt 2 uur. */
export function verdeelTaken(
  ruw: Array<{ id?: string; title?: string; goal?: string; status?: string; capability?: string; assignee?: string | null; error?: unknown; updated_at?: string }>,
  nu: number,
): { actief: NotchTaak[]; mislukt: NotchTaak[] } {
  const naar = (t: (typeof ruw)[number]): NotchTaak => ({
    id: String(t.id || ''),
    titel: String(t.title || t.goal || t.capability || 'task').replace(/\s+/g, ' ').trim(),
    status: String(t.status || ''),
    wie: String(t.assignee || ''),
    capability: t.capability,
    fout: t.error == null ? undefined : typeof t.error === 'string' ? t.error : foutTekst(t.error),
    bijgewerkt: t.updated_at,
  });
  const actief = ruw.filter((t) => ACTIEF.test(String(t.status || ''))).map(naar);
  const mislukt = ruw
    .filter((t) => MISLUKT.test(String(t.status || '')))
    .filter((t) => {
      const ms = t.updated_at ? Date.parse(t.updated_at) : NaN;
      return Number.isFinite(ms) && nu - ms <= FOUT_VENSTER_MS;
    })
    .map(naar);
  return { actief, mislukt };
}

function foutTekst(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message);
  try { return JSON.stringify(e); } catch { return String(e); }
}

export type StapMerk = 'klaar' | 'nu' | 'straks' | 'mislukt';
export interface StapRij { id: string; titel: string; merk: StapMerk }

/** Stappen van de taak in beeld: max 3 rijen, rond de stap van nu. */
export function stapRijen(stappen: NotchStap[], max = 3): StapRij[] {
  const rijen: StapRij[] = [...stappen]
    .sort((a, b) => a.volgorde - b.volgorde)
    .map((s) => {
      const st = s.status.toLowerCase();
      const merk: StapMerk = ['done', 'completed', 'succeeded', 'skipped'].includes(st)
        ? 'klaar'
        : ['running', 'in_progress', 'active', 'claimed'].includes(st)
          ? 'nu'
          : ['failed', 'error'].includes(st)
            ? 'mislukt'
            : 'straks';
      return { id: s.id, titel: s.titel || 'step', merk };
    });
  if (rijen.length <= max) return rijen;
  let nu = rijen.findIndex((r) => r.merk === 'nu' || r.merk === 'mislukt');
  if (nu < 0) nu = rijen.findIndex((r) => r.merk === 'straks');
  if (nu < 0) nu = rijen.length - 1;
  const start = Math.max(0, Math.min(nu - 1, rijen.length - max));
  return rijen.slice(start, start + max);
}

const RISKANT = /trade|trading|order|payment|pay\b|betaal|transfer|wire|sepa|iban|purchase|buy\b|sell\b|deploy|release|send|verstuur|mail|publish|merge/i;

/** Mag "Opnieuw" vanuit de notch? Alleen als de taak niets riskants doet. */
export function magOpnieuw(t: Pick<NotchTaak, 'titel' | 'capability'> & { wie?: string }): boolean {
  const blob = `${t.titel || ''} ${t.capability || ''} ${t.wie || ''}`;
  return !RISKANT.test(blob);
}

/** Korte zin voor de foutkaart. */
export function foutZin(bereikbaar: boolean, mislukt: NotchTaak[]): { titel: string; reden: string } {
  if (!bereikbaar) {
    return {
      titel: "AXE can't reach the server",
      reden: "The VPS isn't answering, so this may be old. Your managers keep working there.",
    };
  }
  const t = mislukt[0];
  const meer = mislukt.length > 1 ? ` (+${mislukt.length - 1} more)` : '';
  return {
    titel: `${t?.titel || 'A task'} didn't finish${meer}`,
    reden: t?.fout ? t.fout.replace(/\s+/g, ' ').slice(0, 120) : 'It stopped with an error.',
  };
}

/** "1 thing waiting on you" / "3 things …" / niets. */
export function wachtZin(n: number): string {
  if (n <= 0) return 'Nothing waiting on you';
  return n === 1 ? '1 thing waiting on you' : `${n} things waiting on you`;
}
