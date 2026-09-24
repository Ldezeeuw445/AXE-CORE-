/**
 * Control Plane: de machinerie van AXE op één plek, en de knoppen erbij.
 *
 * Tot 23 september las de tab `core_route_registry` (die tabel bestaat niet),
 * `core_events` (nul rijen) en de laatste twaalf taken. Een museumlijst die
 * altijd hetzelfde toonde. Deze module is de pure logica eronder:
 *
 *   - Schema's: de eigen planner (`core_schedules`), pg_cron in Supabase en het
 *     ops-register (`axe_ops.cron_job`, via /cron/jobs) tot één lijst met één
 *     rij per job. Welke job je hier nu kunt draaien volgt uit waar hij draait.
 *   - Taken: welke knop bij welke taak hoort. Gespiegeld aan TRANSITIONS in
 *     backend/axe_api/task_runtime.py -- een knop die de server weigert is
 *     erger dan geen knop.
 *   - Gebeurtenissen: het auditlog van de VPS-API en de taakgebeurtenissen,
 *     tot één stroom.
 *   - Routes: de echte routekaart uit /openapi.json van de draaiende API.
 *
 * Geen imports uit infrastructure: de draadtypes staan hier, de gateway
 * importeert ze.
 */
import { isAppId, type AppId } from './apps';

// ── Draadtypes (wat de VPS-API teruggeeft) ────────────────────────────────────

/** Eén rij uit /cron/jobs (RPC axe_cron_status). */
export interface OpsCronJob {
  name: string;
  path: string;
  schedule: string;
  enabled: boolean;
  owner: string | null;
  last_run_at: string | null;
  /** Kijkt naar het antwoord van de app, niet alleen naar de statuscode. */
  last_ok: boolean | null;
  last_error: string | null;
  last_response: string | null;
  failures_24h: number | null;
}

/** Eén rij uit /cron/runs (RPC axe_cron_runs). */
export interface OpsCronRun {
  name: string;
  started_at: string;
  status_code: number | null;
  ok: boolean | null;
  duration_ms: number | null;
  error: string | null;
  response: string | null;
  triggered_by: string | null;
}

/** Eén sleutel uit /keystore/{app}: naam en of hij gevuld is, nooit de waarde. */
export interface KeystoreEntry {
  app: string;
  key: string;
  description: string | null;
  updated_at: string | null;
  is_set: boolean;
}

/**
 * Het ops-register noemt Companion `companion` (gemeten: alle tien rijen in
 * axe_ops.cron_job). Voor de andere apps staat er vandaag niets; die vragen
 * we op hun eigen AppId, zodat een rij die later bijkomt vanzelf verschijnt.
 */
export function opsAppNaam(app: AppId): string {
  return app === 'axe_companion' ? 'companion' : app;
}

// ── Tijd ─────────────────────────────────────────────────────────────────────

