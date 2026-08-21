/**
 * The registry decides which instrument an order lands in, so the case that
 * matters most is the one where it resolves to the WRONG thing rather than to
 * nothing.
 */
import { describe, it, expect } from 'vitest';
import { resolvePairTicker, tradablePairsFor, pairSpec, allPairIds } from './pairRegistry';

describe('resolvePairTicker', () => {
  it('prefers the canonical name over an alias when the broker lists both', () => {
    // A broker carrying XAUUSD and GOLD must give AXE the one it asked for.
    expect(resolvePairTicker('XAUUSD', ['GOLD', 'XAUUSD', 'GOLD.pro'])).toBe('XAUUSD');
  });

  it('finds the instrument behind a broker suffix', () => {
    expect(resolvePairTicker('XAUUSD', ['XAUUSD.c'])).toBe('XAUUSD.c');
    expect(resolvePairTicker('EURUSD', ['EURUSDm'])).toBe('EURUSDm');
    expect(resolvePairTicker('US30', ['US30_CFD'])).toBe('US30_CFD');
  });

  it('finds gold when the broker only calls it GOLD.pro', () => {
    // The real account that started this: gold listed under no XAUUSD variant.
    expect(resolvePairTicker('XAUUSD', ['GOLD.pro', 'EURUSD'])).toBe('GOLD.pro');
  });

  it('NEVER matches an alias inside a longer ticker', () => {
    // The bug being replaced: `includes('GOLD')` against 12.524 US equity
    // tickers also matches GOLDMAN. That is not a missed trade, it is an
    // order in the wrong instrument.
    expect(resolvePairTicker('XAUUSD', ['GOLDMAN', 'GOLDCORP', 'GOLDMAN_CFD.US'])).toBeNull();
    expect(resolvePairTicker('WTIUSD', ['OILSTATES', 'CRUDEX_CFD.US'])).toBeNull();
    expect(resolvePairTicker('US500', ['SPXCORP'])).toBeNull();
  });

  it('returns null when the broker genuinely does not carry it', () => {
    // Measured: MetaQuotes-Demo has no crypto, OANDA has no gold.
    expect(resolvePairTicker('BTCUSD', ['XAUUSD', 'US30', 'EURUSD'])).toBeNull();
    expect(resolvePairTicker('XAUUSD', ['BTCUSD', 'ETHUSD', 'EURUSD'])).toBeNull();
  });

  it('does not mistake one FX pair for another', () => {
    expect(resolvePairTicker('EURUSD', ['EURUSDT'])).toBeNull();
    expect(resolvePairTicker('USDJPY', ['USDJPYX_SOMETHING'])).toBeNull();
  });
});

describe('tradablePairsFor', () => {
  it('splits the two real brokers the way they actually split', () => {
    const mt5 = ['XAUUSD', 'XAGUSD', 'US30', 'US500', 'UK100', 'EURUSD', 'GBPUSD', 'USDJPY'];
    const oanda = ['BTCUSD', 'ETHUSD', 'EURUSD', 'GBPUSD', 'USDJPY'];

    const onMt5 = tradablePairsFor(mt5);
    const onOanda = tradablePairsFor(oanda);

    expect(onMt5).toContain('XAUUSD');
    expect(onMt5).not.toContain('BTCUSD');
    expect(onOanda).toContain('BTCUSD');
    expect(onOanda).not.toContain('XAUUSD');
    // FX majors are the overlap — the algo can trade those on both.
    expect(onMt5).toContain('EURUSD');
    expect(onOanda).toContain('EURUSD');
  });

  it('reports nothing tradable for a catalogue of unrelated equities', () => {
    expect(tradablePairsFor(['AAPL', 'MSFT', 'GOLDMAN', 'A', 'AA'])).toEqual([]);
  });
});

describe('the registry itself', () => {
  it('has no duplicate ids', () => {
    const ids = allPairIds();
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('never lists its own canonical id as an alias', () => {
    // A self-alias is dead weight and hides which name is authoritative.
    for (const id of allPairIds()) {
      expect(pairSpec(id)!.aliases.map(a => a.toUpperCase())).not.toContain(id);
    }
  });
});
