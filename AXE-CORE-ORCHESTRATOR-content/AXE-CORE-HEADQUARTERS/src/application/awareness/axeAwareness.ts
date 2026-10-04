import { getSupabase } from '@/infrastructure/supabase/supabaseClient';
import { isOpenTask } from '@/domain/tasks/taskStatus';
import { goedkeuringVoorActie } from '@/domain/taakGoedkeuring';

export type AwarenessGoedkeuring = {
  id: string;
  tekst: string;
  wat: string;
  waarom: string;
  ja: string;
};

export type AwarenessSnapshot = {
  now: string;
  openTasks: number;
  overdueTasks: number;
  followUps: number;
  alerts: string[];
  /**
   * De titels van de te late taken, nieuwste deadline eerst.
   *
   * Deze query las `title` en `due_date` al en gooide ze weg -- er kwam alleen
   * een getal uit. Het dagbriefje (bouwlijst 6.6) heeft precies deze titels
   * nodig voor zijn top 3: "over tijd" is de enige rangorde die uit echte data
   * komt in plaats van uit een gok. Hoogstens tien; een briefje dat twintig
   * dingen opsomt is geen briefje.
   */
  overdueTitles: string[];
  /** Alleen acties die het staande plan verlaten. */
  goedkeuringen: AwarenessGoedkeuring[];
};

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
  if (!sb) return { now: now.toISOString(), openTasks: 0, overdueTasks: 0, followUps: 0, alerts: [], overdueTitles: [], goedkeuringen: [] };

  const [t, f] = await Promise.allSettled([
    // Filtered here rather than in the query: `neq('status','done')` looked
    // like it excluded finished work and excluded nothing, because the
    // worker writes `completed`, never `done`. See domain/tasks/taskStatus.
    sb.from('core_tasks').select('id,status,due_date,title,goal,metadata,assignee,capability').limit(200),
    sb.from('core_follow_ups').select('id,status,title,due_date').limit(200),
  ]);

  const tasks = t.status === 'fulfilled'
    ? ((t.value.data ?? []) as Array<Record<string, unknown>>).filter(x => isOpenTask(x.status))
    : [];
  const fs = f.status === 'fulfilled'
    ? ((f.value.data ?? []) as Array<Record<string, unknown>>).filter(x => isOpenTask(x.status))
    : [];
  const teLaat = tasks
    .filter(x => x.due_date && new Date(String(x.due_date)) < now)
    .sort((a, b) => new Date(String(b.due_date)).getTime() - new Date(String(a.due_date)).getTime());
  const overdue = teLaat.length;
  const overdueTitles = teLaat
    .map(x => String(x.title ?? '').trim())
    .filter(Boolean)
    .slice(0, 10);
  const alerts: string[] = [];
  if (overdue) alerts.push(`${overdue} taak/taken zijn over tijd`);
  if (fs.length) alerts.push(`${fs.length} follow-up(s) wachten op aandacht`);
  const goedkeuringen: AwarenessGoedkeuring[] = [];
  for (const t of tasks) {
    const status = String(t.status ?? '');
    const meta = (t.metadata && typeof t.metadata === 'object') ? t.metadata as Record<string, unknown> : null;
    const wacht = status === 'waiting_approval' || (status === 'pending' && meta?.goedkeuring === 'nodig');
    if (!wacht) continue;
    const vraag = goedkeuringVoorActie({
      title: typeof t.title === 'string' ? t.title : '',
      goal: typeof t.goal === 'string' ? t.goal : null,
      metadata: meta,
    });
    if (!vraag || !t.id) continue;
    goedkeuringen.push({ id: String(t.id), tekst: vraag.tekst, wat: vraag.wat, waarom: vraag.waarom, ja: vraag.ja });
  }
  return { now: now.toISOString(), openTasks: tasks.length, overdueTasks: overdue, followUps: fs.length, alerts, overdueTitles, goedkeuringen };
}
