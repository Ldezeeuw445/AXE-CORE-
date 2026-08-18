/**
 * agentAutopilot — the 24/7 trading loop.
 *
 * This app has no server-side scheduler for the trading agent (Vercel is
 * paused; the VPS's self-hosted cron only drives the CrewAI research crew
 * and other core_schedules jobs). Instead the Mac mini keeps the AXE CORE
 * Tauri app open around the clock, so "24/7" here means: for as long as the
 * app window is running, check every minute whether a cycle is due — same
 * interval-gate idiom axeBootstrap.ts already uses for maybeSelfHealCheck.
 *
 * One cycle = fresh CrewAI research, then one runTradingAgent() decision
 * (which itself writes memory/journal/learning — see tradingAgentEngine.ts).
 * Off by default; the user arms it from the Agent tab.
 */
import { listWatchlist } from '@/infrastructure/persistence/tradingIntelService';
import { loadSetting, saveSetting } from '@/infrastructure/persistence/userSettingsService';
import { runTradingResearch } from '@/application/tradingIntel/runTradingResearch';
import { runTradingAgent, buildStrategySeries } from '@/application/tradingIntel/tradingAgentEngine';
import { fetchMarketSnapshot } from '@/infrastructure/gateways/marketDataService';
import { computeStrategySignal, DISTINCT_STRATEGIES, type StrategyId } from '@/application/tradingIntel/strategySignals';
import { manageOpenPositions } from '@/application/tradingIntel/positionManager';
import { rankStrategiesForPair, recordLedgerBacktest } from '@/infrastructure/persistence/tradingLedgerService';
import { runBacktest } from '@/application/tradingIntel/backtestEngine';
import { backtestVectorbt } from '@/infrastructure/gateways/axeCoreApiService';
import { syncTradingObsidian } from '@/infrastructure/persistence/tradingObsidianMemory';

const KEY_ENABLED = 'axe_trading_autopilot_enabled';
const KEY_INTERVAL_MIN = 'axe_trading_autopilot_interval_min';
const KEY_LAST_RUN = 'axe_trading_autopilot_last_run';
const KEY_LAST_RESULT = 'axe_trading_autopilot_last_result';
const KEY_ACTIVE_STRATEGY = 'axe_trading_active_strategy';
const KEY_SCAN_ALL_PAIRS = 'axe_trading_scan_all_pairs';
const KEY_LAST_SELFTEST = 'axe_trading_last_selftest';

/** Self-test cadence — backtest every watchlist pair × strategy this often so
 *  the ledger has fresh priors without hammering the data feed every cycle. */
const SELFTEST_INTERVAL_MS = 12 * 60 * 60 * 1000;
/** Bars per self-test backtest — one page, enough for a prior, light on the feed. */
const SELFTEST_BARS = 1000;

const DEFAULT_INTERVAL_MIN = 15;
const MIN_INTERVAL_MIN = 5;
const DEFAULT_SYMBOL = 'XAUUSD';
const DEFAULT_STRATEGY: StrategyId = 'mean-reversion';

// Kept separate from useTradingDeskState.ts's COMMON_PAIRS (same list) —
// application/ must not import from presentation/ (no-restricted-imports).
const SCAN_UNIVERSE = [
  'XAUUSD', 'XAGUSD', 'EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'AUDUSD', 'NZDUSD', 'USDCAD',
  'BTCUSD', 'ETHUSD', 'US30', 'US500', 'NAS100', 'GER40', 'UK100', 'WTIUSD',
] as const;

// Caps how many extra (non-watchlist) pairs get the expensive research+
// decision cycle in one run, regardless of how many the screen flags.
const MAX_SCAN_FLAGGED = 6;

export async function getScanAllPairs(): Promise<boolean> {
  return loadSetting(KEY_SCAN_ALL_PAIRS, false);
}

export async function setScanAllPairs(on: boolean): Promise<void> {
  await saveSetting(KEY_SCAN_ALL_PAIRS, on);
}

