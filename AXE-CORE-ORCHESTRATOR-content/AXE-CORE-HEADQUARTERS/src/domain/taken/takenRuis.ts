/**
 * Taken-tab zonder ruis (Luka, 22 nov: "super veel tasks open, en ik heb geen idee
 * of ik er nou wat mee moet").
 *
 * Gemeten 22 nov: elke mislukte, geannuleerde of afgewezen taak stond als
 * "Wacht op jou" -- ook losse Mac-stapjes van een andere taak (codex.run,
 * git.branch, files.read), taken die daarna wél lukten, en geannuleerde
 * testtaken. Hier de regels: wat weg mag, en wat echt van Luka is. Geen I/O.
 */

export interface RuisRij {
  id: string;
  title: string;
  status: string;
  capability?: string | null;
  created_at: string;
  error?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
}

const KLAAR = new Set(['completed', 'done']);
const MISLUKT = new Set(['failed']);
const AFGESLOTEN = new Set(['cancelled', 'rejected']);
const NOG_OPEN = new Set(['pending', 'queued', 'running', 'planning', 'in_progress', 'verifying', 'retrying', 'waiting_approval', 'blocked']);

/** Iets wat alleen Luka kan oplossen: sleutel, login, tegoed, of de agent zegt dat hij hem nodig heeft. */
const VOOR_LUKA = /api key is invalid|invalid api key|key rejected|not logged in|logged out|log ?in|weekly limit|usage limit|credits?|tegoed|402|needs_human|needs a decision|luka must|verify (your )?account/i;

function foutTekst(r: RuisRij): string {
  const e = r.error;
  if (!e) return '';
  return [e.message, e.code, e.detail].filter((x) => typeof x === 'string').join(' ');
}

export function isVoorLuka(r: RuisRij): boolean {
  if (r.status === 'waiting_approval') return true;
  if (r.status === 'blocked') return true;
  if (!MISLUKT.has(r.status)) return false;
  return VOOR_LUKA.test(foutTekst(r));
}

/** "git.create_branch · AXE Core · mini-van-luka-6": een Mac-stap, ook als een retry hem 'agentic' maakte. */
const MAC_STAP = /^[a-z_]+\.[a-z_]+ · [^·]+ · [\w.-]+$/;

function sleutel(titel: string): string {
  return titel.replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Laat alleen zien wat ertoe doet:
 *  - geen Mac-stapjes (capability computer_use): die horen bij hun taak;
 *  - geen geannuleerde of afgewezen taken;
 *  - een mislukte taak verdwijnt als dezelfde taak daarna lukte of opnieuw loopt,
 *    en van dezelfde mislukte taak blijft alleen de nieuwste over.
 */
export function zonderRuis<T extends RuisRij>(rijen: T[]): T[] {
  const tijd = (r: RuisRij) => Date.parse(r.created_at) || 0;
  const laatsteGoedOfOpen = new Map<string, number>();
  const nieuwsteMislukt = new Map<string, number>();
  for (const r of rijen) {
    const k = sleutel(r.title);
    if (KLAAR.has(r.status) || NOG_OPEN.has(r.status)) {
      laatsteGoedOfOpen.set(k, Math.max(laatsteGoedOfOpen.get(k) ?? 0, tijd(r)));
    }
    if (MISLUKT.has(r.status)) nieuwsteMislukt.set(k, Math.max(nieuwsteMislukt.get(k) ?? 0, tijd(r)));
  }
  return rijen.filter((r) => {
    if (r.capability === 'computer_use' || MAC_STAP.test(r.title)) return false;
    if (AFGESLOTEN.has(r.status)) return false;
    if (MISLUKT.has(r.status)) {
      const k = sleutel(r.title);
      if ((laatsteGoedOfOpen.get(k) ?? 0) > tijd(r)) return false;
      if ((nieuwsteMislukt.get(k) ?? 0) > tijd(r)) return false;
    }
    return true;
  });
}
