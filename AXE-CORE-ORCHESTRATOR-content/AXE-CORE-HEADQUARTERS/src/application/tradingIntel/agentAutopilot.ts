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
import { accountSupportsSymbol } from '@/infrastructure/gateways/metaApiService';
import { tradablePairsForAccount } from '@/infrastructure/gateways/metaApiSymbolResolver';
import { runTradingResearch } from '@/application/tradingIntel/runTradingResearch';
import { runTradingAgent, buildStrategySeries } from '@/application/tradingIntel/tradingAgentEngine';
import { fetchTradeableSnapshot } from '@/infrastructure/gateways/marketDataService';
import { computeStrategySignal, DISTINCT_STRATEGIES, type StrategyId } from '@/application/tradingIntel/strategySignals';
import { manageOpenPositions } from '@/application/tradingIntel/positionManager';
import { rankStrategiesForPair, recordLedgerBacktest } from '@/infrastructure/persistence/tradingLedgerService';
import { reconcileLiveTrades } from '@/application/tradingIntel/liveTradeReconciler';
import { runBacktest } from '@/application/tradingIntel/backtestEngine';
import { backtestVectorbt, vectorbtSignal, backtestNautilus, nautilusSignal, backtestTradingAgents, tradingAgentsSignal } from '@/infrastructure/gateways/axeCoreApiService';
import { frameworkOf } from '@/domain/tradingIntel/strategyColors';
import type { MetaApiConfig } from '@/infrastructure/gateways/metaApiService';
import { toEngineInterval } from '@/domain/tradingIntel/timeframes';
import { tradeableAccounts, accountLabel } from '@/infrastructure/persistence/tradingAccountsService';
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

/** What the algo reaches for when the ledger has nothing at all to say.
 *  Owned by the algo, unreachable from the UI — see strategyForSymbol. */
const ALGO_FALLBACK_STRATEGY: StrategyId = 'trend-follow';

/**
 * Timeframes the algo may choose between, and its fallback.
 *
 * Everything used to run at h1 because selfTestPairs said so — one hard-coded
 * string decided the timeframe for every pair and every strategy, which meant
 * "which timeframe works here" was a question the system could not even ask.
 * Same shape of mistake as the single global strategy: a choice frozen into a
 * constant looks like a decision until you go looking for who made it.
 *
 * Kept to four. Each one multiplies the self-test matrix by its own count
 * (pairs x strategies x timeframes), and m5 on a research cycle that runs every
 * few minutes is noise rather than signal.
 */
const ALGO_TIMEFRAMES = ['m15', 'h1', 'h4', 'd1'] as const;
const ALGO_FALLBACK_TIMEFRAME = 'h1';


// Kept separate from useTradingDeskState.ts's COMMON_PAIRS (same list) —
// application/ must not import from presentation/ (no-restricted-imports).
//
// This is now only the FALLBACK. The real universe comes from the broker (see
// scanUniverse below) so AXE looks at what this account can actually trade,
// not at a list someone typed once. Silver was the tell: XAGUSD sat in here,
// was traded, and still never earned a ledger row.
const SCAN_UNIVERSE = [
  'XAUUSD', 'XAGUSD', 'EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'AUDUSD', 'NZDUSD', 'USDCAD',
  'BTCUSD', 'ETHUSD', 'US30', 'US500', 'NAS100', 'GER40', 'UK100', 'WTIUSD',
] as const;

/** Broker symbol list, cached — see scanUniverse(). */
const KEY_BROKER_SYMBOLS = 'axe_trading_broker_symbols';
const KEY_BROKER_SYMBOLS_AT = 'axe_trading_broker_symbols_at';
const SYMBOLS_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Every instrument this account can trade, refreshed daily.
 *
 * Deliberately feeds the SCREEN and not the watchlist. The watchlist gets a
 * full research + decision cycle per symbol per run; pouring a broker's entire
 * catalogue into it would mean hundreds of those back to back, which is how
 * this project spent an evening hammering its own database into the ground.
 * The screen is bars plus arithmetic — cheap enough to run over everything,
 * and MAX_SCAN_FLAGGED still caps how many earn the expensive treatment.
 *
 * Cached for a day: a broker's instrument list does not change hour to hour,
 * and this must not become another background call that never stops.
 */