/**
 * The Chart/Strategies tab's picker used to be pure local React state —
 * autopilot runs completely outside that component tree (it fires from
 * axeBootstrap's background loop, not from anything mounted), so it never
 * knew which strategy was selected and always used the generic SMA/RSI
 * blend regardless of what the picker showed. Persisted here so both the
 * UI and this loop read the same value.
 */
export async function getActiveStrategy(): Promise<StrategyId> {
  return loadSetting<StrategyId>(KEY_ACTIVE_STRATEGY, DEFAULT_STRATEGY);
}

export async function setActiveStrategySetting(strategy: StrategyId): Promise<void> {
  await saveSetting(KEY_ACTIVE_STRATEGY, strategy);
}

export interface AutopilotStatus {
  enabled: boolean;
  intervalMin: number;
  lastRunAt: string | null;
  lastResult: string | null;
  running: boolean;
}

// Re-entrancy guard: a cycle across N watchlist symbols can outlast the
// 1-minute check interval, and starting a second one on top would double
// up broker calls and CrewAI runs for the same tick.
let cycleInFlight = false;

export async function isAutopilotEnabled(): Promise<boolean> {
  return loadSetting(KEY_ENABLED, false);
}

export async function setAutopilotEnabled(enabled: boolean): Promise<void> {
  await saveSetting(KEY_ENABLED, enabled);
  if (enabled) {
    // Arm-now behavior: don't make the user wait a full interval for the
    // first cycle after flipping the switch on.
    await saveSetting(KEY_LAST_RUN, null);
  }
}

export async function getAutopilotIntervalMin(): Promise<number> {
  return loadSetting(KEY_INTERVAL_MIN, DEFAULT_INTERVAL_MIN);
}

export async function setAutopilotIntervalMin(min: number): Promise<void> {
  await saveSetting(KEY_INTERVAL_MIN, Math.max(MIN_INTERVAL_MIN, Math.round(min)));
}

export async function getAutopilotStatus(): Promise<AutopilotStatus> {
  const [enabled, intervalMin, lastRunAt, lastResult] = await Promise.all([
    isAutopilotEnabled(),
    getAutopilotIntervalMin(),
    loadSetting<string | null>(KEY_LAST_RUN, null),
    loadSetting<string | null>(KEY_LAST_RESULT, null),
  ]);
  return { enabled, intervalMin, lastRunAt, lastResult, running: cycleInFlight };
}

/**
 * Cheap technical-only screen across the full pair universe — one price
 * snapshot + one signal computation per symbol, no CrewAI research and no
 * full agent decision cycle. Deciding which pairs beyond the watchlist are
 * worth the expensive research+decision cycle this way, instead of running
 * that on all 17 pairs every single cycle, is what makes "learn from
 * everything" viable without multiplying CrewAI/VPS load 17x per tick.
 */
async function cheapScreen(strategy: StrategyId, exclude: Set<string>): Promise<string[]> {
  const flagged: string[] = [];
  for (const symbol of SCAN_UNIVERSE) {
    if (exclude.has(symbol)) continue;
    if (flagged.length >= MAX_SCAN_FLAGGED) break;
    try {
      const snap = await fetchMarketSnapshot(symbol);
      if (snap.bars.length < 60) continue;
      const series = buildStrategySeries(snap.bars);
      const signal = computeStrategySignal(strategy, series, series.closes.length - 1);
      if (signal !== 'hold') flagged.push(symbol);
    } catch (e) {
      console.warn(`[autopilot] cheap screen failed for ${symbol}:`, e);
    }
  }
  return flagged;
}

async function autopilotSymbols(): Promise<string[]> {
  const watch = await listWatchlist();
  const tickers = Array.from(new Set(watch.map(w => w.ticker.trim().toUpperCase()).filter(Boolean)));
  const base = tickers.length ? tickers : [DEFAULT_SYMBOL];
  if (!(await getScanAllPairs())) return base;
  const strategy = await getActiveStrategy();
  const flagged = await cheapScreen(strategy, new Set(base));
  return [...base, ...flagged];
}

