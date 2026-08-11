/**
 * useTradingDeskState — all Trading Intel state + handlers in one hook, so
 * the shell (TradingIntel.tsx) and every sub-tab share one source of truth
 * instead of each re-fetching. Lifted 1:1 out of the old single-file
 * TradingIntel.tsx (same field names, same behavior) when the tab was split
 * into Chart / Research / Brain / Scorecard / Strategies / Demo book.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { type IndicatorSnapshot } from '@/presentation/components/trading/CompanionStyleChart';
import { SIGNAL_META, type TradingIntelReport, type TradingSignal, type TradingIntelWatchlistItem } from '@/domain/tradingIntel/types';
import { deleteIntelReport, listIntelReports, listWatchlist, summarizeIntel } from '@/infrastructure/persistence/tradingIntelService';
import { runTradingResearch } from '@/application/tradingIntel/runTradingResearch';
import { isAxeApiConfigured, flowRun } from '@/infrastructure/gateways/axeCoreApiService';
import { fetchMarketSnapshot } from '@/infrastructure/gateways/marketDataService';
import type { MarketSnapshot, DemoAccount } from '@/domain/tradingIntel/demoTypes';
import { equity, getDemoAccount, resetDemoAccount, unrealizedPnl } from '@/infrastructure/persistence/demoTradingService';
import { runTradingAgent } from '@/application/tradingIntel/tradingAgentEngine';
import { runBacktest, type BacktestResult, type BacktestStrategyId } from '@/application/tradingIntel/backtestEngine';
import { loadTradingAgentMemory } from '@/infrastructure/persistence/tradingAgentMemoryService';
import type { GlobalMemoryEntry } from '@/infrastructure/persistence/globalMemoryService';
import { getRiskProfile, setRiskMode } from '@/infrastructure/persistence/tradingRiskService';
import { getLearningStats, listThinkingTraces } from '@/infrastructure/persistence/tradingLearningService';
import { getBrokerConnection, connectBrokerKind, getEffectiveAccountState } from '@/infrastructure/gateways/brokerConnector';
import {
  getMetaApiConfig,
  saveMetaApiConfig,
  metaApiGetAccount,
  metaApiListAccounts,
  metaApiAccountId,
  metaApiGetAccountInfo,
  metaApiProvisionAccount,
  metaApiGetHistoryDeals,
  metaApiGetPositions,
  type MetaApiAccountBalance,
  type MetaApiRegion,
  type MetaApiTradingAccount,
} from '@/infrastructure/gateways/metaApiService';
import {
  computeJournalAnalytics,
  demoTradesToJournalTrades,
  metaApiDealsToJournalTrades,
  type JournalAnalytics,
  type JournalTrade,
} from '@/application/tradingIntel/csvJournalAnalytics';
import type { RiskProfile, RiskMode, ThinkingTrace, AgentLearningStats, BrokerConnection } from '@/domain/tradingIntel/botTypes';
import {
  getAutopilotStatus,
  runTradingAutopilotNow,
  setAutopilotEnabled,
  setAutopilotIntervalMin,
  getActiveStrategy,
  setActiveStrategySetting,
  type AutopilotStatus,
} from '@/application/tradingIntel/agentAutopilot';
import type { StrategyId } from '@/application/tradingIntel/strategySignals';
import {
  getCircuitBreakerState,
  resetCircuitBreaker,
} from '@/infrastructure/persistence/tradingCircuitBreakerService';
import type { CircuitBreakerState } from '@/domain/tradingIntel/botTypes';
import { emergencyFlattenAndStop, type KillSwitchResult } from '@/application/tradingIntel/tradingKillSwitch';

export const COMMON_PAIRS = [
  'XAUUSD', 'XAGUSD', 'EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'AUDUSD', 'NZDUSD', 'USDCAD',
  'BTCUSD', 'ETHUSD', 'US30', 'US500', 'NAS100', 'GER40', 'UK100', 'WTIUSD',
] as const;

/**
 * Strategy shelf. `backtestable: true` means strategySignals.ts has real,
 * distinct logic for it (used by both backtestEngine AND the live agent —
 * one shared function, not two copies that can drift). The remaining 4
 * (smc-structure, volumetric-ob, ifvg, crew-hybrid) share one generic
 * trend+RSI proxy — real SMC/order-block/FVG pattern detection currently
 * only exists as canvas rendering (ChartIndicatorLayer.tsx), not as a
 * replayable series function. Flagged in the backtest result's `note`
 * field too, but shouldn't take running one to find out — hence the badge.
 */
