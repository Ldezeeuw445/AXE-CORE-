/**
 * positionManager — active management of OPEN positions, not just entries.
 *
 * The agent used to open a trade with a fixed SL/TP and then leave it alone
 * until one got hit. That means a trade sitting comfortably in profit but not
 * yet at TP could give the whole gain back — or turn into a loss — if the
 * market or the news flips against it. This runs every autopilot cycle over
 * the live positions and decides, per position, whether it's safer to bank
 * the profit early, on three grounds:
 *
 *   1. GIVE-BACK (trailing): the position was well in profit and has since
 *      retraced a big chunk of its PEAK gain — lock in what's left.
 *   2. STRATEGY REVERSAL: the strategy that would open a trade here now points
 *      the OTHER way — the edge that justified holding is gone.
 *   3. NEWS / CORRELATION AGAINST: AXE Intel's latest cross-feed correlation
 *      leans against the position while it's in profit — take the safer exit.
 *
 * Only ever closes a position that is actually in profit (above a floor); it
 * never turns a small loss into a market close — the stop-loss owns that side.
 * Every early exit is logged in detail (reason + numbers) so the ledger and
 * Obsidian memory can later show whether protecting profit actually helped.
 */
import { getDemoAccount, executeDemoTrade } from '@/infrastructure/persistence/demoTradingService';
import { fetchTradeableSnapshot } from '@/infrastructure/gateways/marketDataService';
import { metaApiPositionsFor, metaApiClosePositionFor, type MetaApiConfig } from '@/infrastructure/gateways/metaApiService';
import { tradeableAccounts } from '@/infrastructure/persistence/tradingAccountsService';
import { loadSetting, saveSetting } from '@/infrastructure/persistence/userSettingsService';
import { computeStrategySignal, DISTINCT_STRATEGIES, type StrategyId } from '@/application/tradingIntel/strategySignals';
import { buildStrategySeries } from '@/application/tradingIntel/tradingAgentEngine';
import { rankStrategiesForPair } from '@/infrastructure/persistence/tradingLedgerService';
import { getLatestCompanionCorrelation } from '@/infrastructure/gateways/companionToolsService';
import { rememberLesson } from '@/infrastructure/persistence/tradingAgentMemoryService';

/** The strategy whose edge governs this pair right now — the ledger's best,
 *  else a robust default. Kept local (via the ledger, not agentAutopilot) so
 *  this module doesn't create a circular import with the autopilot. */
async function pairStrategy(symbol: string): Promise<StrategyId> {
  try {
    const ranked = await rankStrategiesForPair(symbol, [...DISTINCT_STRATEGIES]);
    if (ranked[0]?.tested) return ranked[0].strategy as StrategyId;
  } catch { /* fall through */ }
  return 'mean-reversion';
}

/** Don't protect a gain smaller than this — let the stop handle the noise. */
const MIN_PROFIT_PCT = 0.003; // +0.3%
/** Peak gain must have been at least this big before a give-back can trigger. */
const GIVEBACK_MIN_PEAK_PCT = 0.006; // +0.6%
/** Close if the position has given back this fraction of its peak gain. */
const GIVEBACK_FRACTION = 0.5; // gave back half of the best it showed

const PEAKS_KEY = 'axe_pm_peaks';
type PeakMap = Record<string, { peakPct: number; at: string }>;

async function loadPeaks(): Promise<PeakMap> {
  return (await loadSetting<PeakMap>(PEAKS_KEY, {})) ?? {};
}
async function savePeaks(p: PeakMap): Promise<void> {
  await saveSetting(PEAKS_KEY, p);
}

export interface OpenPositionView {
  symbol: string;
  qty: number;
  entryPrice: number;
  lastPrice: number;
  /** Unrealized return as a fraction of entry (long-only). */
  unrealizedPct: number;
  venue: 'paper' | 'metaapi';
  positionId?: string;
  /** Which account holds it. A position id only means something to its own
   *  account, so the close has to go back to the same one it came from. */
  account?: MetaApiConfig;
}

export interface ManageAction {
  symbol: string;
  closed: boolean;
  reason: string;
  unrealizedPct: number;
  error?: string;
}

/** Correlation signal → the direction it argues FOR. */
function correlationBias(signal: string | null | undefined): 'up' | 'down' | null {
  const s = (signal ?? '').toUpperCase();
  if (s.includes('BULL')) return 'up';
  if (s.includes('BEAR')) return 'down';
  return null;
}

/**
 * Decide + (optionally) execute early exits across all open long positions.
 * Returns one action per position it looked at. Safe to call every cycle —
 * it only acts on positions genuinely in profit past the floor.
 */
