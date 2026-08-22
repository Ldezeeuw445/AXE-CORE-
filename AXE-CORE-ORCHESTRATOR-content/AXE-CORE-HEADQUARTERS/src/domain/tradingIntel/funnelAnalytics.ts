/**
 * funnelAnalytics — what the funnel actually counts.
 *
 * Kept as pure functions, separate from the drawing, because this is the part
 * that can be WRONG in a way nobody notices. A ribbon is either the right
 * width or it is a confident lie about which strategy is making money, and you
 * cannot tell the two apart by looking at a picture.
 *
 * BUILT FROM REAL CLOSED TRADES, NOT FROM THE LEDGER.
 *
 * The ledger aggregates by pair, strategy and timeframe and has never held a
 * direction — so a funnel drawn from it can only ever show "unknown" in the
 * column that matters most, and the old one did. Closed MT5 deals carry the
 * side, the profit and the strategy tag the order was placed with, which is
 * every column the funnel needs and all of it measured rather than inferred.
 *
 * ATTRIBUTION IS ALLOWED TO FAIL. Most trades close at the broker on a stop or
 * a target, and some brokers truncate the order comment the tag rides on. A
 * trade whose strategy cannot be read is counted as "untagged" and kept in the
 * totals — dropping it would quietly inflate the win rate of everything that
 * did carry a tag, which is the exact opposite of what this screen is for.
 */
import { frameworkOf, type FrameworkId } from '@/domain/tradingIntel/strategyColors';
import { canonicalTimeframe } from '@/domain/tradingIntel/timeframes';

export interface FunnelTrade {
  symbol: string;
  side: 'buy' | 'sell' | null;
  profit: number;
  comment: string | null;
  closeTime?: string | null;
}

/** One fully attributed trade, ready to be counted into every column. */
export interface FunnelRow {
  pair: string;
  framework: FrameworkId | 'untagged';
  strategy: string;
  timeframe: string;
  direction: 'buy' | 'sell' | 'unknown';
  won: boolean;
  profit: number;
  /** Needed for drawdown: the equity curve only means something in the order
   *  the trades actually closed. */
  closedAt: string | null;
}

export const UNTAGGED = 'untagged';
export const UNKNOWN_TF = 'unknown';

const TF_RE = /^(.*?)\s+(m5|m15|m30|h1|h4|d1)$/i;

/**
 * Pull the strategy tag off an order comment.
 *
 * The reconciler writes "AXE <strategy> <timeframe>". A bare side+confidence
 * stamp ("AXE b72") is NOT a strategy — treating it as one would invent a
 * strategy called "b72" and give it its own colour and its own row in the top
 * combinations table.
 */
export function parseTag(comment: string | null | undefined): { strategy: string; timeframe: string } {
  const raw = typeof comment === 'string' ? comment.trim() : '';
  const m = raw.match(/^AXE\s+(.+)$/i);
  const tag = m?.[1]?.trim();
  if (!tag || /^[bs]\d+$/i.test(tag)) return { strategy: UNTAGGED, timeframe: UNKNOWN_TF };
  const tfMatch = tag.match(TF_RE);
  if (tfMatch) {
    return {
      strategy: tfMatch[1].trim() || UNTAGGED,
      timeframe: canonicalTimeframe(tfMatch[2]) ?? UNKNOWN_TF,
    };
  }
  return { strategy: tag, timeframe: UNKNOWN_TF };
}

export function toFunnelRows(trades: FunnelTrade[]): FunnelRow[] {
  return trades
    .filter(t => t.symbol)
    .map(t => {
      const { strategy, timeframe } = parseTag(t.comment);
      return {
        pair: t.symbol.toUpperCase(),
        framework: strategy === UNTAGGED ? UNTAGGED : (frameworkOf(strategy) ?? UNTAGGED),
        strategy,
        timeframe,
        direction: t.side ?? 'unknown',
        // Break-even counts as a loss, not a win. It is the conservative read
        // and it keeps the two columns summing to the total.
        won: t.profit > 0,
        profit: t.profit,
        closedAt: t.closeTime ?? null,
      };
    });
}

export interface FunnelTotals {
  trades: number;
  wins: number;
  losses: number;
  winRatePct: number;
  /** Gross profit / gross loss. Infinity is reported as null, not as a number. */
  profitFactor: number | null;
  netProfit: number;
  /** Worst peak-to-trough on the running total, as a fraction of the peak. */
  maxDrawdownPct: number;
}

