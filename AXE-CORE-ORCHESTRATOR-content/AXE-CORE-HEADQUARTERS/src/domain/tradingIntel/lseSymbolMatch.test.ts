import { describe, it, expect } from 'vitest';
import { zoekLseSymbool } from '@/domain/tradingIntel/lseSymbolMatch';

/** Uit de echte catalogus, opgehaald 10 september 2026. */
const CATALOGUS = [
  { dataset: 'commodity', symbol: 'XAU/USD', name: 'Gold' },
  { dataset: 'commodity', symbol: 'XAG/USD', name: 'Silver' },
  { dataset: 'fx', symbol: 'EUR/USD' },
  { dataset: 'fx', symbol: 'GBP/USD' },
  { dataset: 'index', symbol: 'NAS100/USD' },
  { dataset: 'index', symbol: 'US30/USD' },
  { dataset: 'index', symbol: 'UK100/GBP' },
  { dataset: 'index', symbol: 'DE30/EUR' },
  { dataset: 'crypto', symbol: 'BTC/USD' },
  { dataset: 'options', symbol: 'SPY', name: 'SPY options' },
  { dataset: 'stocks', symbol: 'SPY', name: 'SPDR S&P 500' },
];

describe('AXE-symbool naar LSE', () => {
  it('vindt goud, dat anders heet en anders geschreven wordt', () => {
    expect(zoekLseSymbool('XAUUSD', CATALOGUS)).toEqual({ dataset: 'commodity', symbol: 'XAU/USD' });
  });

  it('vindt een valutapaar', () => {
    expect(zoekLseSymbool('EURUSD', CATALOGUS)).toEqual({ dataset: 'fx', symbol: 'EUR/USD' });
  });

  it('vindt een index, die bij LSE een munt achtervoegt', () => {
    // AXE zegt NAS100, LSE zegt NAS100/USD. Zonder de tweede ronde op het deel
    // voor de schuine streep vindt hij niets.
    expect(zoekLseSymbool('NAS100', CATALOGUS)).toEqual({ dataset: 'index', symbol: 'NAS100/USD' });
    expect(zoekLseSymbool('US30', CATALOGUS)).toEqual({ dataset: 'index', symbol: 'US30/USD' });
    expect(zoekLseSymbool('UK100', CATALOGUS)).toEqual({ dataset: 'index', symbol: 'UK100/GBP' });
  });

  it('kiest de koersdataset boven de optiedataset', () => {
    // SPY staat twee keer. Voor een koersgrafiek wil je het aandeel.
    expect(zoekLseSymbool('SPY', CATALOGUS)?.dataset).toBe('stocks');
  });

  it('raadt GEEN hernoemingen', () => {
    // GER40 heet bij LSE DE30/EUR. Dat is een andere naam, geen patroon. Een
    // gok die er plausibel uitziet geeft een grafiek van het verkeerde
    // instrument, en dat zie je niet aan de vorm.
    expect(zoekLseSymbool('GER40', CATALOGUS)).toBeNull();
  });

  it('geeft niets terug voor wat er niet is', () => {
    expect(zoekLseSymbool('ZZZZ', CATALOGUS)).toBeNull();
    expect(zoekLseSymbool('', CATALOGUS)).toBeNull();
  });
});
