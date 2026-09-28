/**
 * De vijf bronnen van de Control Plane, elk met een eigen ritme.
 *
 * Alles loopt langs de VPS-API (service_role blijft daar), behalve de taken:
 * die leest de ingelogde sessie rechtstreeks uit Supabase (RLS: alleen Luka),
 * want dat is één query in plaats van één per status. Zonder sessie valt het
 * terug op de VPS.
 *
 * Er wordt niet gepeild als het venster verborgen is: een schema-overzicht dat
 * elke vijftien seconden de VPS vraagt terwijl niemand kijkt, is precies het
 * soort last waaraan die VPS al eens bezweek.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { APPS } from '@/domain/apps';
import {
  OPEN_TASK_STATUSES, eventsFromAudit, eventsFromTaskEvents, mergeEvents, mergeSchedules, opsAppNaam,
  routesFromOpenApi, type ApiRoute, type AuditRow, type ControlEvent, type CronLedgerRun, type KeystoreEntry,
  type OpsCronJob, type ScheduleRow, type TaskEventRow,
} from '@/domain/controlPlane';
import {
  apiOpenApi, calendarJobs, checkAxeApi, keystoreList, ledgerList, listPendingApprovals, opsCronJobs, sbGetRows,
  type DurableTaskApproval,
} from '@/infrastructure/gateways/axeCoreApiService';
import { getSupabase } from '@/infrastructure/supabase/supabaseClient';
import { useVensterZichtbaar } from '@/presentation/hooks/useVensterZichtbaar';

export interface Peiling<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  at: number | null;
  refresh: () => void;
}

function foutTekst(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Laden bij openen, daarna elke `ms` zolang het venster zichtbaar is. */
function usePeiling<T>(laad: () => Promise<T>, ms: number | null): Peiling<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [at, setAt] = useState<number | null>(null);
  const zichtbaar = useVensterZichtbaar();
  const laadRef = useRef(laad);
  useEffect(() => { laadRef.current = laad; }, [laad]);
  const bezig = useRef(false);
  /* Gevraagd terwijl er al een liep (bijv. een ander filter gekozen): dan
     direct daarna nog een keer, anders toont hij tot de volgende tik het oude. */
  const nogEens = useRef(false);

  const refresh = useCallback(() => {
    if (bezig.current) { nogEens.current = true; return; }
    bezig.current = true;
    setLoading(true);
    const run = () => laadRef.current()
      .then(d => { setData(d); setError(null); setAt(Date.now()); })
      .catch(e => setError(foutTekst(e)))
      .finally(() => {
        if (nogEens.current) { nogEens.current = false; void run(); return; }
        bezig.current = false;
        setLoading(false);
      });
    void run();
  }, []);

  useEffect(() => {
    if (!zichtbaar) return;
    // Eerst renderen, dan laden: geen setState rechtstreeks in de effect-body.
    const eerst = setTimeout(refresh, 0);
    const t = ms ? setInterval(refresh, ms) : null;
    return () => { clearTimeout(eerst); if (t) clearInterval(t); };
  }, [zichtbaar, ms, refresh]);

  return { data, error, loading, at, refresh };
}

// ── Schema's ─────────────────────────────────────────────────────────────────

export interface ScheduleData {
  rows: ScheduleRow[];
  /** Per bron wat niet te lezen was; de rest staat er gewoon. */
  gaps: string[];
}

