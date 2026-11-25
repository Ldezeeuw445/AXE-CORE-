import { describe, expect, it } from 'vitest';
import { activiteitPerDag } from './deskKpi';

describe('northsea desk activity', () => {
  it('telt per dag, vandaag achteraan, buiten het venster niet', () => {
    const nu = new Date(2026, 10, 25, 12).getTime();
    const op = (d: number, u = 10) => new Date(2026, 10, d, u).toISOString();
    const r = activiteitPerDag([
      { created_at: op(25) }, { created_at: op(25, 8) }, { created_at: op(24) }, { updated_at: op(12) },
      { created_at: op(11) }, { created_at: null }, { created_at: op(26) },
    ], nu);
    expect(r).toHaveLength(14);
    expect(r[13]).toBe(2);
    expect(r[12]).toBe(1);
    expect(r[0]).toBe(1);
    expect(r.reduce((a, b) => a + b, 0)).toBe(4);
  });
});
