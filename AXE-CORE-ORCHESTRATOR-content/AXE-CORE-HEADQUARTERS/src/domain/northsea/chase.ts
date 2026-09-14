/**
 * AXE Chase: wat er bij NorthSea achterna gezeten moet worden, en hoe dringend.
 *
 * ## Waar het vandaan komt
 *
 * Vier bronnen uit de NorthSea-database (AXE Commodities), via
 * backend/axe_api/northsea.py:
 *   - action_queue (open of wachtend): kwalificaties, supplier-antwoorden;
 *   - deal_tasks (open): blokkades die AXE per deal oplost;
 *   - reply_drafts (klaar, nog niet verstuurd, wacht op akkoord);
 *   - communications met delivery_status 'bounced' (laatste 30 dagen).
 * Geen voorbeelddata: het bedrijf draait, en een verzonnen "DEAL-004 approval
 * required" is een actie die iemand gaat uitvoeren.
 *
 * ## De regels, in volgorde (de eerste die past wint)
 *
 *   bounce               → "Find alternative contact"   rood, kritiek
 *   uitvoering mislukt   → "Execution failed"            rood, kritiek
 *   deadline voorbij     → "Follow up required"          rood, kritiek
 *   akkoord nodig        → "Approval required"           amber
 *   concept, gevoelig    → "Draft ready · sensitive"     amber
 *   concept              → "Draft ready"                 groen
 *   wacht op antwoord    → "Waiting for reply"           amber
 *   anders               → de volgende stap van de deal  groen
 *
 * Kritiek is ook alles met prioriteit 90 of hoger. Nieuw is aangemaakt in de
 * laatste 24 uur.
 *
 * ## De kopregel
 *
 * De dealcode staat in de database in `opportunities.deal_priority` (DEAL-001,
 * DEAL-002 ...), niet in een eigen kolom. Alleen iets dat eruitziet als een
 * code telt als code; "high" of "medium" in datzelfde veld is een prioriteit.
 * Zonder code: het product, en anders het soort werk. Een nummer als
 * "NORTHSEA-017" bestaat nergens en wordt dus ook niet verzonnen.
 */

export interface NorthseaRij {
  id: string;
  soort?: string | null;
  titel?: string | null;
  status?: string | null;
  prioriteit?: number | string | null;
  akkoord_nodig?: boolean | null;
  due_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  fout?: string | null;
  code?: string | null;
  blokkade?: string | null;
  volgende?: string | null;
  koper?: string | null;
  leverancier?: string | null;
  product?: string | null;
  aan?: unknown;
  gevoelig?: boolean | null;
}

export interface NorthseaOverzicht {
  pipeline: number;
  actief: number;
  tellers: {
    bedrijven: number; contacten: number; communicatie_7d: number;
    bewijs: number; documenten: number; campagnes: number;
  };
  acties: NorthseaRij[];
  taken: NorthseaRij[];
  concepten: NorthseaRij[];
  bounces: NorthseaRij[];
}

export type ChaseToon = 'rood' | 'amber' | 'groen';
export type ChaseBron = 'actie' | 'taak' | 'concept' | 'bounce';

export interface ChaseItem {
  id: string;
  bron: ChaseBron;
  kop: string;
  regel: string;
  stand: string;
  toon: ChaseToon;
  kritiek: boolean;
  nieuw: boolean;
  /** ISO-tijd waarop hij ontstond of voor het laatst veranderde. */
  wanneer: string;
  prioriteit: number;
}

const DAG_MS = 24 * 60 * 60 * 1000;
const GENERIEKE_TITELS = new Set(['resolve current primary blocker']);
const SOORT_LABEL: Record<string, string> = {
  qualify_match: 'Qualify match',
  qualification: 'Qualification',
  review_supplier_reply: 'Supplier reply',
  source_verification: 'Source verification',
  follow_up: 'Follow-up',
  resolve_blocker: 'Blocker',
  parallel_qualification: 'Parallel qualification',
};

export function isDealCode(waarde: string | null | undefined): waarde is string {
  return !!waarde && /^[A-Z][A-Z0-9]*(-[A-Z0-9]+)*-\d{2,}[A-Z0-9-]*$/.test(waarde.trim());
}

