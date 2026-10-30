/**
 * NorthSea desk ↔ Gmail-realiteit (support@northseacommodity.com, RO).
 *
 * Luka go-build okt 2026: de tab liep achter op twee serieuze deals. Deze module
 * is de enkele bron van die feiten voor UI-overlays én voor de sync-SQL die de
 * backend kan toepassen. Geen verzonnen bedragen — alleen stage, evidence-labels
 * en next_action die in mail staan.
 */
export type RealityLane = 'active' | 'quiet';

export interface RealityFact {
  /** Match op leverancier- of productnaam (case-insensitive substring). */
  match: { leverancier?: string; koper?: string; product?: string; code?: string };
  lane: RealityLane;
  /** Stage die de desk zou moeten tonen. */
  stage: string;
  execution_state: string;
  next_action: string;
  /** ISO date when next_action becomes actionable; null = now. */
  next_action_at: string | null;
  evidence: ReadonlyArray<{ label: string; status: 'signed' | 'pending' | 'draft' }>;
  hold_until: string | null;
  note: string;
  source: 'gmail';
  as_of: string;
}

/** Feiten gemeten 29–30 okt 2026 via Gmail RO (Harcros thread, Brixlegg thread). */
export const REALITY_FACTS: readonly RealityFact[] = [
  {
    match: { leverancier: 'Harcros' },
    lane: 'active',
    stage: 'introduced',
    execution_state: 'docs_signed',
    next_action: 'Prepare buyer intro pack (NCNDA+FPA signed 29 Oct).',
    next_action_at: null,
    evidence: [
      { label: 'NCNDA', status: 'signed' },
      { label: 'FPA', status: 'signed' },
    ],
    hold_until: null,
    note: 'Signed NCNDA + FPA received 29 Oct; Luka confirmed; ready for buyer introduction.',
    source: 'gmail',
    as_of: '2026-10-29',
  },
  {
    match: { leverancier: 'Brixlegg' },
    lane: 'active',
    stage: 'engaged',
    execution_state: 'indication_received',
    next_action: 'Send NCNDA when Sandra returns (OOO until 4 Nov).',
    next_action_at: '2026-11-04T09:00:00+01:00',
    evidence: [
      { label: 'Indication', status: 'signed' },
      { label: 'NCNDA', status: 'pending' },
    ],
    hold_until: '2026-11-04',
    note: 'Open to structure; green premium indication; NCNDA still to send; Sandra OOO until 4 Nov.',
    source: 'gmail',
    as_of: '2026-10-28',
  },
];

function hay(d: {
  leverancier?: string | null;
  koper?: string | null;
  product?: string | null;
  code?: string | null;
}): string {
  return [d.leverancier, d.koper, d.product, d.code]
    .map((s) => (s ?? '').toLowerCase())
    .join(' | ');
}

/** Eerste RealityFact die bij deze deal past, of null. */
export function realityVoor(d: {
  leverancier?: string | null;
  koper?: string | null;
  product?: string | null;
  code?: string | null;
}): RealityFact | null {
  const h = hay(d);
  for (const f of REALITY_FACTS) {
    const m = f.match;
    if (m.leverancier && h.includes(m.leverancier.toLowerCase())) return f;
    if (m.koper && h.includes(m.koper.toLowerCase())) return f;
    if (m.product && h.includes(m.product.toLowerCase())) return f;
    if (m.code && (d.code ?? '').toLowerCase().includes(m.code.toLowerCase())) return f;
  }
  return null;
}

/**
 * Overlay: als reality een latere stage/uitvoering kent, wint die voor UI.
 * Originele deal-velden blijven intact; caller bouwt een view-model.
 */
export function metReality<T extends {
  stage?: string | null;
  execution_state?: string | null;
  volgende?: string | null;
  leverancier?: string | null;
  koper?: string | null;
  product?: string | null;
  code?: string | null;
}>(d: T): T & { reality: RealityFact | null } {
  const reality = realityVoor(d);
  if (!reality) return { ...d, reality: null };
  return {
    ...d,
    stage: reality.stage,
    execution_state: reality.execution_state,
    volgende: reality.next_action,
    reality,
  };
}

export interface LaneTelling {
  active: number;
  quiet: number;
  activeIds: string[];
}

/**
 * Active = isActief OF reality.lane === 'active'.
 * Quiet = open + niet active (typisch ~53 identified).
 */
export function laneTelling(
  deals: ReadonlyArray<{
    id: string;
    stage?: string | null;
    execution_state?: string | null;
    leverancier?: string | null;
    koper?: string | null;
    product?: string | null;
    code?: string | null;
  }>,
  isActiefFn: (d: { stage?: string | null; execution_state?: string | null }) => boolean,
): LaneTelling {
  const activeIds: string[] = [];
  let quiet = 0;
  for (const d of deals) {
    const stage = (d.stage ?? '').trim();
    if (stage === 'won' || stage === 'lost') continue;
    const r = realityVoor(d);
    const actief = r?.lane === 'active' || isActiefFn(d);
    if (actief) activeIds.push(d.id);
    else quiet += 1;
  }
  return { active: activeIds.length, quiet, activeIds };
}

/** SQL-patch (handmatig / backend) — geen secrets; alleen stage + next_action. */
export function realitySyncSql(): string {
  return REALITY_FACTS.map((f) => {
    const lev = (f.match.leverancier ?? '').replace(/'/g, "''");
    const hold = f.hold_until ? `'${f.hold_until}'::date` : 'null';
    const nextAt = f.next_action_at ? `'${f.next_action_at}'::timestamptz` : 'now()';
    return `-- ${f.note.replace(/\n/g, ' ')}
UPDATE opportunities
SET stage = '${f.stage}',
    execution_state = '${f.execution_state}',
    next_action = '${f.next_action.replace(/'/g, "''")}',
    next_action_at = ${nextAt},
    updated_at = now()
WHERE lower(coalesce(supplier_name, '')) LIKE '%${lev.toLowerCase()}%'
   OR id IN (
     SELECT o.id FROM opportunities o
     JOIN companies c ON c.id = o.supplier_id
     WHERE lower(c.name) LIKE '%${lev.toLowerCase()}%'
   );
-- hold_until hint (comment): ${hold}`;
  }).join('\n\n');
}
