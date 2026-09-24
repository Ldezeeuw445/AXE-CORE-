/**
 * activity.ts — wat de agents deden en wat ze gaan doen, uit de rijen zelf.
 *
 * Luka: "als agents iets doen moet het hier echt te zien zijn." De Agents-tab
 * toonde tot 23 sep 2026 alleen de routing-log van de chat, dus elke kaart
 * behalve AXE zei "idle — no work yet" terwijl de planner die dag 17 taken
 * afmaakte en de NorthSea-engine elk kwartier draaide. De data stond er al,
 * verspreid over vijf tabellen; dit bestand zet ze op één tijdlijn.
 *
 * Bronnen (gemeten 23 sep 2026 met axe_query):
 *   core_tasks               assignee 'axe-core' | 'code-agent' | 'maps-agent' |
 *                            'axe-algo', of leeg (computer_use, agentic, ...)
 *   agent_learning_episodes  agent = LOOP_AGENTS-naam ('chat', 'wingman', ...)
 *   core_job_runs            app 'northsea' | 'axe_core', per schedule-run
 *   core_schedules           next_run_at, cron_expr, enabled, last_status
 *   memory                   agent = namespace (catalog.ts namespaceFor)
 *
 * De trading-agent (AXE Algo) hoort hier bewust NIET: die heeft zijn eigen tab.
 * Dat betekent meer dan `assignee = 'axe-algo'` weglaten. De namespaces
 * `axe_intel` en `axe_companion` in `memory` zijn op dit moment voor 100%
 * gevuld door de desk-lanes van Trading (deskAgents.ts, bron 'axe-core-intel'/
 * 'axe-core-companion'/'desk-*') — niet door de echte AXE Intel/Companion. Die
 * rijen tellen als trading en worden apart genoemd in plaats van stil als
 * "Intel onthield iets" getoond. Zelfde reden als 'trading-desk-intel' in
 * LOOP_AGENTS (agentLoop.ts).
 *
 * Puur: geen Supabase, geen klok behalve het `now` dat je meegeeft.
 */
import { AXE_AGENTS, type AxeAgentId } from './roster';
import { AGENT_CATALOG } from './catalog';
import { LOOP_AGENTS, type LoopAgent } from '@/domain/memory/agentLoop';
import { isOpenTask } from '@/domain/tasks/taskStatus';

// ── Rijvormen zoals de tabellen ze teruggeven (alles optioneel: de
//    ontwerpmodus levert rijen met de helft van de velden) ────────────────────

export interface TaskRow {
  id: string;
  title?: string | null;
  status?: string | null;
  assignee?: string | null;
  capability?: string | null;
  metadata?: Record<string, unknown> | null;
  error?: unknown;
  created_at?: string | null;
  updated_at?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  cancelled_at?: string | null;
  next_attempt_at?: string | null;
}

export interface EpisodeRow {
  id: string;
  agent?: string | null;
  subject?: string | null;
  verdict?: string | null;
  outcome_note?: string | null;
  opened_at?: string | null;
  closed_at?: string | null;
}

export interface JobRunRow {
  id: string;
  job_key?: string | null;
  job_name?: string | null;
  app?: string | null;
  status?: string | null;
  error?: string | null;
  duration_ms?: number | null;
  started_at?: string | null;
  finished_at?: string | null;
  created_at?: string | null;
}

export interface ScheduleRow {
  id: string;
  name?: string | null;
  cron_expr?: string | null;
  enabled?: boolean | null;
  next_run_at?: string | null;
  last_run_at?: string | null;
  last_status?: string | null;
  app?: string | null;
  job_key?: string | null;
  consecutive_failures?: number | null;
}

export interface MemoryEntryRow {
  id: string;
  agent?: string | null;
  kind?: string | null;
  content?: string | null;
  source?: string | null;
  created_at?: string | null;
}

// ── Wie is wie ──────────────────────────────────────────────────────────────

