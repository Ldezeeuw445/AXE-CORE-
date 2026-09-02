import { describe, it, expect, vi, beforeEach } from 'vitest';

const remember = vi.fn();
vi.mock('@/infrastructure/gateways/axonMemoryService', () => ({
  axonRemember: (...a: unknown[]) => remember(...a),
}));

import { pushCycleToAxon, axonKey } from './axonMemoryBridge';
import { emptyCycle, type CycleRecord } from '@/domain/tradingIntel/cycleJournal';

const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, v); },
});

const withFill = (orderId: string): CycleRecord => ({
  ...emptyCycle('XAUUSD', '2026-08-27T10:00:00.000Z'),
  finalists: ['XAUUSD'],
  accounts: [{ accountId: 'a1', label: 'OANDA DEMO 50K', action: 'buy', confidence: 0.7, orderId, refusedBecause: null }],
});

const connect = (key: string) => store.set('axe_llm_connections', JSON.stringify({ axon: { key } }));

beforeEach(() => { store.clear(); remember.mockReset(); });

describe('axonKey', () => {
  it('reads the key from the Settings card', () => {
    connect('  axon_live_abcd1234  ');
    expect(axonKey()).toBe('axon_live_abcd1234');
  });

  it('is empty when nothing is connected, and survives a corrupt store', () => {
    expect(axonKey()).toBe('');
    store.set('axe_llm_connections', 'not json');
    expect(axonKey()).toBe('');
  });
});

describe('pushCycleToAxon', () => {
  it('sends nothing, and reports nothing, for an ordinary cycle', async () => {
    connect('axon_live_abcd1234');
    expect(await pushCycleToAxon(emptyCycle('XAUUSD'))).toEqual({ sent: 0, skipped: null });
    expect(remember).not.toHaveBeenCalled();
  });

  it('sends a fill', async () => {
    connect('axon_live_abcd1234');
    remember.mockResolvedValue({ ok: true });
    expect(await pushCycleToAxon(withFill('77123'))).toEqual({ sent: 1, skipped: null });
    expect(remember.mock.calls[0][0].content).toContain('77123');
  });

  it('does not send the same fill again when the cycle is re-saved', async () => {
    connect('axon_live_abcd1234');
    remember.mockResolvedValue({ ok: true });
    await pushCycleToAxon(withFill('77123'));
    remember.mockClear();
    expect(await pushCycleToAxon(withFill('77123'))).toEqual({ sent: 0, skipped: null });
    expect(remember).not.toHaveBeenCalled();
  });

  it('keeps a failed write eligible, so one outage does not lose the memory', async () => {
    connect('axon_live_abcd1234');
    remember.mockResolvedValue({ ok: false, error: 'down' });
    expect(await pushCycleToAxon(withFill('77123'))).toEqual({ sent: 0, skipped: 'AXON refused every write' });
    remember.mockResolvedValue({ ok: true });
    expect((await pushCycleToAxon(withFill('77123'))).sent).toBe(1);
  });

  it('says why it skipped when no key is connected, without calling out', async () => {
    expect(await pushCycleToAxon(withFill('77123'))).toEqual({ sent: 0, skipped: 'no AXON key connected' });
    expect(remember).not.toHaveBeenCalled();
  });

  it('does not mark anything sent when there is no key, so it goes once connected', async () => {
    await pushCycleToAxon(withFill('77123'));
    connect('axon_live_abcd1234');
    remember.mockResolvedValue({ ok: true });
    expect((await pushCycleToAxon(withFill('77123'))).sent).toBe(1);
  });
});
