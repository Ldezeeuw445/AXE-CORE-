import { describe, expect, it } from 'vitest';
import { daxOverzichtRijen, DAX_APP_EIGENAAR } from '@/domain/agents/daxOverzicht';
import type { ServerAgent } from '@/domain/agents/serverStatus';

function basis(deel: Partial<ServerAgent> & { agent: string }): ServerAgent {
  return {
    status: 'SLEEPING',
    reason: '',
    events: [],
    ...deel,
  } as ServerAgent;
}

describe('daxOverzichtRijen', () => {
  it('builds rows from real dax_computer + heartbeat fields only', () => {
    const nu = Date.parse('2026-11-04T10:00:00+01:00');
    const agents = {
      trading: basis({
        agent: 'trading',
        dax_computer: 'dax-trading-01',
        dax_status: 'running',
        dax_always_on: true,
        dax_heartbeat_at: new Date(nu - 2 * 60_000).toISOString(),
        dax_routine: 'Market data check',
        current_action: 'Scanning EURUSD',
        task: { id: 't1', title: 'Scan book', status: 'running' },
        events: [{ at: new Date(nu - 60_000).toISOString(), kind: 'task', event_type: 'step', message: 'Fetched candles', task_id: 't1', mission_id: null, source: 'task' }],
        routines: [{ name: 'market', last_run_at: null, last_status: 'ok', next_run_at: new Date(nu + 5 * 60_000).toISOString(), running: false, failures: 0, summary: 'ok' }],
      }),
      browser: basis({
        agent: 'browser',
        dax_computer: 'dax-browser-01',
        dax_status: 'error',
        dax_always_on: true,
        dax_error: 'Chromium dead',
        dax_heartbeat_at: new Date(nu - 40 * 60_000).toISOString(),
      }),
    };
    const rijen = daxOverzichtRijen(agents, nu);
    expect(rijen.map((r) => r.computer)).toEqual(['dax-trading-01', 'dax-browser-01']);
    const trading = rijen[0];
    expect(trading.alwaysOn).toBe(true);
    expect(trading.stand).toBe('running');
    expect(trading.app).toBe(DAX_APP_EIGENAAR['dax-trading-01'].app);
    expect(trading.huidigeTaak).toContain('Scan book');
    expect(trading.laatsteActies[0]).toContain('Fetched candles');
    expect(rijen[1].stand).toBe('blocked');
    expect(rijen[1].blokkade).toContain('Chromium');
  });

  it('marks stale heartbeat as offline even if dax_status=running', () => {
    const nu = Date.parse('2026-11-04T10:00:00+01:00');
    const agents = {
      developer: basis({
        agent: 'developer',
        dax_computer: 'dax-developer-01',
        dax_status: 'running',
        dax_always_on: true,
        dax_heartbeat_at: new Date(nu - 45 * 60_000).toISOString(),
      }),
    };
    const [rij] = daxOverzichtRijen(agents, nu);
    expect(rij.stand).toBe('offline');
    expect(rij.alwaysOn).toBe(true);
  });
});
