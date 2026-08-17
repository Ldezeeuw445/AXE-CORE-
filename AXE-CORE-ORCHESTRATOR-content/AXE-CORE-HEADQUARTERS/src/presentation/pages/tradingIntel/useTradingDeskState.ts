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
import { runTradingResearch, buildCallLlmFromSlots } from '@/application/tradingIntel/runTradingResearch';
import { callProvider } from '@/infrastructure/gateways/llmGateway';
import { PROVIDERS, defaultOllamaSlot, buildStableChatCascade, type KeySlot as ProviderKeySlot } from '@/domain/providers';
import { useVoiceStore } from '@/presentation/store/voiceStore';
import { getTradingModelPref, saveTradingModelPref, type TradingModelPref } from '@/infrastructure/persistence/tradingModelService';
import { getTradingSetups, saveTradingSetup, deleteTradingSetup, type TradingSetup } from '@/application/tradingIntel/tradingSetupService';
import { isAxeApiConfigured, flowRun } from '@/infrastructure/gateways/axeCoreApiService';
import { fetchMarketSnapshot } from '@/infrastructure/gateways/marketDataService';
import type { MarketSnapshot, DemoAccount } from '@/domain/tradingIntel/demoTypes';
import { equity, getDemoAccount, resetDemoAccount, unrealizedPnl } from '@/infrastructure/persistence/demoTradingService';
import { runTradingAgent } from '@/application/tradingIntel/tradingAgentEngine';
import {
  runBacktest,
  runBacktestAllPairs,
  runComboBacktest,
  getSavedStrategies,
  saveStrategyRun,
  deleteSavedStrategyRun,
  type BacktestResult,
  type BacktestStrategyId,
  type AllPairsBacktestRow,
  type SavedStrategyRun,
} from '@/application/tradingIntel/backtestEngine';
import { loadTradingAgentMemory } from '@/infrastructure/persistence/tradingAgentMemoryService';
import type { GlobalMemoryEntry } from '@/infrastructure/persistence/globalMemoryService';
import { getRiskProfile, setRiskMode, saveRiskProfile } from '@/infrastructure/persistence/tradingRiskService';
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
  getScanAllPairs,
  setScanAllPairs,
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
 * one shared function, not two copies that can drift). smc-structure,
 * volumetric-ob and ifvg were ported from the canvas-only detection logic
 * in ChartIndicatorLayer.tsx (structurePivots/buildStructureOverlay,
 * buildVolumetricBreakdown, buildInverseFvgs) into pure, replayable
 * functions. Only crew-hybrid still shares the generic trend+RSI proxy —
 * it's meant to weight live CrewAI intel, which has no historical archive
 * to replay, so a backtest genuinely can't be more real for it (flagged in
 * the backtest result's `note` field too).
 */