async function scanUniverse(): Promise<string[]> {
  const cachedAt = await loadSetting<number>(KEY_BROKER_SYMBOLS_AT, 0);
  const cached = await loadSetting<string[]>(KEY_BROKER_SYMBOLS, []);
  if (cached.length && Date.now() - cachedAt < SYMBOLS_TTL_MS) return cached;

  // The union of what the registry can name AND some connected account can
  // actually trade — canonical AXE ids, resolved to each broker's own ticker
  // at order time.
  //
  // This used to be the broker's raw catalogue. On MetaQuotes-Demo that is
  // 12.524 entries, nearly all of them single US equity tickers (A, AA, AAA),
  // which is not a universe an FX/metals/index algo should be screening — and
  // it came from ONE account, so the list did not even describe the other one.
  // Measured 2026-08-21 the registry resolves 22 real markets across the two
  // accounts, 17 of them on both.
  const accounts = await tradeableAccounts().catch(() => [] as MetaApiConfig[]);
  const union = new Set<string>();
  for (const account of accounts) {
    const pairs = await tradablePairsForAccount({
      token: account.token, accountId: account.accountId, region: account.region,
    }).catch(() => [] as string[]);
    for (const p of pairs) union.add(p);
  }

  if (!union.size) {
    // No account answered. Keep the last good list, and the hand-written one
    // beneath it — a lookup failure must not shrink the algo's world.
    console.warn('[autopilot] no account could report a symbol list');
    return cached.length ? cached : [...SCAN_UNIVERSE];
  }

  const symbols = [...union];
  await saveSetting(KEY_BROKER_SYMBOLS, symbols);
  await saveSetting(KEY_BROKER_SYMBOLS_AT, Date.now());
  console.info(`[autopilot] scan universe: ${symbols.length} pairs across ${accounts.length} account(s)`);
  return symbols;
}

// How many instruments the cheap screen may EXAMINE in one cycle.
//
// The universe now comes from the broker and can run to hundreds. cheapScreen
// fetches a market snapshot per symbol, so walking the whole catalogue every
// cycle would be hundreds of MetaAPI calls a run — and MetaAPI is the service
// that answers "The quota has been exceeded" when pushed. Widening the view
// must not mean recreating, against the broker, the same self-inflicted load
// that was just taken off Supabase.
//
// So each cycle examines a window and the window moves on (see scanOffset).
// Nothing is skipped, it is just spread over several cycles instead of
// demanded all at once.
const MAX_SCAN_EXAMINED = 40;
const KEY_SCAN_OFFSET = 'axe_trading_scan_offset';

