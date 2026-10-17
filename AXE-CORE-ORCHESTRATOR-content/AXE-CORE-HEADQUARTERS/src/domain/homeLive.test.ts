import { describe, expect, it } from 'vitest';
import { homeLiveStand, werkPulseTekst } from './homeLive';
import type { ServerAgent } from './agents/serverStatus';

const agent = (p: Partial<ServerAgent>): ServerAgent => ({
  agent: 'northsea',
  status: 'SLEEPING',
  reason: 'Nothing runnable for this agent.',
  events: [],
  ...p,
});

describe('homeLiveStand', () => {
  it('telt echte werkers en noemt lege kaarten niet vol', () => {
    const stand = homeLiveStand({ agents: {} });
    expect(stand.werkend).toBe(0);
    expect(stand.lopend).toEqual([]);
    expect(stand.goedkeuringen).toEqual([]);
    expect(werkPulseTekst(0)).toBe('No agents working');
  });

  it('zet een wachtende NorthSea-taak in lopend + goedkeuringen', () => {
    const stand = homeLiveStand({
      agents: {
        northsea: agent({
          agent: 'northsea',
          status: 'WAITING_APPROVAL',
          reason: 'A step is waiting for Luka\'s approval.',
          task: { id: 't1', title: 'Energy market snapshot', status: 'waiting_approval' },
          pendingApproval: {
            id: 'ok1',
            wat: 'Run the snapshot',
            waarom: 'Left the standing plan.',
            task_id: 't1',
          },
        }),
      },
    });
    expect(stand.werkend).toBe(1);
    expect(stand.lopend[0]?.titel).toMatch(/Energy market snapshot|waiting on/);
    expect(stand.goedkeuringen).toEqual([
      { id: 'ok1', taskId: 't1', wat: 'Run the snapshot', waarom: 'Left the standing plan.' },
    ]);
    expect(werkPulseTekst(1)).toBe('1 agent working');
  });
});
