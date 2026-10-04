import { describe, expect, it } from 'vitest';
import { voegWerkSamen } from '@/domain/werkBron';
import { durableAlsBron, jobAlsBron, plannerAlsBron } from './leesWerk';
import type { CalendarJob, DurableTaskRun, PlannerTaak } from '@/infrastructure/gateways/axeCoreApiService';

describe('leesWerk — dezelfde bronnen, geen tweede planner', () => {
  it('leest planner, taken en cron tot één set met eigenaar', () => {
    const planner = plannerAlsBron({
      id: 'p',
      title: 'Next NorthSea step',
      goal: null,
      description: null,
      status: 'pending',
      priority: 'medium',
      assignee: 'maps-agent',
      metadata: { agent: 'maps-agent', planner: true, oorsprong: 'vervolg' },
      result: null,
      error: null,
      created_at: '2026-10-01T08:00:00Z',
      completed_at: null,
    } as PlannerTaak);
    const taak = durableAlsBron({
      id: 'd',
      title: 'Next NorthSea step',
      goal: '',
      status: 'queued',
      priority: 'medium',
      assignee: 'northsea',
      requested_by: 'luka',
      capability: 'task_manage',
      metadata: { agent: 'northsea' },
      checkpoint: {},
      attempt: 0,
      max_attempts: 3,
      revision: 1,
      created_at: '2026-10-01T08:01:00Z',
      updated_at: '2026-10-01T08:01:00Z',
    } as DurableTaskRun);
    const cron = jobAlsBron({
      job_key: 'ochtend',
      id: 'c1',
      bron: 'schedule',
      naam: 'Ochtendrapport',
      app: 'axe_core',
      executor: 'vps',
      soort: 'exec',
      cron: '0 7 * * *',
      enabled: true,
      next_run_at: '2026-10-02T07:00:00Z',
      last_run_at: null,
      last_status: null,
      consecutive_failures: 0,
      description: null,
    } as CalendarJob);

    const samen = voegWerkSamen([planner, taak, cron]);
    expect(samen.map((w) => w.oorsprong).sort()).toEqual(['cron', 'planner']);
    expect(samen.find((w) => w.oorsprong === 'planner')?.eigenaar).toBeTruthy();
    expect(samen.find((w) => w.oorsprong === 'cron')?.id).toBe('ochtend');
  });
});
