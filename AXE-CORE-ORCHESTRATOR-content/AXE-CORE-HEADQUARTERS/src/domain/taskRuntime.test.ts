import { describe, expect, it } from 'vitest';
import type {
  DurableTaskRun,
  DurableTaskSnapshot,
} from '@/infrastructure/gateways/axeCoreApiService';

describe('durable task contracts', () => {
  it('represent resumable work and ordered events', () => {
    const task: DurableTaskRun = {
      id: 'run-1',
      title: 'Build feature',
      goal: 'Ship a verified PR',
      status: 'waiting_approval',
      priority: 'high',
      checkpoint: { lastCompletedStep: 'tests' },
      attempt: 1,
      max_attempts: 3,
      revision: 5,
      created_at: '2026-08-16T12:00:00Z',
      updated_at: '2026-08-16T12:05:00Z',
    };
    const snapshot: DurableTaskSnapshot = {
      task,
      steps: [],
      approvals: [],
      events: [
        {
          sequence: 1,
          task_id: task.id,
          event_type: 'task.queued',
          actor_type: 'user',
          data: {},
          created_at: task.created_at,
        },
        {
          sequence: 2,
          task_id: task.id,
          event_type: 'approval.requested',
          actor_type: 'axe',
          data: {},
          created_at: task.updated_at,
        },
      ],
    };

    expect(snapshot.task.checkpoint).toEqual({ lastCompletedStep: 'tests' });
    expect(snapshot.events.map(event => event.sequence)).toEqual([1, 2]);
  });
});
