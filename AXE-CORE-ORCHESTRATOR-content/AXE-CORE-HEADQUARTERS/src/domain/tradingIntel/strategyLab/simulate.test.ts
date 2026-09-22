/**
 * De accountsimulator op synthetische candles, waar elk getal met de hand na te
 * rekenen is: bars van 2395–2405 geven ATR 10, dus stop 15 en doel 22,5 (1,5R).
 * Goud: tick 0,01, $1 per tick per lot.
 */
import { describe, it, expect } from 'vitest';
import { simulateAccount, type LabBar, type LabConfig } from './simulate';
import { estimateInstrument } from './instrumentEstimate';
import type { RiskProfile } from '@/domain/tradingIntel/botTypes';

const GOLD = estimateInstrument('XAUUSD');
const T0 = Date.parse('2026-03-02T00:00:00Z'); // maandag

function flat(n: number, start = 0): LabBar[] {
  return Array.from({ length: n }, (_, k) => ({
    time: new Date(T0 + (start + k) * 3_600_000).toISOString(), open: 2400, high: 2405, low: 2395, close: 2400,
  }));
}
function bar(i: number, o: number, h: number, l: number, c: number): LabBar {
  return { time: new Date(T0 + i * 3_600_000).toISOString(), open: o, high: h, low: l, close: c };
}

const BASE: LabConfig = {
  startingBalance: 100_000,
  sizing: { mode: 'fixed', lots: 1 },
  instrument: GOLD,
  costs: { spread: 0, commissionPerLot: 0, slippage: 0 },
  warmupBars: 20,
};

/** Signaal alleen op de genoemde bars. */
const at = (map: Record<number, 'buy' | 'sell'>) => (i: number) => map[i] ?? 'hold';

describe('fills en brackets', () => {
  it('signaal op bar 30 vult op de open van bar 31; doel 22,5 hoger = +$2250 per lot', () => {
    const bars = flat(40);
    bars[33] = bar(33, 2400, 2423, 2399, 2420);
    const run = simulateAccount(bars, at({ 30: 'buy' }), BASE);
    expect(run.trades).toHaveLength(1);
    const t = run.trades[0];
    expect(t).toMatchObject({ signalIndex: 30, entryIndex: 31, exitIndex: 33, entryPrice: 2400, exitReason: 'target' });
    expect(t.stopLoss).toBeCloseTo(2385, 9);
    expect(t.takeProfit).toBeCloseTo(2422.5, 9);
    expect(t.pnl).toBeCloseTo(2250, 6);
    expect(t.rMultiple).toBeCloseTo(1.5, 6);
    expect(run.metrics.endingBalance).toBeCloseTo(102_250, 6);
  });

  it('stop én doel in dezelfde bar: de stop telt (pessimistisch)', () => {
    const bars = flat(40);
    bars[33] = bar(33, 2400, 2430, 2380, 2400);
    const t = simulateAccount(bars, at({ 30: 'buy' }), BASE).trades[0];
    expect(t.exitReason).toBe('stop');
    expect(t.pnl).toBeCloseTo(-1500, 6);
  });

  it('een gat onder de stop vult op de open, niet op de stop', () => {
    const bars = flat(40);
    bars[33] = bar(33, 2370, 2372, 2360, 2365);
    const t = simulateAccount(bars, at({ 30: 'buy' }), BASE).trades[0];
    expect(t.exitPrice).toBe(2370);
    expect(t.pnl).toBeCloseTo(-3000, 6);
  });

  it('short: ask = bid + spread, ook voor de stop', () => {
    const bars = flat(40);
    bars[33] = bar(33, 2400, 2414.6, 2399, 2405); // ask high = 2414.6 + 0.5 ≥ stop 2415? nee
    bars[34] = bar(34, 2405, 2414.6, 2400, 2405);
    const cfg = { ...BASE, costs: { spread: 0.5, commissionPerLot: 0, slippage: 0 } };
    const run = simulateAccount(bars, at({ 30: 'sell' }), cfg);
    // stop = 2400 + 15 = 2415 (van de slotkoers); ask high 2415.1 raakt hem op bar 33.
    expect(run.trades[0]).toMatchObject({ side: 'sell', exitReason: 'stop', exitIndex: 33 });
  });
});