// Caps how many extra (non-watchlist) pairs get the expensive research+
// decision cycle in one run, regardless of how many the screen flags.
// Was 6, sized for a screen that could only ever flag pairs matching one
// strategy. Now that every strategy gets a look, more pairs legitimately
// qualify — and the whole universe is 17, so this is a real widening without
// becoming "research everything, every cycle".
const MAX_SCAN_FLAGGED = 10;

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
async function cheapScreen(exclude: Set<string>): Promise<string[]> {
  const flagged: string[] = [];
  const universe = await scanUniverse();

  // Rotating window: start where the last cycle stopped, wrap around the end.
  // Over a handful of cycles the whole catalogue is covered, and no single
  // cycle asks the broker for more than it should.
  const offset = universe.length
    ? (await loadSetting<number>(KEY_SCAN_OFFSET, 0)) % universe.length
    : 0;
  const window = universe.length > MAX_SCAN_EXAMINED
    ? Array.from({ length: MAX_SCAN_EXAMINED }, (_, k) => universe[(offset + k) % universe.length])
    : universe;
  if (universe.length > MAX_SCAN_EXAMINED) {
    await saveSetting(KEY_SCAN_OFFSET, (offset + MAX_SCAN_EXAMINED) % universe.length);
  }

  for (const symbol of window) {
    if (exclude.has(symbol)) continue;
    if (flagged.length >= MAX_SCAN_FLAGGED) break;
    try {
      const snap = await fetchTradeableSnapshot(symbol);
      if (snap.bars.length < 60) continue;
      const series = buildStrategySeries(snap.bars);
      const i = series.closes.length - 1;
      // Ask every strategy, not just the active one.
      //
      // This ran a single strategy — whatever getActiveStrategy() returned,
      // which is one global setting — across all 17 pairs. So a pair was only
      // ever noticed if THAT strategy happened to fire on it right now, and a
      // pair where something else had a clear edge stayed invisible.
      //
      // Measured 2026-08-19: the ledger holds 12 strategies per pair and
      // already knew volumetric-ob was the strongest on BTCUSD (+0.132%),
      // while the active strategy was mean-reversion (+0.018%) — and that one
      // strategy was also the only lens the screen looked through. Five pairs
      // had ever been reached. Silver was traded and never even got a row.
      //
      // Flagging on ANY strategy firing costs nothing extra: the bars are
      // already fetched, and this is arithmetic on arrays in memory. Which
      // strategy then actually trades the pair is the ledger's decision, not
      // this screen's — this only decides what is worth a closer look.
      const fires = [...DISTINCT_STRATEGIES].some(
        (candidate: StrategyId) => computeStrategySignal(candidate, series, i) !== 'hold',
      );
      if (fires) flagged.push(symbol);
    } catch (e) {
      console.warn(`[autopilot] cheap screen failed for ${symbol}:`, e);
    }
  }
  return flagged;
}


async function autopilotSymbols(): Promise<string[]> {
  // The watchlist itself must never be the thing that stops trading.
  let base: string[];
  try {
    const watch = await listWatchlist();
    const tickers = Array.from(new Set(watch.map(w => w.ticker.trim().toUpperCase()).filter(Boolean)));
    base = tickers.length ? tickers : [DEFAULT_SYMBOL];
  } catch (e) {
    console.warn('[autopilot] watchlist unreadable, falling back to the default symbol:', e);
    base = [DEFAULT_SYMBOL];
  }
  if (!(await getScanAllPairs().catch(() => false))) return base;
  // No strategy argument any more. cheapScreen used to be handed the globally
  // selected one and flag only pairs where THAT fired; it now asks every
  // strategy, so passing the UI's choice in here was the last thread by which
  // clicking a card could still steer the algo.
  // The screen is an ENRICHMENT, and it was able to kill the cycle.
  //
  // cheapScreen walks the broker's whole instrument list for bars, which is
  // exactly the call MetaAPI rate-limits. When it threw "The quota has been
  // exceeded", runAutopilotCycle died here -- before a single symbol was
  // considered, before manageOpenPositions' results were used, and before
  // KEY_LAST_RESULT was written. Measured 2026-08-20: last_run advancing every
  // cycle (13:38 today) while last_result sat frozen at 2026-08-19 18:14 with
  // "cycle error - The quota has been exceeded", and no trade opened for a day
  // while the desk still read "Autopilot ON, next in ~14m".
  //
  // Finding fewer candidates is a smaller loss than trading nothing, so a
  // failed screen now degrades to the watchlist instead of taking the cycle
  // down with it.
  try {
    const flagged = await cheapScreen(new Set(base));
    return [...base, ...flagged];
  } catch (e) {
    console.warn('[autopilot] pair screen failed, trading the watchlist only:', e);
    return base;
  }
}

/**
 * Which strategy to trade THIS pair with — the agent's own per-pair choice.
 * Reads the (pair × strategy) ledger: once a strategy has a real track record
 * (or a self-test prior) for this pair, the best-performing one is used;
 * before any data exists it falls back to the user's globally-selected
 * strategy, so a fresh install still behaves predictably.
 */
/** vectorbt framework strategies — candidates in the ledger alongside AXE's
 *  own, auto-selected and traded via their off-box live signal. */
