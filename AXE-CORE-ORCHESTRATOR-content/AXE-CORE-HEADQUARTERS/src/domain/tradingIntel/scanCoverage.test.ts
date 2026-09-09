import { describe, it, expect } from 'vitest';
import { accountsVoor, dekking, opDekkingGesorteerd, type Catalogi } from '@/domain/tradingIntel/scanCoverage';

/** De echte situatie van 9 september: vier MT5-accounts en één OANDA. */
const ECHT: Catalogi = new Map([
  ['mt5-100k', new Set(['XAUUSD', 'EURUSD', 'AUDUSD', 'DJ30'])],
  ['mt5-100k-r2', new Set(['XAUUSD', 'EURUSD', 'AUDUSD', 'DJ30'])],
  ['mt5-50k-r2', new Set(['XAUUSD', 'EURUSD', 'AUDUSD', 'DJ30'])],
  ['mt5-5k-r2', new Set(['XAUUSD', 'EURUSD', 'AUDUSD', 'DJ30'])],
  ['oanda-50k', new Set(['XAUUSD', 'EURUSD', 'NAS100', 'US30', 'US2000'])],
]);

describe('wie kan dit symbool verhandelen', () => {
  it('noemt de accounts en niet alleen een aantal', () => {
    expect(accountsVoor('NAS100', ECHT)).toEqual(['oanda-50k']);
  });

  it('telt goud bij alle vijf', () => {
    expect(dekking('XAUUSD', ECHT)).toBe(5);
  });

  it('telt de indices bij één', () => {
    // Dit is precies waarom een cyclus op US30 vier keer niets oplevert.
    expect(dekking('US30', ECHT)).toBe(1);
    expect(dekking('NAS100', ECHT)).toBe(1);
  });

  it('geeft nul voor iets wat niemand voert', () => {
    expect(dekking('BTCUSD', ECHT)).toBe(0);
  });
});

describe('de scanlijst op dekking', () => {
  it('zet breed gedragen paren vóór de indices', () => {
    const uit = opDekkingGesorteerd(['US30', 'NAS100', 'XAUUSD', 'DJ30', 'EURUSD'], ECHT);
    // XAUUSD en EURUSD staan bij 5, DJ30 bij 4, de twee indices bij 1.
    expect(uit.slice(0, 2).sort()).toEqual(['EURUSD', 'XAUUSD']);
    expect(uit[2]).toBe('DJ30');
    expect(uit.slice(3).sort()).toEqual(['NAS100', 'US30']);
  });

  it('laat symbolen vallen die geen enkel account voert', () => {
    // Kosten zonder mogelijke uitkomst: research, desk lanes en de trechter
    // draaien per symbool, vóór de uitwaaiering.
    expect(opDekkingGesorteerd(['BTCUSD', 'XAUUSD'], ECHT)).toEqual(['XAUUSD']);
  });

  it('houdt bij gelijke dekking de oorspronkelijke volgorde aan', () => {
    expect(opDekkingGesorteerd(['EURUSD', 'XAUUSD'], ECHT)).toEqual(['EURUSD', 'XAUUSD']);
    expect(opDekkingGesorteerd(['XAUUSD', 'EURUSD'], ECHT)).toEqual(['XAUUSD', 'EURUSD']);
  });

  it('laat de lijst met rust als geen enkele broker antwoordde', () => {
    // Niets weten is geen reden om de wereld van het algoritme leeg te maken.
    const leeg: Catalogi = new Map();
    expect(opDekkingGesorteerd(['US30', 'XAUUSD'], leeg)).toEqual(['US30', 'XAUUSD']);
  });
});
