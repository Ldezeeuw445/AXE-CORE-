import { describe, it, expect } from 'vitest';
import { activiteitUitServer } from './activiteitUitServer';
import type { ServerAgent } from './serverStatus';

const a = (p: Partial<ServerAgent>): ServerAgent => ({ agent: 'developer', status: 'SLEEPING', reason: '', events: [], ...p });

describe('vluchten uit wat de server zag', () => {
  it('niets veranderd, niets te vliegen', () => {
    expect(activiteitUitServer({ developer: a({}) }, { developer: a({}) })).toEqual([]);
  });
  it('een nieuw event vliegt naar de tegel van die agent', () => {
    const na = a({ last_event_at: '2', events: [{ at: '2', kind: 'shell', event_type: 'axe.progress', message: 'Running npm test', task_id: 't', mission_id: null, source: 'task' }] });
    const uit = activiteitUitServer({ developer: a({ last_event_at: '1' }) }, { developer: na });
    expect(uit[0].doelen[0]).toBe('agent:developer');
    expect(uit[0].label).toContain('Running npm test');
  });
  it('een vraag aan Luka krijgt een eigen kleur', () => {
    const uit = activiteitUitServer({ northsea: a({ agent: 'northsea' }) }, { northsea: a({ agent: 'northsea', status: 'WAITING_APPROVAL', task: { id: 't', title: 'DEAL-002', status: 'waiting_approval' } }) });
    expect(uit[0].label).toContain('needs your OK');
    expect(uit[0].kleur).toContain('251,191,36');
  });
});