async function laadSchedules(): Promise<ScheduleData> {
  const nu = new Date();
  const opsApps = [...new Set(APPS.map(a => opsAppNaam(a.id)))];
  const [cal, pg, ...ops] = await Promise.allSettled([
    calendarJobs(nu, new Date(nu.getTime() + 60_000)),
    ledgerList({ source: 'pg_cron', hours: 26, limit: 2000 }),
    ...opsApps.map(a => opsCronJobs(a)),
  ]);
  if (cal.status === 'rejected') throw cal.reason;
  const gaps: string[] = [];
  const opsJobs: Record<string, OpsCronJob[]> = {};
  ops.forEach((r, i) => {
    if (r.status === 'fulfilled') opsJobs[opsApps[i]] = r.value;
    else gaps.push(`/cron/jobs?app_name=${opsApps[i]}: ${foutTekst(r.reason)}`);
  });
  let pgRuns: CronLedgerRun[] = [];
  if (pg.status === 'fulfilled') pgRuns = pg.value;
  else gaps.push(`/ledger (pg_cron runs): ${foutTekst(pg.reason)}`);
  return { rows: mergeSchedules(cal.value.jobs, opsJobs, pgRuns), gaps };
}

export function useSchedules(): Peiling<ScheduleData> {
  return usePeiling(laadSchedules, 60_000);
}

// ── Taken ────────────────────────────────────────────────────────────────────

export interface TaskRow {
  id: string;
  title: string | null;
  status: string;
  priority: string | null;
  assignee: string | null;
  capability: string | null;
  source_app: string | null;
  worker_id: string | null;
  heartbeat_at: string | null;
  attempt: number | null;
  max_attempts: number | null;
  created_at: string;
  updated_at: string | null;
  metadata: Record<string, unknown> | null;
  error: unknown;
}

export interface TaskData {
  tasks: TaskRow[];
  /** task_id → id van de open vraag in core_approvals. */
  approvals: Record<string, string>;
  via: 'session' | 'vps';
  approvalsError: string | null;
}

const KOLOMMEN = 'id,title,status,priority,assignee,capability,source_app,worker_id,heartbeat_at,attempt,max_attempts,created_at,updated_at,metadata,error';
const WEEK_MS = 7 * 86400_000;

async function takenViaSessie(): Promise<TaskRow[] | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data: sessie } = await sb.auth.getSession();
  if (!sessie.session) return null;
  const sinds = new Date(Date.now() - WEEK_MS).toISOString();
  const [open, mislukt] = await Promise.all([
    sb.from('core_tasks').select(KOLOMMEN).in('status', OPEN_TASK_STATUSES).order('created_at', { ascending: false }).limit(800),
    sb.from('core_tasks').select(KOLOMMEN).eq('status', 'failed').gte('updated_at', sinds).order('updated_at', { ascending: false }).limit(100),
  ]);
  if (open.error) throw new Error(open.error.message);
  if (mislukt.error) throw new Error(mislukt.error.message);
  return [...(open.data ?? []), ...(mislukt.data ?? [])] as TaskRow[];
}

async function takenViaVps(): Promise<TaskRow[]> {
  const sinds = Date.now() - WEEK_MS;
  const lijsten = await Promise.all([...OPEN_TASK_STATUSES, 'failed'].map(status =>
    sbGetRows<TaskRow>('core_tasks', {
      limit: status === 'pending' ? 800 : 100, orderBy: status === 'failed' ? 'updated_at' : 'created_at',
      orderDir: 'desc', filterCol: 'status', filterVal: status,
    })));
  return lijsten.flat().filter(t => t.status !== 'failed' || Date.parse(t.updated_at ?? t.created_at) >= sinds);
}

async function laadTaken(): Promise<TaskData> {
  const [sessie, vragen] = await Promise.allSettled([takenViaSessie(), listPendingApprovals(100)]);
  let tasks: TaskRow[];
  let via: TaskData['via'] = 'session';
  if (sessie.status === 'fulfilled' && sessie.value) tasks = sessie.value;
  else { tasks = await takenViaVps(); via = 'vps'; }
  const approvals: Record<string, string> = {};
  if (vragen.status === 'fulfilled') {
    for (const a of vragen.value as DurableTaskApproval[]) if (!approvals[a.task_id]) approvals[a.task_id] = a.id;
  }
  return { tasks, approvals, via, approvalsError: vragen.status === 'rejected' ? foutTekst(vragen.reason) : null };
}