const VBT_STRATEGIES = ['vbt:ma-cross', 'vbt:rsi-meanrev', 'vbt:bbands', 'vbt:macd'];

/** Per-pair strategy — may be one of AXE Algo's own OR a framework strategy
 *  (vbt:*), whichever the ledger ranks best. Returns a plain string since a
 *  framework name isn't a StrategyId. */
async function strategyForSymbol(symbol: string): Promise<{ strategy: string; timeframe: string }> {
  try {
    const candidates = [...DISTINCT_STRATEGIES, ...VBT_STRATEGIES];
    const ranked = await rankStrategiesForPair(symbol, candidates, [...ALGO_TIMEFRAMES]);
    const top = ranked[0];
    if (top?.tested) return { strategy: top.strategy, timeframe: top.timeframe };
    // Nothing tested on this pair yet. rankStrategiesForPair still ordered the
    // candidates, giving every untested one the same small explore score, so
    // taking the head is a deliberate exploration pick rather than a default —
    // and the trade it produces becomes the first real evidence for this pair.
    if (top) return { strategy: top.strategy, timeframe: top.timeframe };
  } catch (e) {
    console.warn(`[autopilot] per-pair strategy pick failed for ${symbol}:`, e);
  }
  // Last resort only — and NOT the strategy selected in the UI.
  //
  // This used to return getActiveStrategy(), the single global setting behind
  // the strategy cards. So clicking a card to run a backtest also decided what
  // the algo traded with, everywhere, on every pair with no ledger history.
  // Luka's backtests kept naming mean-reversion, he clicked it, and the live
  // record then showed why that was the wrong conclusion: 55 trades on BTCUSD,
  // 15 won, -15.8%, while volumetric-ob sat at 14 wins from 15 trades untouched.
  //
  // The cards are now his backtesting bench and nothing more. What the algo
  // trades is decided by the ledger, per pair.
  return { strategy: ALGO_FALLBACK_STRATEGY, timeframe: ALGO_FALLBACK_TIMEFRAME };
}

/**
 * Run the decision once per account marked for trading.
 *
 * Sequential, and the whole decision is repeated rather than the order being
 * mirrored: sizing reads that account's equity, and the circuit breaker reads
 * that account's drawdown, so an account near its limit has to be able to
 * refuse a trade another account takes. That is the difference between three
 * accounts and one account copied three times, and on a prop account it is the
 * difference that ends the challenge.
 *
 * With fewer than two enabled accounts this runs exactly once with no account
 * argument, which is the original single-account path untouched.
 */
async function runOnEveryAccount(
  symbol: string,
  run: (base: { account?: MetaApiConfig }) => Promise<{ message?: string; decision: { action: string } }>,
): Promise<string> {
  const accounts = await tradeableAccounts().catch(() => [] as MetaApiConfig[]);
  if (!accounts.length) {
    const r = await run({});
    return r.message ?? r.decision.action;
  }
  const parts: string[] = [];
  for (const account of accounts) {
    const label = await accountLabel(account.accountId).catch(() => account.accountId.slice(0, 8));

    // Ask the broker for a market it does not carry and MetaAPI counts it as a
    // NotFoundError; enough of those and it throttles the whole subscription
    // with "The quota has been exceeded". MT5 has no BTCUSD, OANDA has no
    // XAUUSD, and the autopilot was asking both for both every cycle. Skipping
    // is not a degradation — the order could never have filled.
    const supported = await accountSupportsSymbol(account, symbol).catch(() => true);
    if (!supported) {
      parts.push(`${label}: ${symbol} not offered by this broker`);
      continue;
    }

    try {
      const r = await run({ account });
      parts.push(`${label}: ${r.message ?? r.decision.action}`);
    } catch (e) {
      // One account failing must not stop the others — that is the whole point
      // of them being separate accounts.
      //
      // The message alone is not enough, and this one cost five rounds to
      // learn. "The quota has been exceeded." was read as a rate limit and
      // answered with pacing, per-subscription bucketing, caching and priority
      // — none of which helped, because it was never about call volume. The
      // broker's own words, once an order finally reached it, were: "you are
      // trying to access too many unexisting or undeployed trading accounts …
      // check your logs for NotFoundError". A wrong account id, not a ceiling.
      // So the origin travels with the error from here on: a message that does
      // not say where it came from will be mis-attributed, confidently, for as
      // long as you let it.
      const msg = e instanceof Error ? e.message : String(e);
      const frame = e instanceof Error && e.stack
        ? (e.stack.split('\n')[1] ?? '').trim().replace(/^at\s+/, '').slice(0, 90)
        : '';
      parts.push(`${label}: ${msg}${frame ? ` [raised in ${frame}]` : ''}`);
    }
  }
  return parts.join(' | ');
}

