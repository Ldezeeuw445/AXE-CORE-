/**
 * De statuskleuren van de NorthSea-tabbladen, op één plek.
 *
 * ## Het contract (UI_COLOR_AND_STATUS.md en ALERT_ROUTING.md)
 *
 *   rood    kritiek / geblokkeerd / mislukt
 *   oranje  actie / akkoord nodig / blokkade met hoge prioriteit
 *   geel    wachtend / in afwachting / in de gaten houden
 *   blauw   info / nieuw / bezig
 *   groen   geverifieerd / afgerond / gehaald / gezond
 *   paars   AI / automatisering / onderzoek
 *   grijs   neutraal / onbekend / inactief
 *
 * De harde regel: **nooit groen voor informatie die alleen uit een openbare bron
 * komt of die een tegenpartij alleen zegt.** In AXE Commodities is (september
 * 2026) geen enkel bedrijf `verified`; 90 staan op `reviewing`. Dat is blauw
 * ("bezig"), geen groen.
 *
 * Elke badge heeft een sleutel, een label, een betekenis en waar het kan een
 * volgende stap (UI_COLOR_AND_STATUS: "semantic key, label, meaning and optional
 * next action").
 */

export type Toon = 'rood' | 'oranje' | 'geel' | 'blauw' | 'groen' | 'paars' | 'grijs';

export const TOON_KLEUR: Record<Toon, string> = {
  rood: '#F87171',
  oranje: '#FB923C',
  geel: '#FBBF24',
  blauw: '#60A5FA',
  groen: '#34D399',
  paars: '#A78BFA',
  grijs: '#94A3B8',
};

export interface Badge {
  sleutel: string;
  label: string;
  toon: Toon;
  betekenis: string;
  volgende?: string;
}

/** "partially_corroborated" → "Partially corroborated"; leeg → "Unknown". */
export function mensLabel(ruw: string | null | undefined): string {
  const t = (ruw ?? '').trim().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
  if (!t) return 'Unknown';
  return t.charAt(0).toUpperCase() + t.slice(1);
}

const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();

/** Verificatie van een bedrijf of contact (enum verification_status). */
export function verificatieBadge(status: string | null | undefined): Badge {
  const s = norm(status);
  switch (s) {
    case 'verified':
      return { sleutel: s, label: 'Verified', toon: 'groen', betekenis: 'Verified against an independent source.' };
    case 'rejected':
      return { sleutel: s, label: 'Rejected', toon: 'rood', betekenis: 'Verification failed.', volgende: 'Do not proceed without new evidence' };
    case 'reviewing':
      return { sleutel: s, label: 'In review', toon: 'blauw', betekenis: 'Being checked; not verified yet.', volgende: 'Complete verification' };
    case 'unverified':
      return { sleutel: s, label: 'Unverified', toon: 'grijs', betekenis: 'No verification done yet.', volgende: 'Start verification' };
    default:
      return { sleutel: s || 'unknown', label: s ? mensLabel(s) : 'Unknown', toon: 'grijs', betekenis: 'No verification status recorded.' };
  }
}

/**
 * Verificatie van bewijs (deal_evidence.verification_status, vrije tekst).
 * Alleen een expliciete bevestiging uit de bron zelf is groen.
 */
export function bewijsBadge(status: string | null | undefined): Badge {
  const s = norm(status);
  if (['verified', 'source_verified', 'confirmed'].includes(s)) {
    return { sleutel: s, label: mensLabel(s), toon: 'groen', betekenis: 'Confirmed by the source itself.' };
  }
  if (['rejected', 'contradicted', 'failed', 'expired', 'invalid'].includes(s)) {
    return { sleutel: s, label: mensLabel(s), toon: 'rood', betekenis: 'Contradicted, expired or rejected.', volgende: 'Request replacement evidence' };
  }
  if (['partial', 'partially_corroborated', 'counterparty_stated', 'reviewing', 'under_review', 'pending'].includes(s)) {
    return { sleutel: s, label: mensLabel(s), toon: 'geel', betekenis: 'Partly supported or only stated by the counterparty; not verified.', volgende: 'Corroborate with an independent source' };
  }
  if (['public_source_only', 'unverified', ''].includes(s)) {
    return { sleutel: s || 'unverified', label: s ? mensLabel(s) : 'Unverified', toon: 'grijs', betekenis: 'Public or unconfirmed information; treat as unverified.', volgende: 'Verify before relying on it' };
  }
  return { sleutel: s, label: mensLabel(s), toon: 'grijs', betekenis: 'Unrecognised status; treated as unverified.' };
}

