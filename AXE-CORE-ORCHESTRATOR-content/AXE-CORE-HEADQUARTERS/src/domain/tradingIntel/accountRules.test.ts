import { describe, it, expect } from 'vitest';
import {
  evaluateAccountRules,
  insideSession,
  tradingDayKey,
  tradingDayStart,
  type AccountRiskSnapshot,
} from './accountRules';
import type { RiskProfile } from './botTypes';

const NOW = Date.parse('2026-09-22T14:00:00Z'); // dinsdag, 16:00 in Praag

const BASE: RiskProfile = {
  mode: 'custom', riskPerTradePct: 0.005, maxOpenRiskPct: 0, maxDailyLossPct: 0,
  maxTradesPerDay: 10, minConfidence: 0.6, allowShort: false, updatedAt: '',
};
const SNAP: AccountRiskSnapshot = {
  now: NOW, balance: 100_000, equity: 100_000, currency: 'USD',
  dayStartBalance: 100_000, peakEquity: 100_000, openPositions: [],
};
const ctx = (proposedRiskMoney: number | null = 200) => ({ symbol: 'EURUSD', proposedRiskMoney });
const byId = (checks: ReturnType<typeof evaluateAccountRules>, id: string) => checks.find(c => c.id === id);

describe('tijdzone van de handelsdag', () => {
  it('23:30 UTC is in Praag al de volgende dag', () => {
    const t = Date.parse('2026-09-22T23:30:00Z');
    expect(tradingDayKey(t, 'UTC')).toBe('2026-09-22');
    expect(tradingDayKey(t, 'Europe/Prague')).toBe('2026-09-23');
  });
  it('dagstart in Praag is 22:00 UTC de avond ervoor (zomertijd)', () => {
    expect(new Date(tradingDayStart(NOW, 'Europe/Prague')).toISOString()).toBe('2026-09-21T22:00:00.000Z');
    expect(new Date(tradingDayStart(NOW, 'UTC')).toISOString()).toBe('2026-09-22T00:00:00.000Z');
  });
  it('dagstart in New York in de winter is 05:00 UTC', () => {
    expect(new Date(tradingDayStart(Date.parse('2026-01-15T12:00:00Z'), 'America/New_York')).toISOString())
      .toBe('2026-01-15T05:00:00.000Z');
  });
});

describe('sessies', () => {
  it('binnen en buiten een venster, in de zone van het account', () => {
    expect(insideSession(NOW, [{ start: '08:00', end: '18:00' }], 'Europe/Prague')).toBe(true);
    expect(insideSession(NOW, [{ start: '08:00', end: '15:00' }], 'Europe/Prague')).toBe(false);
  });
  it('alleen op de genoemde weekdagen, en over middernacht', () => {
    expect(insideSession(NOW, [{ start: '00:00', end: '24:00', days: [1, 3] }], 'UTC')).toBe(false); // dinsdag = 2
    expect(insideSession(Date.parse('2026-09-23T01:00:00Z'), [{ start: '22:00', end: '02:00', days: [2] }], 'UTC')).toBe(true);
  });
});

