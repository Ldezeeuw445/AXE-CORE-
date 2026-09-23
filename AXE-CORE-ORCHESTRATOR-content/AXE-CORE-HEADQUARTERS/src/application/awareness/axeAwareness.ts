import { getSupabase } from '@/infrastructure/supabase/supabaseClient';
import { isOpenTask } from '@/domain/tasks/taskStatus';

export type AwarenessSnapshot = { now: string; openTasks: number; overdueTasks: number; followUps: number; alerts: string[] };

/** Live snapshot of open work AXE is aware of — open/overdue tasks and
 *  pending follow-ups — surfaced in the Awareness Center panel on Home.
 *
 *  Each source is fetched and caught independently (`Promise.allSettled`,
 *  not `Promise.all`). `core_follow_ups` does not exist in the database yet
 *  (confirmed live: `to_regclass('public.core_follow_ups')` returns null) --
 *  with the old `Promise.all` + one shared catch, that single missing table
 *  rejected the WHOLE call, so `core_tasks` (which queries fine on its own
 *  and has real open rows) was silently thrown away too. The panel was
 *  reporting zero for everything, always, regardless of real task data,
 *  because of a table that was never even meant to feed it yet. Follow-ups
 *  now correctly stay at 0 until that table is migrated, without taking
 *  tasks down with them. */
export async function getAwarenessSnapshot(): Promise<AwarenessSnapshot> {
  const now = new Date();
  const sb = getSupabase();
  if (!sb) return { now: now.toISOString(), openTasks: 0, overdueTasks: 0, followUps: 0, alerts: [] };

  const [t, f] = await Promise.allSettled([
    // Filtered here rather than in the query: `neq('status','done')` looked
    // like it excluded finished work and excluded nothing, because the
    // worker writes `completed`, never `done`. See domain/tasks/taskStatus.
    sb.from('core_tasks').select('id,status,due_date,title').limit(200),
    sb.from('core_follow_ups').select('id,status,title,due_date').limit(200),
  ]);

  const tasks = t.status === 'fulfilled'
    ? ((t.value.data ?? []) as Array<Record<string, unknown>>).filter(x => isOpenTask(x.status))
    : [];
  const fs = f.status === 'fulfilled'
    ? ((f.value.data ?? []) as Array<Record<string, unknown>>).filter(x => isOpenTask(x.status))
    : [];
  const overdue = tasks.filter(x => x.due_date && new Date(String(x.due_date)) < now).length;
  const alerts: string[] = [];
  if (overdue) alerts.push(`${overdue} taak/taken zijn over tijd`);
  if (fs.length) alerts.push(`${fs.length} follow-up(s) wachten op aandacht`);
  return { now: now.toISOString(), openTasks: tasks.length, overdueTasks: overdue, followUps: fs.length, alerts };
}
