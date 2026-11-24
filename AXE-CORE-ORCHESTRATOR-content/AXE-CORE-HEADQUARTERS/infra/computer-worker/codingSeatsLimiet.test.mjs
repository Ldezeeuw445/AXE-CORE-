// 24 nov live: "You've hit your session limit · resets 8:20am" bleef een vrije stoel.
import { describe, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isRealLimitMessage, parseLimitReset, noteerLimiet, collectSeats } from './codingSeats.mjs';

const CLAUDE = `{"is_error":true,"api_error_status":429,"result":"You've hit your session limit · resets 8:20am (Europe/Amsterdam)"}`;

describe('sessielimiet van Claude Code', () => {
  it('herkent de melding', () => {
    expect(isRealLimitMessage("You've hit your session limit · resets 8:20am")).toBe(true);
    expect(isRealLimitMessage('alles goed')).toBe(false);
  });

  it('leest "resets 8:20am" als het tijdstip', () => {
    const nu = new Date(2026, 10, 24, 7, 0).getTime();
    expect(parseLimitReset("You've hit your session limit · resets 8:20am", nu))
      .toBe(new Date(2026, 10, 24, 8, 20).getTime());
    expect(parseLimitReset('hit your limit · resets 5pm', nu))
      .toBe(new Date(2026, 10, 24, 17, 0).getTime());
  });

  it('een run met limiet maakt de stoel vol in de heartbeat', async () => {
    const home = mkdtempSync(join(tmpdir(), 'axe-lim-'));
    const nu = Date.now();
    const lim = noteerLimiet('claude3', CLAUDE, { home, now: nu });
    expect(lim.limit_message).toMatch(/session limit/);
    expect(lim.limit_until * 1000).toBeGreaterThan(nu);
    const rijen = await collectSeats({ home, env: {} });
    const s = rijen.find(r => r.seat_id === 'claude3');
    expect(s.rate_limited).toBe(true);
    expect(s.last_limit_message).toMatch(/session limit/);
  });

  it('gewone uitvoer verandert niets', () => {
    const home = mkdtempSync(join(tmpdir(), 'axe-lim-'));
    expect(noteerLimiet('claude', '{"result":"Test toegevoegd"}', { home })).toBeNull();
  });
});
