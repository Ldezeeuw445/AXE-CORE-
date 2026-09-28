/**
 * De rijen achter de Agents-tab: wat de agents deden, wat ze gaan doen, en
 * wat ze onthouden. Alleen lezen, en alleen smalle kolommen — deze service
 * draait elke 15 seconden zolang de tab open is.
 *
 * Rechtstreeks via Supabase en niet via de VPS-bridge (sbGetRows/ledgerList):
 * alle vijf tabellen hebben een SELECT-policy voor de ingelogde gebruiker
 * (gemeten 23 sep 2026 in pg_policies), dus er is geen reden om een tweede
 * hop te nemen die kan wegvallen. En de ontwerpmodus onderschept getSupabase,
 * dus de lay-out is te beoordelen zonder echte sessie.
 *
 * Elke bron faalt los: een kapotte core_job_runs mag de taken niet
 * meenemen. De fouten komen mee terug, zodat de pagina "kon niet lezen" kan
 * zeggen in plaats van "niets gebeurd".
 */
import { getSupabase } from '@/infrastructure/supabase/supabaseClient';
import { TERMINAL_TASK_STATUSES } from '@/domain/tasks/taskStatus';
import {
  DESK_SOURCE_PATTERNS,
  type TaskRow, type EpisodeRow, type JobRunRow, type ScheduleRow, type MemoryEntryRow,
} from '@/domain/agents/activity';

const TASK_COLS = 'id,title,status,assignee,capability,metadata,error,created_at,updated_at,started_at,completed_at,cancelled_at,next_attempt_at';
const EPISODE_COLS = 'id,agent,subject,verdict,outcome_note,opened_at,closed_at';
const RUN_COLS = 'id,job_key,job_name,app,status,error,duration_ms,started_at,finished_at,created_at';
const SCHEDULE_COLS = 'id,name,cron_expr,enabled,next_run_at,last_run_at,last_status,app,job_key,consecutive_failures';
const MEMORY_COLS = 'id,agent,kind,content,source,created_at';

/**
 * Trading heeft >5 000 episodes (gemeten 23 sep). Zonder deze uitsluiting in
 * de query zijn de nieuwste 200 rijen allemaal trading, en ziet de tab van de
 * andere agents niets.
 */
const TRADING_EPISODE_AGENTS = '(trading,trading-desk-intel,trading-desk-companion,research)';

/** Desk-schrijfsels in andermans namespace, al in de database weggelaten. Null-bron blijft. */
const NOT_DESK = `source.is.null,and(${DESK_SOURCE_PATTERNS.map(p => `source.not.like.${p}`).join(',')})`;

/** Het CHECK-constraint van core_tasks.status zonder de eindtoestanden (zie taskStatus.ts). */
const TERMINAL_LIST = `(${TERMINAL_TASK_STATUSES.join(',')})`;

export interface AgentActivitySnapshot {
  recentTasks: TaskRow[];
  openTasks: TaskRow[];
  episodes: EpisodeRow[];
  runs: JobRunRow[];
  schedules: ScheduleRow[];
  memory: MemoryEntryRow[];
  /** Per bron die niet gelezen kon worden: "core_job_runs: permission denied". */
  errors: string[];
  /** Hoeveel van de zes bronnen antwoordden. 0 = niets kwam door. */
  sourcesOk: number;
}

type Result<T> = { data: T[] | null; error: { message: string } | null };

