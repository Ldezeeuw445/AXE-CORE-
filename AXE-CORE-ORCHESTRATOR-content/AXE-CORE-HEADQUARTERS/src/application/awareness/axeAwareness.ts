import { getSupabase } from '@/infrastructure/supabase/supabaseClient';
import { isOpenTask } from '@/domain/tasks/taskStatus';

export type AwarenessSnapshot = {
  now: string;
  openTasks: number;
  overdueTasks: number;
  followUps: number;
  alerts: string[];
  nextItem: string | null;
};

function leeg(now: Date): AwarenessSnapshot {
  return { now: now.toISOString(), openTasks: 0, overdueTasks: 0, followUps: 0, alerts: [], nextItem: null };
}

function titelVan(row: Record<string, unknown>): string | null {
  const t = typeof row.title === 'string' ? row.title.trim() : '';
  return t.length > 0 ? t : null;
}

function eerstvolgende(rows: Array<Record<string, unknown>>, now: Date): string | null {
  const metDue = rows
    .map((r) => ({ title: titelVan(r), due: r.due_date ? new Date(String(r.due_date)) : null }))
    .filter((r) => r.title);
  const komend = metDue
    .filter((r) => r.due && !Number.isNaN(r.due.getTime()))
    .sort((a, b) => a.due!.getTime() - b.due!.getTime());
  const overdueEerst = komend.find((r) => r.due!.getTime() < now.getTime());
  if (overdueEerst?.title) return overdueEerst.title;
  if (komend[0]?.title) return komend[0].title;
  return metDue[0]?.title ?? null;
}

/** Live snapshot of open work AXE is aware of — open/overdue tasks and
 *  pending follow-ups — surfaced in the Awareness Center panel on Home.
 *  Missing tables (e.g. core_follow_ups not yet migrated) fail soft to an
 *  empty snapshot rather than breaking the panel. */
export async function getAwarenessSnapshot(): Promise<AwarenessSnapshot> {
  const now = new Date();
  const sb = getSupabase();
  if (!sb) return leeg(now);
  try {
    const [t, f] = await Promise.all([
      // Filtered here rather than in the query: `neq('status','done')` looked
      // like it excluded finished work and excluded nothing, because the
      // worker writes `completed`, never `done`. See domain/tasks/taskStatus.
      sb.from('core_tasks').select('id,status,due_date,title').limit(200),
      sb.from('core_follow_ups').select('id,status,title,due_date').limit(200),
    ]);
    const tasks = ((t.data ?? []) as Array<Record<string, unknown>>).filter(x => isOpenTask(x.status));
    const fs = ((f.data ?? []) as Array<Record<string, unknown>>).filter(x => isOpenTask(x.status));
    const overdue = tasks.filter(x => x.due_date && new Date(String(x.due_date)) < now).length;
    const alerts: string[] = [];
    if (overdue) alerts.push(`${overdue} taak/taken zijn over tijd`);
    if (fs.length) alerts.push(`${fs.length} follow-up(s) wachten op aandacht`);
    return {
      now: now.toISOString(),
      openTasks: tasks.length,
      overdueTasks: overdue,
      followUps: fs.length,
      alerts,
      nextItem: eerstvolgende([...tasks, ...fs], now),
    };
  } catch {
    return leeg(now);
  }
}