/** Bezorgstatus van een uitgaand bericht (communications.delivery_status). */
export function bezorgBadge(status: string | null | undefined): Badge | null {
  const s = norm(status);
  if (!s) return null;
  if (['bounced', 'failed', 'rejected', 'complained'].includes(s)) {
    return { sleutel: s, label: mensLabel(s), toon: 'rood', betekenis: 'Not delivered.', volgende: 'Find an alternative contact' };
  }
  if (['delayed', 'deferred'].includes(s)) return { sleutel: s, label: mensLabel(s), toon: 'geel', betekenis: 'Delivery delayed; retrying.' };
  if (['delivered', 'opened', 'clicked'].includes(s)) return { sleutel: s, label: mensLabel(s), toon: 'groen', betekenis: 'Delivered to the recipient.' };
  return { sleutel: s, label: mensLabel(s), toon: 'blauw', betekenis: 'Sent; delivery not confirmed yet.' };
}

/** Een antwoordconcept (reply_drafts.approval_status + sent_at). */
export function conceptBadge(akkoord: string | null | undefined, verzonden: string | null | undefined): Badge {
  if (verzonden) return { sleutel: 'sent', label: 'Sent', toon: 'groen', betekenis: 'Approved and sent.' };
  const s = norm(akkoord);
  if (s === 'approved') return { sleutel: s, label: 'Approved', toon: 'blauw', betekenis: 'Approved, not sent yet.', volgende: 'Send via the approved-reply path' };
  if (s === 'rejected') return { sleutel: s, label: 'Rejected', toon: 'grijs', betekenis: 'Rejected; will not be sent.' };
  return { sleutel: s || 'pending', label: 'Awaiting approval', toon: 'oranje', betekenis: 'Draft ready; needs your approval.', volgende: 'Review and approve or reject' };
}

/** Een deal-taak of actie. `nu` in ms, zodat het testbaar is. */
export function taakBadge(
  t: { status?: string | null; akkoord_nodig?: boolean | null; due_at?: string | null; fout?: string | null },
  nu: number,
): Badge {
  const s = norm(t.status);
  if (t.fout) return { sleutel: 'failed', label: 'Execution failed', toon: 'rood', betekenis: t.fout, volgende: 'Resolve the failure' };
  const due = t.due_at ? Date.parse(t.due_at) : NaN;
  if (['completed', 'done', 'cancelled'].includes(s)) {
    return { sleutel: s, label: mensLabel(s), toon: s === 'cancelled' ? 'grijs' : 'groen', betekenis: s === 'cancelled' ? 'Cancelled.' : 'Completed.' };
  }
  if (Number.isFinite(due) && due < nu) return { sleutel: 'overdue', label: 'Overdue', toon: 'rood', betekenis: 'Past its due date.', volgende: 'Follow up now' };
  if (t.akkoord_nodig) return { sleutel: 'approval', label: 'Approval required', toon: 'oranje', betekenis: 'Needs your approval before it can run.' };
  if (s === 'waiting') return { sleutel: s, label: 'Waiting', toon: 'geel', betekenis: 'Waiting on someone else.' };
  if (s === 'in_progress') return { sleutel: s, label: 'In progress', toon: 'blauw', betekenis: 'Being worked on.' };
  return { sleutel: s || 'open', label: 'Open', toon: 'blauw', betekenis: 'Open task.' };
}

/**
 * De toon van een deal-gebeurtenis (deal_events.event_type, vrije tekst), voor de
 * automatiseringslog. Mislukt eerst, dan vertraagd, dan automatisering, dan info.
 */
export function gebeurtenisToon(soort: string | null | undefined): Toon {
  const s = norm(soort);
  if (!s) return 'grijs';
  if (/bounce|fail|error|reject/.test(s)) return 'rood';
  if (/delay|deferred|retry|stale|overdue/.test(s)) return 'geel';
  if (/approval|review_required|needs_review/.test(s)) return 'oranje';
  if (/automation|engine|fallback|sourcing|research|ai_|crew/.test(s)) return 'paars';
  if (/delivered|completed|verified|won/.test(s)) return 'groen';
  if (/sent|processed|matched|created|initialized|qualif|reply|lead/.test(s)) return 'blauw';
  return 'grijs';
}

/** De negen poorten als stappen: gehaald, de eerstvolgende (huidig), of nog open. */
export const POORT_LABELS = [
  'Buyer', 'Seller', 'Commercial', 'Evidence', 'Protection', 'Introduction', 'Transaction', 'Fulfilment', 'Settlement',
] as const;

export type PoortStaat = 'gehaald' | 'huidig' | 'open';

export function poortStappen(gehaald: ReadonlyArray<boolean | null | undefined>): Array<{ label: string; staat: PoortStaat }> {
  // Een poort telt alleen als hij expliciet true is (DEAL_STATE_MACHINE: "explicit source-supported evidence").
  const eerstOpen = POORT_LABELS.findIndex((_, i) => gehaald[i] !== true);
  return POORT_LABELS.map((label, i) => ({
    label,
    staat: gehaald[i] === true ? 'gehaald' : i === eerstOpen ? 'huidig' : 'open',
  }));
}