export function totals(rows: FunnelRow[]): FunnelTotals {
  const wins = rows.filter(r => r.won);
  const losses = rows.filter(r => !r.won);
  const grossWin = wins.reduce((s, r) => s + r.profit, 0);
  const grossLoss = Math.abs(losses.reduce((s, r) => s + r.profit, 0));

  // Drawdown walks the equity curve in CLOSE ORDER, and the order is the whole
  // point: the same trades shuffled give a different worst trough, and the only
  // one worth reporting is the one that actually happened. Rows with no close
  // time sort last rather than being dropped — they still moved the balance.
  const ordered = [...rows].sort((a, b) => {
    if (!a.closedAt) return 1;
    if (!b.closedAt) return -1;
    return a.closedAt.localeCompare(b.closedAt);
  });
  let running = 0, peak = 0, worst = 0;
  for (const r of ordered) {
    running += r.profit;
    if (running > peak) peak = running;
    const dd = peak > 0 ? (peak - running) / peak : 0;
    if (dd > worst) worst = dd;
  }

  return {
    trades: rows.length,
    wins: wins.length,
    losses: losses.length,
    winRatePct: rows.length ? (wins.length / rows.length) * 100 : 0,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : null,
    netProfit: grossWin - grossLoss,
    maxDrawdownPct: worst * 100,
  };
}

export interface Combination {
  pair: string;
  framework: FrameworkId | 'untagged';
  strategy: string;
  timeframe: string;
  direction: 'buy' | 'sell' | 'unknown';
  trades: number;
  wins: number;
  winRatePct: number;
  netProfit: number;
  /** Average profit per trade — what you expect the next one to be worth. */
  expectancy: number;
  confidence: LearningSignal;
}

/**
 * How much a row's record is worth believing.
 *
 * Thresholds, not a continuous score, because the decision this feeds is
 * discrete: trade it, watch it, or leave it alone. Ten and thirty are the
 * usual bar for a win rate to stop being noise — at five trades a 60% win rate
 * and a 40% one are the same coin.
 */
export type LearningSignal = 'validated' | 'early' | 'insufficient';

export function learningSignal(trades: number): LearningSignal {
  if (trades >= 30) return 'validated';
  if (trades >= 10) return 'early';
  return 'insufficient';
}

export function combinations(rows: FunnelRow[]): Combination[] {
  const by = new Map<string, FunnelRow[]>();
  for (const r of rows) {
    const key = `${r.pair}|${r.framework}|${r.strategy}|${r.timeframe}|${r.direction}`;
    const list = by.get(key);
    if (list) list.push(r); else by.set(key, [r]);
  }

  const out: Combination[] = [];
  for (const group of by.values()) {
    const first = group[0];
    const wins = group.filter(r => r.won).length;
    const net = group.reduce((s, r) => s + r.profit, 0);
    out.push({
      pair: first.pair,
      framework: first.framework,
      strategy: first.strategy,
      timeframe: first.timeframe,
      direction: first.direction,
      trades: group.length,
      wins,
      winRatePct: (wins / group.length) * 100,
      netProfit: net,
      expectancy: net / group.length,
      confidence: learningSignal(group.length),
    });
  }

  // Ranked by expectancy, but a well-sampled row outranks a lucky one on the
  // same number: sorting on net profit alone would put a single +€400 trade
  // above a strategy that has earned €380 over forty.
  const weight = { validated: 2, early: 1, insufficient: 0 };
  return out.sort((a, b) =>
    weight[b.confidence] - weight[a.confidence] ||
    b.expectancy - a.expectancy ||
    b.trades - a.trades,
  );
}

/** Counts per value of one column, largest first — the width of each band. */
export function columnCounts<K extends keyof FunnelRow>(
  rows: FunnelRow[],
  key: K,
): Array<{ value: string; trades: number; wins: number; net: number }> {
  const by = new Map<string, { trades: number; wins: number; net: number }>();
  for (const r of rows) {
    const v = String(r[key]);
    const cur = by.get(v) ?? { trades: 0, wins: 0, net: 0 };
    cur.trades += 1;
    if (r.won) cur.wins += 1;
    cur.net += r.profit;
    by.set(v, cur);
  }
  return [...by.entries()]
    .map(([value, s]) => ({ value, ...s }))
    .sort((a, b) => b.trades - a.trades);
}