export const STRATEGIES = [
  { id: 'smc-structure', label: 'SMC Structure', detail: 'BOS/MSS + order blocks + FVG', backtestable: false },
  { id: 'volumetric-ob', label: 'Volumetric Order Block', detail: 'Lux-algo style volume OBs', backtestable: false },
  { id: 'fib-retracement', label: 'Fib Retracement', detail: 'Dragable fib levels', backtestable: true },
  { id: 'pdh', label: 'Previous Day High', detail: 'PDH / PDL levels', backtestable: true },
  { id: 'ifvg', label: 'Inversion FVG', detail: 'Inverted fair value gaps', backtestable: false },
  { id: 'golden-pocket', label: 'Golden Pocket', detail: '0.618–0.65 zone', backtestable: true },
  { id: 'mean-reversion', label: 'Mean Reversion', detail: 'RSI extremes + Bollinger', backtestable: true },
  { id: 'trend-follow', label: 'Trend Follow', detail: 'SMA20/50 cross + momentum', backtestable: true },
  { id: 'crew-hybrid', label: 'Crew Hybrid', detail: 'Chart + research desk combined', backtestable: false },
] as const;

/** Fallback for signals that aren't one of the five known values. */
export const UNKNOWN_SIGNAL_META = { label: '—', color: '#94A3B8', bg: 'rgba(148,163,184,0.12)' };

/** The trading agent's name, everywhere it's shown to the user. */
export const AGENT_NAME = 'AXE ALGO';

/** How far back "his own book" looks for real MT5 closed-deal history. */
export const OWN_BOOK_LOOKBACK_DAYS = 180;

export function signalMeta(signal: TradingSignal) {
  const key = typeof signal === 'string' ? (signal.toUpperCase() as TradingSignal) : signal;
  return SIGNAL_META[key] ?? UNKNOWN_SIGNAL_META;
}

