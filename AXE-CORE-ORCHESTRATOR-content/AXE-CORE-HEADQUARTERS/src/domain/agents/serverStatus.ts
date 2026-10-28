/**
 * De status van een agent zoals de SERVER hem ziet: /agents/activity.
 *
 * De Home-kolom liet "idle" zien zodra deze app zelf geen job had lopen,
 * ook als op de VPS een missie draaide. Deze status komt uit core_tasks,
 * core_missions en de events daarvan -- WORKING alleen bij een levende lease.
 * Hier staat alleen hoe hij eruitziet; niets wordt verzonnen of afgeleid.
 */
import { taakFoutVan } from '@/domain/taken/taakFout';
import { amsterdamKlok, mensTekst, nextTekst } from '@/domain/tijd';

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

export interface ServerPendingApproval {
  id: string;
  kind?: string | null;
  title?: string | null;
  detail?: string | null;
  wat?: string | null;
  waarom?: string | null;
  task_id?: string | null;
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
  /** Pending core_approvals-rij, zodat Home OK ter plekke Approve/Decline kan. */
  pendingApproval?: ServerPendingApproval | null;
  /** Alle open vragen van deze agent (niet alleen de huidige taak). */
  pendingApprovals?: ServerPendingApproval[];
  mission?: ServerMissie | null;
  events: ServerEvent[];
  last_event_at?: string | null;
  /** De eigen computer (DAX) van deze agent: running, sleeping, provisioned. */
  dax_status?: string | null;
  /** Roosters die voor deze agent draaien, met wat de laatste run vond. */
  routines?: ServerRoutine[];
  /** Laatste gemeten heartbeat van de DAX (dax_wacht, elke 5 min). */
  dax_heartbeat_at?: string | null;
  /** Wat de bot nu niet kan, gemeten; leeg = alles is er. */
  dax_blockers?: string[];
  dax_error?: string | null;
  /** Het vaste werk van deze bot ("Market data check"). */
  dax_routine?: string | null;
  dax_always_on?: boolean | null;
  /** Abonnement-CLI's die ín de DAX zijn ingelogd (claude_logged_in, codex_logged_in). */
  dax_engines?: Record<string, boolean>;
  dax_notes?: string[];
}

/** Na zoveel minuten zonder heartbeat telt een DAX niet meer als wakker (wacht tikt elke 5 min). */
export const DAX_HARTSLAG_MAX_MIN = 15;

export interface DaxRegel {
  /** Echt wakker: draaiend én een verse heartbeat. */
  wakker: boolean;
  /** Eén regel voor het venster, Engels. */
  tekst: string;
  /** Wat hij niet kan, of ''. */
  blokkade: string;
}

/**
 * De eigen computer in één regel, alleen uit wat de server mat.
 * "running" zonder verse heartbeat is niet wakker: dan zeggen we hoe oud hij is.
 */
export function daxRegel(a: ServerAgent, nu: number = Date.now()): DaxRegel | null {
  if (!a.dax_computer) return null;
  const hart = a.dax_heartbeat_at ? new Date(a.dax_heartbeat_at).getTime() : NaN;
  const minuten = Number.isNaN(hart) ? null : Math.max(0, Math.round((nu - hart) / 60000));
  const vers = minuten !== null && minuten <= DAX_HARTSLAG_MAX_MIN;
  const wakker = a.dax_status === 'running' && vers;
  let staat: string;
  if (a.dax_status === 'error') staat = 'unreachable';
  else if (wakker) staat = 'awake';
  else if (a.dax_status === 'running') staat = 'no recent heartbeat';
  else staat = a.dax_status || 'unknown';
  const hartTekst = minuten === null ? 'never measured' : minuten < 1 ? 'heartbeat just now' : `heartbeat ${minuten}m ago`;
  const blokkade = wakker ? (a.dax_blockers ?? []).join('; ') : (a.dax_error || (a.dax_blockers ?? []).join('; '));
  return {
    wakker,
    tekst: `Computer ${a.dax_computer} · ${staat} · ${hartTekst}${a.dax_routine ? ` · ${a.dax_routine}` : ''}`,
    blokkade,
  };
}