describe('kosten', () => {
  it('spread, slippage en commissie tellen allemaal, exact', () => {
    const bars = flat(40);
    bars[33] = bar(33, 2400, 2423, 2399, 2420);
    const cfg = { ...BASE, costs: { spread: 0.3, commissionPerLot: 3.5, slippage: 0.1 } };
    const t = simulateAccount(bars, at({ 30: 'buy' }), cfg).trades[0];
    // Instap 2400 + 0,3 + 0,1 = 2400,4; doel 2422,5 → +22,1 = 2210 − 7 commissie.
    expect(t.entryPrice).toBeCloseTo(2400.4, 9);
    expect(t.pnl).toBeCloseTo(2210 - 7, 6);
  });
});

describe('sizing', () => {
  it('risico-% = geld bij de stop: 1% van 100k met 15 stop = 0,66 lot, verlies ≈ $990', () => {
    const bars = flat(40);
    bars[33] = bar(33, 2400, 2401, 2380, 2390);
    const cfg: LabConfig = { ...BASE, sizing: { mode: 'risk', riskPct: 0.01 } };
    const t = simulateAccount(bars, at({ 30: 'buy' }), cfg).trades[0];
    expect(t.lots).toBe(0.66);
    expect(t.riskAtEntry).toBeCloseTo(990, 6);
    expect(t.pnl).toBeCloseTo(-990, 6);
  });

  it('vaste lots en risico-% geven een ander resultaat op dezelfde candles', () => {
    const bars = flat(40);
    bars[33] = bar(33, 2400, 2401, 2380, 2390);
    const fixed = simulateAccount(bars, at({ 30: 'buy' }), BASE).metrics.netProfit;
    const risk = simulateAccount(bars, at({ 30: 'buy' }), { ...BASE, sizing: { mode: 'risk', riskPct: 0.01 } }).metrics.netProfit;
    expect(fixed).toBeCloseTo(-1500, 6);
    expect(risk).toBeCloseTo(-990, 6);
  });
});

describe('limieten', () => {
  it('max gelijktijdige posities en max trades per dag blokkeren en worden geteld', () => {
    const bars = flat(80);
    const sig = at({ 30: 'buy', 31: 'buy', 32: 'buy', 50: 'buy', 60: 'buy' });
    const one = simulateAccount(bars, sig, { ...BASE, maxConcurrent: 2, rewardRisk: null, exitOnOppositeSignal: false });
    expect(one.trades.length).toBe(2);
    expect(one.metrics.blockedByRule.maxConcurrent).toBe(3);
    const perDay = simulateAccount(bars, at({ 30: 'buy', 40: 'sell' }), { ...BASE, maxTradesPerDay: 1, rewardRisk: null });
    expect(perDay.metrics.blockedByRule.maxTradesPerDay).toBe(1);
  });

  it('shorts uit = geen short', () => {
    const run = simulateAccount(flat(40), at({ 30: 'sell' }), { ...BASE, allowShort: false });
    expect(run.trades).toHaveLength(0);
    expect(run.metrics.blockedByRule.allowShort).toBe(1);
  });
});

describe('geen blik vooruit', () => {
  it('een simulatie op de eerste k bars geeft precies de trades die in de volledige run vóór k sloten', () => {
    const bars = flat(200);
    for (let i = 40; i < 200; i++) {
      const drift = Math.sin(i / 7) * 30;
      bars[i] = bar(i, 2400 + drift, 2410 + drift, 2390 + drift, 2400 + drift + Math.cos(i) * 3);
    }
    const sig = (i: number) => (i % 11 === 0 ? 'buy' : i % 13 === 0 ? 'sell' : 'hold') as 'buy' | 'sell' | 'hold';
    const full = simulateAccount(bars, sig, { ...BASE, sizing: { mode: 'risk', riskPct: 0.01 } });
    const k = 120;
    const prefix = simulateAccount(bars.slice(0, k), sig, { ...BASE, sizing: { mode: 'risk', riskPct: 0.01 } });
    const closedBefore = full.trades.filter(t => t.exitIndex < k - 1);
    expect(prefix.trades.slice(0, closedBefore.length)).toEqual(closedBefore);
    expect(closedBefore.length).toBeGreaterThan(3);
  });
});