export function useTradingDeskState() {
  const [indicatorSnap, setIndicatorSnap] = useState<IndicatorSnapshot | null>(null);
  const [reports, setReports] = useState<TradingIntelReport[]>([]);
  const [watchCount, setWatchCount] = useState(0);
  const [watchlist, setWatchlist] = useState<TradingIntelWatchlistItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [deepRunning, setDeepRunning] = useState(false);
  const [agentRunning, setAgentRunning] = useState(false);
  const [symbol, setSymbol] = useState('XAUUSD');
  const [chartSymbol, setChartSymbol] = useState('XAUUSD');
  const [activeStrategy, setActiveStrategyState] = useState<StrategyId>('mean-reversion');
  const [backtestRunning, setBacktestRunning] = useState(false);
  const [backtestResult, setBacktestResult] = useState<BacktestResult | null>(null);
  const [account, setAccount] = useState<DemoAccount | null>(null);
  const [snapshot, setSnapshot] = useState<MarketSnapshot | null>(null);
  const [memory, setMemory] = useState<GlobalMemoryEntry[]>([]);
  const [risk, setRisk] = useState<RiskProfile | null>(null);
  const [learning, setLearning] = useState<AgentLearningStats | null>(null);
  const [broker, setBroker] = useState<BrokerConnection | null>(null);
  const [lastTrace, setLastTrace] = useState<ThinkingTrace | null>(null);
  const [metaToken, setMetaToken] = useState('');
  const [metaAccountId, setMetaAccountId] = useState('');
  const [metaRegion, setMetaRegion] = useState<MetaApiRegion>('london');
  const [metaAccounts, setMetaAccounts] = useState<MetaApiTradingAccount[]>([]);
  const [metaAccountsLoading, setMetaAccountsLoading] = useState(false);
  const [showNewMetaAccount, setShowNewMetaAccount] = useState(false);
  const [newMetaLogin, setNewMetaLogin] = useState('');
  const [newMetaPassword, setNewMetaPassword] = useState('');
  const [newMetaServer, setNewMetaServer] = useState('');
  const [newMetaName, setNewMetaName] = useState('');
  const [provisioning, setProvisioning] = useState(false);
  const [mt5Balance, setMt5Balance] = useState<MetaApiAccountBalance | null>(null);
  const [autopilot, setAutopilot] = useState<AutopilotStatus | null>(null);
  const [autopilotBusy, setAutopilotBusy] = useState(false);
  const [circuitBreaker, setCircuitBreaker] = useState<CircuitBreakerState | null>(null);
  const [killSwitchBusy, setKillSwitchBusy] = useState(false);
  const [ownBookAnalytics, setOwnBookAnalytics] = useState<JournalAnalytics | null>(null);
  const [ownBookTrades, setOwnBookTrades] = useState<JournalTrade[]>([]);
  const [ownBookSource, setOwnBookSource] = useState<'metaapi' | 'paper' | null>(null);
  const [ownBookLoading, setOwnBookLoading] = useState(false);
  const [metaPositions, setMetaPositions] = useState<Record<string, unknown>[] | null>(null);

  const refreshMetaAccounts = useCallback(async (token: string) => {
    if (!token) {
      setMetaAccounts([]);
      return;
    }
    setMetaAccountsLoading(true);
    const res = await metaApiListAccounts(token);
    setMetaAccountsLoading(false);
    if (res.ok) setMetaAccounts(res.accounts);
    else setMetaAccounts([]);
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [reps, watch, acc, mem, rp, learn, br, meta, pilot, breaker, traces, strategy] = await Promise.all([
        listIntelReports(),
        listWatchlist(),
        getDemoAccount(),
        loadTradingAgentMemory(),
        getRiskProfile(),
        getLearningStats(),
        getBrokerConnection(),
        getMetaApiConfig(),
        getAutopilotStatus(),
        getCircuitBreakerState(),
        // "Last thinking" previously only ever came from a manual click in
        // this same session — autopilot's cycles were saving traces the
        // whole time (saveThinkingTrace in tradingAgentEngine), the tab
        // just never loaded them back. This is why it showed "No cycle run
        // yet" even while autopilot had clearly been running.
        listThinkingTraces(1),
        // Same fix, different symptom: the strategy picker was pure local
        // state, so autopilot (which runs outside this component entirely)
        // never knew what you'd selected.
        getActiveStrategy(),
      ]);
      setReports(reps);
      setWatchlist(watch);
      setWatchCount(watch.length);
      setAccount(acc);
      setMemory(mem);
      setRisk(rp);
      setLearning(learn);
      setActiveStrategyState(strategy);
      setBroker(br);
      setAutopilot(pilot);
      setCircuitBreaker(breaker);
      if (traces[0]) setLastTrace(traces[0]);
      if (meta) {
        setMetaToken(meta.token || '');
        setMetaAccountId(meta.accountId || '');
        setMetaRegion(meta.region || 'london');
        if (meta.token) void refreshMetaAccounts(meta.token);
      }
      try {
        const snap = await fetchMarketSnapshot(chartSymbol);
        setSnapshot(snap);
      } catch { /* ignore */ }
    } finally {
      setLoading(false);
    }
  }, [chartSymbol, refreshMetaAccounts]);

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!metaAccountId) {
      setMt5Balance(null);
      return;
    }
    let cancelled = false;
    const poll = async () => {
      const res = await metaApiGetAccountInfo();
      if (!cancelled && res.ok) setMt5Balance(res.info);
    };
    void poll();
    const t = setInterval(poll, 15_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [metaAccountId]);

  // "His own book" — prefers the REAL connected MT5 account's history over
  // the internal paper mirror. The paper book only ever sees trades AXE
  // itself placed through it; a real account (e.g. an OANDA demo you
  // connected) has its own history AXE didn't create. Re-fetches whenever
  // the broker connection or the paper account changes.
  const metaConnected = broker?.kind === 'mt5_demo' && broker.connected;
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (metaConnected) {
        setOwnBookLoading(true);
        const end = new Date();
        const start = new Date(end.getTime() - OWN_BOOK_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
        const [dealsRes, positionsRes] = await Promise.all([
          metaApiGetHistoryDeals(start.toISOString(), end.toISOString()),
          metaApiGetPositions(),
        ]);
        if (cancelled) return;
        setOwnBookLoading(false);
        setMetaPositions(positionsRes.ok ? (positionsRes.positions as Record<string, unknown>[]) : []);
        if (dealsRes.ok) {
          const journalTrades = metaApiDealsToJournalTrades(dealsRes.deals);
          setOwnBookTrades(journalTrades);
          setOwnBookAnalytics(journalTrades.length ? computeJournalAnalytics(journalTrades) : null);
          setOwnBookSource('metaapi');
          return;
        }
        toast.error(`Couldn't load MT5 history: ${dealsRes.error} — showing paper book instead`);
      } else {
        setMetaPositions(null);
      }
      // No MetaAPI connection (or the fetch failed) — fall back to paper.
      if (!account?.trades?.length) {
        setOwnBookTrades([]);
        setOwnBookAnalytics(null);
        setOwnBookSource(metaConnected ? 'metaapi' : 'paper');
        return;
      }
      const journalTrades = demoTradesToJournalTrades(account.trades);
      setOwnBookTrades(journalTrades);
      setOwnBookAnalytics(journalTrades.length ? computeJournalAnalytics(journalTrades) : null);
      setOwnBookSource('paper');
    })();
    return () => { cancelled = true; };
  }, [metaConnected, account]);

  // Autopilot (and the circuit breaker it can trip) run in the background
  // (axeBootstrap) independent of any page being mounted — poll status so
  // the strip/tab reflect a cycle that just fired, not just the state from
  // the last page load.
  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      const [status, breaker, traces] = await Promise.all([getAutopilotStatus(), getCircuitBreakerState(), listThinkingTraces(1)]);
      if (cancelled) return;
      setAutopilot(status);
      setCircuitBreaker(breaker);
      if (traces[0]) setLastTrace(traces[0]);
    };
    const t = setInterval(poll, 10_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  const summary = useMemo(() => summarizeIntel(reports, watchCount), [reports, watchCount]);
  const eq = account ? equity(account) : 0;
  const upnl = account ? unrealizedPnl(account) : 0;

  const runResearch = useCallback(async () => {
    setRunning(true);
    try {
      const r = await runTradingResearch({ ticker: symbol });
      toast.success(`Research done · ${r.signal}`);
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }, [symbol, reload]);

  /** Full institutional research cycle — the 18-agent CrewAI Flow. */
  const runDeepResearch = useCallback(async () => {
    setDeepRunning(true);
    try {
      const res = await flowRun('trading_intelligence', {
        asset: symbol,
        topic: `${symbol} institutional research cycle`,
        depth: 'standard',
      });
      if (res.status !== 'ok') {
        toast.error(res.error || 'Deep research failed');
        return;
      }
      const reportText = (res.state?.research_report as string | undefined)
        ?? (res.state?.hypotheses as string | undefined)
        ?? res.result
        ?? 'No report text returned.';
      const highConfidence = res.state?.confidence_gate_decision === 'high_confidence_findings';
      const { createEmptyReport, upsertIntelReport } = await import('@/infrastructure/persistence/tradingIntelService');
      const report = createEmptyReport({ ticker: symbol, source: 'crewai' });
      await upsertIntelReport({
        ...report,
        status: 'complete',
        confidence: highConfidence ? 0.75 : 0.45,
        thesis: reportText.slice(0, 2000),
        body: reportText,
        tags: ['institutional', 'crewai-flow'],
      });
      toast.success(`Deep research done · ${highConfidence ? 'high confidence' : 'needs monitoring'}`);
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setDeepRunning(false);
    }
  }, [symbol, reload]);

  const runAgent = useCallback(async () => {
    setAgentRunning(true);
    try {
      const result = await runTradingAgent({
        symbol: chartSymbol,
        autoExecute: true,
        strategy: activeStrategy,
        indicatorHint: indicatorSnap
          ? {
              sma20: indicatorSnap.sma20,
              sma50: indicatorSnap.sma50,
              rsi14: indicatorSnap.rsi14,
              fvgCount: indicatorSnap.fvgCount,
              obCount: indicatorSnap.obCount,
              pdh: indicatorSnap.pdh,
              pdl: indicatorSnap.pdl,
            }
          : undefined,
      } as Parameters<typeof runTradingAgent>[0]);
      if (result.trace) setLastTrace(result.trace);
      toast.success(
        result.error
          ?? (result.decision ? `${result.decision.action.toUpperCase()} · ${result.decision.rationale}` : 'Agent cycle complete'),
      );
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setAgentRunning(false);
    }
  }, [chartSymbol, indicatorSnap, reload, activeStrategy]);

  const runBacktestNow = useCallback(async () => {
    setBacktestRunning(true);
    setBacktestResult(null);
    try {
      const res = await runBacktest({ symbol: chartSymbol, strategy: activeStrategy as BacktestStrategyId, timeframe: '1h', limit: 500 });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setBacktestResult(res.result);
    } finally {
      setBacktestRunning(false);
    }
  }, [chartSymbol, activeStrategy]);

  const setActiveStrategy = useCallback((strategy: StrategyId) => {
    setActiveStrategyState(strategy);
    void setActiveStrategySetting(strategy);
  }, []);

  const toggleAutopilot = useCallback(async () => {
    if (!autopilot) return;
    setAutopilotBusy(true);
    try {
      await setAutopilotEnabled(!autopilot.enabled);
      setAutopilot(await getAutopilotStatus());
      toast.success(autopilot.enabled ? 'Autopilot stopped' : 'Autopilot armed — first cycle runs within a minute');
    } finally {
      setAutopilotBusy(false);
    }
  }, [autopilot]);

  const setAutopilotCadence = useCallback(async (min: number) => {
    await setAutopilotIntervalMin(min);
    setAutopilot(await getAutopilotStatus());
  }, []);

  const runAutopilotNow = useCallback(async () => {
    toast('Running autopilot cycle now…');
    await runTradingAutopilotNow();
    setAutopilot(await getAutopilotStatus());
    await reload();
  }, [reload]);

  const resetBreaker = useCallback(async () => {
    // Reset against the same real-vs-paper source the engine trades
    // against — resetting to the paper $100k mock while a real MT5
    // account is connected would silently re-arm the breaker at the
    // wrong peak. Symbol is irrelevant here, only .equity/.isReal matter.
    const effective = await getEffectiveAccountState(chartSymbol || 'EURUSD');
    await resetCircuitBreaker(effective.equity, effective.isReal ? 'live' : 'paper');
    setCircuitBreaker(await getCircuitBreakerState());
    toast.success('Circuit breaker reset — autopilot can trade again once re-armed.');
  }, [chartSymbol]);

  const triggerKillSwitch = useCallback(async (): Promise<KillSwitchResult> => {
    setKillSwitchBusy(true);
    try {
      const result = await emergencyFlattenAndStop('Manual kill switch from Trading tab');
      setAutopilot(await getAutopilotStatus());
      setCircuitBreaker(await getCircuitBreakerState());
      await reload();
      const errCount = result.paperCloseErrors.length + result.metaApiCloseErrors.length;
      toast[errCount ? 'error' : 'success'](
        `Flattened ${result.paperPositionsClosed + result.metaApiPositionsClosed} position(s), autopilot stopped${errCount ? ` — ${errCount} error(s), check console` : ''}.`,
      );
      if (errCount) {
        console.warn('[killSwitch] errors:', result.paperCloseErrors, result.metaApiCloseErrors);
      }
      return result;
    } finally {
      setKillSwitchBusy(false);
    }
  }, [reload]);

  return {
    // data
    indicatorSnap, setIndicatorSnap,
    reports, watchCount, watchlist, summary,
    loading, running, deepRunning, agentRunning,
    symbol, setSymbol, chartSymbol, setChartSymbol,
    activeStrategy, setActiveStrategy,
    backtestRunning, backtestResult,
    account, snapshot, eq, upnl,
    memory, risk, learning, broker, lastTrace,
    metaToken, setMetaToken, metaAccountId, setMetaAccountId, metaRegion, setMetaRegion,
    metaAccounts, metaAccountsLoading, refreshMetaAccounts,
    showNewMetaAccount, setShowNewMetaAccount,
    newMetaLogin, setNewMetaLogin, newMetaPassword, setNewMetaPassword,
    newMetaServer, setNewMetaServer, newMetaName, setNewMetaName,
    provisioning, setProvisioning,
    mt5Balance,
    autopilot, autopilotBusy,
    circuitBreaker, killSwitchBusy,
    ownBookAnalytics, ownBookTrades, ownBookSource, ownBookLoading, metaPositions,
    isAxeApiConfigured,
    // actions
    reload,
    runResearch, runDeepResearch, runAgent, runBacktestNow,
    toggleAutopilot, setAutopilotCadence, runAutopilotNow,
    resetBreaker, triggerKillSwitch,
    deleteIntelReport: (id: string) => deleteIntelReport(id).then(reload),
    resetDemoAccount: () => resetDemoAccount().then(reload),
    setRiskMode: (m: RiskMode) => setRiskMode(m).then(reload),
    saveMetaApiConfig, metaApiGetAccount, metaApiAccountId, metaApiProvisionAccount,
    connectBrokerKind,
  };
}

export type TradingDeskState = ReturnType<typeof useTradingDeskState>;
