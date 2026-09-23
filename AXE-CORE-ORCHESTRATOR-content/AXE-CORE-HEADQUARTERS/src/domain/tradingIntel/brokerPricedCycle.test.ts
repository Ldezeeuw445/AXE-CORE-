import { describe, it, expect } from 'vitest';
import { isSubstituteFeed, magDureCyclus } from './brokerPricedCycle';

describe('isSubstituteFeed', () => {
  it('herkent de voedingen van de live weigering (23 sep)', () => {
    // Exact de sources uit het cyclusjournaal: lse en binance:BTCUSDT.
    expect(isSubstituteFeed('lse')).toBe(true);
    expect(isSubstituteFeed('binance:BTCUSDT')).toBe(true);
    expect(isSubstituteFeed('binance')).toBe(true);
    expect(isSubstituteFeed('synthetic')).toBe(true);
    expect(isSubstituteFeed('stooq')).toBe(true);
  });

  it('laat alleen de vullende rekening door', () => {
    expect(isSubstituteFeed('metaapi')).toBe(false);
  });
});

describe('magDureCyclus', () => {
  it('stopt vóór research als er geen brokerprijs is', () => {
    // Oude gedrag: LSE-snapshot telt als "we hebben een prijs", research
    // draait, execution vraagt een fill, assertTradeable weigert te laat.
    expect(magDureCyclus({ source: 'lse' })).toBe(false);
    expect(magDureCyclus({ source: 'binance:BTCUSDT' })).toBe(false);
    expect(magDureCyclus({ source: 'synthetic' })).toBe(false);
    expect(magDureCyclus(null)).toBe(false);
  });

  it('laat een paar door dat de rekening zelf prijst', () => {
    expect(magDureCyclus({ source: 'metaapi' })).toBe(true);
  });
});
