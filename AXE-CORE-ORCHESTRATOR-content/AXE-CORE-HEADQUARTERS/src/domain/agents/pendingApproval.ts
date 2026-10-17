/**
 * Pending core_approvals zoals Home, Awareness en de PWA ze nodig hebben.
 *
 * De VPS stuurde `pending_approval` (snake); de UI las `pendingApproval`.
 * Zonder die brug zei de popover "needs your OK" zonder knoppen.
 */
import type { ServerAgent } from './serverStatus';

export type PendingVraag = NonNullable<ServerAgent['pendingApproval']> & {
  task_id?: string | null;
};

export type GoedkeuringsRij = {
  id: string;
  taskId: string;
  wat: string;
  waarom: string;
};

type RuweAgent = ServerAgent & {
  pending_approval?: PendingVraag | null;
  pending_approvals?: PendingVraag[] | null;
  pendingApprovals?: PendingVraag[] | null;
};

function alsVraag(raw: unknown): PendingVraag | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const id = typeof r.id === 'string' ? r.id : '';
  if (!id) return null;
  return {
    id,
    kind: typeof r.kind === 'string' ? r.kind : null,
    title: typeof r.title === 'string' ? r.title : null,
    detail: typeof r.detail === 'string' ? r.detail : null,
    wat: typeof r.wat === 'string' ? r.wat : null,
    waarom: typeof r.waarom === 'string' ? r.waarom : null,
    task_id: typeof r.task_id === 'string' ? r.task_id : typeof r.taskId === 'string' ? r.taskId : null,
  };
}

function lijstVan(raw: unknown): PendingVraag[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(alsVraag).filter((x): x is PendingVraag => x != null);
}

/** Zet snake_case van de API om naar wat de UI leest. Niets verzinnen. */
export function normaliseerServerAgent(raw: ServerAgent | RuweAgent): ServerAgent {
  const r = raw as RuweAgent;
  const een = alsVraag(r.pendingApproval) ?? alsVraag(r.pending_approval);
  const meer = [
    ...lijstVan(r.pendingApprovals),
    ...lijstVan(r.pending_approvals),
    ...(een ? [een] : []),
  ];
  const gezien = new Set<string>();
  const pendingApprovals = meer.filter((v) => {
    if (gezien.has(v.id)) return false;
    gezien.add(v.id);
    return true;
  });
  const pendingApproval = pendingApprovals[0] ?? een ?? null;
  return { ...r, pendingApproval, pendingApprovals };
}

export function wachtOpOk(agent: Pick<ServerAgent, 'status' | 'pendingApproval'> | null | undefined, jobWacht = false): boolean {
  if (jobWacht) return true;
  if (!agent) return false;
  if (agent.status === 'WAITING_APPROVAL') return true;
  return !!agent.pendingApproval?.id;
}

function schoonChip(s: string): string {
  return s
    .replace(/\s*[—–]+\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[.)]+$/g, '')
    .trim();
}

/** Eénregel-chip: DEAL-id + onderwerp, zonder Dit is / Waarom. */
export function okChipTekst(wat: string | null | undefined): string {
  const ruw = (wat || '').replace(/\s+/g, ' ').trim();
  if (!ruw) return 'this step';

  const yes = /Yes needed:\s*([^)\n]+)/i.exec(ruw);
  if (yes) return schoonChip(yes[1]) || 'this step';

  const deal = /\b(DEAL-\d+)\b(?:\s*[—–-]+\s*|\s+)([^)\n.,]+)/i.exec(ruw);
  if (deal) return schoonChip(`${deal[1]} ${deal[2]}`);

  const alleen = /\b(DEAL-\d+)\b/i.exec(ruw);
  if (alleen) return alleen[1];

  const haak = /\(([^)]+)\)/.exec(ruw);
  if (haak && /DEAL-\d+|Yes needed/i.test(haak[1])) {
    return schoonChip(haak[1].replace(/^Yes needed:\s*/i, '')) || 'this step';
  }

  return schoonChip(ruw.replace(/^Dit is:\s*/i, '')) || 'this step';
}

function vraagTekst(v: PendingVraag | null | undefined, fallback = ''): { wat: string; waarom: string } {
  const wat = (v?.wat || v?.title || fallback).trim();
  const waarom = (v?.waarom || v?.detail || '').trim();
  return { wat, waarom };
}

function rijVanVraag(v: PendingVraag, fallbackTaskId?: string | null): GoedkeuringsRij | null {
  const taskId = v.task_id || fallbackTaskId || '';
  if (!v.id || !taskId) return null;
  const { wat, waarom } = vraagTekst(v, 'This needs your OK.');
  return { id: v.id, taskId, wat, waarom };
}

/** Alle open /approvals-rijen, zonder per-agent filter — de telefoonstrook. */
export function rijenVanLijst(
  extra: Array<{ id: string; task_id?: string; wat?: string | null; waarom?: string | null; title?: string; detail?: string }> = [],
): GoedkeuringsRij[] {
  const uit: GoedkeuringsRij[] = [];
  const gezien = new Set<string>();
  for (const e of extra) {
    const rij = rijVanVraag({
      id: e.id,
      title: e.title,
      detail: e.detail,
      wat: e.wat,
      waarom: e.waarom,
      task_id: e.task_id,
    }, e.task_id);
    if (!rij || gezien.has(rij.id)) continue;
    gezien.add(rij.id);
    uit.push(rij);
  }
  return uit;
}

/** Open rijen voor deze agent: eigen pending + globale /approvals-lijst. */
export function rijenVoorAgent(
  agent: ServerAgent | null | undefined,
  extra: Array<{ id: string; task_id?: string; wat?: string | null; waarom?: string | null; title?: string; detail?: string }> = [],
): GoedkeuringsRij[] {
  const uit: GoedkeuringsRij[] = [];
  const gezien = new Set<string>();
  const voeg = (rij: GoedkeuringsRij | null) => {
    if (!rij || gezien.has(rij.id)) return;
    gezien.add(rij.id);
    uit.push(rij);
  };
  for (const v of agent?.pendingApprovals ?? (agent?.pendingApproval ? [agent.pendingApproval] : [])) {
    voeg(rijVanVraag(v, agent?.task?.id));
  }
  const taakId = agent?.task?.id;
  for (const e of extra) {
    const zelfdeTaak = taakId && e.task_id === taakId;
    const alGekoppeld = agent?.pendingApproval?.id === e.id
      || (agent?.pendingApprovals ?? []).some((v) => v.id === e.id);
    const alleenDezeWacht = agent?.status === 'WAITING_APPROVAL' && extra.length === 1;
    if (!zelfdeTaak && !alGekoppeld && !alleenDezeWacht) continue;
    voeg(rijVanVraag({
      id: e.id,
      title: e.title,
      detail: e.detail,
      wat: e.wat,
      waarom: e.waarom,
      task_id: e.task_id,
    }, taakId || e.task_id));
  }
  return uit;
}
