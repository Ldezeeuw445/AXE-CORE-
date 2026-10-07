/**
 * De status van een agent zoals de SERVER hem ziet: /agents/activity.
 *
 * De Home-kolom liet "idle" zien zodra deze app zelf geen job had lopen,
 * ook als op de VPS een missie draaide. Deze status komt uit core_tasks,
 * core_missions en de events daarvan -- WORKING alleen bij een levende lease.
 * Hier staat alleen hoe hij eruitziet; niets wordt verzonnen of afgeleid.
 */

export type ServerAgentStatus =
  | 'WORKING' | 'VERIFYING' | 'WAITING_TOOL' | 'WAITING_AGENT' | 'WAITING_APPROVAL'
  | 'QUEUED' | 'BLOCKED' | 'ERROR' | 'MONITORING' | 'MISSION_COMPLETE' | 'SLEEPING';

export interface ServerEvent {
  at: string | null;
  kind: string;
  event_type: string | null;
  message: string | null;
  task_id: string | null;
  mission_id: string | null;
  source: 'task' | 'mission' | null;
}

export interface ServerMissie {
  id: string;
  title: string;
  status: string;
  progress: number;
  next_action: string | null;
  current_milestone: string | null;
  milestones_total: number;
  blocked_reason: string | null;
}

export interface ServerAgent {
  agent: string;
  status: ServerAgentStatus;
  reason: string;
  role?: string | null;
  dax_computer?: string | null;
  crew?: string[];
  current_action?: string | null;
  task?: { id: string; title: string | null; status: string; engine?: string | null; model?: string | null } | null;
  mission?: ServerMissie | null;
  events: ServerEvent[];
  last_event_at?: string | null;
}

export interface ServerStand {
  label: string;
  kleur: string;
  /** Wat er nu gebeurt, in één regel. */
  regel: string;
  /** Mag de kolom hem als "stil" tonen (alleen het woord, geen balkje)? */
  stil: boolean;
}

const KLEUR: Record<ServerAgentStatus, string> = {
  WORKING: 'var(--accent-cyan)',
  VERIFYING: 'var(--accent-cyan)',
  WAITING_TOOL: 'var(--accent-cyan)',
  WAITING_AGENT: 'var(--text-secondary)',
  WAITING_APPROVAL: 'var(--warn)',
  QUEUED: 'var(--text-muted)',
  BLOCKED: 'var(--err)',
  ERROR: 'var(--err)',
  MONITORING: 'var(--text-secondary)',
  MISSION_COMPLETE: 'var(--ok)',
  SLEEPING: 'var(--text-secondary)',
};

const LABEL: Record<ServerAgentStatus, string> = {
  WORKING: 'working',
  VERIFYING: 'verifying',
  WAITING_TOOL: 'running tool',
  WAITING_AGENT: 'waiting on agent',
  WAITING_APPROVAL: 'needs your OK',
  QUEUED: 'queued',
  BLOCKED: 'blocked',
  ERROR: 'error',
  MONITORING: 'monitoring',
  MISSION_COMPLETE: 'mission complete',
  SLEEPING: 'sleeping',
};

function kort(tekst: string | null | undefined, max = 140): string {
  const t = (tekst || '').replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

export function serverStand(a: ServerAgent): ServerStand {
  const m = a.mission;
  let regel = '';
  if (a.status === 'BLOCKED' || a.status === 'ERROR') regel = a.reason;
  else if (a.current_action) regel = a.current_action;
  else if (a.status === 'WAITING_APPROVAL' && a.task?.title) regel = `waiting on: ${a.task.title}`;
  else if (m?.next_action) regel = m.next_action;
  else if (a.task?.title) regel = a.task.title;
  else if (m?.title) regel = m.title;
  else if (a.status !== 'SLEEPING') regel = a.reason;
  return {
    label: LABEL[a.status] ?? a.status.toLowerCase(),
    kleur: KLEUR[a.status] ?? 'var(--text-secondary)',
    regel: kort(regel),
    stil: a.status === 'SLEEPING',
  };
}

/** Voortgang als "2/5 · 40%", of '' zonder missie. */
export function missieVoortgang(m: ServerMissie | null | undefined): string {
  if (!m || !m.milestones_total) return '';
  const klaar = Math.round(m.progress * m.milestones_total);
  return `${klaar}/${m.milestones_total} · ${Math.round(m.progress * 100)}%`;
}

/** Leesbare tijd voor de tijdlijn: "14:03". */
export function eventTijd(at: string | null): string {
  if (!at) return '';
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
}
