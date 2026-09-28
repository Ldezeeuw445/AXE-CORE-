/**
 * Opgeslagen data voor tier-1: taken, prioriteiten, agenda.
 * Geen LLM. Elke bron heeft een eigen timeout; een dode VPS mag groet
 * of status niet tegenhouden.
 */
import { getAwarenessSnapshot } from '@/application/awareness/axeAwareness';
import {
  calendarJobs,
  plannerTaken,
  type CalendarJobItem,
  type PlannerTaak,
} from '@/infrastructure/gateways/axeCoreApiService';
import { isOpenTask } from '@/domain/tasks/taskStatus';
import type { AxeRouteKind } from '@/domain/tierRouter/axeRoute';

export interface Tier1Kijk {
  openTasks: number;
  overdueTasks: number;
  titels: string[];
  agenda: string[];
}

export interface HaalTier1Deps {
  awareness?: () => Promise<{ openTasks: number; overdueTasks: number }>;
  taken?: () => Promise<string[]>;
  agenda?: () => Promise<string[]>;
  timeoutMs?: number;
}

function metTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    p.catch(() => fallback),
    new Promise<T>((resolve) => {
      setTimeout(() => resolve(fallback), ms);
    }),
  ]);
}

const LEEG: Tier1Kijk = { openTasks: 0, overdueTasks: 0, titels: [], agenda: [] };

export async function haalTier1Kijk(
  kind: AxeRouteKind,
  deps: HaalTier1Deps = {},
): Promise<Tier1Kijk> {
  if (kind === 'greeting' || kind === 'session') return LEEG;

  const timeoutMs = deps.timeoutMs ?? 600;
  const awareness = deps.awareness ?? (async () => {
    const s = await getAwarenessSnapshot();
    return { openTasks: s.openTasks, overdueTasks: s.overdueTasks };
  });
  const taken = deps.taken ?? (async () => {
    const { taken: lijst } = await plannerTaken(20);
    return (lijst ?? [])
      .filter((t: PlannerTaak) => isOpenTask(t.status))
      .map((t) => t.title)
      .filter(Boolean);
  });
  const agenda = deps.agenda ?? (async () => {
    const tot = new Date(Date.now() + 24 * 3600 * 1000);
    const { items } = await calendarJobs(new Date(), tot);
    return (items ?? []).map((i: CalendarJobItem) => i.naam).filter(Boolean);
  });

  const wilTaken = kind === 'tasks' || kind === 'priorities' || kind === 'status';
  const wilAgenda = kind === 'calendar' || kind === 'priorities';

  const [stand, titels, items] = await Promise.all([
    metTimeout(awareness(), timeoutMs, { openTasks: 0, overdueTasks: 0 }),
    wilTaken ? metTimeout(taken(), timeoutMs, [] as string[]) : Promise.resolve([] as string[]),
    wilAgenda ? metTimeout(agenda(), timeoutMs, [] as string[]) : Promise.resolve([] as string[]),
  ]);

  return {
    openTasks: stand.openTasks,
    overdueTasks: stand.overdueTasks,
    titels: titels.length ? titels : [],
    agenda: items,
  };
}
