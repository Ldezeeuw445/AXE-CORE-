/**
 * The funnel's arithmetic, tested apart from its drawing.
 *
 * A ribbon is either the right width or it is a confident claim about which
 * strategy makes money — and you cannot tell those apart by looking at the
 * picture, which is the entire reason this layer is separate and tested.
 */
import { describe, it, expect } from 'vitest';
import {
  parseTag, toFunnelRows, totals, combinations, columnCounts, learningSignal,
  UNTAGGED, UNKNOWN_TF, type FunnelTrade,
} from './funnelAnalytics';

function t(over: Partial<FunnelTrade> = {}): FunnelTrade {
  return { symbol: 'BTCUSD', side: 'buy', profit: 10, comment: 'AXE mean-reversion h1', ...over };
}

describe('reading the strategy tag', () => {

  // The comments the live MT5 book actually carries, taken from the scoreboard
  // on the same screen that was listing them by name while the funnel called
  // all 130 of them untagged.
  it('reads a bare comment from the live book, with no AXE prefix', () => {
    expect(parseTag('volumetric-ob').strategy).toBe('volumetric-ob');
    expect(parseTag('mean-reversion').strategy).toBe('mean-reversion');
    expect(parseTag('fib-retracement').strategy).toBe('fib-retracement');
  });

  it('still splits the timeframe off a bare comment', () => {
    expect(parseTag('volumetric-ob h1')).toEqual({ strategy: 'volumetric-ob', timeframe: 'h1' });
    expect(parseTag('mean-reversion d1')).toEqual({ strategy: 'mean-reversion', timeframe: 'd1' });
  });

  it('keeps reading the prefixed form the reconciler writes', () => {
    expect(parseTag('AXE golden-pocket h4')).toEqual({ strategy: 'golden-pocket', timeframe: 'h4' });
  });

  it('does not mistake the broker\'s own stamps for strategies', () => {
    // Each of these would otherwise become a strategy with its own colour and
    // its own row — and "sl 4512.30" would become one per price.
    expect(parseTag('sl 4512.30').strategy).toBe(UNTAGGED);
    expect(parseTag('tp 1.23456').strategy).toBe(UNTAGGED);
    expect(parseTag('so: 20%').strategy).toBe(UNTAGGED);
    expect(parseTag('b72').strategy).toBe(UNTAGGED);
    expect(parseTag('AXE s31').strategy).toBe(UNTAGGED);
    expect(parseTag('12345').strategy).toBe(UNTAGGED);
  });
  it('splits strategy and timeframe', () => {
    expect(parseTag('AXE volumetric-ob h4')).toEqual({ strategy: 'volumetric-ob', timeframe: 'h4' });
  });

  it('keeps a framework prefix intact', () => {
    expect(parseTag('AXE kr:forecast h1')).toEqual({ strategy: 'kr:forecast', timeframe: 'h1' });
  });

  it('refuses to invent a strategy from a side+confidence stamp', () => {
    // "AXE b72" is the bare stamp. Read as a strategy it would earn its own
    // colour and its own row in the top-combinations table.
    expect(parseTag('AXE b72').strategy).toBe(UNTAGGED);
    expect(parseTag('AXE s61').strategy).toBe(UNTAGGED);
  });

  it('treats a broker-truncated or empty comment as untagged', () => {
    expect(parseTag(null).strategy).toBe(UNTAGGED);
    expect(parseTag('').strategy).toBe(UNTAGGED);
    expect(parseTag('sl 4512.30').strategy).toBe(UNTAGGED);
  });

  it('keeps a strategy that carries no timeframe', () => {
    expect(parseTag('AXE trend-follow')).toEqual({ strategy: 'trend-follow', timeframe: UNKNOWN_TF });
  });
});

describe('attribution', () => {
  it('derives the framework from the strategy prefix', () => {
    const [r] = toFunnelRows([t({ comment: 'AXE nt:atr-breakout h4' })]);
    expect(r.framework).toBe('nt');
    expect(r.strategy).toBe('nt:atr-breakout');
  });

  it("calls AXE's own unprefixed strategies axe", () => {
    expect(toFunnelRows([t({ comment: 'AXE mean-reversion h1' })])[0].framework).toBe('axe');
  });

  it('keeps untagged trades in the count rather than dropping them', () => {
    // Dropping them would inflate the win rate of everything that DID carry a
    // tag, which is the opposite of what this screen is for.
    const rows = toFunnelRows([t({ comment: null, profit: -50 }), t({ profit: 10 })]);
    expect(rows).toHaveLength(2);
    expect(totals(rows).trades).toBe(2);
  });

  it('records the real side, and says unknown when there is none', () => {
    expect(toFunnelRows([t({ side: 'sell' })])[0].direction).toBe('sell');
    expect(toFunnelRows([t({ side: null })])[0].direction).toBe('unknown');
  });
});

