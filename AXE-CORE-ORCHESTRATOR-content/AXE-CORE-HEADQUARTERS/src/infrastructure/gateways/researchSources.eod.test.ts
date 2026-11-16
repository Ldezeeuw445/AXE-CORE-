/**
 * Daily bars from EODHD: why they can be empty, and that a day's answer is kept.
 * Measured 2026-11-16: only the first five Trading Team cycles of each UTC day had bars.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const store = vi.hoisted(() => new Map<string, unknown>());
vi.mock('@/infrastructure/persistence/durableConfigService', () => ({
  loadDurableConfig: async (k: string, d: unknown) => (store.has(k) ? store.get(k) : d),
  saveDurableConfig: async (k: string, v: unknown) => { store.set(k, v); },
}));

import { classifyEodHttp, fetchEodHistoryChecked, EODHD_DAILY_CAP } from './researchSources';

const okBars = [
  { date: '2026-11-12', open: 1.1, high: 1.11, low: 1.09, close: 1.105 },
  { date: '2026-11-13', open: 1.105, high: 1.12, low: 1.1, close: 1.11 },
];
const jsonRes = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body }) as Response;

beforeEach(() => { store.clear(); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('classifyEodHttp', () => {
  it('tells the allowance apart from the key and from an outage', () => {
    expect(classifyEodHttp(402).code).toBe('quota');
    expect(classifyEodHttp(429).code).toBe('quota');
    expect(classifyEodHttp(401).code).toBe('auth');
    expect(classifyEodHttp(403).code).toBe('auth');
    expect(classifyEodHttp(502).code).toBe('http');
  });
});

describe('fetchEodHistoryChecked', () => {
  it('says there is no key rather than returning a silent empty list', async () => {
    const r = await fetchEodHistoryChecked('EURUSD', '2026-09-01');
    expect(r.bars).toEqual([]);
    expect(r.problem?.code).toBe('no_key');
  });

  it('says there is no ticker for an unknown pair', async () => {
    store.set('research_sources', { eodhd: 'k' });
    const r = await fetchEodHistoryChecked('NOPEPAIR', '2026-09-01');
    expect(r.problem?.code).toBe('no_ticker');
  });
});

describe('fetchEodHistoryChecked with a key', () => {
  beforeEach(() => {
    store.set('research_sources', { eodhd: 'test-key' });
  });

  it('reports a spent plan as quota and never puts the key in the message', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonRes({}, 402)));
    const r = await fetchEodHistoryChecked('EURUSD', '2026-09-01');
    expect(r.problem?.code).toBe('quota');
    expect(JSON.stringify(r)).not.toContain('test-key');
  });

  it('reports a thrown fetch as network without the URL', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('fetch failed https://eodhd.com/api/eod/X?api_token=test-key'); }));
    const r = await fetchEodHistoryChecked('EURUSD', '2026-09-01');
    expect(r.problem?.code).toBe('network');
    expect(JSON.stringify(r)).not.toContain('test-key');
  });

  it('asks once per ticker per day and serves the rest from the day cache', async () => {
    const fetchMock = vi.fn(async () => jsonRes(okBars));
    vi.stubGlobal('fetch', fetchMock);
    const first = await fetchEodHistoryChecked('EURUSD', '2026-09-01');
    expect(first.bars).toHaveLength(2);
    expect(first.fromCache).toBe(false);
    const second = await fetchEodHistoryChecked('EURUSD', '2026-09-01');
    expect(second.fromCache).toBe(true);
    expect(second.bars).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('stops asking once the shared daily budget is spent and says so', async () => {
    const fetchMock = vi.fn(async () => jsonRes([]));
    vi.stubGlobal('fetch', fetchMock);
    let last = await fetchEodHistoryChecked('EURUSD', '2026-09-01');
    for (let i = 0; i < EODHD_DAILY_CAP + 3; i++) last = await fetchEodHistoryChecked('EURUSD', '2026-09-01');
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(EODHD_DAILY_CAP);
    expect(last.problem?.code).toBe('budget_spent');
  });
});
