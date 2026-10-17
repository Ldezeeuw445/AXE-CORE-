import { describe, it, expect } from 'vitest';
import { agentLiveRegel, daxRegel, missieVoortgang, serverStand, type ServerAgent } from './serverStatus';

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

describe('de eigen computer (DAX) zegt alleen wat gemeten is', () => {
  const nu = Date.parse('2026-10-11T12:00:00Z');
  it('wakker alleen met een verse heartbeat', () => {
    const r = daxRegel(basis({ dax_computer: 'dax-trading-01', dax_status: 'running',
      dax_heartbeat_at: '2026-10-11T11:57:00Z', dax_routine: 'Market data check' }), nu);
    expect(r).toMatchObject({ wakker: true, blokkade: '' });
    expect(r?.tekst).toBe('Computer dax-trading-01 · awake · heartbeat 3m ago · Market data check');
  });

  it('running in het register zonder recente meting is niet wakker', () => {
    const r = daxRegel(basis({ dax_computer: 'dax-browser-01', dax_status: 'running',
      dax_heartbeat_at: '2026-10-11T10:00:00Z' }), nu);
    expect(r?.wakker).toBe(false);
    expect(r?.tekst).toContain('no recent heartbeat · heartbeat 120m ago');
  });

  it('nooit gemeten en blokkades staan er letterlijk', () => {
    const r = daxRegel(basis({ dax_computer: 'dax-developer-01', dax_status: 'provisioned',
      dax_blockers: ['github.com unreachable from this DAX (HTTP 0)'] }), nu);
    expect(r?.tekst).toContain('provisioned · never measured');
    expect(r?.blokkade).toBe('github.com unreachable from this DAX (HTTP 0)');
  });

  it('geen DAX, geen regel', () => {
    expect(daxRegel(basis({}), nu)).toBeNull();
  });
});

describe('agentLiveRegel laat verouderde fouten vallen', () => {
  it('toont geen hintergebleven blocked_reason als de status niet BLOCKED is', () => {
    const regel = agentLiveRegel(basis({
      status: 'MONITORING',
      reason: 'next cycle at 12:00',
      mission: {
        id: 'm', title: 'DAX', status: 'monitoring', progress: 0.2, next_action: null,
        current_milestone: null, milestones_total: 1,
        blocked_reason: 'Mislukt: pip install failed',
      },
    }));
    expect(regel).not.toMatch(/pip install/);
    expect(regel).toMatch(/next cycle|DAX/);
  });

  it('toont geen DAX-blokkade als de computer wakker is', () => {
    const nu = Date.parse('2026-10-11T12:00:00Z');
    const regel = agentLiveRegel(basis({
      status: 'SLEEPING',
      dax_computer: 'dax-developer-01',
      dax_status: 'running',
      dax_heartbeat_at: '2026-10-11T11:57:00Z',
      dax_error: 'Mislukt: pip install failed',
    }), nu);
    expect(regel).toBe('');
    const dax = daxRegel(basis({
      dax_computer: 'dax-developer-01', dax_status: 'running',
      dax_heartbeat_at: '2026-10-11T11:57:00Z',
    }), nu);
    expect(dax?.wakker).toBe(true);
  });
});
