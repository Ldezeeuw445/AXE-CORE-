/**
 * Eén leespad voor Taken, planner, agenda en de kluis.
 * Bronnen blijven waar ze zijn: core_tasks, planner.py, calendar/jobs.
 * Hier wordt niets gekopieerd en geen tweede planner verzonnen.
 */
import {
  calendarJobs,
  listDurableTasks,
  plannerTaken,
  type CalendarJob,
  type DurableTaskRun,
  type PlannerTaak,
} from '@/infrastructure/gateways/axeCoreApiService';
import {
  cronAlsBron,
  taakAlsBron,
  voegWerkSamen,
  type WerkBronIn,
  type WerkItem,
} from '@/domain/werkBron';

export function plannerAlsBron(t: PlannerTaak): WerkBronIn {
  return taakAlsBron({
    id: t.id,
    title: t.title,
    status: t.status,
    assignee: t.assignee,
    capability: 'planner',
    created_at: t.created_at,
    completed_at: t.completed_at,
    metadata: { ...(t.metadata ?? {}), planner: true, agent: t.metadata?.agent ?? t.assignee },
    planner: true,
  });
}

export function durableAlsBron(t: DurableTaskRun): WerkBronIn {
  return taakAlsBron({
    id: t.id,
    title: t.title,
    status: t.status,
    assignee: t.assignee,
    requested_by: t.requested_by,
    capability: t.capability,
    created_at: t.created_at,
    metadata: t.metadata,
    planner: t.capability === 'planner',
  });
}

export function jobAlsBron(j: CalendarJob): WerkBronIn {
  return cronAlsBron({
    id: j.job_key || j.id || j.naam,
    name: j.naam,
    enabled: j.enabled,
    next_run_at: j.next_run_at,
    metadata: { bron: j.bron, app: j.app },
  });
}

async function leesWerkBronnen(): Promise<WerkBronIn[]> {
  const tot = new Date();
  const van = new Date(tot.getTime() - 7 * 86400_000);
  const [taken, planner, jobs] = await Promise.allSettled([
    listDurableTasks({ limit: 200 }),
    plannerTaken(100),
    calendarJobs(van, new Date(tot.getTime() + 14 * 86400_000)),
  ]);
  const uit: WerkBronIn[] = [];
  if (planner.status === 'fulfilled') {
    for (const t of planner.value.taken) uit.push(plannerAlsBron(t));
  }
  if (taken.status === 'fulfilled') {
    for (const t of taken.value.tasks) uit.push(durableAlsBron(t));
  }
  if (jobs.status === 'fulfilled') {
    for (const j of jobs.value.jobs) {
      if (j.enabled) uit.push(jobAlsBron(j));
    }
  }
  return uit;
}

export async function leesWerkWaarheid(): Promise<WerkItem[]> {
  return voegWerkSamen(await leesWerkBronnen());
}
