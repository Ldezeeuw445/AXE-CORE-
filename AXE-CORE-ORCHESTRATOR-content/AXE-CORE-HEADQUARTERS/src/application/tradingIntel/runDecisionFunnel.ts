/**
 * Feeds the six-phase funnel with real prices, spreads and desk votes.
 *
 * The funnel itself is pure (domain/tradingIntel/decisionFunnel.ts). This is
 * the part that talks to brokers and storage, kept separate so the decision
 * logic stays testable against fixed numbers.
 *
 * ## Why it runs on every pair, every cycle
 *
 * The scan rotation exists because scoring 30 pairs with a full agent pass is
 * expensive. This is the cheap half: candles and a quote, no model calls. That
 * makes it affordable to look at the whole board every cycle, which is the
 * only way phase 3 can do its job — you cannot notice that EURUSD, GBPUSD and
 * AUDUSD are the same bet if you only ever look at three pairs at a time.
 *
 * ## Priced in the background
 *
 * Every fetch is `priority: 'background'` so a funnel run can never queue in
 * front of an order. A ranking that delays the trade it is ranking is worse
 * than no ranking.
 */
import { fetchMarketSnapshot } from '@/infrastructure/gateways/marketDataService';
import { metaApiGetSymbolPrice } from '@/infrastructure/gateways/metaApiService';
import { allPairIds } from '@/domain/tradingIntel/pairRegistry';
import { fetchPolygonDaily } from '@/infrastructure/gateways/researchSources';
import { fetchEconomicReleases } from '@/infrastructure/gateways/researchSources';
import { eventWithin48h } from '@/domain/tradingIntel/economicCalendar';
import { loadSetting, saveSetting } from '@/infrastructure/persistence/userSettingsService';
import {
  runFunnel, type FunnelInput, type FunnelRun,
} from '@/domain/tradingIntel/decisionFunnel';

const KEY_LAST_RUN = 'axe_trading_funnel_last_run';

/** Enough history for a 50-period mean plus a 40-bar structure window. */
const BARS_TIMEFRAME = 'h1';

export interface FunnelVote {
  signal: 'buy' | 'sell' | 'hold';
  confidence: number;
}

/**
 * Run the funnel across every pair in the registry.
 *
 * `votes` is what the desk concluded this cycle, keyed by pair. Pairs with no
 * vote reach phase 6 with `null`, which the funnel reports as "no desk vote"
 * rather than treating silence as approval.
 */
export async function runDecisionFunnel(opts: {
  votes?: Record<string, FunnelVote>;
  /** Overridable so a caller can rank a subset; defaults to the whole board. */
  pairs?: string[];
} = {}): Promise<FunnelRun> {
  const pairs = opts.pairs ?? allPairIds();
  const votes = opts.votes ?? {};

  const inputs: FunnelInput[] = [];
  // One fetch for the whole run, cached for the calendar day inside the
  // gateway. An empty list leaves every pair at null, which is what makes
  // phase 2 say "unavailable" instead of quietly passing everything.
  const releases = await fetchEconomicReleases().catch(() => []);

  for (const pairId of pairs) {
    let closes: number[] = [];
    let highs: number[] = [];
    let lows: number[] = [];

    // MASSIVE FIRST, THE BROKER SECOND — to keep the ranking off MetaAPI.
    //
    // The funnel needs history for thirty pairs every cycle. Asking the broker
    // for all of them is thirty calls on the endpoint this project has been
    // throttled on more than any other, and it buys nothing: ranking wants the
    // SHAPE of the last few months, not the broker's exact tick. Massive
    // answers that from its own quota (verified 2026-08-25: C:XAUUSD returned
    // real daily bars) and covers twelve of the registry's pairs — the FX,
    // metals and crypto that make up most of the board.
    //
    // The broker is still the authority on anything Massive does not carry,
    // and on the trade itself. This only moves the cheap, repetitive half of
    // the work onto a provider that is not also the one placing orders.
    try {
      const to = new Date();
      const from = new Date(to.getTime() - 200 * 24 * 60 * 60 * 1000);
      const bars = await fetchPolygonDaily(
        pairId, from.toISOString().slice(0, 10), to.toISOString().slice(0, 10),
      );
      if (bars.length >= 60) {
        closes = bars.map(b => b.c);
        highs = bars.map(b => b.h);
        lows = bars.map(b => b.l);
      }
    } catch { /* fall through to the broker */ }

    if (closes.length < 60) {
      try {
        const snap = await fetchMarketSnapshot(pairId, BARS_TIMEFRAME, { priority: 'background' });
        if (snap.bars.length > closes.length) {
          closes = snap.bars.map(b => b.c);
          highs = snap.bars.map(b => b.h);
          lows = snap.bars.map(b => b.l);
        }
      } catch {
        // A pair neither provider will price is not a pair with a flat chart.
        // An empty series makes phase 1 drop it for "not enough history",
        // which is the honest reading.
      }
    }

    const vote = votes[pairId];
    inputs.push({
      pairId,
      closes, highs, lows,
      // Left null on the first pass; filled in below for the few pairs that
      // actually reach the spread check. See the two-pass note above.
      spreadPct: null,
      // Phase 2's data, at last. null still means "not checked" — for a pair
      // with no USD leg, or when the schedule could not be fetched — and the
      // phase reports itself unavailable rather than clean on that. See
      // domain/tradingIntel/economicCalendar.ts for why a US-only calendar
      // must never answer `false` for a pair it cannot speak to.
      eventWithin48h: eventWithin48h({ pairId, events: releases }),
      vote: vote?.signal ?? null,
      voteConfidence: vote?.confidence ?? null,
    });
  }

  // ---- two passes, because quotes are the expensive part ----------------
  //
  // A quote per pair would be 30 more MetaAPI calls every cycle, on the exact
  // endpoint this codebase has been throttled on repeatedly — and almost all
  // of them would be wasted, since most pairs never reach the spread check at
  // all. So: rank once with the spread unknown (phase 5 treats unknown as "not
  // a no" and reports itself unavailable), see who is still standing, and only
  // then ask the broker about those few.
  const firstPass = runFunnel(inputs);

  // Anyone who got as far as phase 5 or 6 is worth a quote.
  const needQuote = new Set(
    firstPass.outcomes
      .filter(o => o.passed || o.droppedAt === 'liquidity' || o.droppedAt === 'vote')
      .map(o => o.pairId),
  );

  let gotAnyQuote = false;
  for (const input of inputs) {
    if (!needQuote.has(input.pairId)) continue;
    try {
      const q = await metaApiGetSymbolPrice(input.pairId);
      if (q.ok && q.price.bid != null && q.price.ask != null && q.price.bid > 0) {
        const mid = (q.price.bid + q.price.ask) / 2;
        if (mid > 0) {
          input.spreadPct = ((q.price.ask - q.price.bid) / mid) * 100;
          gotAnyQuote = true;
        }
      }
    } catch { /* unknown stays unknown — phase 5 will say so */ }
  }

  // Re-rank only when a quote actually arrived; otherwise the second pass
  // would be identical work for an identical answer.
  const run = gotAnyQuote ? runFunnel(inputs) : firstPass;
  await saveSetting(KEY_LAST_RUN, run).catch(() => undefined);
  return run;
}

/** The last completed run, for a tab that opens before a cycle has finished. */
export async function loadLastFunnelRun(): Promise<FunnelRun | null> {
  return loadSetting<FunnelRun | null>(KEY_LAST_RUN, null);
}
