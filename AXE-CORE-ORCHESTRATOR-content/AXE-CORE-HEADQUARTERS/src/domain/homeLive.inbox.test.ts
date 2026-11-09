import { describe, expect, it } from 'vitest';
import { homeLiveStand } from './homeLive';

describe('wacht op jou-inbox op Home', () => {
  it('toont een open approval die bij geen agent hoort, zonder agentnaam te verzinnen', () => {
    const s = homeLiveStand({
      agents: {},
      extraGoedkeuringen: [{ id: 'ap1', task_id: 't1', wat: 'Push naar main', waarom: 'Tests groen' }],
    });
    expect(s.goedkeuringen).toHaveLength(1);
    expect(s.goedkeuringen[0]).toMatchObject({ id: 'ap1', taskId: 't1', wat: 'Push naar main' });
    expect(s.goedkeuringen[0].agent).toBeUndefined();
    expect(s.goedkeuringen[0].agentId).toBeUndefined();
  });

  it('zonder open approvals blijft de inbox leeg', () => {
    const s = homeLiveStand({ agents: {}, extraGoedkeuringen: [] });
    expect(s.goedkeuringen).toEqual([]);
  });
});
