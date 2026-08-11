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
import { runTradingAgent } from '@/application/tradingIntel/tradingAgentEngine';
import type { StrategyId } from '@/application/tradingIntel/strategySignals';

const KEY_ENABLED = 'axe_trading_autopilot_enabled';
const KEY_INTERVAL_MIN = 'axe_trading_autopilot_interval_min';
const KEY_LAST_RUN = 'axe_trading_autopilot_last_run';
const KEY_LAST_RESULT = 'axe_trading_autopilot_last_result';
const KEY_ACTIVE_STRATEGY = 'axe_trading_active_strategy';

const DEFAULT_INTERVAL_MIN = 15;
const MIN_INTERVAL_MIN = 5;
const DEFAULT_SYMBOL = 'XAUUSD';
const DEFAULT_STRATEGY: StrategyId = 'mean-reversion';

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

async function autopilotSymbols(): Promise<string[]> {
  const watch = await listWatchlist();
  const tickers = Array.from(new Set(watch.map(w => w.ticker.trim().toUpperCase()).filter(Boolean)));
  return tickers.length ? tickers : [DEFAULT_SYMBOL];
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
    const strategy = await getActiveStrategy();
    const result = await runTradingAgent({ symbol, autoExecute: true, strategy });
    return `${symbol}: ${result.message ?? result.decision.action}`;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[autopilot] agent cycle failed for ${symbol}:`, e);
    return `${symbol}: cycle error — ${msg}`;
  }
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
  await saveSetting(KEY_LAST_RUN, new Date().toISOString());
  try {
    const symbols = await autopilotSymbols();
    const summaries: string[] = [];
    // Sequential, not parallel — the crew run + broker calls per symbol are
    // already rate-limit-sensitive; running the watchlist concurrently would
    // multiply that pressure for no benefit.
    for (const symbol of symbols) {
      summaries.push(await runOneSymbol(symbol));
    }
    await saveSetting(KEY_LAST_RESULT, summaries.join(' · ').slice(0, 2000));
  } finally {
    cycleInFlight = false;
  }
}

/** Manual "run now" — bypasses the due-time check but still respects the
 *  re-entrancy guard. Used by the Agent tab's "Run cycle now" button. */
export async function runTradingAutopilotNow(): Promise<void> {
  if (cycleInFlight) return;
  cycleInFlight = true;
  await saveSetting(KEY_LAST_RUN, new Date().toISOString());
  try {
    const symbols = await autopilotSymbols();
    const summaries: string[] = [];
    for (const symbol of symbols) {
      summaries.push(await runOneSymbol(symbol));
    }
    await saveSetting(KEY_LAST_RESULT, summaries.join(' · ').slice(0, 2000));
  } finally {
    cycleInFlight = false;
  }
}
