/**
 * One vocabulary for timeframes, and one place that translates it.
 *
 * THE BUG THIS EXISTS TO END
 *
 * AXE's own strategies wrote ledger rows at 'h1'. The framework self-test wrote
 * them at '1h', because that is what TwelveData calls the same hour and the
 * engine argument was passed straight through. normTf() only lowercases, so
 * those are two different ledger keys for one timeframe:
 *
 *   axe:XAUUSD:volumetric-ob:h1     <- AXE's own row
 *   axe:XAUUSD:vbt:ma-cross:1h      <- the same hour, filed separately
 *
 * Nothing errored. The rows simply never met, so a framework strategy could not
 * be compared against an AXE strategy on the same timeframe, and the timeframe
 * dot rendered grey because TIMEFRAME_COLORS is keyed 'h1' and never had a '1h'.
 * The Obsidian graph would have drawn that as a finding rather than a typo.
 *
 * MT5 naming is canonical here, because that is what the broker, the chart and
 * the ledger already speak. Engines are asked in their own dialect at the call
 * boundary and nowhere else.
 */

/** The canonical form. Everything stored or compared uses these. */
export const TIMEFRAMES = ['m5', 'm15', 'm30', 'h1', 'h4', 'd1'] as const;
export type Timeframe = (typeof TIMEFRAMES)[number];

export const DEFAULT_TIMEFRAME: Timeframe = 'h1';

/** Every spelling seen in this codebase or returned by a data source. */
const ALIASES: Record<string, Timeframe> = {
  m5: 'm5', '5m': 'm5', '5min': 'm5',
  m15: 'm15', '15m': 'm15', '15min': 'm15',
  m30: 'm30', '30m': 'm30', '30min': 'm30',
  h1: 'h1', '1h': 'h1', '60min': 'h1', hourly: 'h1',
  h4: 'h4', '4h': 'h4', '240min': 'h4',
  d1: 'd1', '1d': 'd1', '1day': 'd1', daily: 'd1',
};

/**
 * Any spelling in, canonical out.
 *
 * Returns null rather than guessing for something unrecognised: a timeframe
 * quietly coerced to h1 is how a d1 result would end up filed as an hour, and
 * a wrong row is worse than a missing one.
 */
export function canonicalTimeframe(tf?: string | null): Timeframe | null {
  if (!tf) return null;
  return ALIASES[tf.trim().toLowerCase()] ?? null;
}

/** TwelveData's names, used by both VPS engines (vectorbt and Nautilus). */
const ENGINE_INTERVAL: Record<Timeframe, string> = {
  m5: '5min',
  m15: '15min',
  m30: '30min',
  h1: '1h',
  h4: '4h',
  d1: '1day',
};

/** Canonical -> the interval string a VPS engine expects. */
export function toEngineInterval(tf: string): string {
  const c = canonicalTimeframe(tf);
  return c ? ENGINE_INTERVAL[c] : ENGINE_INTERVAL[DEFAULT_TIMEFRAME];
}
