import { describe, expect, it } from 'vitest';
import { marktVoorSymbool, prijsTekst, quoteVanMarkt } from './phoneQuotes';
import type { LockscreenMarket } from '@/infrastructure/gateways/axeCoreApiService';

const goud: LockscreenMarket = {
  symbol: 'XAUUSD',
  label: 'XAU/USD',
  price: 4181.1,
  chg: { '1D': { abs: 12, pct: 0.29 } },
};

describe('phoneQuotes', () => {
  it('koppelt XAUUSD aan de lockscreen-goudkaart', () => {
    expect(marktVoorSymbool([goud], 'XAUUSD')?.price).toBe(4181.1);
    const q = quoteVanMarkt('XAUUSD', goud);
    expect(q.last).toBe(4181.1);
    expect(q.changePct).toBeCloseTo(0.29);
    expect(prijsTekst(q.last!)).toBe('4,181.10');
  });

  it('weigeren een synthetic goudprijs rond 100', () => {
    const nep: LockscreenMarket = { symbol: 'XAUUSD', label: 'XAU/USD', price: 106.22 };
    expect(quoteVanMarkt('XAUUSD', nep).last).toBeUndefined();
  });
});
