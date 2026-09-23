/**
 * De echte motor (runTradingAgent), van beslissing tot metaApiMarketOrder:
 * risk/trade is geld bij de stop, en de accountregels houden een opening tegen.
 *
 * Echt: tradingAgentEngine, preTradeGate, accountRules, positionSizing,
 * brokerConnector, accountRiskSnapshot, circuit breaker, risicoprofiel.
 * Vervangen: MetaAPI, koersen, opslag, geheugen/journaal — de buitenrand.
 * Er gaat niets naar een echte broker; metaApiMarketOrder is een vi.fn().
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mem = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => { mem.set(k, v); },
  removeItem: (k: string) => { mem.delete(k); },
});

const ACCOUNT = { token: 'tok', accountId: 'acct-A', region: 'london' as const, enabled: true, updatedAt: '' };

const h = vi.hoisted(() => ({
  settings: new Map<string, unknown>(),
  equity: 100_000,
  balance: 100_000,
  positions: [] as Array<Record<string, unknown>>,
  deals: [] as Array<Record<string, unknown>>,
  env: 'demo' as 'demo' | 'live',
  outcomes: [] as Array<Record<string, unknown>>,
}));

vi.mock('@/infrastructure/persistence/userSettingsService', () => ({
  loadSetting: vi.fn(async (k: string, fb: unknown) => (h.settings.has(k) ? h.settings.get(k) : fb)),
  saveSetting: vi.fn(async (k: string, v: unknown) => { h.settings.set(k, v); }),
}));

vi.mock('@/infrastructure/gateways/metaApiService', () => ({
  getMetaApiConfig: vi.fn(async () => ACCOUNT),
  metaApiGetAccount: vi.fn(),
  metaApiMarketOrder: vi.fn(async () => ({ ok: true, orderId: 'ord-1' })),
  metaApiPendingOrder: vi.fn(),
  metaApiAccountInfoFor: vi.fn(async () => ({ ok: true, info: { equity: h.equity, balance: h.balance, currency: 'USD' } })),
  metaApiPositionsFor: vi.fn(async () => ({ ok: true, positions: h.positions })),
  metaApiGetHistoryDealsFor: vi.fn(async () => ({ ok: true, deals: h.deals })),
  metaApiInstrumentSpecFor: vi.fn(async (_c: unknown, symbol: string) => ({
    ok: true,
    spec: { symbol, brokerSymbol: symbol, tickSize: 0.01, lossTickValue: 1, contractSize: 100, minVolume: 0.01, maxVolume: 50, volumeStep: 0.01 },
  })),
  metaApiClosePositionFor: vi.fn(async () => ({ ok: true })),
  qtyToLots: vi.fn(() => { throw new Error('qtyToLots must not size an agent order any more'); }),
  toMt5Symbol: vi.fn((s: string) => s.toUpperCase()),
}));

vi.mock('@/infrastructure/gateways/marketDataService', async (orig) => {
  const real = await orig<typeof import('@/infrastructure/gateways/marketDataService')>();
  // 60 uurbars goud rond 2400, elk 10 hoog: ATR14 = 10 → stop 15 onder de instap.
  const bars = Array.from({ length: 60 }, (_, i) => ({ t: Date.now() - (60 - i) * 3_600_000, o: 2400, h: 2405, l: 2395, c: 2400, v: 100 }));
  const snap = { symbol: 'XAUUSD', last: 2400, bars, source: 'metaapi', changePct: 0 };
  return { ...real, fetchTradeableSnapshot: vi.fn(async () => snap), fetchMarketSnapshot: vi.fn(async () => snap) };
});

vi.mock('@/infrastructure/persistence/demoTradingService', () => ({
  executeDemoTrade: vi.fn(async () => ({ trade: { id: 'mirror-1' } })),
  getDemoAccount: vi.fn(async () => ({ cash: 0, positions: [], trades: [] })),
  markPositions: vi.fn(async () => ({})),
}));
vi.mock('@/infrastructure/persistence/tradingIntelService', () => ({ listIntelReports: vi.fn(async () => []) }));
vi.mock('@/infrastructure/persistence/tradingAgentMemoryService', () => ({
  buildTradingAgentContextWithEpisode: vi.fn(async () => ({ context: '', episodeId: null })),
  rememberLesson: vi.fn(), rememberOpenThesis: vi.fn(), rememberTradeDecision: vi.fn(),
}));
vi.mock('@/infrastructure/persistence/tradingAgentBrain', () => ({
  recordTrade: vi.fn(), recordIntelSnapshot: vi.fn(), recordThesis: vi.fn(), recordMistake: vi.fn(),
}));
vi.mock('@/infrastructure/persistence/tradingLearningService', async (orig) => {
  const real = await orig<typeof import('@/infrastructure/persistence/tradingLearningService')>();
  return {
    // Het echte learnedKnobsFor: het beleid per account is wat hier getest wordt.
    learnedKnobsFor: real.learnedKnobsFor,
    getLearningStats: vi.fn(async () => ({ tradesClosed: 0, wins: 0, losses: 0, winRate: 0, learnedMinConfidence: 0.5, aggressiveness: 0, recentOutcomes: h.outcomes, updatedAt: '' })),
    saveThinkingTrace: vi.fn(),
  };
});
vi.mock('@/infrastructure/persistence/tradingLedgerService', () => ({
  getLedgerEntry: vi.fn(async () => null), DEFAULT_RUN: 'run-1',
}));
vi.mock('@/application/tradingIntel/runDecisionFunnel', () => ({ loadLastFunnelRun: vi.fn(async () => null) }));
vi.mock('@/infrastructure/persistence/tradingAccountsService', () => ({
  getAccounts: vi.fn(async () => ({ accounts: [{ id: 'r', label: 'A', token: 'tok', accountId: 'acct-A', region: 'london', enabled: true, addedAt: '' }], activeId: 'r' })),
  accountLabel: vi.fn(async (id: string) => id),
  accountEnvironment: vi.fn(async () => ({ env: h.env, source: 'configured' })),
}));
vi.mock('@/infrastructure/gateways/researchSources', () => ({ fetchEconomicReleases: vi.fn(async () => []) }));

import { runTradingAgent } from './tradingAgentEngine';
import { saveRiskProfile } from '@/infrastructure/persistence/tradingRiskService';
import { __resetPlacedToday } from '@/infrastructure/gateways/brokerConnector';
import * as meta from '@/infrastructure/gateways/metaApiService';
import type { RiskProfile } from '@/domain/tradingIntel/botTypes';

const PROFILE: RiskProfile = {
  mode: 'funded_challenge', riskPerTradePct: 0.005, maxOpenRiskPct: 0.02, maxDailyLossPct: 0.04,
  maxTradesPerDay: 10, minConfidence: 0.5, allowShort: false, maxDrawdownPct: 0.1, updatedAt: '',
};

const run = () => runTradingAgent({
  symbol: 'XAUUSD', autoExecute: true, account: ACCOUNT, run: 'run-1',
  strategySignalOverride: 'buy', strategyName: 'vbt:macd', timeframe: 'h1',
});

beforeEach(async () => {
  vi.clearAllMocks();
  h.settings.clear(); mem.clear();
  h.equity = 100_000; h.balance = 100_000; h.positions = []; h.deals = [];
  h.env = 'demo'; h.outcomes = [];
  __resetPlacedToday();
  await saveRiskProfile(PROFILE, 'acct-A');
});

describe('runTradingAgent — sizing op de stop', () => {
  it('0,5% van 100k = $500 bij de stop: 0,33 lot goud met de stop 15 onder de instap', async () => {
    const res = await run();
    expect(res.blockedByRisk).toBeUndefined();
    expect(meta.metaApiMarketOrder).toHaveBeenCalledTimes(1);
    const order = vi.mocked(meta.metaApiMarketOrder).mock.calls[0][0];
    expect(order.volume).toBe(0.33);
    expect(order.stopLoss).toBeCloseTo(2385, 6);
    // Echt verlies bij de stop: 1500 ticks × $1 × 0,33 lot.
    const lossAtStop = ((2400 - order.stopLoss!) / 0.01) * 1 * order.volume;
    expect(lossAtStop).toBeLessThanOrEqual(500);
    expect(lossAtStop).toBeGreaterThan(490);
    const sizing = res.trace.steps.find(s => s.title === 'Position sizing');
    expect(sizing?.detail).toMatch(/risk budget 500\.00 .* → 0\.33 lots · 495\.00 lost at stop/);
  });

  it('dubbele equity, dubbele lots — en niet begrensd op één lot', async () => {
    h.equity = 1_000_000; h.balance = 1_000_000;
    await run();
    expect(vi.mocked(meta.metaApiMarketOrder).mock.calls[0][0].volume).toBe(3.33);
  });

  it('dagverlies bereikt: de motor opent niets en zegt waarom', async () => {
    h.deals = [{ type: 'DEAL_TYPE_SELL', entryType: 'DEAL_ENTRY_OUT', symbol: 'EURUSD', time: new Date().toISOString(), profit: -4200 }];
    const res = await run();
    expect(meta.metaApiMarketOrder).not.toHaveBeenCalled();
    expect(res.blockedByRisk).toMatch(/Daily loss 4200\.00 USD reached the 4% limit/);
    expect(res.trace.steps.some(s => s.title === 'Account rules blocked')).toBe(true);
  });

  it('open risico: een open positie zonder stop houdt nieuwe openingen tegen', async () => {
    h.positions = [{ symbol: 'EURUSD', type: 'POSITION_TYPE_BUY', volume: 1, openPrice: 1.1, stopLoss: null }];
    const res = await run();
    expect(meta.metaApiMarketOrder).not.toHaveBeenCalled();
    expect(res.blockedByRisk).toMatch(/Open position without a stop \(EURUSD\)/);
  });

  it('sizingBase=initialBalance sized op het startsaldo, niet op de gegroeide equity', async () => {
    await saveRiskProfile({ ...PROFILE, sizingBase: 'initialBalance', initialBalance: 50_000 }, 'acct-A');
    await run();
    // 0,5% van 50k = 250 → 250/1500 = 0,1666 → 0,16 lot.
    expect(vi.mocked(meta.metaApiMarketOrder).mock.calls[0][0].volume).toBe(0.16);
  });

  it('statische drawdown: een daling vanaf de piek laat de trailing breaker NIET klappen', async () => {
    await saveRiskProfile({ ...PROFILE, drawdownType: 'static', initialBalance: 100_000 }, 'acct-A');
    h.equity = 120_000; h.balance = 120_000;
    await run();                       // piek 120k vastgelegd
    vi.clearAllMocks();
    h.equity = 105_000; h.balance = 105_000; // 12,5% onder de piek, 5% boven de statische vloer van 90k
    const res = await run();
    expect(res.blockedByRisk).toBeUndefined();
    expect(meta.metaApiMarketOrder).toHaveBeenCalledTimes(1);
  });

  it('trailing (standaard) klapt wel bij 12,5% onder de piek', async () => {
    h.equity = 120_000; h.balance = 120_000;
    await run();
    vi.clearAllMocks();
    h.equity = 105_000; h.balance = 105_000;
    const res = await run();
    expect(res.blockedByRisk).toMatch(/Equity drawdown 12\.5% from peak/);
    expect(meta.metaApiMarketOrder).not.toHaveBeenCalled();
  });

  it('demo-uitkomsten sturen de vertrouwensvloer van een live/funded account niet', async () => {
    // 20 demo-verliezen: op een demo-account stijgt de geleerde vloer naar 73%,
    // en een beslissing met 61% vertrouwen wordt tegengehouden. Voor een live
    // account telt geen enkele van die uitkomsten: neutrale vloer, en hij handelt.
    h.outcomes = Array.from({ length: 20 }, () => ({ pnl: -1, win: false, symbol: 'XAUUSD', closedAt: '', environment: 'demo' }));
    await saveRiskProfile({ ...PROFILE, minConfidence: 0.55 }, 'acct-A');

    const demo = await run();
    expect(demo.blockedByRisk).toMatch(/Confidence 61% < floor 73%/);
    expect(meta.metaApiMarketOrder).not.toHaveBeenCalled();

    vi.clearAllMocks();
    h.env = 'live';
    const live = await run();
    expect(live.trace.steps.find(s => s.title === 'Evidence')?.detail)
      .toMatch(/account environment live \(configured\) · using live\/funded evidence only · learned floor 58% from 0 outcome/);
    expect(live.blockedByRisk).toBeUndefined();
    expect(meta.metaApiMarketOrder).toHaveBeenCalledTimes(1);
  });

  it('een SELL tegen een open long sluit die long per id — geen markt-SELL die op hedging een short opent', async () => {
    h.positions = [{ id: 'pos-7', symbol: 'XAUUSD', type: 'POSITION_TYPE_BUY', volume: 0.5, openPrice: 2390, stopLoss: 2380 }];
    const res = await runTradingAgent({
      symbol: 'XAUUSD', autoExecute: true, account: ACCOUNT, run: 'run-1',
      strategySignalOverride: 'sell', strategyName: 'vbt:macd', timeframe: 'h1',
    });
    expect(res.decision.action).toBe('sell');
    expect(meta.metaApiClosePositionFor).toHaveBeenCalledWith(expect.objectContaining({ accountId: 'acct-A' }), 'pos-7');
    expect(meta.metaApiMarketOrder).not.toHaveBeenCalled();
  });
});
