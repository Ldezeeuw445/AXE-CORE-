import { describe, it, expect } from 'vitest';
import {
  DEFAULT_LIVE_FRAMEWORKS, STRATEGY_CAPABILITIES, evaluateEligibility, selectLiveStrategy, type EligibilityContext,
} from './frameworkEligibility';
import { STRATEGY_COLORS } from './strategyColors';

const OK: EligibilityContext = {
  asset: 'metal', timeframe: 'h1', engineHealthy: true,
  sample: { backtestTrades: 120, liveTrades: 0 },
  account: { liveFrameworks: ['axe', 'vbt', 'nt', 'kr', 'ta'] },
};

describe('registry', () => {
  it('kent elke strategie die een kleur heeft, en niets meer', () => {
    expect(STRATEGY_CAPABILITIES.map(c => c.id).sort()).toEqual(Object.keys(STRATEGY_COLORS).sort());
  });
  it('negentien geïmplementeerd, drie placeholders', () => {
    expect(STRATEGY_CAPABILITIES.filter(c => c.implemented)).toHaveLength(19);
    expect(STRATEGY_CAPABILITIES.filter(c => c.kind === 'placeholder').map(c => c.id))
      .toEqual(['pa:impulse-pullback', 'pa:bos-retest', 'pa:liquidity-sweep']);
  });
});

describe('evaluateEligibility', () => {
  it('standaard alleen AXE en vectorbt — geen gedragsverandering zonder keuze', () => {
    expect(DEFAULT_LIVE_FRAMEWORKS).toEqual(['axe', 'vbt']);
    const def = { ...OK, account: {} };
    expect(evaluateEligibility('ifvg', def).eligible).toBe(true);
    expect(evaluateEligibility('vbt:macd', def).eligible).toBe(true);
    expect(evaluateEligibility('nt:atr-breakout', def).reasons).toContain('nt not enabled for live on this account');
  });

  it('Nautilus wordt geschikt als het account het toestaat, de engine er is en de steekproef genoeg is', () => {
    expect(evaluateEligibility('nt:atr-breakout', OK)).toMatchObject({ eligible: true, kind: 'rule' });
    expect(evaluateEligibility('nt:atr-breakout', { ...OK, engineHealthy: false }).reasons[0]).toMatch(/not installed/);
    expect(evaluateEligibility('nt:atr-breakout', { ...OK, engineHealthy: null }).reasons[0]).toMatch(/health unknown/);
    expect(evaluateEligibility('nt:atr-breakout', { ...OK, sample: { backtestTrades: 12, liveTrades: 2 } }).reasons[0]).toMatch(/sample too small/);
    expect(evaluateEligibility('nt:atr-breakout', { ...OK, sample: { backtestTrades: 0, liveTrades: 5 } }).eligible).toBe(true);
  });

  it('Kronos is een forecaster en alleen op h1', () => {
    const kr = evaluateEligibility('kr:forecast', OK);
    expect(kr).toMatchObject({ eligible: true, kind: 'forecast' });
    expect(kr.warnings.join()).toMatch(/forecaster/);
    expect(evaluateEligibility('kr:forecast', { ...OK, timeframe: 'm15' }).reasons).toContain('forecaster built for h1, not m15');
  });

  it('TradingAgents alleen op d1, en buiten aandelen alleen met expliciete toestemming', () => {
    const d1 = { ...OK, timeframe: 'd1' };
    expect(evaluateEligibility('ta:debate', d1).reasons).toContain('partial coverage for metal — not allowed on this account');
    const allowed = evaluateEligibility('ta:debate', { ...d1, account: { ...d1.account, allowPartialCoverage: true } });
    expect(allowed.eligible).toBe(true);
    expect(allowed.warnings.join()).toMatch(/partial coverage/);
    expect(evaluateEligibility('ta:debate', { ...OK, timeframe: 'h1' }).eligible).toBe(false);
  });

  it('Price Action is een placeholder en nooit geschikt', () => {
    const pa = evaluateEligibility('pa:bos-retest', { ...OK, account: { liveFrameworks: ['pa'] } });
    expect(pa.eligible).toBe(false);
    expect(pa.reasons[0]).toBe('placeholder — not implemented');
  });

  it('vectorbt blijft meedoen als de gezondheid onbekend is (zoals altijd), niet als hij aantoonbaar ontbreekt', () => {
    expect(evaluateEligibility('vbt:macd', { ...OK, engineHealthy: null }).eligible).toBe(true);
    expect(evaluateEligibility('vbt:macd', { ...OK, engineHealthy: false }).eligible).toBe(false);
  });

  it('crew-hybrid is geen live kandidaat', () => {
    expect(evaluateEligibility('crew-hybrid', OK).reasons).toContain('no live signal');
  });
});

describe('selectLiveStrategy — de echte keuze', () => {
  const ranked = [
    { strategy: 'nt:atr-breakout', timeframe: 'h4', score: 0.004, tested: true, stats: { trades: 0, backtest: { trades: 80 } } },
    { strategy: 'kr:forecast', timeframe: 'm15', score: 0.003, tested: true, stats: { trades: 0, backtest: { trades: 40 } } },
    { strategy: 'vbt:macd', timeframe: 'h1', score: 0.002, tested: true, stats: { trades: 3, backtest: { trades: 60 } } },
    { strategy: 'ifvg', timeframe: 'h1', score: 0.001, tested: true, stats: { trades: 9, backtest: { trades: 50 } } },
  ];
  const health = { vbt: true, nt: true, kr: true, ta: false };

  it('zonder opt-in: de beste van AXE/vectorbt, en zegt waarom Nautilus niet meedeed', () => {
    const pick = selectLiveStrategy({ ranked, asset: 'metal', health, account: {}, evidenceLabel: 'all evidence' })!;
    expect(pick.strategy).toBe('vbt:macd');
    expect(pick.selection).toMatch(/not eligible: nt:atr-breakout@h4: nt not enabled for live on this account/);
  });

  it('met opt-in: de Nautilus-strategie die al bovenaan stond wordt gekozen', () => {
    const pick = selectLiveStrategy({ ranked, asset: 'metal', health, account: { liveFrameworks: ['axe', 'vbt', 'nt', 'kr'] }, evidenceLabel: 'all evidence' })!;
    expect(pick).toMatchObject({ strategy: 'nt:atr-breakout', timeframe: 'h4' });
    expect(pick.selection).toMatch(/kr:forecast@m15: forecaster built for h1, not m15/);
  });

  it('niets geschikt = null, zodat de terugval eerlijk "fallback" zegt', () => {
    expect(selectLiveStrategy({ ranked: ranked.slice(0, 2), asset: 'metal', health, account: {}, evidenceLabel: 'x' })).toBeNull();
  });
});