export function useTasks(): Peiling<TaskData> {
  return usePeiling(laadTaken, 30_000);
}

// ── Gebeurtenissen ───────────────────────────────────────────────────────────

export interface EventData {
  events: ControlEvent[];
  gaps: string[];
}

/** `kind` gekozen: haal díe soort op de server op, anders zit hij tussen de ticks verstopt. */
async function laadEvents(kind: string | null): Promise<EventData> {
  const [audit, taak] = await Promise.allSettled([
    sbGetRows<AuditRow>('core_audit_log', {
      limit: 200, orderBy: 'created_at', orderDir: 'desc', ...(kind ? { filterCol: 'action', filterVal: kind } : {}),
    }),
    sbGetRows<TaskEventRow>('core_task_events', {
      limit: 100, orderBy: 'created_at', orderDir: 'desc', ...(kind ? { filterCol: 'event_type', filterVal: kind } : {}),
    }),
  ]);
  if (audit.status === 'rejected' && taak.status === 'rejected') throw audit.reason;
  const gaps: string[] = [];
  if (audit.status === 'rejected') gaps.push(`core_audit_log: ${foutTekst(audit.reason)}`);
  if (taak.status === 'rejected') gaps.push(`core_task_events: ${foutTekst(taak.reason)}`);
  return {
    events: mergeEvents(
      audit.status === 'fulfilled' ? eventsFromAudit(audit.value) : [],
      taak.status === 'fulfilled' ? eventsFromTaskEvents(taak.value) : [],
    ),
    gaps,
  };
}

export function useEvents(kind: string | null): Peiling<EventData> {
  const laad = useCallback(() => laadEvents(kind), [kind]);
  const p = usePeiling(laad, 15_000);
  const { refresh } = p;
  // Andere soort gekozen: meteen opnieuw, niet pas bij de volgende tik.
  useEffect(() => { const t = setTimeout(refresh, 0); return () => clearTimeout(t); }, [kind, refresh]);
  return p;
}

// ── Routes en gezondheid ────────────────────────────────────────────────────

export interface RouteData {
  routes: ApiRoute[];
  title: string;
  version: string;
  health: { status: string; latencyMs: number; flags: Record<string, boolean> } | { error: string };
}

async function laadRoutes(): Promise<RouteData> {
  const t0 = performance.now();
  const [doc, health] = await Promise.allSettled([apiOpenApi(), checkAxeApi()]);
  const latencyMs = Math.round(performance.now() - t0);
  if (doc.status === 'rejected') throw doc.reason;
  const info = (doc.value as { info?: { title?: string; version?: string } }).info ?? {};
  return {
    routes: routesFromOpenApi(doc.value),
    title: info.title ?? 'API',
    version: info.version ?? '—',
    health: health.status === 'fulfilled'
      ? {
        status: health.value.status, latencyMs,
        flags: Object.fromEntries(Object.entries(health.value).filter((e): e is [string, boolean] => typeof e[1] === 'boolean')),
      }
      : { error: foutTekst(health.reason) },
  };
}

export function useRoutes(): Peiling<RouteData> {
  return usePeiling(laadRoutes, 120_000);
}

// ── Sleutels per app ─────────────────────────────────────────────────────────

export interface KeyApp {
  app: (typeof APPS)[number];
  opsNaam: string;
  keys: KeystoreEntry[] | null;
  error: string | null;
}

async function laadSleutels(): Promise<KeyApp[]> {
  const res = await Promise.allSettled(APPS.map(a => keystoreList(opsAppNaam(a.id))));
  return APPS.map((app, i) => {
    const r = res[i];
    return {
      app, opsNaam: opsAppNaam(app.id),
      keys: r.status === 'fulfilled' ? r.value : null,
      error: r.status === 'rejected' ? foutTekst(r.reason) : null,
    };
  });
}

export function useKeys(): Peiling<KeyApp[]> {
  return usePeiling(laadSleutels, null);
}