describe('totals', () => {
  const rows = toFunnelRows([
    t({ profit: 100, closeTime: '2026-08-01' }),
    t({ profit: -40, closeTime: '2026-08-02' }),
    t({ profit: 60, closeTime: '2026-08-03' }),
    t({ profit: -20, closeTime: '2026-08-04' }),
  ]);

  it('counts wins, losses and net', () => {
    const s = totals(rows);
    expect(s.trades).toBe(4);
    expect(s.wins).toBe(2);
    expect(s.losses).toBe(2);
    expect(s.netProfit).toBeCloseTo(100, 6);
    expect(s.winRatePct).toBe(50);
  });

  it('computes profit factor as gross win over gross loss', () => {
    expect(totals(rows).profitFactor).toBeCloseTo(160 / 60, 6);
  });

  it('reports an unbeaten record as null rather than Infinity', () => {
    // Infinity renders as "∞" or as a broken number depending on the formatter;
    // null lets the view say "no losing trade yet", which is the real fact.
    expect(totals(toFunnelRows([t({ profit: 10 })])).profitFactor).toBeNull();
  });

  it('counts break-even as a loss so the columns still sum', () => {
    const s = totals(toFunnelRows([t({ profit: 0 })]));
    expect(s.wins).toBe(0);
    expect(s.losses).toBe(1);
  });

  it('walks the drawdown in close order, not array order', () => {
    // Same four trades, shuffled. The worst trough is a property of the
    // sequence that happened, so it must not depend on how the rows arrived.
    const shuffled = toFunnelRows([
      t({ profit: -20, closeTime: '2026-08-04' }),
      t({ profit: 100, closeTime: '2026-08-01' }),
      t({ profit: 60, closeTime: '2026-08-03' }),
      t({ profit: -40, closeTime: '2026-08-02' }),
    ]);
    expect(totals(shuffled).maxDrawdownPct).toBeCloseTo(totals(rows).maxDrawdownPct, 6);
    // 100 -> 60 is the worst peak-to-trough: 40% of the 100 peak.
    expect(totals(rows).maxDrawdownPct).toBeCloseTo(40, 6);
  });
});

describe('learning signal', () => {
  it('needs thirty trades before a record counts as validated', () => {
    expect(learningSignal(29)).toBe('early');
    expect(learningSignal(30)).toBe('validated');
  });

  it('calls under ten insufficient, because that is a coin flip', () => {
    expect(learningSignal(9)).toBe('insufficient');
    expect(learningSignal(10)).toBe('early');
  });
});

describe('top combinations', () => {
  it('ranks a well-sampled edge above a single lucky trade', () => {
    const lucky = Array.from({ length: 1 }, () => t({ symbol: 'ETHUSD', profit: 400 }));
    const solid = Array.from({ length: 30 }, () => t({ symbol: 'BTCUSD', profit: 13 }));
    const ranked = combinations(toFunnelRows([...lucky, ...solid]));
    // The lucky one has 30x the expectancy and belongs below, because one
    // trade is not evidence.
    expect(ranked[0].pair).toBe('BTCUSD');
    expect(ranked[0].confidence).toBe('validated');
    expect(ranked[1].pair).toBe('ETHUSD');
  });

  it('groups on every column, so buy and sell are separate records', () => {
    const rows = toFunnelRows([
      t({ side: 'buy', profit: 50 }),
      t({ side: 'sell', profit: -50 }),
    ]);
    const combos = combinations(rows);
    expect(combos).toHaveLength(2);
    expect(new Set(combos.map(c => c.direction))).toEqual(new Set(['buy', 'sell']));
  });
});

describe('column widths', () => {
  it('counts per value, widest first', () => {
    const rows = toFunnelRows([
      t({ symbol: 'BTCUSD' }), t({ symbol: 'BTCUSD' }), t({ symbol: 'XAUUSD' }),
    ]);
    const cols = columnCounts(rows, 'pair');
    expect(cols[0]).toMatchObject({ value: 'BTCUSD', trades: 2 });
    expect(cols[1]).toMatchObject({ value: 'XAUUSD', trades: 1 });
  });
});
