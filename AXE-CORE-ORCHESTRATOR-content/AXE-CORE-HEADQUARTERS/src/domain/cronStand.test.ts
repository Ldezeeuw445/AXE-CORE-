import { describe, expect, it } from 'vitest';
import { cronStand, overHoeLang, type CronRij } from './cronStand';

const nu = Date.parse('2026-11-23T12:00:00Z');
const rij = (p: Partial<CronRij>): CronRij => ({
  id: p.name ?? 'x', name: 'x', enabled: true, next_run_at: null, last_status: 'ok', ...p,
});

describe('cronStand', () => {
  it('telt actief en gepauzeerd, zet de vaakst falende bovenaan', () => {
    const s = cronStand([
      rij({ name: 'a', last_status: 'fail', consecutive_failures: 1 }),
      rij({ name: 'b', last_status: 'timeout', consecutive_failures: 5 }),
      rij({ name: 'c', enabled: false, last_status: 'fail' }),
      rij({ name: 'd' }),
    ], nu);
    expect(s.actief).toBe(3);
    expect(s.gepauzeerd).toBe(1);
    expect(s.fout.map((r) => r.name)).toEqual(['b', 'a']);
  });

  it('kiest de eerstvolgende actieve run, niet een gepauzeerde of verlopen', () => {
    const s = cronStand([
      rij({ name: 'later', next_run_at: '2026-11-23T14:00:00Z' }),
      rij({ name: 'eerst', next_run_at: '2026-11-23T12:05:00Z' }),
      rij({ name: 'uit', enabled: false, next_run_at: '2026-11-23T12:01:00Z' }),
      rij({ name: 'oud', next_run_at: '2026-11-22T12:00:00Z' }),
    ], nu);
    expect(s.volgende?.name).toBe('eerst');
  });

  it('zegt hoe lang nog', () => {
    expect(overHoeLang('2026-11-23T12:04:00Z', nu)).toBe('in 4 min');
    expect(overHoeLang('2026-11-23T15:00:00Z', nu)).toBe('in 3 h');
    expect(overHoeLang('2026-11-23T11:00:00Z', nu)).toBe('now');
    expect(overHoeLang(null, nu)).toBe('—');
  });
});
