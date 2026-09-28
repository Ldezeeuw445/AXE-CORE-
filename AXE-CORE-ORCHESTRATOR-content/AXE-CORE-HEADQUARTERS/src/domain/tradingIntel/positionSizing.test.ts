import { describe, it, expect } from 'vitest';
import { floorToStep, openPositionRiskMoney, sizeLotsForRisk, type InstrumentSpec } from './positionSizing';

const EURUSD: InstrumentSpec = {
  symbol: 'EURUSD', tickSize: 0.00001, lossTickValue: 1, contractSize: 100_000,
  minVolume: 0.01, maxVolume: 100, volumeStep: 0.01, source: 'broker',
};
const XAUUSD: InstrumentSpec = {
  symbol: 'XAUUSD', tickSize: 0.01, lossTickValue: 1, contractSize: 100,
  minVolume: 0.01, maxVolume: 50, volumeStep: 0.01, source: 'broker',
};
// Een EUR-account op USDJPY: tickwaarde in EUR, zoals de broker hem omrekent.
const USDJPY_EUR: InstrumentSpec = {
  symbol: 'USDJPY', tickSize: 0.001, lossTickValue: 0.62, contractSize: 100_000,
  minVolume: 0.01, maxVolume: 100, volumeStep: 0.01, accountCurrency: 'EUR', source: 'broker',
};

describe('sizeLotsForRisk — risk % is geld bij de stop', () => {
  it('0,5% van 100k met 20 pips stop op EURUSD is 2,5 lot ($500 bij de stop)', () => {
    const r = sizeLotsForRisk({ riskBudget: 500, entry: 1.1, stop: 1.098, spec: EURUSD });
    expect(r.lots).toBe(2.5);
    expect(r.riskAtStop).toBeCloseTo(500, 6);
  });

  it('dezelfde euro’s risico op goud met $15 stop is 0,33 lot, naar beneden afgerond', () => {
    const r = sizeLotsForRisk({ riskBudget: 500, entry: 2400, stop: 2385, spec: XAUUSD });
    expect(r.lots).toBe(0.33);
    expect(r.riskAtStop).toBeLessThanOrEqual(500);
  });

  it('rekent in de accountvaluta via de tickwaarde van de broker', () => {
    // 50 pips = 50 000 × 0,001 … = 500 ticks × €0,62 = €310 per lot → €1000 is 3,22 lot.
    const r = sizeLotsForRisk({ riskBudget: 1000, entry: 150, stop: 149.5, spec: USDJPY_EUR });
    expect(r.lots).toBe(3.22);
    expect(r.riskAtStop).toBeCloseTo(3.22 * 310, 6);
  });

  it('rondt nooit omhoog naar het minimum lot: dan weigert hij', () => {
    const r = sizeLotsForRisk({ riskBudget: 5, entry: 2400, stop: 2300, spec: XAUUSD });
    expect(r.lots).toBe(0);
    expect(r.refused).toMatch(/minimum 0\.01 lot would risk 100\.00/);
  });

  it('weigert zonder stopafstand of zonder tickwaarde', () => {
    expect(sizeLotsForRisk({ riskBudget: 500, entry: 1.1, stop: 1.1, spec: EURUSD }).refused).toMatch(/no stop distance/);
    expect(sizeLotsForRisk({ riskBudget: 500, entry: 1.1, stop: 1.09, spec: { ...EURUSD, lossTickValue: 0 } }).refused).toMatch(/tick value/);
  });

  it('respecteert de maximale lotgrootte van de broker', () => {
    expect(sizeLotsForRisk({ riskBudget: 1e9, entry: 1.1, stop: 1.099, spec: EURUSD }).lots).toBe(100);
  });

  it('volumestap 0,1 (indices) rondt op tienden af', () => {
    expect(floorToStep(1.29, 0.1)).toBe(1.2);
    expect(floorToStep(0.3, 0.1)).toBe(0.3);
    expect(floorToStep(2.5, 0.01)).toBe(2.5);
  });
});

describe('openPositionRiskMoney', () => {
  it('long: verlies tot de stop; short: gespiegeld', () => {
    expect(openPositionRiskMoney({ side: 'buy', volume: 1, openPrice: 2400, stopLoss: 2390, spec: XAUUSD })).toBeCloseTo(1000);
    expect(openPositionRiskMoney({ side: 'sell', volume: 0.5, openPrice: 2400, stopLoss: 2410, spec: XAUUSD })).toBeCloseTo(500);
  });
  it('geen stop = onbegrensd (null); stop in de winst = 0', () => {
    expect(openPositionRiskMoney({ side: 'buy', volume: 1, openPrice: 2400, stopLoss: null, spec: XAUUSD })).toBeNull();
    expect(openPositionRiskMoney({ side: 'buy', volume: 1, openPrice: 2400, stopLoss: 2410, spec: XAUUSD })).toBe(0);
  });
});
