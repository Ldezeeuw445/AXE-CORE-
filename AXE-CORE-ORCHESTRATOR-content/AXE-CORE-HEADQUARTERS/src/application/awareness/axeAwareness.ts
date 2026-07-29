import { getSupabase } from '@/infrastructure/supabase/supabaseClient';

export type AwarenessSnapshot = { now: string; openTasks: number; overdueTasks: number; followUps: number; alerts: string[] };

/** Live snapshot of open work AXE is aware of — open/overdue tasks and
 *  pending follow-ups — surfaced in the Awareness Center panel on Home.
 *  Missing tables (e.g. core_follow_ups not yet migrated) fail soft to an
 *  empty snapshot rather than breaking the panel. */
export async function getAwarenessSnapshot(): Promise<AwarenessSnapshot> {
  const now = new Date();
  const sb = getSupabase();
  if (!sb) return { now: now.toISOString(), openTasks: 0, overdueTasks: 0, followUps: 0, alerts: [] };
  try {
    const [t, f] = await Promise.all([
      sb.from('core_tasks').select('id,status,due_date,title').neq('status', 'done').limit(100),
      sb.from('core_follow_ups').select('id,status,title,due_date').neq('status', 'done').limit(100),
    ]);
    const tasks = (t.data ?? []) as Array<Record<string, unknown>>;
    const fs = (f.data ?? []) as Array<Record<string, unknown>>;
    const overdue = tasks.filter(x => x.due_date && new Date(String(x.due_date)) < now).length;
    const alerts: string[] = [];
    if (overdue) alerts.push(`${overdue} taak/taken zijn over tijd`);
    if (fs.length) alerts.push(`${fs.length} follow-up(s) wachten op aandacht`);
    return { now: now.toISOString(), openTasks: tasks.length, overdueTasks: overdue, followUps: fs.length, alerts };
  } catch {
    return { now: now.toISOString(), openTasks: 0, overdueTasks: 0, followUps: 0, alerts: [] };
  }
}
