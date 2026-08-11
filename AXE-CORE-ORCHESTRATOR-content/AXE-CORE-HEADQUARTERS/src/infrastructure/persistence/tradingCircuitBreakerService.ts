/**
 * tradingCircuitBreakerService — a hard stop on equity drawdown from peak,
 * independent of the learning loop's confidence/aggressiveness knobs.
 *
 * Why this needs to be separate from the learning loop: the learning knobs
 * (tradingLearningService) are a soft, gradual adjustment to selectivity —
 * they don't know about a fast, sharp drawdown until enough trades have
 * closed to move the rolling average. This is the fast hard stop that
 * doesn't wait for that: once tripped, tradingAgentEngine forces every
 * cycle to HOLD regardless of confidence, until a human explicitly resets
 * it. Auto-recovering the moment equity ticks back up would just retrip on
 * the next down-tick, so reset is manual by design.
 */
import { loadSetting, saveSetting } from '@/infrastructure/persistence/userSettingsService';
import type { CircuitBreakerState } from '@/domain/tradingIntel/botTypes';

const KEY = 'axe_trading_circuit_breaker';

function defaultState(equity: number, source: 'paper' | 'live'): CircuitBreakerState {
  return {
    peakEquity: equity,
    tripped: false,
    updatedAt: new Date().toISOString(),
    equitySource: source,
  };
}

export async function getCircuitBreakerState(): Promise<CircuitBreakerState | null> {
  return loadSetting<CircuitBreakerState | null>(KEY, null);
}

async function saveState(s: CircuitBreakerState): Promise<void> {
  localStorage.setItem(KEY, JSON.stringify(s));
  void saveSetting(KEY, s);
}

/**
 * Call at the start of every agent cycle with current equity. Updates the
 * high-water mark and trips the breaker if drawdown from peak exceeds
 * thresholdPct. Returns the (possibly just-tripped) state.
 *
 * `source` distinguishes paper-mock equity from real MetaAPI equity — the
 * two are unrelated numbers (e.g. $100k paper vs a real ~€50k account), so
 * a switch between them resets the peak instead of comparing across it.
 * Without this, connecting a real account for the first time (or MetaAPI
 * briefly dropping and falling back to paper) would look like an instant
 * ~50% drawdown and wrongly trip the breaker.
 */
export async function checkAndUpdateCircuitBreaker(
  currentEquity: number,
  thresholdPct: number,
  source: 'paper' | 'live' = 'live',
): Promise<CircuitBreakerState> {
  const existing = (await getCircuitBreakerState()) ?? defaultState(currentEquity, source);

  // `existing.equitySource &&` used to guard this, which meant a record
  // saved before source-tagging existed (equitySource undefined) was never
  // recognised as a mismatch and its peak was trusted forever. That is
  // exactly what happened live: a stale, untagged peak of $1,116,543 —
  // clearly not this account's real high-water mark — kept comparing
  // against a real ~$49,854 MT5 equity and permanently forced HOLD.
  // Undefined is a real "unknown provenance" state, not "no opinion" — it
  // must reset just as much as an actual paper↔live flip does.
  if (existing.equitySource !== source) {
    const reset = defaultState(currentEquity, source);
    await saveState(reset);
    return reset;
  }

  // Already tripped — stays tripped regardless of equity moves until a
  // human resets it. Still track peak so the eventual reset starts fresh.
  if (existing.tripped) {
    const next = { ...existing, peakEquity: Math.max(existing.peakEquity, currentEquity), equitySource: source };
    await saveState(next);
    return next;
  }

  const peakEquity = Math.max(existing.peakEquity, currentEquity);
  const drawdownPct = peakEquity > 0 ? (peakEquity - currentEquity) / peakEquity : 0;

  if (drawdownPct >= thresholdPct) {
    const tripped: CircuitBreakerState = {
      peakEquity,
      tripped: true,
      trippedAt: new Date().toISOString(),
      trippedReason: `Equity drawdown ${(drawdownPct * 100).toFixed(1)}% from peak $${peakEquity.toFixed(0)} exceeded the ${(thresholdPct * 100).toFixed(0)}% limit`,
      updatedAt: new Date().toISOString(),
      equitySource: source,
    };
    await saveState(tripped);
    return tripped;
  }

  const next: CircuitBreakerState = { peakEquity, tripped: false, updatedAt: new Date().toISOString(), equitySource: source };
  await saveState(next);
  return next;
}

/** Manual reset — the explicit "I've reviewed this, resume" action. Resets
 *  the peak to current equity so the next threshold is measured fresh. */
export async function resetCircuitBreaker(currentEquity: number, source: 'paper' | 'live' = 'live'): Promise<CircuitBreakerState> {
  const next = defaultState(currentEquity, source);
  await saveState(next);
  return next;
}

/** Trip it directly regardless of drawdown level — the kill switch's "stop
 *  everything, don't let autopilot resume even if turned back on" backstop. */
export async function forceTripCircuitBreaker(reason: string, currentEquity: number, source: 'paper' | 'live' = 'live'): Promise<CircuitBreakerState> {
  const existing = (await getCircuitBreakerState()) ?? defaultState(currentEquity, source);
  const tripped: CircuitBreakerState = {
    peakEquity: Math.max(existing.peakEquity, currentEquity),
    tripped: true,
    trippedAt: new Date().toISOString(),
    trippedReason: reason,
    updatedAt: new Date().toISOString(),
    equitySource: source,
  };
  await saveState(tripped);
  return tripped;
}