/**
 * How long fresh research may take before the cycle moves on without it.
 *
 * Measured 2026-08-21: symbol bursts eight minutes apart, with nothing written
 * in between — one `runTradingResearch` call per symbol, unbounded, grinding
 * through a provider cascade in which Gemini, Anthropic, OpenAI, Groq and
 * Ollama were all failing. At eight minutes a symbol, a cycle covering ~16
 * pairs across two accounts takes hours against a fifteen-minute interval, so
 * the loop can never catch up and most pairs are never reached at all.
 *
 * Yesterday's intel is worth far more than today's stalled cycle: the agent
 * already scores off the latest COMPLETED report and already tolerates a
 * failed research call, so a timeout lands on a path that exists.
 */
const RESEARCH_DEADLINE_MS = 45_000;

async function runOneSymbol(symbol: string): Promise<string> {
  // Fresh intel every cycle — the agent scores off whatever the latest
  // completed report says, so a stale one defeats the point of running
  // on a schedule at all. Bounded, because a slow provider must not be able
  // to spend the whole cycle on one symbol.
  try {
    const timedOut = Symbol('timeout');
    const outcome = await Promise.race([
      runTradingResearch({ ticker: symbol }),
      new Promise(resolve => setTimeout(() => resolve(timedOut), RESEARCH_DEADLINE_MS)),
    ]);
    if (outcome === timedOut) {
      console.warn(
        `[autopilot] research for ${symbol} exceeded ${RESEARCH_DEADLINE_MS / 1000}s — ` +
        `deciding on the last completed report instead`,
      );
    }
  } catch (e) {
    console.warn(`[autopilot] research failed for ${symbol}:`, e);
  }

  try {
    const { strategy, timeframe } = await strategyForSymbol(symbol);
    let result;
    if (strategy.includes(':')) {
      // Framework strategy the ledger selected — fetch its current signal
      // off-box (the VPS engine) and trade on it, attributed as this strategy.
      let sig: 'buy' | 'sell' | 'hold' = 'hold';
      // Ask the engine that OWNS this strategy.
      //
      // This used to call vectorbtSignal for anything with a colon in its
      // name, back when vectorbt was the only framework. A nt: strategy sent
      // there returns a signals map that simply has no such key, so sig stayed
      // 'hold' and the strategy never traded once — while the ledger went on
      // ranking it first and the Frameworks tab went on calling it wired.
      const fw = frameworkOf(strategy);
      const ask = fw === 'nt' ? nautilusSignal : fw === 'vbt' ? vectorbtSignal : fw === 'ta' ? tradingAgentsSignal : null;
      if (!ask) {
        console.warn(`[autopilot] no engine owns ${strategy} — holding`);
      } else {
        try {
          // The timeframe the ledger picked, not a fixed one — otherwise a
          // framework strategy chosen FOR h4 would still be signalled on h1.
          // The engines speak TwelveData's dialect; the ledger and the chart
          // speak MT5's. Passing the canonical name straight through is what
          // filed every framework prior under a timeframe nothing else used.
          const r = await ask(symbol, toEngineInterval(timeframe));
          if (r?.ok && r.signals?.[strategy]) sig = r.signals[strategy];
        } catch (e) {
          console.warn(`[autopilot] ${fw} signal failed for ${symbol}/${strategy}:`, e);
        }
      }
      result = await runOnEveryAccount(symbol, base => runTradingAgent({ ...base, symbol, autoExecute: true, strategySignalOverride: sig, strategyName: strategy, timeframe }));
    } else {
      result = await runOnEveryAccount(symbol, base => runTradingAgent({ ...base, symbol, autoExecute: true, strategy: strategy as StrategyId, timeframe }));
    }
    return `${symbol}: ${strategy} @ ${timeframe} · ${result}`;
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
      // Every timeframe, not just h1. A strategy can be an edge on h4 and noise
      // on m15, and testing one timeframe made that difference invisible —
      // the ledger then ranked strategies as if the timeframe were settled.
      // TradingAgents, once, at d1 only.
    //
    // Not a cost dodge: the firm reasons about fundamentals, news and sentiment
    // with a multi-day horizon, and its own recommendation carries a
    // time_horizon_days. Asking it what to do on a 15-minute candle would be
    // asking a question it does not answer, and the ledger would then rank the
    // nonsense against real m15 rows. One engine call per pair, at the only
    // timeframe where its output means anything.
    try {
      const ta = await backtestTradingAgents(pair, toEngineInterval('d1'));
      if (ta?.ok && ta.strategies) {
        for (const [strategy, st] of Object.entries(ta.strategies)) {
          if (!st || st.error || !Number.isFinite(st.netReturnPct)) continue;
          await recordLedgerBacktest({
            pair, strategy,
            backtest: {
              netReturnPct: st.netReturnPct,
              winRate: st.winRate,
              profitFactor: Number.isFinite(st.profitFactor) ? st.profitFactor : 99,
              trades: st.trades,
              timeframe: 'd1',
              bars: ta.bars,
              at: new Date().toISOString(),
            },
          });
        }
      }
    } catch (e) {
      console.warn(`[autopilot] tradingagents self-test failed for ${pair}:`, e);
    }

    for (const timeframe of ALGO_TIMEFRAMES) {
        try {
          const res = await runBacktest({ symbol: pair, strategy, timeframe, limit: SELFTEST_BARS });
          if (!res.ok) continue;
          const r = res.result;
          await recordLedgerBacktest({
            pair, strategy,
            backtest: {
              netReturnPct: r.netReturnPct,
              winRate: r.winRate,
              profitFactor: Number.isFinite(r.profitFactor) ? r.profitFactor : 99,
              trades: r.totalTrades,
              timeframe,
              bars: r.candleCount,
              at: new Date().toISOString(),
            },
          });
        } catch (e) {
          console.warn(`[autopilot] self-test failed for ${pair}/${strategy}/${timeframe}:`, e);
        }
      }
    }
    // ── Framework strategies (VPS engines) ──
    //
    // Every timeframe, exactly like AXE's own strategies above. This used to
    // run once at a hard-coded hour, which meant a framework could only ever
    // be selected for h1 no matter how much better it was on h4 -- the same
    // frozen-constant mistake as the single global strategy before it, one
    // level down.
    //
    // Measured on the box before widening it: a full Nautilus run over 800
    // bars and four strategies takes ~1s, so two engines across four
    // timeframes is about 8 seconds per pair on a self-test that runs twice a
    // day. There was no cost reason to keep it pinned.
    // TradingAgents, once, at d1 only.
    //
    // Not a cost dodge: the firm reasons about fundamentals, news and sentiment
    // with a multi-day horizon, and its own recommendation carries a
    // time_horizon_days. Asking it what to do on a 15-minute candle would be
    // asking a question it does not answer, and the ledger would then rank the
    // nonsense against real m15 rows. One engine call per pair, at the only
    // timeframe where its output means anything.
    try {
      const ta = await backtestTradingAgents(pair, toEngineInterval('d1'));
      if (ta?.ok && ta.strategies) {
        for (const [strategy, st] of Object.entries(ta.strategies)) {
          if (!st || st.error || !Number.isFinite(st.netReturnPct)) continue;
          await recordLedgerBacktest({
            pair, strategy,
            backtest: {
              netReturnPct: st.netReturnPct,
              winRate: st.winRate,
              profitFactor: Number.isFinite(st.profitFactor) ? st.profitFactor : 99,
              trades: st.trades,
              timeframe: 'd1',
              bars: ta.bars,
              at: new Date().toISOString(),
            },
          });
        }
      }
    } catch (e) {
      console.warn(`[autopilot] tradingagents self-test failed for ${pair}:`, e);
    }

    for (const timeframe of ALGO_TIMEFRAMES) {
      const interval = toEngineInterval(timeframe);
      for (const [label, run] of [
        ['vectorbt', () => backtestVectorbt(pair, interval, SELFTEST_BARS)],
        ['nautilus', () => backtestNautilus(pair, interval, SELFTEST_BARS)],
      ] as const) {
        try {
          const res = await run();
          if (res?.ok && res.strategies) {
            for (const [strategy, st] of Object.entries(res.strategies)) {
              if (!st || st.error || !Number.isFinite(st.netReturnPct)) continue;
              await recordLedgerBacktest({
                pair, strategy,
                backtest: {
                  netReturnPct: st.netReturnPct,
                  winRate: st.winRate,
                  profitFactor: Number.isFinite(st.profitFactor) ? st.profitFactor : 99,
                  trades: st.trades,
                  // Canonical, not the engine's dialect — see timeframes.ts.
                  timeframe,
                  bars: res.bars,
                  at: new Date().toISOString(),
                },
              });
            }
          }
        } catch (e) {
          // An engine that is not installed answers 503. That is a normal state
          // for a framework nobody has deployed yet, not a reason to abandon
          // the pair, the timeframe, or the other engine.
          console.warn(`[autopilot] ${label} self-test failed for ${pair} @ ${timeframe}:`, e);
        }
      }
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

  // Learn from what actually happened, before deciding anything new.
  //
  // Everything below this line ranks strategies on their record. Until today
  // that record was backtests only: the ledger's live side had never been
  // written, because the sole caller of recordTradeOutcome() was the paper
  // book. Real trades closed at the broker and vanished.
  //
  // Running it first means a position that closed since the last cycle is
  // already in the ledger by the time strategyForSymbol() picks this cycle's
  // strategy — the loop closes within one cycle rather than one behind.
  try {
    const rec = await reconcileLiveTrades();
    if (rec.error) {
      console.warn('[autopilot] live trade reconcile failed:', rec.error);
    } else if (rec.recorded > 0) {
      console.info(
        `[autopilot] folded ${rec.recorded} closed trade(s) into the ledger` +
        (rec.unattributed ? ` (${rec.unattributed} without a strategy tag)` : ''),
      );
    }
  } catch (e) {
    // Never fatal: not knowing the outcome of yesterday's trades is a reason
    // to decide more cautiously, not a reason to stop trading.
    console.warn('[autopilot] live trade reconcile threw:', e);
  }

  // Whatever happens below, the desk has to be able to say what happened.
  //
  // KEY_LAST_RESULT was written only on the success path, so a cycle that threw
  // early left the previous run's text on screen indefinitely -- the one state
  // that looks identical to "nothing has gone wrong yet".
  const summaries: string[] = [];
  try {
    const symbols = await autopilotSymbols();
    // Sequential, not parallel — the crew run + broker calls per symbol are
    // already rate-limit-sensitive; running the watchlist concurrently would
    // multiply that pressure for no benefit.
    for (const symbol of symbols) {
      summaries.push(await runOneSymbol(symbol));
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn('[autopilot] cycle failed before finishing:', e);
    summaries.push(`cycle stopped early — ${msg}`);
  } finally {
    // A STATUS WRITE MUST NOT BE ABLE TO END THE LOOP.
    //
    // Measured 2026-08-20: the cycle finished all six symbols at 23:06:45 —
    // decisions, intel and lessons all written — and then never returned. The
    // last statement is this write, and saveSetting goes to Supabase with no
    // timeout. Worse than losing the status: runAutopilotCycle never resolves,
    // so `cycleInFlight` stays true and EVERY later tick returns early. One
    // hung write permanently stopped a 24/7 trading loop, and from outside it
    // looked exactly like an idle app.
    //
    // Bounded and swallowed. Losing the line on the desk is a cosmetic loss;
    // losing the loop is not.
    // ...but it must not swallow its own failure either, and the first version
    // of this guard did. Measured 2026-08-21: cycles ran to completion and
    // released the lock, KEY_LAST_RUN advanced every time, and KEY_LAST_RESULT
    // sat unchanged for hours — because the bounded write was `.catch(() => {})`
    // and a rejected or slow write left no trace anywhere. A frozen status line
    // is indistinguishable from an idle desk, which is the exact confusion this
    // whole investigation kept paying for.
    const text = (summaries.join(' · ') || 'cycle produced no result').slice(0, 2000);
    const timedOut = Symbol('timeout');
    const outcome = await Promise.race([
      saveSetting(KEY_LAST_RESULT, text).then(() => 'ok' as const),
      new Promise(resolve => setTimeout(() => resolve(timedOut), 10_000)),
    ]).catch((e: unknown) => (e instanceof Error ? e.message : String(e)));

    if (outcome !== 'ok') {
      const why = outcome === timedOut ? 'timed out after 10s' : String(outcome);
      console.error(`[autopilot] status write did not land: ${why}`);
      // A short second write, so the NEXT cycle tells us which half is broken:
      // if this lands, the long value is the problem; if nothing lands, the
      // write path is. Losing the detail is survivable — losing the signal
      // that anything happened at all is what cost this project days.
      await Promise.race([
        saveSetting(
          KEY_LAST_RESULT,
          `status write failed (${why}) — cycle DID finish ${summaries.length} symbol(s) at ${new Date().toISOString()}`,
        ),
        new Promise(resolve => setTimeout(resolve, 5_000)),
      ]).catch(() => { /* genuinely nothing left to try */ });
    }
  }
}

/** Interval-gate check — cheap to call every minute; no-ops until due. */
/**
 * How long a cycle may hold the re-entrancy guard before it is presumed dead.
 *
 * `cycleInFlight` exists so two cycles cannot trade at once, which is right —
 * but a boolean that is only cleared by a `finally` is only as reliable as the
 * slowest thing inside the try. A cycle that never resolves silences the
 * autopilot forever, and nothing on screen says so.
 *
 * Generous: a full sweep across two accounts, six-plus symbols, research per
 * symbol and paced broker reads legitimately takes minutes.
 */
const CYCLE_WATCHDOG_MS = 20 * 60_000;
let cycleStartedAt = 0;

export async function maybeRunTradingAutopilot(): Promise<void> {
  if (cycleInFlight) {
    if (Date.now() - cycleStartedAt < CYCLE_WATCHDOG_MS) return;
    // Presumed dead. Releasing the guard is the lesser risk: the alternative is
    // an autopilot that is permanently off while reporting itself ON.
    console.warn('[autopilot] previous cycle exceeded the watchdog — releasing the guard');
    cycleInFlight = false;
  }
  const enabled = await isAutopilotEnabled();
  if (!enabled) return;

  const intervalMin = await getAutopilotIntervalMin();
  const last = await loadSetting<string | null>(KEY_LAST_RUN, null);
  const dueAt = last ? Date.parse(last) + intervalMin * 60_000 : 0;
  if (Date.now() < dueAt) return;

  cycleInFlight = true;
  cycleStartedAt = Date.now();
  try {
    await runAutopilotCycle();
  } finally {
    cycleInFlight = false;
  }
}

/** Manual "run now" — bypasses the due-time check but still respects the
 *  re-entrancy guard. Used by the Agent tab's "Run cycle now" button. */
export async function runTradingAutopilotNow(): Promise<void> {
  if (cycleInFlight && Date.now() - cycleStartedAt < CYCLE_WATCHDOG_MS) return;
  cycleInFlight = true;
  cycleStartedAt = Date.now();
  try {
    await runAutopilotCycle();
  } finally {
    cycleInFlight = false;
  }
}
