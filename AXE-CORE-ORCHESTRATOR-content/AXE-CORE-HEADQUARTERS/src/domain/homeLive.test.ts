import { describe, expect, it } from 'vitest';
import { kaartRegels, eventTitel, homeLiveStand, recentUniek, seatsRegels, werkPulseTekst } from './homeLive';
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
    expect(werkPulseTekst(0, 2)).toBe('No agents working · 2 need your OK');
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

  it('recentUniek laat identieke NorthSea-regels één keer staan', () => {
    const dubbel = recentUniek([
      { id: 'a', agent: 'NorthSea', titel: 'task completed', stand: 'done', voortgang: '18:17', kleur: 'var(--ok)' },
      { id: 'b', agent: 'NorthSea', titel: 'task completed', stand: 'done', voortgang: '18:17', kleur: 'var(--ok)' },
      { id: 'c', agent: 'Cron', titel: 'schedules 16 on', stand: 'done', voortgang: '18:10', kleur: 'var(--ok)' },
    ]);
    expect(dubbel).toHaveLength(2);
    expect(dubbel.map((t) => t.titel)).toEqual(['task completed', 'schedules 16 on']);
  });

  it('eventTitel maakt task.completed leesbaar', () => {
    expect(eventTitel({ event_type: 'task.completed', message: 'task.completed' }, 0)).toBe('task completed');
    expect(eventTitel({ event_type: 'task.completed', message: 'Copper PO filed' }, 0)).toBe('Copper PO filed');
  });

  it('homeLiveStand dedupliceert dezelfde complete-events', () => {
    const stand = homeLiveStand({
      agents: {
        northsea: agent({
          agent: 'northsea',
          events: [
            { at: '2026-10-17T16:17:00Z', kind: 'task', event_type: 'task.completed', message: 'task.completed', task_id: 't1', mission_id: null, source: 'task' },
            { at: '2026-10-17T16:17:01Z', kind: 'task', event_type: 'task.completed', message: 'task.completed', task_id: 't1', mission_id: null, source: 'task' },
          ],
        }),
      },
    });
    expect(stand.recent).toHaveLength(1);
    expect(stand.recent[0]?.titel).toBe('task completed');
  });

  it('kaartRegels toont de top 2 en telt de rest', () => {
    const { zicht, meer } = kaartRegels([1, 2, 3, 4, 5, 6, 7]);
    expect(zicht).toEqual([1, 2]);
    expect(meer).toBe(5);
  });

  it('seatsRegels plakt stoelen, dax en roosters in één leesbare lijst', () => {
    const stand = homeLiveStand({
      agents: {
        northsea: agent({
          agent: 'northsea',
          routines: [{
            name: 'Energy snapshot', last_run_at: '2026-10-17T11:00:00Z',
            last_status: 'ok', next_run_at: '2026-10-17T17:00:00Z',
            running: false, failures: 0, summary: 'ok',
          }],
        }),
      },
      stoelen: [{
        id: 'claude4', logged_in: true, rate_limited: false,
        current_task: 'idle', last_seen_at: new Date().toISOString(), config_exists: true,
      }],
    });
    const regels = seatsRegels(stand);
    expect(regels.some((r) => r.tekst.includes('claude4'))).toBe(true);
    expect(regels.some((r) => r.tekst.includes('Energy snapshot'))).toBe(true);
  });
});