describe('accountregels en funded-bewaking (dezelfde regels als live)', () => {
  const FUNDED: RiskProfile = {
    mode: 'funded_challenge', riskPerTradePct: 0.01, maxOpenRiskPct: 0.05, maxDailyLossPct: 0.05,
    maxTradesPerDay: 10, minConfidence: 0.5, allowShort: true, maxDrawdownPct: 0.1, drawdownType: 'static',
    initialBalance: 100_000, profitTargetPct: 0.08, updatedAt: '',
  };

  it('een dagverlies breekt de challenge op de exacte bar en stopt het handelen', () => {
    const bars = flat(60);
    // 3 lots, $4500 risico — past in de $5000 dagruimte. Bar 33 opent met een gat
    // op 2382, onder de stop: vulling op de open, -18 × 300 = -$5400 ≥ 5%.
    bars[33] = bar(33, 2382, 2383, 2380, 2381);
    const run = simulateAccount(bars, at({ 30: 'buy', 45: 'buy' }), { ...BASE, sizing: { mode: 'fixed', lots: 3 }, profile: { ...FUNDED, maxOpenRiskPct: 1 } });
    expect(run.funded?.status).toBe('BREACHED');
    expect(run.funded?.event).toMatchObject({ rule: 'dailyLoss', index: 33, time: bars[33].time, tradeId: 1 });
    expect(run.funded?.event?.equity).toBeCloseTo(100_000 - 5400, 6);
    expect(run.funded?.event?.balance).toBeCloseTo(100_000 - 5400, 6);
    expect(run.trades).toHaveLength(1); // het signaal op 45 wordt niet meer uitgevoerd
  });

  it('de pre-trade regel weigert een order die de dagruimte zou overschrijden', () => {
    // 4 lots × 15 stop = $6000 risico > 5% = $5000 ruimte.
    const run = simulateAccount(flat(40), at({ 30: 'buy' }), { ...BASE, sizing: { mode: 'fixed', lots: 4 }, profile: { ...FUNDED, maxOpenRiskPct: 1 } });
    expect(run.trades).toHaveLength(0);
    expect(run.metrics.blockedByRule.dailyLoss).toBe(1);
  });

  it('winstdoel met minimum handelsdagen: pas PASSED als beide gehaald zijn', () => {
    const bars = flat(24 * 5);
    // Twee grote winsttrades op dag 2 en dag 3.
    bars[33] = bar(33, 2400, 2500, 2399, 2490);
    bars[57] = bar(57, 2400, 2500, 2399, 2490);
    const sig = at({ 30: 'buy', 54: 'buy' });
    const profile = { ...FUNDED, maxOpenRiskPct: 1, maxDailyLossPct: 0.5, minTradingDays: 2, profitTargetPct: 0.05 };
    const cfg = { ...BASE, sizing: { mode: 'fixed' as const, lots: 2.5 }, rewardRisk: 3 };
    const run = simulateAccount(bars, sig, { ...cfg, profile });
    expect(run.events.find(e => e.kind === 'target')?.detail).toMatch(/1\/2 trading days/);
    // Het doel is na dag 1 al gehaald (bar 33) maar telt niet: 1 van 2 dagen.
    // De tweede trade opent op dag 3 (bar 55): tweede handelsdag, doel nog steeds
    // boven de lat — daar is de challenge gehaald, en daarna wordt niet meer gehandeld.
    expect(run.funded).toMatchObject({ status: 'PASS', event: { rule: 'profitTarget', index: 55 } });
    expect(run.events.find(e => e.kind === 'target')?.drawdownPct).toBe(0);
  });
});