export const STRATEGIES = [
  { id: 'smc-structure', label: 'SMC Structure', detail: 'BOS/MSS + order blocks + FVG', backtestable: true },
  { id: 'volumetric-ob', label: 'Volumetric Order Block', detail: 'Lux-algo style volume OBs', backtestable: true },
  { id: 'fib-retracement', label: 'Fib Retracement', detail: 'Dragable fib levels', backtestable: true },
  { id: 'pdh', label: 'Previous Day High', detail: 'PDH / PDL levels', backtestable: true },
  { id: 'ifvg', label: 'Inversion FVG', detail: 'Inverted fair value gaps', backtestable: true },
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
  const [scanAllPairs, setScanAllPairsState] = useState(false);
  const [backtestRunning, setBacktestRunning] = useState(false);
  const [backtestResult, setBacktestResult] = useState<BacktestResult | null>(null);
  const [backtestTimeframe, setBacktestTimeframe] = useState('1h');
  const [backtestLimit, setBacktestLimit] = useState(500);
  const [allPairsRunning, setAllPairsRunning] = useState(false);
  const [allPairsResults, setAllPairsResults] = useState<AllPairsBacktestRow[] | null>(null);
  const [savedStrategies, setSavedStrategies] = useState<SavedStrategyRun[]>([]);
  const [comboStrategies, setComboStrategies] = useState<StrategyId[]>(['smc-structure', 'volumetric-ob', 'ifvg']);
  const [comboMinAgree, setComboMinAgree] = useState(2);
  const [setups, setSetups] = useState<TradingSetup[]>([]);
  const [comboRunning, setComboRunning] = useState(false);
  const [comboResult, setComboResult] = useState<BacktestResult | null>(null);
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
  const [tradingModel, setTradingModelState] = useState<TradingModelPref>({ provider: '', model: '' });

  const setTradingModel = useCallback(async (pref: TradingModelPref) => {
    const saved = await saveTradingModelPref(pref);
    setTradingModelState(saved);
  }, []);

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
      const [reps, watch, acc, mem, rp, learn, br, meta, pilot, breaker, traces, strategy, scanAll, saved] = await Promise.all([
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
        getScanAllPairs(),
        getSavedStrategies(),
      ]);
      void getTradingModelPref().then(setTradingModelState);
      void getTradingSetups().then(setSetups);
      setReports(reps);
      setWatchlist(watch);
      setWatchCount(watch.length);
      setAccount(acc);
      setMemory(mem);
      setRisk(rp);
      setLearning(learn);
      setActiveStrategyState(strategy);
      setScanAllPairsState(scanAll);
      setSavedStrategies(saved);
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

  /** Build the trading LLM from the user's chosen "trading model" (Settings).
   *  Returns undefined for auto (let runTradingResearch use CrewAI/default).
   *  The chosen model becomes both the CrewAI fallback and the synthesis LLM. */
  const buildTradingCallLlm = useCallback(async (): Promise<((system: string, user: string) => Promise<string>) | undefined> => {
    const pref = await getTradingModelPref();

    // Every configured provider, so a chosen-but-quota-exhausted model still
    // has somewhere to fall through to instead of surfacing "quota exceeded"
    // and stopping the run cold.
    const allSlots: ProviderKeySlot[] = [];
    const pushSlot = (s: ProviderKeySlot | null | undefined) => {
      if (s?.provider && !allSlots.some(x => x.provider === s.provider)) allSlots.push(s);
    };
    try {
      const conns = JSON.parse(localStorage.getItem('axe_llm_connections') ?? '{}') as Record<string, { key?: string; model?: string; baseUrl?: string } | undefined>;
      for (const [id, c] of Object.entries(conns)) {
        if (!c?.key || c.key.length < 4) continue;
        const cfg = PROVIDERS.find(p => p.id === id);
        pushSlot({ provider: id as ProviderKeySlot['provider'], key: c.key, model: c.model || cfg?.defaultModel, baseUrl: c.baseUrl || cfg?.baseUrl });
      }
    } catch { /* ignore */ }
    pushSlot(defaultOllamaSlot());

    let chosen: ProviderKeySlot | null = null;
    if (pref.provider === 'ollama') {
      chosen = { ...defaultOllamaSlot(), ...(pref.model ? { model: pref.model } : {}) };
    } else if (pref.provider) {
      const cfg = PROVIDERS.find(p => p.id === pref.provider);
      const existing = allSlots.find(s => s.provider === pref.provider);
      chosen = existing
        ? { ...existing, ...(pref.model ? { model: pref.model } : {}) }
        : { provider: pref.provider, key: '', model: pref.model || cfg?.defaultModel, baseUrl: cfg?.baseUrl };
    }

    const st = useVoiceStore.getState();
    const cascade = buildStableChatCascade(allSlots, {
      primary: chosen ?? st.primarySlot,
      fallback1: st.fallback1Slot,
      fallback2: st.fallback2Slot,
    });
    if (!cascade.length) return undefined;
    return buildCallLlmFromSlots(cascade, (s, msgs) => callProvider(s as ProviderKeySlot, msgs as Array<{ role: 'user' | 'assistant' | 'system'; content: string }>));
  }, []);

  const runResearch = useCallback(async () => {
    setRunning(true);
    try {
      const callLlm = await buildTradingCallLlm();
      const r = await runTradingResearch({ ticker: symbol, callLlm });
      toast.success(`Research done · ${r.signal}`);
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }, [symbol, reload, buildTradingCallLlm]);

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
      const res = await runBacktest({ symbol: chartSymbol, strategy: activeStrategy as BacktestStrategyId, timeframe: backtestTimeframe, limit: backtestLimit });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setBacktestResult(res.result);
    } finally {
      setBacktestRunning(false);
    }
  }, [chartSymbol, activeStrategy, backtestTimeframe, backtestLimit]);

  const runBacktestAllPairsNow = useCallback(async () => {
    setAllPairsRunning(true);
    setAllPairsResults(null);
    try {
      const rows = await runBacktestAllPairs({
        symbols: COMMON_PAIRS,
        strategy: activeStrategy as BacktestStrategyId,
        timeframe: backtestTimeframe,
        limit: backtestLimit,
      });
      setAllPairsResults(rows);
      const failed = rows.filter(r => !r.result).length;
      if (failed) toast.error(`${failed}/${rows.length} pairs failed — see table for details`);
    } finally {
      setAllPairsRunning(false);
    }
  }, [activeStrategy, backtestTimeframe, backtestLimit]);

  const toggleComboStrategy = useCallback((strategy: StrategyId) => {
    setComboStrategies(prev => prev.includes(strategy) ? prev.filter(s => s !== strategy) : [...prev, strategy]);
  }, []);

  /** Save the current combo builder as a named, reusable setup. */
  const saveSetup = useCallback(async (name: string) => {
    const next = await saveTradingSetup({
      name,
      strategies: comboStrategies as BacktestStrategyId[],
      minAgree: comboMinAgree,
      timeframe: backtestTimeframe,
      limit: backtestLimit,
    });
    setSetups(next);
    toast.success(`Setup "${name.trim()}" saved`);
  }, [comboStrategies, comboMinAgree, backtestTimeframe, backtestLimit]);

  /** Load a saved setup back into the combo builder (strategies + agreement +
   *  timeframe + period) so it can be re-backtested or tuned further. */
  const loadSetup = useCallback((setup: TradingSetup) => {
    setComboStrategies(setup.strategies as StrategyId[]);
    setComboMinAgree(setup.minAgree);
    setBacktestTimeframe(setup.timeframe);
    setBacktestLimit(setup.limit);
    toast(`Loaded "${setup.name}" — run the combo backtest to test it`);
  }, []);

  const deleteSetup = useCallback(async (id: string) => {
    setSetups(await deleteTradingSetup(id));
  }, []);

  const runComboBacktestNow = useCallback(async () => {
    setComboRunning(true);
    setComboResult(null);
    try {
      const res = await runComboBacktest({
        symbol: chartSymbol,
        strategies: comboStrategies as BacktestStrategyId[],
        minAgree: comboMinAgree,
        timeframe: backtestTimeframe,
        limit: backtestLimit,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setComboResult(res.result);
    } finally {
      setComboRunning(false);
    }
  }, [chartSymbol, comboStrategies, comboMinAgree, backtestTimeframe, backtestLimit]);

  const saveCurrentBacktest = useCallback(async (note?: string, resultOverride?: BacktestResult) => {
    const toSave = resultOverride ?? backtestResult;
    if (!toSave) return;
    const next = await saveStrategyRun(toSave, note);
    setSavedStrategies(next);
    toast.success(`Saved ${toSave.strategy} on ${toSave.symbol}`);
  }, [backtestResult]);

  const deleteSavedStrategy = useCallback(async (id: string) => {
    const next = await deleteSavedStrategyRun(id);
    setSavedStrategies(next);
  }, []);

  const setActiveStrategy = useCallback((strategy: StrategyId) => {
    setActiveStrategyState(strategy);
    void setActiveStrategySetting(strategy);
  }, []);

  const toggleScanAllPairs = useCallback((on: boolean) => {
    setScanAllPairsState(on);
    void setScanAllPairs(on);
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

  /** Edit individual risk parameters (not just the mode preset). Persists via
   *  saveRiskProfile (localStorage + cloud) so autopilot's next cycle and the
   *  risk engine both read the new numbers. Clamped to sane bounds so a typo
   *  can't set 500% risk-per-trade. */
  const updateRiskProfile = useCallback(async (patch: Partial<RiskProfile>) => {
    const current = risk ?? (await getRiskProfile());
    const clampPct = (v: number | undefined, fb: number, max = 1) =>
      typeof v === 'number' && Number.isFinite(v) ? Math.min(Math.max(v, 0), max) : fb;
    const next: RiskProfile = {
      ...current,
      ...patch,
      riskPerTradePct: clampPct(patch.riskPerTradePct, current.riskPerTradePct, 0.5),
      maxOpenRiskPct: clampPct(patch.maxOpenRiskPct, current.maxOpenRiskPct, 1),
      maxDailyLossPct: clampPct(patch.maxDailyLossPct, current.maxDailyLossPct, 1),
      minConfidence: clampPct(patch.minConfidence, current.minConfidence, 1),
      maxDrawdownPct: patch.maxDrawdownPct != null ? clampPct(patch.maxDrawdownPct, current.maxDrawdownPct ?? 0.12, 1) : current.maxDrawdownPct,
      profitTargetPct: patch.profitTargetPct != null ? clampPct(patch.profitTargetPct, current.profitTargetPct ?? 0.1, 5) : current.profitTargetPct,
      maxTradesPerDay: patch.maxTradesPerDay != null && Number.isFinite(patch.maxTradesPerDay)
        ? Math.min(Math.max(Math.round(patch.maxTradesPerDay), 1), 200)
        : current.maxTradesPerDay,
      updatedAt: new Date().toISOString(),
    };
    const saved = await saveRiskProfile(next);
    setRisk(saved);
    return saved;
  }, [risk]);

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
    scanAllPairs, toggleScanAllPairs,
    backtestRunning, backtestResult,
    backtestTimeframe, setBacktestTimeframe, backtestLimit, setBacktestLimit,
    allPairsRunning, allPairsResults, runBacktestAllPairsNow,
    savedStrategies, saveCurrentBacktest, deleteSavedStrategy,
    comboStrategies, toggleComboStrategy, comboMinAgree, setComboMinAgree,
    comboRunning, comboResult, runComboBacktestNow,
    setups, saveSetup, loadSetup, deleteSetup,
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
    tradingModel, setTradingModel,
    circuitBreaker, killSwitchBusy,
    ownBookAnalytics, ownBookTrades, ownBookSource, ownBookLoading, metaPositions,
    isAxeApiConfigured,
    // actions
    reload,
    runResearch, runDeepResearch, runAgent, runBacktestNow,
    toggleAutopilot, setAutopilotCadence, runAutopilotNow,
    updateRiskProfile,
    resetBreaker, triggerKillSwitch,
    deleteIntelReport: (id: string) => deleteIntelReport(id).then(reload),
    resetDemoAccount: () => resetDemoAccount().then(reload),
    setRiskMode: (m: RiskMode) => setRiskMode(m).then(reload),
    saveMetaApiConfig, metaApiGetAccount, metaApiAccountId, metaApiProvisionAccount,
    connectBrokerKind,
  };
}

export type TradingDeskState = ReturnType<typeof useTradingDeskState>;