async function read<T>(label: string, q: PromiseLike<Result<T>>, errors: string[]): Promise<T[] | null> {
  try {
    const { data, error } = await q;
    if (error) { errors.push(`${label}: ${error.message}`); return null; }
    return (data ?? []) as T[];
  } catch (err) {
    errors.push(`${label}: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

export async function loadAgentActivity(namespaces: readonly string[]): Promise<AgentActivitySnapshot> {
  const sb = getSupabase();
  const empty: AgentActivitySnapshot = {
    recentTasks: [], openTasks: [], episodes: [], runs: [], schedules: [], memory: [],
    errors: [], sourcesOk: 0,
  };
  if (!sb) return { ...empty, errors: ['Supabase is not configured on this device.'] };

  const errors: string[] = [];
  const weekAgo = new Date(Date.now() - 7 * 86400_000).toISOString();
  const [recentTasks, openTasks, episodes, runs, schedules, memory] = await Promise.all([
    read<TaskRow>('core_tasks', sb.from('core_tasks').select(TASK_COLS)
      .order('updated_at', { ascending: false }).limit(150), errors),
    read<TaskRow>('core_tasks (open)', sb.from('core_tasks').select(TASK_COLS)
      .not('status', 'in', TERMINAL_LIST)
      .order('created_at', { ascending: true }).limit(500), errors),
    read<EpisodeRow>('agent_learning_episodes', sb.from('agent_learning_episodes').select(EPISODE_COLS)
      .not('agent', 'in', TRADING_EPISODE_AGENTS)
      .order('opened_at', { ascending: false }).limit(150), errors),
    read<JobRunRow>('core_job_runs', sb.from('core_job_runs').select(RUN_COLS)
      .gte('created_at', weekAgo)
      .order('created_at', { ascending: false }).limit(300), errors),
    read<ScheduleRow>('core_schedules', sb.from('core_schedules').select(SCHEDULE_COLS)
      .order('next_run_at', { ascending: true }), errors),
    read<MemoryEntryRow>('memory', sb.from('memory').select(MEMORY_COLS)
      .in('agent', [...namespaces]).or(NOT_DESK)
      .order('created_at', { ascending: false }).limit(80), errors),
  ]);

  const parts = [recentTasks, openTasks, episodes, runs, schedules, memory];
  return {
    recentTasks: recentTasks ?? [],
    openTasks: openTasks ?? [],
    episodes: episodes ?? [],
    runs: runs ?? [],
    schedules: schedules ?? [],
    memory: memory ?? [],
    errors,
    sourcesOk: parts.filter(p => p !== null).length,
  };
}

export interface NamespaceCount {
  /** Eigen rijen, zonder wat de trading-desk erin schreef. null = niet te lezen. */
  own: number | null;
  /** Rijen van de trading-desk in deze namespace (bron axe-core-*, desk-*). */
  desk: number | null;
}

/**
 * Per namespace: hoeveel is echt van deze agent, en hoeveel schreef de desk.
 * Twee tellingen en geen aftrekking van één totaal, zodat een mislukte
 * telling als onbekend zichtbaar blijft in plaats van als nul.
 */
export async function loadNamespaceCounts(namespaces: readonly string[]): Promise<Record<string, NamespaceCount>> {
  const sb = getSupabase();
  if (!sb) return {};
  const deskOr = DESK_SOURCE_PATTERNS.map(p => `source.like.${p}`).join(',');
  const count = async (ns: string, filter: string): Promise<number | null> => {
    try {
      const { count: n, error } = await sb.from('memory')
        .select('id', { count: 'exact', head: true })
        .eq('agent', ns).or(filter);
      return error ? null : (n ?? 0);
    } catch {
      return null;
    }
  };
  const entries = await Promise.all(namespaces.map(async ns => {
    const [own, desk] = await Promise.all([count(ns, NOT_DESK), count(ns, deskOr)]);
    return [ns, { own, desk }] as const;
  }));
  return Object.fromEntries(entries);
}

/** De nieuwste eigen herinneringen van één namespace. */
export async function loadNamespaceMemory(namespace: string, limit = 6): Promise<MemoryEntryRow[] | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const errors: string[] = [];
  return read<MemoryEntryRow>('memory', sb.from('memory').select(MEMORY_COLS)
    .eq('agent', namespace).or(NOT_DESK)
    .order('created_at', { ascending: false }).limit(limit), errors);
}
