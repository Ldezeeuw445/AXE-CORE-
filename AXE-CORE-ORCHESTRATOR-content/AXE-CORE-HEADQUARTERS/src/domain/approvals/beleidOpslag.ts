/**
 * Luka's beleidsschakelaars. De defaults staan in beleid.ts; dit bewaart alleen
 * wat hij zelf zet, lokaal tot de Supabase-migratie is toegepast.
 */
import { STANDAARD_REGELS, type ApprovalCategorie, type BeleidRegel } from './beleid';

const SLEUTEL = 'axe_approval_policy_v1';
const LOG = 'axe_approval_decisions_v1';

export interface BesluitLog {
  itemId: string;
  sourceId?: string;
  action: 'approve' | 'reject' | 'auto_approve' | 'auto_reject';
  actorType: 'human' | 'axe_policy' | 'manager';
  reason: string;
  via: 'inbox' | 'bulk' | 'reaction' | 'thread' | 'policy';
  at: string;
  threadId?: string | null;
  messageId?: string | null;
}

function leesJson<T>(sleutel: string, fallback: T): T {
  if (typeof localStorage === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(sleutel);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function laadRegels(): BeleidRegel[] {
  const extra = leesJson<BeleidRegel[]>(SLEUTEL, []);
  if (!Array.isArray(extra) || extra.length === 0) return STANDAARD_REGELS.map((r) => ({ ...r }));
  const uit = STANDAARD_REGELS.map((r) => ({ ...r }));
  for (const e of extra) {
    const i = uit.findIndex((r) => r.managerId === e.managerId && r.category === e.category);
    if (i >= 0) uit[i] = { ...uit[i], ...e };
    else uit.push(e);
  }
  return uit;
}

export function zetCategorieVrij(managerId: string, category: ApprovalCategorie, aan: boolean): BeleidRegel[] {
  const regels = laadRegels().map((r) =>
    r.managerId === managerId && r.category === category
      ? { ...r, axeMayApproveAll: aan, mode: aan ? 'auto_approve' as const : r.mode }
      : r,
  );
  if (typeof localStorage !== 'undefined') localStorage.setItem(SLEUTEL, JSON.stringify(regels));
  return regels;
}

export function logBesluit(rij: BesluitLog): void {
  const oud = leesJson<BesluitLog[]>(LOG, []);
  const next = [rij, ...oud].slice(0, 500);
  if (typeof localStorage !== 'undefined') localStorage.setItem(LOG, JSON.stringify(next));
}

export function laadBesluiten(): BesluitLog[] {
  return leesJson<BesluitLog[]>(LOG, []);
}