/**
 * Which strategy to trade THIS pair with — the agent's own per-pair choice.
 * Reads the (pair × strategy) ledger: once a strategy has a real track record
 * (or a self-test prior) for this pair, the best-performing one is used;
 * before any data exists it falls back to the user's globally-selected
 * strategy, so a fresh install still behaves predictably.
 */
async function strategyForSymbol(symbol: string): Promise<StrategyId> {
  try {
    const candidates = [...DISTINCT_STRATEGIES];
    const ranked = await rankStrategiesForPair(symbol, candidates);
    const top = ranked[0];
    if (top?.tested) return top.strategy as StrategyId;
  } catch (e) {
    console.warn(`[autopilot] per-pair strategy pick failed for ${symbol}:`, e);
  }
  return getActiveStrategy();
}

async function runOneSymbol(symbol: string): Promise<string> {
  // Fresh intel every cycle — the agent scores off whatever the latest
  // completed report says, so a stale one defeats the point of running
  // on a schedule at all.
  try {
    await runTradingResearch({ ticker: symbol });
  } catch (e) {
    console.warn(`[autopilot] research failed for ${symbol}:`, e);
  }

  try {
    const strategy = await strategyForSymbol(symbol);
    const result = await runTradingAgent({ symbol, autoExecute: true, strategy });
    return `${symbol}: ${strategy} · ${result.message ?? result.decision.action}`;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[autopilot] agent cycle failed for ${symbol}:`, e);
    return `${symbol}: cycle error — ${msg}`;
  }
}

/**
 * Self-test: interval-gated backtest of every watchlist pair × distinct
 * strategy, written into the ledger as each pair×strategy's "prior". This is
 * how the agent "tests strategies itself" — so per-pair selection has real,
 * data-driven priors before enough live trades accumulate, and the ledger keeps
 * a fresh read on what backtests well where. Non-blocking and gated so it never
 * competes with the actual trading cycle more than once every SELFTEST_INTERVAL.
 */
async function watchlistPairs(): Promise<string[]> {
  const watch = await listWatchlist();
  const pairs = Array.from(new Set(watch.map(w => w.ticker.trim().toUpperCase()).filter(Boolean)));
  return pairs.length ? pairs : [DEFAULT_SYMBOL];
}

/**
 * Run the full self-test for the given pairs and write every result into the
 * ledger as that (pair × strategy)'s prior. Two engines feed the SAME ledger:
 *   1. AXE Algo's own distinct strategies (runBacktest / TS engine).
 *   2. vectorbt's clean vbt:* strategies (isolated venv on the VPS).
 * They compete on equal footing — the framework-agnostic "what works where"
 * brain then ranks them per pair. This is how a framework "plugs in": as more
 * candidates in the same ledger, not a new brain.
 */
export async function selfTestPairs(pairs: string[]): Promise<void> {
  const strategies = [...DISTINCT_STRATEGIES];
  for (const pair of pairs) {
    // ── AXE Algo's own strategies ──
    for (const strategy of strategies) {
      try {
        const res = await runBacktest({ symbol: pair, strategy, timeframe: '1h', limit: SELFTEST_BARS });
        if (!res.ok) continue;
        const r = res.result;
        await recordLedgerBacktest({
          pair, strategy,
          backtest: {
            netReturnPct: r.netReturnPct,
            winRate: r.winRate,
            profitFactor: Number.isFinite(r.profitFactor) ? r.profitFactor : 99,
            trades: r.totalTrades,
            timeframe: '1h',
            bars: r.candleCount,
            at: new Date().toISOString(),
          },
        });
      } catch (e) {
        console.warn(`[autopilot] self-test failed for ${pair}/${strategy}:`, e);
      }
    }
    // ── vectorbt framework strategies (VPS) ──
    try {
      const vbt = await backtestVectorbt(pair, '1h', SELFTEST_BARS);
      if (vbt?.ok && vbt.strategies) {
        for (const [strategy, s] of Object.entries(vbt.strategies)) {
          if (!s || s.error || !Number.isFinite(s.netReturnPct)) continue;
          await recordLedgerBacktest({
            pair, strategy,
            backtest: {
              netReturnPct: s.netReturnPct,
              winRate: s.winRate,
              profitFactor: Number.isFinite(s.profitFactor) ? s.profitFactor : 99,
              trades: s.trades,
              timeframe: '1h',
              bars: vbt.bars,
              at: new Date().toISOString(),
            },
          });
        }
      }
    } catch (e) {
      console.warn(`[autopilot] vectorbt self-test failed for ${pair}:`, e);
    }
  }

  // Regenerate the growing Obsidian trading knowledge base from the freshly
  // updated ledger — one living scorecard per pair + the strategy index.
  try {
    await syncTradingObsidian();
  } catch (e) {
    console.warn('[autopilot] trading Obsidian sync failed:', e);
  }
}

/** Interval-gated background self-test (called each cycle). */
export async function maybeSelfTest(): Promise<void> {
  const last = await loadSetting<string | null>(KEY_LAST_SELFTEST, null);
  if (last && Date.now() - Date.parse(last) < SELFTEST_INTERVAL_MS) return;
  await saveSetting(KEY_LAST_SELFTEST, new Date().toISOString());
  await selfTestPairs(await watchlistPairs());
}

/** Force a self-test right now (bypasses the interval gate) — wired to the
 *  "Run self-test" button so the ledger fills on demand. */
export async function runSelfTestNow(pairs?: string[]): Promise<void> {
  await saveSetting(KEY_LAST_SELFTEST, new Date().toISOString());
  await selfTestPairs(pairs && pairs.length ? pairs : await watchlistPairs());
}

/** One full cycle: manage open positions first (protect profit / early exits),
 *  then run research + a decision per symbol. Shared by the scheduled loop and
 *  the manual "run now" so both get the same behavior. */
async function runAutopilotCycle(): Promise<void> {
  await saveSetting(KEY_LAST_RUN, new Date().toISOString());
  // Self-test in the background (interval-gated) so the ledger's per-pair
  // strategy priors stay fresh without blocking this cycle's trading.
  void maybeSelfTest().catch(() => { /* non-fatal */ });
  // Manage OPEN positions first — protect profit on trades that turned against
  // us before spending the cycle hunting new entries.
  try {
    const managed = await manageOpenPositions();
    const closed = managed.filter(m => m.closed);
    if (closed.length) {
      console.info('[autopilot] early exits:', closed.map(c => `${c.symbol} (${c.reason})`).join(' · '));
    }
  } catch (e) {
    console.warn('[autopilot] position management failed:', e);
  }

  const symbols = await autopilotSymbols();
  const summaries: string[] = [];
  // Sequential, not parallel — the crew run + broker calls per symbol are
  // already rate-limit-sensitive; running the watchlist concurrently would
  // multiply that pressure for no benefit.
  for (const symbol of symbols) {
    summaries.push(await runOneSymbol(symbol));
  }
  await saveSetting(KEY_LAST_RESULT, summaries.join(' · ').slice(0, 2000));
}

/** Interval-gate check — cheap to call every minute; no-ops until due. */
export async function maybeRunTradingAutopilot(): Promise<void> {
  if (cycleInFlight) return;
  const enabled = await isAutopilotEnabled();
  if (!enabled) return;

  const intervalMin = await getAutopilotIntervalMin();
  const last = await loadSetting<string | null>(KEY_LAST_RUN, null);
  const dueAt = last ? Date.parse(last) + intervalMin * 60_000 : 0;
  if (Date.now() < dueAt) return;

  cycleInFlight = true;
  try {
    await runAutopilotCycle();
  } finally {
    cycleInFlight = false;
  }
}

/** Manual "run now" — bypasses the due-time check but still respects the
 *  re-entrancy guard. Used by the Agent tab's "Run cycle now" button. */
export async function runTradingAutopilotNow(): Promise<void> {
  if (cycleInFlight) return;
  cycleInFlight = true;
  try {
    await runAutopilotCycle();
  } finally {
    cycleInFlight = false;
  }
}
