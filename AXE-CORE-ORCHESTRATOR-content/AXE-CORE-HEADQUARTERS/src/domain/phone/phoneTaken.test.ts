import { describe, expect, it } from 'vitest';
import { groepeerTelefoonTaken } from './phoneTaken';

describe('groepeerTelefoonTaken', () => {
  it('vouwt zes DEAL-002-regels tot één kaart met schone titel', () => {
    const rijen = Array.from({ length: 6 }, (_, i) => ({
      id: `t${i}`,
      title: 'Continue: Yes needed: DEAL-002 — Copper Cathode',
      status: 'pending',
      updated_at: `2026-10-17T1${i}:00:00Z`,
    }));
    const uit = groepeerTelefoonTaken(rijen);
    expect(uit).toHaveLength(1);
    expect(uit[0].aantal).toBe(6);
    expect(uit[0].titel).toBe('DEAL-002 — Copper Cathode');
    expect(uit[0].id).toBe('t5');
  });

  it('houdt verschillende deals uit elkaar', () => {
    const uit = groepeerTelefoonTaken([
      { id: 'a', title: 'DEAL-001 — Copper Cathode', status: 'open' },
      { id: 'b', title: 'DEAL-002 — Copper Cathode', status: 'open' },
    ]);
    expect(uit).toHaveLength(2);
  });
});