describe('funded-simulator: bekende synthetische doorbraken, exact', () => {
  const RULES: RiskProfile = {
    mode: 'funded_challenge', riskPerTradePct: 0.01, maxOpenRiskPct: 1, maxDailyLossPct: 0.5,
    maxTradesPerDay: 50, minConfidence: 0.5, allowShort: true, maxDrawdownPct: 0.06, drawdownType: 'static',
    initialBalance: 100_000, updatedAt: '',
  };
  const cfg = (profile: RiskProfile, lots = 2): LabConfig => ({ ...BASE, sizing: { mode: 'fixed', lots }, profile });

  it('statische drawdown: een geplande stop mag de vloer niet raken — de pre-trade regel weigert', () => {
    const bars = flat(80);
    bars[33] = bar(33, 2400, 2401, 2380, 2385); // −3000 → 97 000
    // Trade 2 zou met zijn stop op precies 94 000 = de vloer uitkomen: geweigerd.
    const run = simulateAccount(bars, at({ 30: 'buy', 40: 'buy' }), cfg(RULES));
    expect(run.trades).toHaveLength(1);
    expect(run.metrics.blockedByRule.totalDrawdown).toBe(1);
    expect(run.funded?.status).toBe('ACTIVE');
  });

  it('statische drawdown: een gat door de stop breekt, op de exacte bar, met trade, equity en saldo', () => {
    const bars = flat(80);
    bars[33] = bar(33, 2400, 2401, 2380, 2385);   // trade 1, 2 lots: −15 × 200 = −3000 → 97 000
    bars[43] = bar(43, 2378, 2379, 2370, 2372);   // trade 2 gapt door zijn stop: open 2378
    const profile = { ...RULES, maxDrawdownPct: 0.065 }; // vloer 93 500
    // Trade 2 past: 97 000 − 3000 = 94 000 ≥ 93 500. Het gat: −22 × 200 = −4400 → 92 600.
    const run = simulateAccount(bars, at({ 30: 'buy', 40: 'buy' }), cfg(profile));
    expect(run.funded).toMatchObject({ status: 'BREACHED', event: { rule: 'totalDrawdown', index: 43, tradeId: 2, time: bars[43].time } });
    expect(run.funded?.event?.equity).toBeCloseTo(92_600, 6);
    expect(run.funded?.event?.balance).toBeCloseTo(92_600, 6);
    expect(run.funded?.event?.detail).toMatch(/Static drawdown: equity 92600\.00 at or below 93500\.00/);
  });

  it('trailing drawdown meet vanaf de piek, niet vanaf het startsaldo', () => {
    const bars = flat(80);
    bars[33] = bar(33, 2400, 2423, 2399, 2420);   // +4500 (2 lots × 22,5) → piek 104 500
    bars[43] = bar(43, 2400, 2401, 2380, 2385);   // −3000 → 101 500
    bars[53] = bar(53, 2400, 2401, 2380, 2385);   // −3000 → 98 500 ≤ 104 500 × 0,94 = 98 230? nee
    bars[63] = bar(63, 2400, 2401, 2380, 2385);   // −3000 → 95 500 ≤ 98 230: breuk
    const trailing = { ...RULES, drawdownType: 'trailing' as const };
    const run = simulateAccount(bars, at({ 30: 'buy', 40: 'buy', 50: 'buy', 60: 'buy' }), cfg(trailing));
    // Bar 33 (range 24) verbreedt de ATR, dus de stops van trade 2 en 3 liggen verder
    // dan 15: −3621,43 en −3450. Na trade 3 is de equity 97 428,57 ≤ 104 500 × 0,94
    // = 98 230 — breuk op bar 53, trade #3. Trade 4 wordt niet meer geopend.
    expect(run.funded).toMatchObject({ status: 'BREACHED', event: { rule: 'totalDrawdown', index: 53, tradeId: 3 } });
    expect(run.funded?.event?.equity).toBeCloseTo(97_428.571428, 4);
    expect(run.trades).toHaveLength(3);
    // Statisch zou dezelfde reeks niet breken (95 500 > 94 000).
    expect(simulateAccount(bars, at({ 30: 'buy', 40: 'buy', 50: 'buy', 60: 'buy' }), cfg(RULES)).funded?.status).toBe('ACTIVE');
  });

  it('consistentie: doel gehaald met één enorme dag telt niet als PASS', () => {
    const bars = flat(24 * 4);
    bars[33] = bar(33, 2400, 2500, 2399, 2490); // één dag, alles
    const profile = { ...RULES, maxDrawdownPct: 0.5, profitTargetPct: 0.05, consistencyPct: 0.4 };
    const run = simulateAccount(bars, at({ 30: 'buy' }), { ...BASE, sizing: { mode: 'fixed', lots: 2.5 }, rewardRisk: 3, profile });
    expect(run.funded?.status).toBe('ACTIVE');
    expect(run.events.find(e => e.kind === 'target')?.detail).toMatch(/consistency best day 100\.0% > 40%/);
  });

  it('long-only profiel: shorts worden nooit geopend', () => {
    const run = simulateAccount(flat(60), at({ 30: 'sell', 40: 'sell' }), cfg({ ...RULES, allowShort: false }));
    expect(run.trades).toHaveLength(0);
    expect(run.metrics.blockedByRule.allowShort).toBe(2);
  });
});
