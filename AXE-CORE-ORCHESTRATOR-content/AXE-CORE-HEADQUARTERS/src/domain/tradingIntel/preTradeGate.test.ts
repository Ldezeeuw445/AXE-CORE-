import { describe, it, expect } from 'vitest';
import {
  CLEARANCE_TTL_MS,
  evaluatePreTradeGate,
  verifyClearance,
  type PreTradeGateInput,
} from './preTradeGate';

const OPEN: PreTradeGateInput = {
  origin: 'manual',
  symbol: 'xauusd',
  side: 'buy',
  accountId: 'acct-A',
  mode: 'funded_challenge',
  account: { known: true, available: true },
  breaker: { tripped: false },
  dayLimit: { tradesToday: 2, unverified: false, max: 8 },
  allowShort: false,
  longPositionQty: 0,
};

describe('evaluatePreTradeGate', () => {
  it('laat een order door als elke harde grens groen is, met een toelating', () => {
    const v = evaluatePreTradeGate(OPEN, 1000);
    expect(v.allowed).toBe(true);
    expect(v.clearance).toMatchObject({ symbol: 'XAUUSD', side: 'buy', accountId: 'acct-A', issuedAt: 1000 });
    expect(v.checks.map(c => c.status)).toEqual(['PASS', 'PASS', 'PASS', 'SKIP', 'SKIP']);
  });

  it('blokkeert op een geklapte breaker (en dus na de kill switch)', () => {
    const v = evaluatePreTradeGate({ ...OPEN, breaker: { tripped: true, reason: 'Manual kill switch' } });
    expect(v).toMatchObject({ allowed: false, blockedBy: 'breaker', reason: 'Manual kill switch' });
    expect(v.clearance).toBeUndefined();
  });

  it('blokkeert op een vol dagmaximum en op een onleesbare broker-telling', () => {
    expect(evaluatePreTradeGate({ ...OPEN, dayLimit: { tradesToday: 8, unverified: false, max: 8 } }))
      .toMatchObject({ allowed: false, blockedBy: 'dayLimit', reason: 'Max trades/day (8) [funded_challenge]' });
    expect(evaluatePreTradeGate({ ...OPEN, dayLimit: { tradesToday: 0, unverified: true, max: 8 } }))
      .toMatchObject({ allowed: false, blockedBy: 'dayLimit' });
  });

  it('blokkeert een short als shorts uit staan, maar niet een sell tegen een long', () => {
    expect(evaluatePreTradeGate({ ...OPEN, side: 'sell' })).toMatchObject({ allowed: false, blockedBy: 'allowShort' });
    expect(evaluatePreTradeGate({ ...OPEN, side: 'sell', longPositionQty: 0.5 }).allowed).toBe(true);
    expect(evaluatePreTradeGate({ ...OPEN, side: 'sell', allowShort: true }).allowed).toBe(true);
  });

  it('blokkeert een onbekend of onleesbaar account', () => {
    expect(evaluatePreTradeGate({ ...OPEN, account: { known: false, available: true } }).blockedBy).toBe('account');
    expect(evaluatePreTradeGate({ ...OPEN, account: { known: true, available: false, unavailableReason: 'quota' } }))
      .toMatchObject({ blockedBy: 'account', reason: 'quota — refusing to trade blind' });
  });

  it('past de vertrouwensvloer alleen toe als de motor hem meegeeft', () => {
    const agent = { ...OPEN, origin: 'agent' as const, confidence: { value: 0.5, floor: 0.58 } };
    expect(evaluatePreTradeGate(agent)).toMatchObject({ allowed: false, reason: 'Confidence 50% < floor 58%' });
    expect(evaluatePreTradeGate(OPEN).checks.find(c => c.id === 'confidence')?.status).toBe('SKIP');
  });

  it('noemt de breaker als reden wanneer ook de dag vol is — zelfde volgorde als de motor had', () => {
    const v = evaluatePreTradeGate({
      ...OPEN,
      breaker: { tripped: true, reason: 'DD' },
      dayLimit: { tradesToday: 9, unverified: false, max: 8 },
    });
    expect(v.blockedBy).toBe('breaker');
  });
});

describe('verifyClearance', () => {
  const clearance = evaluatePreTradeGate(OPEN, 10_000).clearance!;
  const order = { symbol: 'XAUUSD', side: 'buy' as const, accountId: 'acct-A' };

  it('accepteert precies de order waarvoor hij is uitgegeven', () => {
    expect(verifyClearance(clearance, order, 10_500)).toEqual({ ok: true });
  });

  it('weigert zonder toelating, of met een omzeild type', () => {
    expect(verifyClearance(undefined, order).ok).toBe(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(verifyClearance({} as any, order).ok).toBe(false);
  });

  it('weigert hergebruik voor een ander symbool, een andere kant of een ander account', () => {
    expect(verifyClearance(clearance, { ...order, symbol: 'EURUSD' }, 10_500).ok).toBe(false);
    expect(verifyClearance(clearance, { ...order, side: 'sell' }, 10_500).ok).toBe(false);
    expect(verifyClearance(clearance, { ...order, accountId: 'acct-B' }, 10_500).ok).toBe(false);
  });

  it('weigert een verlopen toelating', () => {
    expect(verifyClearance(clearance, order, 10_000 + CLEARANCE_TTL_MS + 1).ok).toBe(false);
  });
});
