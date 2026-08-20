/**
 * liveTradeReconciler — the missing half of AXE Algo's learning loop.
 *
 * Measured 2026-08-19: every one of the 52 rows in the (pair × strategy)
 * ledger held a backtest prior and `live.trades = null`. Not one live outcome
 * had ever been recorded, on an account with 496 historical trades.
 *
 * The cause was not a broken write. `recordTradeOutcome()` works, and
 * `recordLedgerTrade()` behind it works — but the only thing that ever called
 * it was `demoTradingService`. The paper book learned from itself; every real
 * trade AXE placed through MetaAPI was forgotten the moment it closed. Luka
 * spotted the symptom himself: he had traded silver, and XAGUSD had no ledger
 * row at all.
 *
 * Closing it by hooking `metaApiClosePosition` would not have been enough —
 * most trades close at the broker when SL or TP is hit, and AXE never sees
 * that call. So this reads the account's real closed-deal history instead,
 * which catches every exit regardless of who triggered it.
 *
 * Attribution comes from the order comment: brokerConnector tags each order
 * "AXE <strategy>", and MetaAPI echoes it back on the closing deal. Best
 * effort by nature — some brokers truncate comments — so a deal we cannot
 * attribute is still recorded against the pair, just without a strategy.
 * A trade counted under the wrong strategy would be worse than one counted
 * under none.
 */
import { metaApiGetHistoryDeals, metaApiGetAccountInfo } from '@/infrastructure/gateways/metaApiService';
import { metaApiDealsToJournalTrades } from '@/application/tradingIntel/csvJournalAnalytics';
import { recordTradeOutcome } from '@/infrastructure/persistence/tradingLearningService';
import { loadSetting, saveSetting } from '@/infrastructure/persistence/userSettingsService';

/** ISO timestamp of the newest deal already folded into the ledger. */
const KEY_WATERMARK = 'axe_trading_ledger_watermark';

/** First run has no watermark. Thirty days is enough to seed the ledger with
 *  a real track record without replaying months of history on a Nano-tier
 *  database that is already having a hard time. */
const FIRST_RUN_LOOKBACK_DAYS = 30;

/**
 * Is this comment tag actually a strategy name?
 *
 * metaApiDealsToJournalTrades hands back everything after "AXE " as the tag,
 * which is right for its purpose but too generous for this one. When
 * brokerConnector has no strategy it stamps "AXE <side><confidence>" instead —
 * "AXE b72". Passed straight through, "b72" would become a strategy in the
 * ledger: a bucket that no backtest can ever fill and that nothing can ever
 * choose, quietly diluting the real ones.
 *
 * Unattributed is the honest answer there. The trade still counts on its pair.
 */
export function validStrategyTag(tag?: string | null): string | null {
  if (!tag) return null;
  const t = tag.trim();
  if (!t) return null;
  if (/^[bs]\d+$/i.test(t)) return null;
  return t;
}

/** Timeframes a tag may end with. Anything else is part of the strategy name. */
const TF_SUFFIX = /^(.*?)\s+(m5|m15|m30|h1|h4|d1)$/i;

/**
 * Splits a tag like "volumetric-ob h4" into its two decisions.
 *
 * Strategy and timeframe are both chosen per pair and both ride in the same
 * 31-character comment, so they have to come back apart cleanly. Left glued
 * together, "volumetric-ob h4" would register as a strategy in its own right —
 * one no backtest can fill and nothing can ever select — and the record for
 * volumetric-ob would fragment across a bucket per timeframe instead of
 * accumulating where the ranking reads it.
 *
 * A tag with no timeframe returns null for it, which the ledger reads as h1:
 * true by construction, since h1 was the only timeframe anything ran on before
 * today.
 */
export function decisionFromTag(tag?: string | null): { strategy: string | null; timeframe: string | null } {
  const valid = validStrategyTag(tag);
  if (!valid) return { strategy: null, timeframe: null };
  const m = valid.match(TF_SUFFIX);
  if (!m) return { strategy: valid, timeframe: null };
  return { strategy: m[1].trim() || null, timeframe: m[2].toLowerCase() };
}


/**
 * Broker instrument names that are the same market under a different label.
 *
 * Only entries that are unambiguous. A wrong line here is worse than a missing
 * one: it files real money's track record under a pair it never traded, and
 * every ranking downstream then trusts it.
 *
 * Confirmed from this account's own history (2026-08-19): it holds
 * NDX1_CFD.DE and DJ30 positions while every backtest and ledger row speaks in
 * NAS100 and US30, so those trades were teaching nothing.
 *
 * Deliberately absent, pending confirmation: SPCXUSD and USOUSD. They are
 * almost certainly S&P 500 cash and US oil — but "almost certainly" is not a
 * standard to attribute live results by. Until Luka confirms, they keep their
 * own rows, which is honest and self-correcting.
 */
const BROKER_ALIASES: Record<string, string> = {
  // This account's silver is called SILVER, not XAGUSD — which is exactly why
  // Luka's silver trade never reached the pair his backtests speak about.
  SILVER: 'XAGUSD',
  NDX1_CFD: 'NAS100',
  NDX100: 'NAS100',
  DJ30: 'US30',
  DE40: 'GER40',
  GER30: 'GER40',
};