function kort(tekst: string, max = 72): string {
  const t = tekst.replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

function soortLabel(soort: string | null | undefined): string {
  if (!soort) return 'Action';
  return SOORT_LABEL[soort] ?? soort.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
}

function partijen(r: NorthseaRij): string | null {
  const a = r.koper?.trim();
  const b = r.leverancier?.trim();
  if (a && b) return `${a} ↔ ${b}`;
  return a || b || null;
}

function eersteAdres(aan: unknown): string | null {
  if (Array.isArray(aan)) return typeof aan[0] === 'string' ? aan[0] : null;
  return typeof aan === 'string' ? aan : null;
}

function naarItem(r: NorthseaRij, bron: ChaseBron, nu: number): ChaseItem {
  const prioriteit = Number(r.prioriteit ?? 0) || 0;
  const wanneer = r.updated_at || r.created_at || new Date(nu).toISOString();
  const aangemaakt = Date.parse(r.created_at || wanneer);
  const verlopen = !!r.due_at && Date.parse(r.due_at) < nu;

  const kop = isDealCode(r.code)
    ? r.code.trim()
    : bron === 'bounce' ? 'Email Failure'
      : r.product?.trim() || soortLabel(r.soort);

  const titel = r.titel?.trim() ?? '';
  const regel = bron === 'bounce'
    ? `${partijen(r) ?? eersteAdres(r.aan) ?? 'Outbound email'} bounced`
    : titel && !GENERIEKE_TITELS.has(titel.toLowerCase())
      ? titel
      : r.blokkade?.trim() || partijen(r) || soortLabel(r.soort);

  let stand: string;
  let toon: ChaseToon;
  let kritiek = prioriteit >= 90;
  if (bron === 'bounce') { stand = 'Find alternative contact'; toon = 'rood'; kritiek = true; }
  else if (r.fout) { stand = 'Execution failed'; toon = 'rood'; kritiek = true; }
  else if (verlopen) { stand = 'Follow up required'; toon = 'rood'; kritiek = true; }
  else if (r.akkoord_nodig) { stand = 'Approval required'; toon = 'amber'; }
  else if (bron === 'concept') { stand = r.gevoelig ? 'Draft ready · sensitive' : 'Draft ready'; toon = r.gevoelig ? 'amber' : 'groen'; }
  else if (r.status === 'waiting') { stand = 'Waiting for reply'; toon = 'amber'; }
  else { stand = r.volgende?.trim() || soortLabel(r.soort); toon = 'groen'; }

  return {
    id: `${bron}:${r.id}`, bron,
    kop: kort(kop, 32), regel: kort(regel), stand: kort(stand, 60), toon,
    kritiek, nieuw: Number.isFinite(aangemaakt) && nu - aangemaakt < DAG_MS,
    wanneer, prioriteit,
  };
}

export function chaseItems(o: Pick<NorthseaOverzicht, 'acties' | 'taken' | 'concepten' | 'bounces'>, nu: number): ChaseItem[] {
  const items = [
    ...o.bounces.map(r => naarItem(r, 'bounce', nu)),
    ...o.acties.map(r => naarItem(r, 'actie', nu)),
    ...o.taken.map(r => naarItem(r, 'taak', nu)),
    ...o.concepten.map(r => naarItem(r, 'concept', nu)),
  ];
  return items.sort((a, b) =>
    Number(b.kritiek) - Number(a.kritiek)
    || b.prioriteit - a.prioriteit
    || Date.parse(b.wanneer) - Date.parse(a.wanneer));
}

export function chaseTellers(items: readonly ChaseItem[]): { alle: number; kritiek: number; nieuw: number } {
  return {
    alle: items.length,
    kritiek: items.filter(i => i.kritiek).length,
    nieuw: items.filter(i => i.nieuw).length,
  };
}

/** "2h ago", "1d ago": dezelfde vorm als het ontwerp. */
export function tijdGeleden(iso: string, nu: number): string {
  const ms = nu - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 60_000) return 'just now';
  const min = Math.floor(ms / 60_000);
  if (min < 60) return `${min}m ago`;
  const uur = Math.floor(min / 60);
  if (uur < 24) return `${uur}h ago`;
  return `${Math.floor(uur / 24)}d ago`;
}