const ROSTER_IDS = new Set<string>(AXE_AGENTS.map(a => a.id));

/** Alle agents die op deze tab mogen verschijnen: de roster zonder Trading. */
export const ACTIVITY_AGENTS = AXE_AGENTS.filter(a => a.id !== 'trading');

/**
 * De planner op de agent-host kent alleen zijn oude sleutels (zie
 * plannerKoppeling.ts, PLANNER_SLEUTEL). `null` = trading, hoort niet hier.
 */
const ASSIGNEE: Record<string, AxeAgentId | null> = {
  'axe-core': 'axe',
  'code-agent': 'developer',
  'maps-agent': 'northsea',
  'axe-algo': null,
};

/** Taken zonder assignee: de capability zegt wie het werk deed. */
const CAPABILITY: Record<string, AxeAgentId> = {
  claude_local: 'developer',
  code: 'developer',
  task_manage: 'task',
  crew: 'wingman',
  browser: 'browser',
};

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function ms(iso: unknown): number | null {
  if (typeof iso !== 'string' || !iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

/** Bij wie hoort deze taak? `null` = trading (eigen tab). Onbekend → AXE, die alles uitdeelt. */
export function agentForTask(row: TaskRow): AxeAgentId | null {
  const key = str(row.assignee) || str(row.metadata?.agent);
  if (key) {
    if (Object.prototype.hasOwnProperty.call(ASSIGNEE, key)) return ASSIGNEE[key];
    if (ROSTER_IDS.has(key)) return key === 'trading' ? null : (key as AxeAgentId);
  }
  return CAPABILITY[str(row.capability)] ?? 'axe';
}

/**
 * LOOP_AGENTS-naam → roster. 'research' is de trading-researchlane
 * (namespace axe_research), 'trading-desk-*' zijn Trading's eigen lanes.
 */
const EPISODE_AGENT: Partial<Record<LoopAgent, AxeAgentId>> = {
  chat: 'axe',
  'code-editor': 'developer',
  browser: 'browser',
  intel: 'intel',
  companion: 'companion',
  wingman: 'wingman',
  task: 'task',
  cron: 'cron',
  memory: 'memory',
  thinktank: 'thinktank',
  finance: 'finance',
  apps: 'apps',
};

export function agentForEpisode(agent: unknown): AxeAgentId | null {
  return EPISODE_AGENT[str(agent) as LoopAgent] ?? null;
}

/** Omgekeerd: onder welke lus-naam leert deze roster-agent? (voor agentLoopHealth) */
export function loopAgentFor(id: AxeAgentId): LoopAgent | null {
  const hit = (Object.entries(EPISODE_AGENT) as [LoopAgent, AxeAgentId][]).find(([, r]) => r === id);
  return hit && (LOOP_AGENTS as readonly string[]).includes(hit[0]) ? hit[0] : null;
}

/** Een schedule-run: NorthSea-engine is van de desk manager, de rest draait de Cron Manager. */
function agentForJob(row: { app?: string | null; job_key?: string | null }): AxeAgentId {
  if (str(row.app) === 'northsea' || str(row.job_key).startsWith('northsea')) return 'northsea';
  return 'cron';
}

/** Namespaces die trading zijn, ongeacht wie ze leest. */
const TRADING_NAMESPACES = new Set(['axe_trader', 'axe_research']);

/** Bronnen waarmee de trading-desk in andermans namespace schrijft. */
const DESK_SOURCE = /^(axe-core-|desk-|axe_algo|axe_research)/;

export function isTradingMemory(row: Pick<MemoryEntryRow, 'agent' | 'source'>): boolean {
  return TRADING_NAMESPACES.has(str(row.agent)) || DESK_SOURCE.test(str(row.source));
}

/** De LIKE-patronen van DESK_SOURCE, voor de query die ze in de database al weglaat. */
export const DESK_SOURCE_PATTERNS = ['axe-core-*', 'desk-*', 'axe_algo*', 'axe_research*'] as const;

export interface MemoryOwner {
  /** catalog-id: roster-id of crew-specialist. */
  id: string;
  name: string;
  namespace: string;
  accent: string;
  /** De roster-agent onder wie dit op de tijdlijn valt (crew → Wingman). */
  agent: AxeAgentId;
  kind: 'core' | 'crew';
}

const WINGMAN_ACCENT = AXE_AGENTS.find(a => a.id === 'wingman')?.accent ?? '#38BDF8';

/** Elke namespace die op deze tab hoort: de roster zonder trading, plus de crew van de Wingman. */
export function memoryOwners(): MemoryOwner[] {
  return AGENT_CATALOG
    .filter(e => (e.kind === 'core' || e.kind === 'crew') && e.namespace && !TRADING_NAMESPACES.has(e.namespace))
    .map(e => {
      // Crew-ids botsen met roster-ids (de crew heeft een eigen 'intel'), dus
      // alleen een core-entry mag zijn roster-agent opzoeken.
      const roster = e.kind === 'core' ? AXE_AGENTS.find(a => a.id === e.id) : undefined;
      return {
        id: e.kind === 'crew' ? `crew:${e.id}` : e.id,
        name: e.name,
        namespace: e.namespace,
        accent: roster?.accent ?? WINGMAN_ACCENT,
        agent: (roster?.id ?? 'wingman') as AxeAgentId,
        kind: e.kind as 'core' | 'crew',
      };
    });
}

function agentForNamespace(ns: string): AxeAgentId | null {
  return memoryOwners().find(o => o.namespace === ns)?.agent ?? null;
}

// ── De tijdlijn ─────────────────────────────────────────────────────────────

/** Toestand in één woord; de kleur volgt eruit, in de letters. */
export type Tone = 'ok' | 'fail' | 'running' | 'waiting' | 'neutral';

export interface ActivityItem {
  key: string;
  agent: AxeAgentId;
  at: number;
  kind: 'task' | 'episode' | 'run' | 'memory';
  text: string;
  /** Tweede regel: foutmelding, duur, bron. */
  detail?: string;
  tone: Tone;
  /** Herhalingen vallen samen: NorthSea draait elk kwartier, de computer-worker
   *  controleert zijn rechten elke paar seconden. */
  groupKey: string;
  count: number;
}

const RUNNING = new Set(['running', 'in_progress', 'claimed', 'verifying', 'retrying', 'planning']);

function taskErrorText(err: unknown): string | undefined {
  if (!err) return undefined;
  if (typeof err === 'string') return err;
  if (typeof err === 'object') {
    const m = (err as Record<string, unknown>).message;
    if (typeof m === 'string' && m) return m;
  }
  return undefined;
}

/**
 * Een taak als gebeurtenis. Alleen wat echt bewoog: een taak die de planner
 * aanmaakte en die nooit begon is een PLAN, geen activiteit — die staat rechts.
 */
export function taskActivity(row: TaskRow): ActivityItem | null {
  const agent = agentForTask(row);
  if (!agent) return null;
  const status = str(row.status).toLowerCase();
  const title = str(row.title) || 'Untitled task';
  const started = ms(row.started_at);
  let text: string;
  let tone: Tone;
  let at: number | null;
  if (status === 'completed' || status === 'done') {
    text = `Completed: ${title}`; tone = 'ok'; at = ms(row.completed_at) ?? ms(row.updated_at);
  } else if (status === 'failed' || status === 'rejected') {
    text = `Failed: ${title}`; tone = 'fail'; at = ms(row.updated_at);
  } else if (status === 'cancelled') {
    text = `Cancelled: ${title}`; tone = 'neutral'; at = ms(row.cancelled_at) ?? ms(row.updated_at);
  } else if (RUNNING.has(status)) {
    text = `Working on: ${title}`; tone = 'running'; at = started ?? ms(row.updated_at);
  } else if (started) {
    text = `Picked up: ${title}`; tone = 'waiting'; at = started;
  } else {
    return null;
  }
  if (at == null) return null;
  return {
    key: `task:${row.id}`, agent, at, kind: 'task', text, tone,
    detail: tone === 'fail' ? taskErrorText(row.error) : undefined,
    // Dezelfde taak met dezelfde afloop is een herhaling: gemeten 23 sep
    // wisselden 'computer.permissions'-checks op twee apparaten elkaar elke
    // ~10 s af, en zonder samenvoegen vulden die de hele tijdlijn.
    groupKey: `task:${agent}:${title}:${tone}`, count: 1,
  };
}

const VERDICT_TONE: Record<string, Tone> = { good: 'ok', poor: 'fail', unknown: 'neutral' };

/**
 * Een episode is twee gebeurtenissen: openen (welk geheugen ging erin) en
 * sluiten (hoe liep het af). Wingman opent er één per crew-run (CrewAI.tsx),
 * dus zo verschijnen de crew-runs op de tijdlijn.
 */
export function episodeActivity(row: EpisodeRow): ActivityItem[] {
  const agent = agentForEpisode(row.agent);
  if (!agent) return [];
  const subject = str(row.subject) || 'untitled';
  const crew = agent === 'wingman';
  const out: ActivityItem[] = [];
  const opened = ms(row.opened_at);
  if (opened != null) {
    out.push({
      key: `ep-open:${row.id}`, agent, at: opened, kind: 'episode',
      text: crew ? `Started crew run: ${subject}` : `Opened learning episode: ${subject}`,
      tone: 'neutral', groupKey: `ep-open:${row.id}`, count: 1,
    });
  }
  const closed = ms(row.closed_at);
  if (closed != null) {
    const verdict = str(row.verdict) || 'unknown';
    out.push({
      key: `ep-close:${row.id}`, agent, at: closed, kind: 'episode',
      text: crew ? `Crew run finished (${verdict}): ${subject}` : `Closed episode (${verdict}): ${subject}`,
      detail: str(row.outcome_note) || undefined,
      tone: VERDICT_TONE[verdict] ?? 'neutral', groupKey: `ep-close:${row.id}`, count: 1,
    });
  }
  return out;
}

function durationText(msDur: number | null | undefined): string {
  if (msDur == null || !Number.isFinite(msDur)) return '';
  if (msDur < 1000) return `${Math.round(msDur)}ms`;
  const s = msDur / 1000;
  if (s < 60) return `${s < 10 ? s.toFixed(1) : Math.round(s)}s`;
  return `${Math.round(s / 60)}m`;
}

export function runActivity(row: JobRunRow): ActivityItem | null {
  const at = ms(row.started_at) ?? ms(row.created_at);
  if (at == null) return null;
  const name = str(row.job_name) || str(row.job_key) || 'scheduled job';
  const status = str(row.status).toLowerCase();
  const tone: Tone = status === 'ok' ? 'ok'
    : status === 'fail' || status === 'timeout' ? 'fail'
    : status === 'running' ? 'running'
    : 'neutral';
  const text = tone === 'running' ? `Running: ${name}`
    : tone === 'fail' ? `${status === 'timeout' ? 'Timed out' : 'Failed'}: ${name}`
    : tone === 'ok' ? `Ran: ${name}`
    : `${status || 'Logged'}: ${name}`;
  const detail = tone === 'fail' ? (str(row.error) || undefined) : (durationText(row.duration_ms) || undefined);
  return {
    key: `run:${row.id}`, agent: agentForJob(row), at, kind: 'run', text, detail, tone,
    // Alleen gelukte runs vallen samen; een fout staat altijd op zichzelf.
    groupKey: tone === 'ok' ? `run:${str(row.job_key) || name}:ok` : `run:${row.id}`,
    count: 1,
  };
}

function clip(s: string, n: number): string {
  const flat = s.replace(/\s+/g, ' ').trim();
  return flat.length > n ? `${flat.slice(0, n - 1)}…` : flat;
}

export function memoryActivity(row: MemoryEntryRow): ActivityItem | null {
  if (isTradingMemory(row)) return null;
  const agent = agentForNamespace(str(row.agent));
  const at = ms(row.created_at);
  if (!agent || at == null) return null;
  const content = str(row.content);
  if (!content) return null;
  return {
    key: `mem:${row.id}`, agent, at, kind: 'memory',
    text: `Remembered: ${clip(content, 140)}`,
    detail: [str(row.agent), str(row.source)].filter(Boolean).join(' · ') || undefined,
    tone: 'neutral', groupKey: `mem:${row.id}`, count: 1,
  };
}

export type AgentFilter = AxeAgentId | 'all';

/**
 * Nieuwste eerst, gefilterd, en herhalingen samen op de plek van de nieuwste
 * ("Ran: NorthSea Communication Engine ×12"). Ook als er iets anders tussen
 * zat: twee apparaten die om de beurt een check doen zijn nog steeds twee
 * herhalingen, geen honderd gebeurtenissen. Een mislukte run heeft een eigen
 * groupKey en valt dus nooit weg in een reeks gelukte.
 */
export function buildTimeline(items: readonly ActivityItem[], filter: AgentFilter, limit: number): ActivityItem[] {
  const sorted = items
    .filter(i => filter === 'all' || i.agent === filter)
    .slice()
    .sort((a, b) => b.at - a.at);
  const out: ActivityItem[] = [];
  const seen = new Map<string, number>();
  for (const item of sorted) {
    const at = seen.get(item.groupKey);
    if (at != null) {
      out[at] = { ...out[at], count: out[at].count + 1 };
      continue;
    }
    if (out.length >= limit) continue;
    seen.set(item.groupKey, out.length);
    out.push({ ...item });
  }
  return out;
}

/** Welke agents hebben iets op de tijdlijn of in de plannen — voor de filterchips. */
export function agentsWithData(ids: Iterable<AxeAgentId>): AxeAgentId[] {
  const set = new Set(ids);
  return ACTIVITY_AGENTS.filter(a => set.has(a.id)).map(a => a.id);
}

// ── De plannen ──────────────────────────────────────────────────────────────

export type ScheduleState = 'upcoming' | 'overdue' | 'disabled' | 'unscheduled';

export interface SchedulePlan {
  key: string;
  agent: AxeAgentId;
  name: string;
  cron: string;
  nextAt: number | null;
  lastAt: number | null;
  lastStatus: string;
  failures: number;
  state: ScheduleState;
}

/** Een schedule dat meer dan dit te laat is, is niet "zo meteen" maar blijven hangen. */
const OVERDUE_GRACE_MS = 5 * 60_000;

export function schedulePlans(rows: readonly ScheduleRow[], now: number): SchedulePlan[] {
  const order: Record<ScheduleState, number> = { overdue: 0, upcoming: 1, unscheduled: 2, disabled: 3 };
  return rows
    .map(r => {
      const nextAt = ms(r.next_run_at);
      const enabled = r.enabled !== false;
      const state: ScheduleState = !enabled ? 'disabled'
        : nextAt == null ? 'unscheduled'
        : nextAt < now - OVERDUE_GRACE_MS ? 'overdue'
        : 'upcoming';
      return {
        key: `sched:${r.id}`,
        agent: agentForJob(r),
        name: str(r.name) || str(r.job_key) || 'Unnamed schedule',
        cron: str(r.cron_expr),
        nextAt,
        lastAt: ms(r.last_run_at),
        lastStatus: str(r.last_status),
        failures: Number(r.consecutive_failures) || 0,
        state,
      };
    })
    .sort((a, b) => order[a.state] - order[b.state] || (a.nextAt ?? Infinity) - (b.nextAt ?? Infinity));
}

export interface QueuedTask {
  key: string;
  title: string;
  status: string;
  /** Echte deadline uit metadata.dueAt, als die er is. */
  dueAt: number | null;
  queuedAt: number | null;
  needsApproval: boolean;
}

export interface AgentQueue {
  agent: AxeAgentId;
  total: number;
  approvals: number;
  /** Eerst wat een deadline heeft, dan wat het langst wacht. */
  tasks: QueuedTask[];
}

/** Open taken per agent. Trading valt eruit; wat nog op iemand wacht blijft. */
export function queuesByAgent(rows: readonly TaskRow[]): AgentQueue[] {
  const byAgent = new Map<AxeAgentId, QueuedTask[]>();
  for (const r of rows) {
    if (!isOpenTask(r.status)) continue;
    const agent = agentForTask(r);
    if (!agent) continue;
    const status = str(r.status).toLowerCase() || 'pending';
    const task: QueuedTask = {
      key: `q:${r.id}`,
      title: str(r.title) || 'Untitled task',
      status,
      dueAt: ms(r.metadata?.dueAt),
      queuedAt: ms(r.created_at),
      needsApproval: status === 'waiting_approval' || str(r.metadata?.goedkeuring) === 'nodig',
    };
    const list = byAgent.get(agent) ?? [];
    list.push(task);
    byAgent.set(agent, list);
  }
  const out: AgentQueue[] = [];
  for (const [agent, tasks] of byAgent) {
    tasks.sort((a, b) =>
      Number(b.needsApproval) - Number(a.needsApproval)
      || (a.dueAt ?? Infinity) - (b.dueAt ?? Infinity)
      || (a.queuedAt ?? Infinity) - (b.queuedAt ?? Infinity));
    out.push({ agent, total: tasks.length, approvals: tasks.filter(t => t.needsApproval).length, tasks });
  }
  const rosterOrder = (id: AxeAgentId) => AXE_AGENTS.findIndex(a => a.id === id);
  return out.sort((a, b) => rosterOrder(a.agent) - rosterOrder(b.agent));
}

// ── De War Room-kaart ───────────────────────────────────────────────────────

export interface AgentPulse {
  working: boolean;
  text: string;
  at: number;
  tone: Tone;
}

/** Een run of taak die langer "loopt" dan dit, loopt niet maar is blijven hangen. */
const WORKING_WINDOW_MS = 2 * 3600_000;

/**
 * Per agent: waar is hij nu mee bezig, of wat deed hij het laatst.
 * "Working" alleen als de rij echt nog loopt EN recent begon — een run die
 * sinds 17 sep op 'running' staat (dat is er een, gemeten 23 sep) is geen werk
 * maar een run zonder afloop, en die krijgt de kaart als "last:" te zien.
 */
export function agentPulses(items: readonly ActivityItem[], now: number): Partial<Record<AxeAgentId, AgentPulse>> {
  const out: Partial<Record<AxeAgentId, AgentPulse>> = {};
  const sorted = items.slice().sort((a, b) => b.at - a.at);
  for (const item of sorted) {
    const current = out[item.agent];
    const live = item.tone === 'running' && now - item.at < WORKING_WINDOW_MS;
    if (!current) {
      out[item.agent] = { working: live, text: item.text, at: item.at, tone: item.tone };
    } else if (live && !current.working) {
      out[item.agent] = { working: true, text: item.text, at: item.at, tone: item.tone };
    }
  }
  return out;
}

/** "5m ago" of "in 3h". Engels: dit staat in de UI. */
export function relativeTime(at: number, now: number): string {
  const diff = at - now;
  const future = diff > 0;
  const s = Math.round(Math.abs(diff) / 1000);
  if (s < 45) return future ? 'in a moment' : 'just now';
  const m = Math.round(s / 60);
  const unit = m < 60 ? `${m}m` : m < 60 * 36 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d`;
  return future ? `in ${unit}` : `${unit} ago`;
}
