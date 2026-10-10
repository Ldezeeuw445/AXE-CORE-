import { describe, expect, it } from 'vitest';
import { createRealtimeUsageGuard, REALTIME_USAGE_KEY, type UsageStorage } from './realtimeUsageGuard';

function storage(): UsageStorage {
  const rows = new Map<string, string>();
  return { getItem: (k) => rows.get(k) ?? null, setItem: (k, v) => { rows.set(k, v); } };
}
const response = (id: string, tokens: number) => ({ id, usage: { total_tokens: tokens } });

describe('realtime kostenhek', () => {
  it('telt dubbel ontvangen antwoorden één keer en bewaart gebruik bij herstart', () => {
    const s = storage();
    const guard = createRealtimeUsageGuard(s);
    expect(guard.record(response('r1', 100))).toEqual({ dailyTokens: 100, sessionTokens: 100 });
    expect(guard.record(response('r1', 100))).toEqual({ dailyTokens: 100, sessionTokens: 100 });
    expect(createRealtimeUsageGuard(s).record(response('r2', 200)).dailyTokens).toBe(300);
  });
  it('stopt bij de sessiegrens en schrijft de laatste betaalde beurt wel weg', () => {
    const s = storage();
    const guard = createRealtimeUsageGuard(s);
    expect(() => guard.record(response('r1', 20_000))).toThrow(/session token limit/);
    expect(JSON.parse(s.getItem(REALTIME_USAGE_KEY)!).tokens).toBe(20_000);
  });
  it('weigert nieuwe sessies bij de daggrens, ook na herstart', () => {
    const s = storage();
    expect(() => createRealtimeUsageGuard(s).record(response('r1', 50_000))).toThrow(/Daily/);
    expect(() => createRealtimeUsageGuard(s)).toThrow(/Daily/);
  });
  it('stopt bij ontbrekende, negatieve of ongeldige usage', () => {
    const guard = createRealtimeUsageGuard(storage());
    for (const bad of [{ id: 'r' }, response('r', -1), response('r', NaN), response('r', 1.5)]) {
      expect(() => guard.record(bad)).toThrow(/usage is unavailable/);
    }
  });
  it('weigert sessies als opslag kapot of onbeschrijfbaar is', () => {
    const s = storage();
    s.setItem(REALTIME_USAGE_KEY, 'invalid');
    expect(() => createRealtimeUsageGuard(s)).toThrow();
    expect(() => createRealtimeUsageGuard({ getItem: () => null, setItem: () => { throw new Error('quota'); } })).toThrow('quota');
  });
  it('wisselt de dag om middernacht Amsterdam en behoudt de sessietelling', () => {
    let now = Date.parse('2026-10-09T21:59:59Z');
    const s = storage();
    const guard = createRealtimeUsageGuard(s, () => now);
    guard.record(response('r1', 100));
    now = Date.parse('2026-10-09T22:00:01Z');
    expect(guard.record(response('r2', 200))).toEqual({ dailyTokens: 200, sessionTokens: 300 });
  });
});
