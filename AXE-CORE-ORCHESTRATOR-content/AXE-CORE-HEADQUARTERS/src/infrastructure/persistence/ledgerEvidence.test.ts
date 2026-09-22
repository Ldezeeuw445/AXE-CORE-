/**
 * Papier en demo kunnen een live/funded account niet laten kiezen.
 *
 * Echt: tradingLedgerService (opslaan, lezen, ranken) en evidence.ts. Alleen de
 * opslag (global_memory) is een Map. Zo wordt precies de ranking getest die
 * agentAutopilot.strategyForSymbol gebruikt.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const store = vi.hoisted(() => new Map<string, { key: string; value: string; updated_at: string }>());
vi.mock('@/infrastructure/persistence/globalMemoryService', () => ({
  saveGlobalMemory: vi.fn(async (row: { key: string; value: string }) => {
    store.set(row.key, { key: row.key, value: row.value, updated_at: new Date().toISOString() });
  }),
  loadGlobalMemories: vi.fn(async () => [...store.values()]),
}));
vi.mock('@/infrastructure/persistence/chatPersistence', () => ({ AXE_USER_ID: 'u' }));

import {
  countersFor, legacyCounters, rankStrategiesForPair, recordLedgerTrade, getLedgerEntry, ledgerKey,
  type LedgerEntry,
} from './tradingLedgerService';
import { ALL_EVIDENCE, evidencePolicyFor, environmentFromBrokerTradeMode, evidenceEnvForAccount } from '@/domain/tradingIntel/evidence';

const LIVE = evidencePolicyFor('live');

async function trades(strategy: string, environment: 'paper' | 'demo' | 'live' | 'unknown', returns: number[]) {
  for (const r of returns) await recordLedgerTrade({ pair: 'XAUUSD', strategy, timeframe: 'h1', returnPct: r, environment });
}

beforeEach(() => store.clear());

describe('evidencePolicyFor', () => {
  it('live/funded telt alleen live; demo en onbekend tellen alles, zoals voorheen', () => {
    expect(LIVE).toMatchObject({ envs: ['live'], includeLegacy: false });
    expect(evidencePolicyFor('demo')).toBe(ALL_EVIDENCE);
    expect(evidencePolicyFor(null)).toBe(ALL_EVIDENCE);
  });
  it('de broker bepaalt de omgeving als het account niets ingesteld heeft', () => {
    expect(environmentFromBrokerTradeMode('ACCOUNT_TRADE_MODE_REAL')).toBe('live');
    expect(environmentFromBrokerTradeMode('ACCOUNT_TRADE_MODE_DEMO')).toBe('demo');
    expect(environmentFromBrokerTradeMode('ACCOUNT_TRADE_MODE_CONTEST')).toBe('demo');
    expect(environmentFromBrokerTradeMode(undefined)).toBeNull();
    expect(evidenceEnvForAccount(null)).toBe('unknown');
  });
});

describe('ledger per omgeving', () => {
  it('telt elke trade in het totaal én in zijn eigen omgeving', async () => {
    await trades('vbt:macd', 'demo', [0.01, -0.005]);
    await trades('vbt:macd', 'live', [0.002]);
    const raw = JSON.parse(store.get(ledgerKey('XAUUSD', 'vbt:macd', 'h1'))!.value) as LedgerEntry;
    expect(raw.trades).toBe(3);
    expect(raw.byEnv?.demo?.trades).toBe(2);
    expect(raw.byEnv?.live?.trades).toBe(1);
    expect(countersFor(raw, LIVE).trades).toBe(1);
  });

  it('oude tellers zonder omgeving heten legacy en worden niet omgelabeld', async () => {
    // Zoals het ledger vandaag bestaat: 40 trades, geen byEnv.
    const legacy: LedgerEntry = {
      run: 'run-1', pair: 'XAUUSD', strategy: 'volumetric-ob', timeframe: 'h1',
      trades: 40, wins: 30, losses: 10, grossWinPct: 0.3, grossLossPct: -0.05, netReturnPct: 0.25,
      updatedAt: new Date().toISOString(),
    };
    store.set(ledgerKey('XAUUSD', 'volumetric-ob', 'h1'), { key: ledgerKey('XAUUSD', 'volumetric-ob', 'h1'), value: JSON.stringify(legacy), updated_at: '' });
    await trades('volumetric-ob', 'live', [-0.004]);
    const raw = JSON.parse(store.get(ledgerKey('XAUUSD', 'volumetric-ob', 'h1'))!.value) as LedgerEntry;
    expect(raw.trades).toBe(41);                    // elk bestaand scherm ziet het totaal
    expect(legacyCounters(raw).trades).toBe(40);    // het oude deel blijft ongelabeld
    const live = await getLedgerEntry('XAUUSD', 'volumetric-ob', 'run-1', LIVE);
    expect(live?.trades).toBe(1);
    expect(live?.evidence).toMatchObject({ counted: 1, legacy: 40, byEnv: { live: 1 } });
  });

  it('een strategie die alleen op papier/demo won, wint de ranking niet op een funded account', async () => {
    // Papier + demo: 30 trades, fors positief. Live: niets.
    await trades('ifvg', 'paper', Array(15).fill(0.01));
    await trades('ifvg', 'demo', Array(15).fill(0.01));
    // Live: 6 bescheiden positieve trades voor een andere strategie.
    await trades('pdh', 'live', Array(6).fill(0.001));

    const demoRank = await rankStrategiesForPair('XAUUSD', ['ifvg', 'pdh'], ['h1'], 'run-1', ALL_EVIDENCE);
    expect(demoRank[0].strategy).toBe('ifvg');

    const liveRank = await rankStrategiesForPair('XAUUSD', ['ifvg', 'pdh'], ['h1'], 'run-1', LIVE);
    expect(liveRank[0].strategy).toBe('pdh');
    const ifvgLive = liveRank.find(r => r.strategy === 'ifvg')!;
    expect(ifvgLive.stats?.trades).toBe(0);          // geen live bewijs
    expect(ifvgLive.tested).toBe(false);             // en dus niet "bewezen"
  });

  it('onbekende omgeving telt nooit als live', async () => {
    await trades('ifvg', 'unknown', Array(10).fill(0.02));
    const e = await getLedgerEntry('XAUUSD', 'ifvg', 'run-1', LIVE);
    expect(e?.trades).toBe(0);
  });

  it('een rondeloze opname blijft in run-1; met run in zijn eigen ronde', async () => {
    await recordLedgerTrade({ pair: 'XAUUSD', strategy: 'ifvg', timeframe: 'h1', returnPct: 0.01, environment: 'demo', run: 'run-2' });
    expect(store.has(ledgerKey('XAUUSD', 'ifvg', 'h1', 'run-2'))).toBe(true);
    expect(store.has(ledgerKey('XAUUSD', 'ifvg', 'h1'))).toBe(false);
  });
});