export interface ServerRoutine {
  name: string;
  last_run_at: string | null;
  last_status: string | null;
  next_run_at: string | null;
  running: boolean;
  failures: number;
  summary: string;
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
  MONITORING: 'scheduled',
  MISSION_COMPLETE: 'mission complete',
  SLEEPING: 'sleeping',
};

/** Agents met een vast 24/7-ritme (staande_diensten op de VPS). Nooit een kaal SLEEPING. */
const STAANDE_AGENTS: ReadonlySet<string> = new Set([
  'wingman', 'memory', 'task', 'cron', 'finance', 'apps', 'intel', 'companion',
  'axemanager', 'projectsmgr', 'companionmgr', 'axon', 'tradingos', 'northseamgr',
]);

function roosterRegel(a: ServerAgent, nu?: number): string {
  const r = (a.routines ?? []).find((x) => x.next_run_at || x.summary || x.last_run_at)
    ?? (a.routines ?? [])[0];
  if (!r && !STAANDE_AGENTS.has(a.agent)) return '';
  const next = r?.running ? 'now' : nextTekst(r?.next_run_at, nu);
  const last = mensTekst((r?.summary || '').trim() || (r?.last_status ? `cycle ${r.last_status}` : 'none yet'), nu);
  return `${next} · last: ${last}`;
}

function kort(tekst: string | null | undefined, max = 140): string {
  const t = (tekst || '').replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

export function serverStand(a: ServerAgent, nu?: number): ServerStand {
  const m = a.mission;
  const gepland = (a.routines && a.routines.length > 0) || STAANDE_AGENTS.has(a.agent);
  const rooster = roosterRegel(a, nu);
  let regel = '';
  if (a.status === 'BLOCKED' || a.status === 'ERROR') {
    regel = taakFoutVan(a.reason, a.task?.title || '').regel;
  }
  else if (a.current_action) regel = mensTekst(a.current_action, nu);
  else if (a.status === 'WAITING_APPROVAL' && a.task?.title) regel = `waiting on: ${a.task.title}`;
  else if ((a.status === 'MONITORING' || a.status === 'SLEEPING') && rooster) regel = rooster;
  else if (m?.next_action) regel = mensTekst(m.next_action, nu);
  else if (a.task?.title) regel = a.task.title;
  else if (m?.title) regel = m.title;
  else if (a.status === 'MONITORING' || a.status === 'SLEEPING') regel = rooster || (a.status === 'SLEEPING' ? '' : mensTekst(a.reason, nu));
  else regel = mensTekst(a.reason, nu);
  const kaalSlapen = a.status === 'SLEEPING' && !gepland;
  return {
    label: kaalSlapen ? LABEL.SLEEPING : (gepland && (a.status === 'SLEEPING' || a.status === 'MONITORING') ? 'scheduled' : (LABEL[a.status] ?? a.status.toLowerCase())),
    kleur: KLEUR[a.status] ?? 'var(--text-secondary)',
    regel: kort(mensTekst(regel, nu)),
    stil: kaalSlapen,
  };
}

/**
 * Wat de Home-rail onder de naam zet. Geen hintergebleven blocked_reason of
 * DAX-fout van een eerdere cyclus: die leeft alleen in BLOCKED/ERROR (reason).
 */
export function agentLiveRegel(server: ServerAgent, nu: number = Date.now()): string {
  const stand = serverStand(server, nu);
  if (stand.regel) return stand.regel;
  const rooster = roosterRegel(server, nu);
  if (rooster) return rooster;
  const next = (server.routines ?? []).find((r) => r.next_run_at && !r.running);
  const dax = daxRegel(server, nu);
  if (dax && !dax.wakker && dax.blokkade) return mensTekst(dax.blokkade, nu);
  if (next) return `${nextTekst(next.next_run_at, nu)} · last: ${mensTekst(next.summary || next.name, nu)}`;
  return '';
}

/** Voortgang als "2/5 · 40%", of '' zonder missie. */
export function missieVoortgang(m: ServerMissie | null | undefined): string {
  if (!m || !m.milestones_total) return '';
  const klaar = Math.round(m.progress * m.milestones_total);
  return `${klaar}/${m.milestones_total} · ${Math.round(m.progress * 100)}%`;
}

/** Leesbare tijd voor de tijdlijn: "14:03" in Europe/Amsterdam. */
export function eventTijd(at: string | null): string {
  return amsterdamKlok(at);
}
