import { describe, it, expect } from 'vitest';
import { missieVoortgang, serverStand, type ServerAgent } from './serverStatus';

const basis = (p: Partial<ServerAgent>): ServerAgent => ({
  agent: 'developer', status: 'SLEEPING', reason: 'Nothing runnable for this agent.', events: [], ...p,
});

describe('Home toont wat de server echt ziet', () => {
  it('slapen is het woord, geen balkje en geen verzonnen regel', () => {
    const s = serverStand(basis({}));
    expect(s).toMatchObject({ label: 'sleeping', stil: true, regel: '' });
  });

  it('werkend toont de echte laatste actie', () => {
    const s = serverStand(basis({ status: 'WORKING', current_action: 'Step 3: $ npm test' }));
    expect(s.label).toBe('working');
    expect(s.regel).toBe('Step 3: $ npm test');
    expect(s.stil).toBe(false);
  });

  it('geblokkeerd toont waarom', () => {
    const s = serverStand(basis({ status: 'BLOCKED', reason: 'needs DNS access' }));
    expect(s.regel).toBe('needs DNS access');
    expect(s.kleur).toBe('var(--err)');
  });

  it('missie geeft de volgende actie en voortgang', () => {
    const mission = { id: 'm', title: 'Finish AXON', status: 'active', progress: 0.4, next_action: 'Work on: API',
      current_milestone: 'API', milestones_total: 5, blocked_reason: null };
    expect(serverStand(basis({ status: 'QUEUED', mission })).regel).toBe('Work on: API');
    expect(missieVoortgang(mission)).toBe('2/5 · 40%');
    expect(missieVoortgang(null)).toBe('');
  });
});