/** Hoe lang geleden (of hoe lang nog), in één kort woord: 42s, 7m, 5h, 3d. */
export function korteDuur(iso: string | null | undefined, now: number): string {
  if (!iso) return '—';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '—';
  const s = Math.abs(now - t) / 1000;
  if (s < 60) return `${Math.floor(s)}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

// ── Schema's ────────────────────────────────────────────────────────────────

/** Wat /calendar/jobs per job teruggeeft (de velden die we gebruiken). */
export interface PlannerJob {
  job_key: string;
  id: string | null;
  bron: 'schedule' | 'pg_cron';
  naam: string;
  app: string;
  executor: string | null;
  soort: string;
  cron: string;
  enabled: boolean;
  next_run_at: string | null;
  last_run_at: string | null;
  last_status: string | null;
  consecutive_failures: number | null;
  description: string | null;
}

/** Een pg_cron-run uit /ledger. */
export interface CronLedgerRun {
  at: string;
  name: string;
  status: string;
  detail: string;
}

export type ScheduleRunner = 'vps' | 'mac' | 'supabase' | 'unknown';

export type ScheduleRunVia =
  | { kind: 'planner'; id: string }
  | { kind: 'ops'; app: string; name: string };

export interface ScheduleRow {
  key: string;
  app: AppId;
  name: string;
  cron: string;
  runner: ScheduleRunner;
  /** planner = core_schedules, pg_cron = een job in Supabase zelf. */
  source: 'planner' | 'pg_cron';
  enabled: boolean;
  lastRunAt: string | null;
  /** null = onbekend; niet hetzelfde als gelukt. */
  lastOk: boolean | null;
  lastDetail: string | null;
  failures: number | null;
  failuresScope: 'in a row' | 'in 24h' | null;
  nextRunAt: string | null;
  /** Hoe "Run now" deze job start; null als dat hier niet kan. */
  runVia: ScheduleRunVia | null;
  /** Waarom niet, als runVia null is: kort voor in de tabel, lang voor erbij. */
  runBlocked: { kort: string; lang: string } | null;
  description: string | null;
}

function runnerVan(executor: string | null): ScheduleRunner {
  return executor === 'vps' || executor === 'mac' || executor === 'supabase' ? executor : 'unknown';
}

function appVan(app: string): AppId {
  return isAppId(app) ? app : 'axe_core';
}

/** Hoort deze pg_cron-jobnaam bij deze ops-job? `axe-companion-mt5-sync` ↔ `mt5-sync`. */
function hoortBij(jobnaam: string, opsNaam: string): boolean {
  return jobnaam === opsNaam || jobnaam.endsWith(`-${opsNaam}`);
}

export function mergeSchedules(
  jobs: readonly PlannerJob[],
  opsJobs: Readonly<Record<string, readonly OpsCronJob[]>>,
  pgRuns: readonly CronLedgerRun[],
): ScheduleRow[] {
  const rijen: ScheduleRow[] = [];
  const gebruikt = new Set<string>();

  for (const j of jobs) {
    const app = appVan(j.app);
    if (j.bron === 'schedule') {
      const status = j.last_status;
      const lastOk = status === 'ok' ? true : status === 'fail' || status === 'timeout' ? false : null;
      const runner = runnerVan(j.executor);
      let runVia: ScheduleRunVia | null = null;
      let runBlocked: ScheduleRow['runBlocked'] = null;
      if (j.soort === 'observed') runBlocked = { kort: 'reports only', lang: 'Observed job: it runs elsewhere and reports its runs, so it cannot be fired from here.' };
      else if (runner === 'mac') runBlocked = { kort: 'Mac only', lang: 'Runs on the Mac. Run now reaches the VPS runner only.' };
      else if (!j.id) runBlocked = { kort: 'no id', lang: 'This schedule has no id to fire.' };
      else runVia = { kind: 'planner', id: j.id };
      rijen.push({
        key: j.job_key, app, name: j.naam, cron: j.cron, runner, source: 'planner', enabled: j.enabled,
        lastRunAt: j.last_run_at, lastOk, lastDetail: status,
        failures: j.consecutive_failures, failuresScope: j.consecutive_failures == null ? null : 'in a row',
        nextRunAt: j.enabled ? j.next_run_at : null, runVia, runBlocked, description: j.description,
      });
      continue;
    }

    const opsApp = opsAppNaam(app);
    const ops = (opsJobs[opsApp] ?? []).find(o => hoortBij(j.naam, o.name));
    if (ops) {
      gebruikt.add(`${opsApp}/${ops.name}`);
      rijen.push({
        key: j.job_key, app, name: ops.name, cron: ops.schedule || j.cron, runner: 'supabase', source: 'pg_cron',
        enabled: j.enabled && ops.enabled,
        lastRunAt: ops.last_run_at, lastOk: ops.last_ok, lastDetail: ops.last_error,
        failures: ops.failures_24h, failuresScope: ops.failures_24h == null ? null : 'in 24h',
        nextRunAt: j.enabled ? j.next_run_at : null,
        runVia: { kind: 'ops', app: opsApp, name: ops.name }, runBlocked: null, description: ops.path,
      });
      continue;
    }

    // Alleen pg_cron: de laatste run komt uit het grootboek (cron.job_run_details).
    // "ok" betekent daar dat de SQL liep, niet wat een app antwoordde.
    const laatste = pgRuns.find(r => r.name === j.naam);
    const s = laatste?.status;
    rijen.push({
      key: j.job_key, app, name: j.naam, cron: j.cron, runner: 'supabase', source: 'pg_cron', enabled: j.enabled,
      lastRunAt: laatste?.at ?? null,
      lastOk: s === undefined ? null : s === 'ok' || s === 'succeeded' ? true : s === 'failed' || s === 'fail' ? false : null,
      lastDetail: laatste ? (laatste.detail || s || null) : null,
      failures: null, failuresScope: null,
      nextRunAt: j.enabled ? j.next_run_at : null,
      runVia: null, runBlocked: { kort: 'pg_cron only', lang: 'pg_cron job inside Postgres. There is no run-now endpoint for it.' },
      description: j.description,
    });
  }

  // Ops-jobs zonder pg_cron-tegenhanger: bestaan in het register, planning onbekend.
  for (const [opsApp, lijst] of Object.entries(opsJobs)) {
    for (const o of lijst) {
      if (gebruikt.has(`${opsApp}/${o.name}`)) continue;
      const app: AppId = opsApp === 'companion' ? 'axe_companion' : appVan(opsApp);
      rijen.push({
        key: `ops:${opsApp}:${o.name}`, app, name: o.name, cron: o.schedule, runner: 'supabase', source: 'pg_cron',
        enabled: o.enabled, lastRunAt: o.last_run_at, lastOk: o.last_ok, lastDetail: o.last_error,
        failures: o.failures_24h, failuresScope: o.failures_24h == null ? null : 'in 24h',
        nextRunAt: null, runVia: { kind: 'ops', app: opsApp, name: o.name }, runBlocked: null, description: o.path,
      });
    }
  }
  return rijen;
}

export type ScheduleStand = 'failing' | 'overdue' | 'unknown' | 'ok' | 'off';

/** Tien minuten speling: een tick per minuut mag een run een paar minuten laat oppakken. */
const TE_LAAT_MS = 10 * 60 * 1000;

export function scheduleStand(r: ScheduleRow, now: number): ScheduleStand {
  if (!r.enabled) return 'off';
  if (r.lastOk === false) return 'failing';
  if (r.nextRunAt && Date.parse(r.nextRunAt) < now - TE_LAAT_MS) return 'overdue';
  if (r.lastOk === true) return 'ok';
  return 'unknown';
}

const STAND_VOLGORDE: Record<ScheduleStand, number> = { failing: 0, overdue: 1, unknown: 2, ok: 3, off: 4 };

/** Wat aandacht vraagt bovenaan; daarbinnen per app en naam. */
export function sorteerSchedules(rijen: readonly ScheduleRow[], now: number): ScheduleRow[] {
  return [...rijen].sort((a, b) =>
    STAND_VOLGORDE[scheduleStand(a, now)] - STAND_VOLGORDE[scheduleStand(b, now)]
    || a.app.localeCompare(b.app) || a.name.localeCompare(b.name));
}

// ── Taken ────────────────────────────────────────────────────────────────────

export interface TaskLike {
  id: string;
  title: string | null;
  status: string;
  assignee: string | null;
  capability: string | null;
  worker_id?: string | null;
  metadata?: Record<string, unknown> | null;
}

/** Actief = een worker houdt de lease; alleen die mag de taak verzetten. */
const ACTIEF = new Set(['planning', 'running', 'in_progress', 'verifying']);
/** Statussen waarvandaan TRANSITIONS 'cancelled' toestaat zonder lease. */
const ANNULEERBAAR = new Set(['pending', 'queued', 'waiting_approval', 'approved', 'retrying', 'blocked']);
const WACHTEND = new Set(['pending', 'queued', 'approved', 'retrying', 'blocked']);

/** Alle open statussen, voor de query. */
export const OPEN_TASK_STATUSES = [...new Set([...ACTIEF, ...ANNULEERBAAR])];

export type TaskGroup = 'needs_you' | 'active' | 'waiting' | 'failed';

function wachtOpPlannerAkkoord(t: TaskLike): boolean {
  return t.status === 'pending' && t.capability === 'planner' && t.metadata?.goedkeuring === 'nodig';
}

export function taskGroup(t: TaskLike): TaskGroup | null {
  if (t.status === 'waiting_approval' || wachtOpPlannerAkkoord(t)) return 'needs_you';
  if (ACTIEF.has(t.status)) return 'active';
  if (WACHTEND.has(t.status)) return 'waiting';
  if (t.status === 'failed') return 'failed';
  return null;
}

export type TaskAction = 'approve' | 'reject' | 'cancel';

export interface TaskActions {
  actions: TaskAction[];
  /** Langs welke echte route approve/reject gaat. */
  via: 'planner' | 'approval' | null;
  /** Waarom er (minder) knoppen zijn. */
  note: string | null;
}

export function taskActions(t: TaskLike, pendingApprovalId: string | null): TaskActions {
  if (wachtOpPlannerAkkoord(t)) return { actions: ['approve', 'reject'], via: 'planner', note: null };
  if (t.status === 'waiting_approval') {
    return pendingApprovalId
      ? { actions: ['approve', 'reject', 'cancel'], via: 'approval', note: null }
      : { actions: ['cancel'], via: null, note: 'No pending approval row for this task.' };
  }
  if (ACTIEF.has(t.status)) {
    return { actions: [], via: null, note: `Held by ${t.worker_id || 'a worker'}. Only its lease can move it.` };
  }
  if (t.status === 'failed') {
    return { actions: [], via: null, note: 'Failed is final in the task state machine. There is no retry endpoint.' };
  }
  if (ANNULEERBAAR.has(t.status)) return { actions: ['cancel'], via: null, note: null };
  return { actions: [], via: null, note: null };
}

// ── Gebeurtenissen ───────────────────────────────────────────────────────────

export interface AuditRow {
  id: string;
  action: string;
  resource: string | null;
  details: unknown;
  performed_by: string | null;
  created_at: string;
}

export interface TaskEventRow {
  sequence: number;
  task_id: string;
  event_type: string;
  actor_type: string | null;
  actor_id: string | null;
  message: string | null;
  created_at: string;
}

export interface ControlEvent {
  key: string;
  at: string;
  source: 'api' | 'task';
  kind: string;
  subject: string;
  detail: string;
  actor: string;
  tone: 'ok' | 'bad' | 'neutral';
}

/** Elke minuut een tick, elke query en insert een regel: waar, maar geen nieuws. */
export const ROUTINE_ACTIONS: readonly string[] = ['cron_tick', 'sql', 'insert'];

const GEHEIM = /secret|password|token|api_key|apikey|authorization|cookie|value/i;

/** Eén regel uit een JSON-object; velden die naar een geheim ruiken worden weggelaten. */
export function detailRegel(details: unknown, max = 160): string {
  if (details == null) return '';
  if (typeof details !== 'object') return String(details).slice(0, max);
  const delen: string[] = [];
  for (const [k, v] of Object.entries(details as Record<string, unknown>)) {
    if (GEHEIM.test(k)) continue;
    const tekst = typeof v === 'string' ? v : JSON.stringify(v);
    delen.push(`${k}: ${(tekst ?? '').replace(/\s+/g, ' ')}`);
  }
  const regel = delen.join(' · ');
  return regel.length > max ? `${regel.slice(0, max - 1)}…` : regel;
}

function toonVan(kind: string): ControlEvent['tone'] {
  if (/fail|error|reject|denied|timeout/i.test(kind)) return 'bad';
  if (/complet|approved|succe|done/i.test(kind)) return 'ok';
  return 'neutral';
}

export function eventsFromAudit(rows: readonly AuditRow[]): ControlEvent[] {
  return rows.map(r => ({
    key: `api:${r.id}`, at: r.created_at, source: 'api' as const, kind: r.action,
    subject: r.resource ?? '', detail: detailRegel(r.details), actor: r.performed_by ?? '', tone: toonVan(r.action),
  }));
}

export function eventsFromTaskEvents(rows: readonly TaskEventRow[]): ControlEvent[] {
  return rows.map(r => ({
    key: `task:${r.task_id}:${r.sequence}`, at: r.created_at, source: 'task' as const, kind: r.event_type,
    subject: `task ${r.task_id.slice(0, 8)}`, detail: r.message ?? '',
    actor: [r.actor_type, r.actor_id].filter(Boolean).join(':'), tone: toonVan(r.event_type),
  }));
}

/** Nieuwste eerst, elke gebeurtenis één keer. */
export function mergeEvents(...lijsten: ReadonlyArray<readonly ControlEvent[]>): ControlEvent[] {
  const gezien = new Map<string, ControlEvent>();
  for (const l of lijsten) for (const e of l) gezien.set(e.key, e);
  return [...gezien.values()].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}

export function filterEvents(
  events: readonly ControlEvent[],
  opts: { kind: string | null; query: string; hideRoutine: boolean },
): ControlEvent[] {
  const q = opts.query.trim().toLowerCase();
  return events.filter(e =>
    (!opts.kind || e.kind === opts.kind)
    && (!opts.hideRoutine || opts.kind === e.kind || !(e.source === 'api' && ROUTINE_ACTIONS.includes(e.kind)))
    && (!q || `${e.kind} ${e.subject} ${e.detail} ${e.actor}`.toLowerCase().includes(q)));
}

// ── Routes ───────────────────────────────────────────────────────────────────

export interface ApiRoute {
  method: string;
  path: string;
  summary: string;
  /** Vraagt AXE_CORE_API_KEY (de operatie heeft een security-eis in de OpenAPI). */
  auth: boolean;
  /** Het eerste padsegment: cron, tasks, keystore... */
  area: string;
}

const METHODES = ['get', 'post', 'put', 'patch', 'delete'] as const;

/** De routekaart uit een OpenAPI-document. Alles wat niet klopt wordt overgeslagen, niet verzonnen. */
export function routesFromOpenApi(doc: unknown): ApiRoute[] {
  const paths = (doc as { paths?: unknown } | null)?.paths;
  if (!paths || typeof paths !== 'object') return [];
  const routes: ApiRoute[] = [];
  for (const [path, ops] of Object.entries(paths as Record<string, unknown>)) {
    if (!ops || typeof ops !== 'object') continue;
    for (const m of METHODES) {
      const op = (ops as Record<string, unknown>)[m] as { summary?: unknown; security?: unknown } | undefined;
      if (!op) continue;
      routes.push({
        method: m.toUpperCase(), path,
        summary: typeof op.summary === 'string' ? op.summary : '',
        auth: Array.isArray(op.security) && op.security.length > 0,
        area: path.split('/')[1] || '/',
      });
    }
  }
  return routes.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
}

export interface RouteArea {
  area: string;
  count: number;
  open: number;
}

export function routeAreas(routes: readonly ApiRoute[]): RouteArea[] {
  const per = new Map<string, RouteArea>();
  for (const r of routes) {
    const a = per.get(r.area) ?? { area: r.area, count: 0, open: 0 };
    a.count += 1;
    if (!r.auth) a.open += 1;
    per.set(r.area, a);
  }
  return [...per.values()].sort((a, b) => b.count - a.count || a.area.localeCompare(b.area));
}