/**
 * Broker symbol -> the name the ledger and the backtests use.
 *
 * This account trades XAUUSD.x, BTCUSD.x, AUDCAD.x and UK100.r, while every
 * backtest and every ledger row says XAUUSD, BTCUSD, UK100. Without folding
 * the suffix away, each live trade would open its own row and the live record
 * would never meet the prior it is supposed to correct — the loop would look
 * connected and still never close.
 *
 * The suffix rule is deliberately narrow: everything from the first dot onward
 * is a broker suffix. No real instrument name contains a dot, and
 * toMt5Symbol() cannot be reused here — it strips punctuation, which turns
 * XAUUSD.x into XAUUSDX and invents a third spelling of the same pair.
 *
 * Anything with no dot and no alias is left exactly as it is, and gets a row
 * of its own.
 */
export function canonicalPair(brokerSymbol: string): string {
  const s = brokerSymbol.trim().toUpperCase();
  const dot = s.indexOf('.');
  const base = dot > 0 ? s.slice(0, dot) : s;
  return BROKER_ALIASES[base] ?? base;
}

export interface ReconcileResult {
  scanned: number;
  recorded: number;
  unattributed: number;
  error?: string;
}

/**
 * Fold every newly closed deal into the ledger. Safe to call on every cycle:
 * the watermark means a deal is only ever counted once, and it only advances
 * after the deals below it have been recorded.
 */
export async function reconcileLiveTrades(): Promise<ReconcileResult> {
  const since = await loadSetting<string | null>(KEY_WATERMARK, null);
  const startIso = since
    ?? new Date(Date.now() - FIRST_RUN_LOOKBACK_DAYS * 86_400_000).toISOString();
  const endIso = new Date().toISOString();

  const res = await metaApiGetHistoryDeals(startIso, endIso);
  if (!res.ok) return { scanned: 0, recorded: 0, unattributed: 0, error: res.error };

  // Grouping deals into trades is metaApiDealsToJournalTrades' job, not this
  // file's. Writing it a second time here got three things wrong that the
  // proven version gets right, and every one of them would have failed
  // quietly:
  //
  //   - DEAL_ENTRY_INOUT is an OPENING (a reversal), not a close. Treating it
  //     as a close would have scored the same position twice.
  //   - The strategy tag rides on the OPENING deal's comment. Reading it off
  //     the closing deal would have attributed nothing, ever — and the ledger
  //     would have filled with pair-only rows that looked like progress.
  //   - Profit has to be summed across the whole position group. A position
  //     closed in parts would otherwise land as several trades, each carrying
  //     only its own slice.
  //
  // It also filters to DEAL_TYPE_BUY/SELL, which keeps balance operations and
  // deposits out of a track record they have no business being in.
  // One balance read per run, not per trade. If it cannot be read, the trades
  // are still recorded — as wins and losses without a percentage, which is
  // worse than having one and far better than having a wrong one.
  const acct = await metaApiGetAccountInfo();
  const balance = acct.ok ? (acct.info.balance ?? 0) : 0;
  if (!balance) console.warn('[reconciler] no account balance — recording outcomes without a return %');

  const trades = metaApiDealsToJournalTrades(res.deals)
    .filter(t => t.closeTime)
    .sort((a, b) => String(a.closeTime).localeCompare(String(b.closeTime)));

  let recorded = 0;
  let unattributed = 0;
  let newest = since;

  for (const t of trades) {
    const closed = String(t.closeTime);
    // The range is inclusive at both ends, so the watermark trade itself comes
    // back every cycle. Skipping anything at or before it is what stops one
    // trade being counted twice.
    if (since && closed <= since) continue;
    if (!t.symbol) continue;

    const pnl = t.profit + t.commission + t.swap;
    // Return as a fraction of the ACCOUNT, not of a notional.
    //
    // The first version divided by openPrice x volume. MT5 volume is in LOTS,
    // and a lot is a different quantity for every instrument — 1 BTC, 5000
    // ounces of silver, whole index contracts. So the divisor was right for
    // crypto by coincidence and wrong everywhere else, which is how three
    // silver trades came out at +118% and went straight into the ranking that
    // decides what to trade next.
    //
    // Balance is the honest common denominator: "what did this trade do to the
    // account" means the same thing for silver, Bitcoin and an index, and it is
    // the question the expectancy ranking is really asking. It also needs no
    // per-instrument contract table to stay correct as the broker adds symbols.
    const returnPct = balance > 0 ? pnl / balance : undefined;

    const decision = decisionFromTag(t.comment);
    const strategy = decision.strategy ?? undefined;
    const timeframe = decision.timeframe ?? undefined;
    if (!strategy) unattributed += 1;

    try {
      await recordTradeOutcome({
        symbol: canonicalPair(t.symbol),
        pnl,
        confidence: 0,
        exitReason: 'broker_close',
        strategy,
        timeframe,
        returnPct,
      });
      recorded += 1;
      if (!newest || closed > newest) newest = closed;
    } catch (e) {
      console.warn('[reconciler] could not record trade', t.symbol, closed, e);
      break; // leave the watermark where it is; retry next cycle
    }
  }

  if (newest && newest !== since) await saveSetting(KEY_WATERMARK, newest);
  return { scanned: trades.length, recorded, unattributed };
}
