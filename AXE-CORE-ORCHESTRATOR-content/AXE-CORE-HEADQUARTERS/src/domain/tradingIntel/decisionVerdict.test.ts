import { describe, it, expect } from 'vitest';
import { buildDecisionVerdict, withOutcome } from '@/domain/tradingIntel/decisionVerdict';

const ACC = { id: 'acc-12345678', environment: 'demo', live: true };
const SIZE = { lots: 0.5, riskPct: 0.01, riskAtStop: 98.4, stopDistance: 0.002, stopLoss: 1.08, takeProfit: 1.086, note: 'broker spec' };

describe('buildDecisionVerdict', () => {
  it('PASS met fill: uitvoering en trade-id komen mee', () => {
    const v = buildDecisionVerdict({
      symbol: 'EURUSD', action: 'buy', confidence: 0.72, confidenceFloor: 0.6,
      gates: [{ id: 'breaker', status: 'PASS', detail: 'ok' }],
      sizing: SIZE, account: ACC, autoExecute: true,
      placed: { ok: true, tradeId: 't-1', price: 1.0822 },
      intelText: 'STANCE: long\nDollar zwakker na de data.',
      companionText: 'Geen duidelijke kant.\nSTANCE: neutral',
    });
    expect(v.state).toBe('PASS');
    expect(v.blockReason).toBeNull();
    expect(v.execution).toMatchObject({ state: 'filled', tradeId: 't-1', price: 1.0822 });
    expect(v.contributions.intel).toEqual({ stance: 'long', summary: 'Dollar zwakker na de data.' });
    expect(v.contributions.companion.stance).toBe('neutral');
  });

  it('BLOCK noemt de reden, ook als die van de funnel komt', () => {
    const v = buildDecisionVerdict({
      symbol: 'XAUUSD', action: 'buy', confidence: 0.8, sizing: { ...SIZE, lots: 0 },
      account: ACC, autoExecute: true, blockReason: 'Funnel: dropped — R:R under 2',
    });
    expect(v.state).toBe('BLOCK');
    expect(v.blockReason).toBe('Funnel: dropped — R:R under 2');
    expect(v.execution.state).toBe('not-sent');
  });

  it('WAIT bij HOLD zonder blokkade; BLOCK bij HOLD met getripte breaker', () => {
    expect(buildDecisionVerdict({ symbol: 'X', action: 'hold', confidence: 0.3, account: ACC, autoExecute: true }).state).toBe('WAIT');
    const b = buildDecisionVerdict({ symbol: 'X', action: 'hold', confidence: 0, account: ACC, autoExecute: true, blockReason: 'Circuit breaker tripped' });
    expect(b.state).toBe('BLOCK');
    expect(b.blockReason).toBe('Circuit breaker tripped');
  });

  it('een door de broker afgewezen order is BLOCK, niet PASS', () => {
    const v = buildDecisionVerdict({
      symbol: 'EURUSD', action: 'sell', confidence: 0.7, sizing: SIZE, account: ACC, autoExecute: true,
      placed: { ok: false, error: 'Market closed' },
    });
    expect(v.state).toBe('BLOCK');
    expect(v.blockReason).toBe('Market closed');
    expect(v.execution.state).toBe('rejected');
  });

  it('PASS zonder autoExecute zegt dat er niets verstuurd is', () => {
    const v = buildDecisionVerdict({ symbol: 'EURUSD', action: 'buy', confidence: 0.7, sizing: SIZE, account: ACC, autoExecute: false });
    expect(v.state).toBe('PASS');
    expect(v.execution.state).toBe('autoexecute-off');
  });
});

describe('withOutcome', () => {
  const mk = (id: string, tradeId: string | null) => ({
    id,
    verdict: buildDecisionVerdict({
      symbol: 'EURUSD', action: 'buy', confidence: 0.7, sizing: SIZE, account: ACC, autoExecute: true,
      placed: tradeId ? { ok: true, tradeId, price: 1 } : null,
    }),
  });

  it('hangt de uitkomst aan het spoor met hetzelfde trade-id', () => {
    const next = withOutcome([mk('a', 't-1'), mk('b', 't-2')], 't-2', { pnl: -12.5, closedAt: '2026-09-22T10:00:00Z', exitReason: 'broker_close' });
    expect(next?.[1].verdict.outcome?.pnl).toBe(-12.5);
    expect(next?.[0].verdict.outcome).toBeUndefined();
  });

  it('verzint geen koppeling als geen spoor bij het id hoort', () => {
    expect(withOutcome([mk('a', 't-1')], 't-9', { pnl: 1, closedAt: 'x', exitReason: null })).toBeNull();
  });
});