export async function manageOpenPositions(opts?: { execute?: boolean }): Promise<ManageAction[]> {
  const execute = opts?.execute !== false;
  const actions: ManageAction[] = [];
  const peaks = await loadPeaks();

  // Gather open long positions from whichever venue holds them.
  const views: OpenPositionView[] = [];
  const account = await getDemoAccount();
  for (const p of account.positions) {
    if (p.qty <= 0) continue;
    let last = p.markPrice ?? p.avgPrice;
    try { last = (await fetchTradeableSnapshot(p.symbol)).last || last; } catch { /* keep mark */ }
    views.push({
      symbol: p.symbol, qty: p.qty, entryPrice: p.avgPrice, lastPrice: last,
      unrealizedPct: p.avgPrice > 0 ? (last - p.avgPrice) / p.avgPrice : 0,
      venue: 'paper',
    });
  }
  // EVERY connected account, not just the active one. This read
  // getMetaApiConfig() + metaApiGetPositions(), so a position opened on the
  // second account was never trailed, never protected on giveback, and never
  // closed early — it simply was not visible to the manager that exists to
  // look after it.
  const accounts = await tradeableAccounts().catch(() => [] as MetaApiConfig[]);
  for (const account of accounts) {
    const res = await metaApiPositionsFor(account).catch(() => null);
    if (!res || !res.ok) continue;
    for (const raw of res.positions as Record<string, unknown>[]) {
      const type = String(raw.type ?? '').toUpperCase();
      // LONG-ONLY MANAGEMENT, AND NOW THAT IS A REAL GAP.
      //
      // Skipping shorts was harmless while the agent could not open one. It
      // can as of today, so a short currently gets no trailing stop, no
      // giveback protection and no early exit — only its broker-side SL/TP.
      // Left explicit rather than half-fixed: the giveback and flip triggers
      // below are all written in long terms (peakPct, "flipped to SELL"), and
      // mirroring them properly is its own change, not a sign flip.
      if (type.includes('SELL')) continue;
      const symbol = String(raw.symbol ?? '').toUpperCase();
      const entry = Number(raw.openPrice ?? raw.entryPrice ?? 0);
      const current = Number(raw.currentPrice ?? raw.price ?? entry);
      if (!symbol || !(entry > 0)) continue;
      views.push({
        symbol, qty: Number(raw.volume ?? raw.qty ?? 0), entryPrice: entry, lastPrice: current,
        unrealizedPct: (current - entry) / entry,
        venue: 'metaapi', positionId: String(raw.id ?? raw.positionId ?? ''),
        account,
      });
    }
  }

  if (!views.length) return actions;

  const correlation = await getLatestCompanionCorrelation().catch(() => null);
  const corrBias = correlationBias(correlation?.signal);

  for (const v of views) {
    const strat = await pairStrategy(v.symbol);
    // Track peak profit so a give-back can be measured against the best it showed.
    const prevPeak = peaks[v.symbol]?.peakPct ?? 0;
    const peakPct = Math.max(prevPeak, v.unrealizedPct);
    peaks[v.symbol] = { peakPct, at: new Date().toISOString() };

    // Below the profit floor → leave it to the stop-loss, never market-close a loser here.
    if (v.unrealizedPct < MIN_PROFIT_PCT) {
      actions.push({ symbol: v.symbol, closed: false, reason: 'holding — not enough profit to protect', unrealizedPct: v.unrealizedPct });
      continue;
    }

    // ── Trigger 1: gave back a big chunk of peak profit ──
    let trigger: string | null = null;
    if (peakPct >= GIVEBACK_MIN_PEAK_PCT && v.unrealizedPct <= peakPct * (1 - GIVEBACK_FRACTION)) {
      trigger = `gave back ${((1 - v.unrealizedPct / peakPct) * 100).toFixed(0)}% of a +${(peakPct * 100).toFixed(2)}% peak`;
    }

    // ── Trigger 2: the strategy now points against the (long) position ──
    if (!trigger) {
      try {
        const snap = await fetchTradeableSnapshot(v.symbol);
        if (snap.bars.length >= 60) {
          const series = buildStrategySeries(snap.bars);
          const sig = computeStrategySignal(strat, series, series.closes.length - 1);
          if (sig === 'sell') trigger = `strategy ${strat} flipped to SELL while +${(v.unrealizedPct * 100).toFixed(2)}%`;
        }
      } catch { /* ignore, other triggers still apply */ }
    }

    // ── Trigger 3: latest intel correlation leans against the position ──
    if (!trigger && corrBias === 'down') {
      trigger = `AXE Intel correlation is ${correlation?.signal} against this long while +${(v.unrealizedPct * 100).toFixed(2)}%`;
    }

    if (!trigger) {
      actions.push({ symbol: v.symbol, closed: false, reason: `holding — in profit +${(v.unrealizedPct * 100).toFixed(2)}%, no turn-against signal`, unrealizedPct: v.unrealizedPct });
      continue;
    }

    const reason = `Protect profit: closed early — ${trigger}.`;
    if (!execute) {
      actions.push({ symbol: v.symbol, closed: false, reason: `WOULD close: ${trigger}`, unrealizedPct: v.unrealizedPct });
      continue;
    }

    // ── Execute the early close on the right venue ──
    let closed = false;
    let error: string | undefined;
    try {
      if (v.venue === 'metaapi' && v.positionId && v.account) {
        const r = await metaApiClosePositionFor(v.account, v.positionId);
        if (r.ok) closed = true; else error = r.error;
      } else {
        const r = await executeDemoTrade({
          symbol: v.symbol, side: 'sell', qty: v.qty, price: v.lastPrice,
          reason, confidence: 0.9, strategy: strat,
        });
        if ('error' in r) error = r.error; else closed = true;
      }
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }

    if (closed) {
      delete peaks[v.symbol]; // position gone — reset its peak tracker
      void rememberLesson(
        v.symbol,
        `Early exit at +${(v.unrealizedPct * 100).toFixed(2)}% (peak +${(peakPct * 100).toFixed(2)}%): ${trigger}. Banked profit instead of holding to TP.`,
        0.8,
      ).catch(() => {});
    }
    actions.push({ symbol: v.symbol, closed, reason: closed ? reason : `close FAILED: ${error}`, unrealizedPct: v.unrealizedPct, error });
  }

  await savePeaks(peaks);
  return actions;
}
