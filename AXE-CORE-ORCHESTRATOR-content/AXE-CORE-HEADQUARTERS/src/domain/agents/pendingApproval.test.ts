import { describe, expect, it } from 'vitest';
import {
  normaliseerServerAgent,
  okChipTekst,
  rijenVanLijst,
  rijenVoorAgent,
  wachtOpOk,
} from './pendingApproval';
import type { ServerAgent } from './serverStatus';

const basis = (p: Partial<ServerAgent> & Record<string, unknown>): ServerAgent => ({
  agent: 'northsea',
  status: 'SLEEPING',
  reason: 'Nothing runnable for this agent.',
  events: [],
  ...p,
});

describe('normaliseerServerAgent', () => {
  it('leest pending_approval van de VPS als pendingApproval', () => {
    const a = normaliseerServerAgent(basis({
      status: 'WAITING_APPROVAL',
      reason: 'A step is waiting for Luka\'s approval.',
      pending_approval: {
        id: 'ok-1',
        title: 'Send the intro',
        detail: 'Outside the standing plan.',
        wat: 'Send the intro',
        waarom: 'Outside the standing plan.',
        task_id: 't-1',
      },
      task: { id: 't-1', title: 'Send the intro', status: 'waiting_approval' },
    }) as ServerAgent);
    expect(a.pendingApproval?.id).toBe('ok-1');
    expect(a.pendingApprovals).toHaveLength(1);
    expect(wachtOpOk(a)).toBe(true);
  });

  it('houdt camelCase in stand', () => {
    const a = normaliseerServerAgent(basis({
      pendingApproval: { id: 'ok-2', title: 'Pay', wat: 'Pay' },
    }));
    expect(a.pendingApproval?.id).toBe('ok-2');
  });
});

describe('rijenVoorAgent', () => {
  it('koppelt /approvals op task_id', () => {
    const a = normaliseerServerAgent(basis({
      status: 'WAITING_APPROVAL',
      task: { id: 't-9', title: 'Step', status: 'waiting_approval' },
    }));
    const rijen = rijenVoorAgent(a, [
      { id: 'a-9', task_id: 't-9', wat: 'Approve the step', waarom: 'It left the plan.' },
      { id: 'a-x', task_id: 'other', wat: 'Ignore' },
    ]);
    expect(rijen).toEqual([
      { id: 'a-9', taskId: 't-9', wat: 'Approve the step', waarom: 'It left the plan.' },
    ]);
  });
});

describe('okChipTekst', () => {
  it('haalt DEAL-id en onderwerp uit de Dit is/Yes needed-dump', () => {
    expect(okChipTekst(
      'Dit is: een dealbeslissing (Yes needed: DEAL-002 — Copper Cathode).',
    )).toBe('DEAL-002 Copper Cathode');
  });

  it('leest Yes needed zonder haakjes', () => {
    expect(okChipTekst('Yes needed: DEAL-001 — Copper Cathode')).toBe('DEAL-001 Copper Cathode');
  });

  it('houdt een korte titel in stand', () => {
    expect(okChipTekst('Send the intro')).toBe('Send the intro');
  });

  it('valt terug als er geen tekst is', () => {
    expect(okChipTekst('')).toBe('this step');
    expect(okChipTekst(null)).toBe('this step');
  });
});

describe('rijenVanLijst', () => {
  it('zet elke pending /approvals-rij om, zonder agentfilter', () => {
    expect(rijenVanLijst([
      { id: 'a-1', task_id: 't-1', wat: 'Send', waarom: 'Left the plan.' },
      { id: 'a-2', task_id: 't-2', title: 'Pay', detail: 'Needs a card.' },
      { id: 'a-1', task_id: 't-1', wat: 'dup' },
    ])).toEqual([
      { id: 'a-1', taskId: 't-1', wat: 'Send', waarom: 'Left the plan.' },
      { id: 'a-2', taskId: 't-2', wat: 'Pay', waarom: 'Needs a card.' },
    ]);
  });
});