describe('evaluateAccountRules', () => {
  it('een profiel zonder regelvelden legt niets op', () => {
    expect(evaluateAccountRules(BASE, SNAP, ctx())).toEqual([]);
  });

  it('dagverlies op dagstartsaldo, met zwevend verlies meegeteld', () => {
    const p = { ...BASE, maxDailyLossPct: 0.05 };
    expect(byId(evaluateAccountRules(p, { ...SNAP, equity: 95_000 }, ctx()), 'dailyLoss'))
      .toMatchObject({ status: 'BLOCK', breach: true });
    // Nog 300 ruimte, order riskeert 400.
    expect(byId(evaluateAccountRules(p, { ...SNAP, equity: 95_300 }, ctx(400)), 'dailyLoss'))
      .toMatchObject({ status: 'BLOCK', detail: expect.stringMatching(/exceeds remaining daily headroom 300\.00/) });
    expect(byId(evaluateAccountRules(p, { ...SNAP, equity: 95_300 }, ctx(200)), 'dailyLoss')?.status).toBe('PASS');
  });

  it('dagverlies op het startsaldo (FTMO-stijl) als het profiel dat zegt', () => {
    const p: RiskProfile = { ...BASE, maxDailyLossPct: 0.05, dailyLossBase: 'initialBalance', initialBalance: 50_000 };
    // Dagstart 100k, 3k verloren: boven 5% van 50k (2,5k), niet boven 5% van 100k.
    expect(byId(evaluateAccountRules(p, { ...SNAP, equity: 97_000 }, ctx()), 'dailyLoss')?.status).toBe('BLOCK');
  });

  it('statische drawdown meet vanaf het startsaldo, niet vanaf de piek', () => {
    const p: RiskProfile = { ...BASE, maxDrawdownPct: 0.1, drawdownType: 'static', initialBalance: 100_000 };
    // Piek 120k, nu 105k: trailing 12,5%, statisch nog 15k boven de vloer.
    expect(byId(evaluateAccountRules(p, { ...SNAP, equity: 105_000, peakEquity: 120_000 }, ctx()), 'totalDrawdown')?.status).toBe('PASS');
    expect(byId(evaluateAccountRules(p, { ...SNAP, equity: 90_000 }, ctx()), 'totalDrawdown')).toMatchObject({ status: 'BLOCK', breach: true });
    expect(byId(evaluateAccountRules(p, { ...SNAP, equity: 90_100 }, ctx(200)), 'totalDrawdown')).toMatchObject({ status: 'BLOCK' });
    expect(byId(evaluateAccountRules(p, { ...SNAP, equity: 90_100 }, ctx(200)), 'totalDrawdown')?.breach).toBeUndefined();
  });

  it('statisch zonder startsaldo: overgeslagen en gezegd waarom, niet stil geslaagd', () => {
    const p: RiskProfile = { ...BASE, maxDrawdownPct: 0.1, drawdownType: 'static' };
    expect(byId(evaluateAccountRules(p, SNAP, ctx()), 'totalDrawdown')).toMatchObject({ status: 'SKIP' });
  });

  it('open risico: een positie zonder stop maakt het onbegrensd', () => {
    const p = { ...BASE, maxOpenRiskPct: 0.02 };
    const snap = { ...SNAP, openPositions: [{ symbol: 'XAUUSD', riskMoney: null }] };
    expect(byId(evaluateAccountRules(p, snap, ctx()), 'openRisk')?.detail).toMatch(/XAUUSD\) — open risk is unbounded/);
    const ok = { ...SNAP, openPositions: [{ symbol: 'XAUUSD', riskMoney: 1700 }] };
    expect(byId(evaluateAccountRules(p, ok, ctx(300)), 'openRisk')?.status).toBe('PASS');
    expect(byId(evaluateAccountRules(p, ok, ctx(301)), 'openRisk')?.status).toBe('BLOCK');
  });

  it('max gelijktijdige posities', () => {
    const p = { ...BASE, maxConcurrentPositions: 2 };
    const two = { ...SNAP, openPositions: [{ symbol: 'A', riskMoney: 1 }, { symbol: 'B', riskMoney: 1 }] };
    expect(byId(evaluateAccountRules(p, two, ctx()), 'maxPositions')?.status).toBe('BLOCK');
  });

  it('dagwinstdoel sluit de dag, winstdoel stopt pas na de minimum handelsdagen', () => {
    const daily = { ...BASE, dailyProfitTargetPct: 0.01 };
    expect(byId(evaluateAccountRules(daily, { ...SNAP, equity: 101_000 }, ctx()), 'dailyTarget')?.status).toBe('BLOCK');

    const target: RiskProfile = { ...BASE, mode: 'funded_challenge', profitTargetPct: 0.1, initialBalance: 100_000, minTradingDays: 4 };
    const hit = { ...SNAP, equity: 110_500, dayStartBalance: 110_000 };
    expect(byId(evaluateAccountRules(target, { ...hit, tradingDays: 3 }, ctx()), 'profitTarget'))
      .toMatchObject({ status: 'PASS', detail: expect.stringMatching(/3 of 4 minimum trading days/) });
    expect(byId(evaluateAccountRules(target, { ...hit, tradingDays: 4 }, ctx()), 'profitTarget')?.status).toBe('BLOCK');
    expect(byId(evaluateAccountRules({ ...target, profitTargetAction: 'continue' }, { ...hit, tradingDays: 4 }, ctx()), 'profitTarget')?.status).toBe('PASS');
  });

  it('consistentie: vandaag mag niet meer dan X% van de totale winst zijn', () => {
    const p: RiskProfile = { ...BASE, consistencyPct: 0.3, initialBalance: 100_000, profitTargetPct: 0.1 };
    const today = tradingDayKey(NOW, 'UTC');
    const history = new Map([['2026-09-18', 6_000], ['2026-09-21', 4_000], [today, 99_999]]); // vandaag uit de map telt niet dubbel
    // Totaal = 10k eerder + 3,5k vandaag = 13,5k; cap = 30% × max(13,5k, 10k doel) = 4,05k.
    expect(byId(evaluateAccountRules(p, { ...SNAP, equity: 103_500, dayStartBalance: 100_000, dailyClosedPnl: history }, ctx()), 'consistency')?.status).toBe('PASS');
    expect(byId(evaluateAccountRules(p, { ...SNAP, equity: 104_500, dayStartBalance: 100_000, dailyClosedPnl: history }, ctx()), 'consistency')?.status).toBe('BLOCK');
    expect(byId(evaluateAccountRules(p, SNAP, ctx()), 'consistency')?.status).toBe('SKIP');
  });

  it('nieuws: alleen blokkeren als de kalender ja zegt, niet bij onbekend', () => {
    const p: RiskProfile = { ...BASE, newsRestriction: 'high_impact_day' };
    expect(byId(evaluateAccountRules(p, SNAP, { ...ctx(), highImpactToday: true }), 'news')?.status).toBe('BLOCK');
    expect(byId(evaluateAccountRules(p, SNAP, { ...ctx(), highImpactToday: null }), 'news')?.status).toBe('SKIP');
  });
});
