/**
 * One colour per strategy, one per framework — defined once, read everywhere.
 *
 * The point of the dots is that a colour means the same thing wherever it
 * appears: the dot on a card in the strategy list, the dot beside an open
 * position, and the dot beside a closed trade in the journal are the same
 * colour for the same strategy. That only holds if there is exactly one table.
 * A second copy anywhere and the colours drift apart silently, which is worse
 * than having no colours at all — it would show Luka a relationship that is
 * not there.
 *
 * Chosen against a matte-black surface, and deliberately avoiding cyan: cyan is
 * already the app's "you selected this" accent (the ring around a card you
 * clicked to backtest). Selection and attribution have to stay visually
 * separate, because they now mean genuinely different things — what YOU are
 * looking at versus what the ALGO chose on its own.
 */

/** Framework a strategy belongs to — AXE's own engine, or a plugged-in one. */
export type FrameworkId = 'axe' | 'vbt' | 'nt';

/**
 * Three marks that stay apart at 9px. Slate, amber and violet differ in hue
 * AND in lightness, which is what keeps them readable for a colour-blind eye
 * and on a phone screen at arm's length — the two places these are actually
 * looked at.
 */
export const FRAMEWORK_COLORS: Record<FrameworkId, string> = {
  axe: '#94A3B8', // slate — AXE's own engine
  vbt: '#F59E0B', // amber — vectorbt
  nt: '#8B5CF6',  // violet — NautilusTrader
};

/**
 * Timeframe colours, drawn as a small "T".
 *
 * Shape carries the dimension, colour carries the value: a dot is always a
 * strategy, a triangle is always a framework, a T is always a timeframe. That
 * is what lets one trade row be read without labels — and it is the same
 * encoding the Obsidian graph can reuse, so a node there means what a row here
 * means.
 */
export const TIMEFRAME_COLORS: Record<string, string> = {
  m5: '#F87171',
  m15: '#FB923C',
  h1: '#FACC15',
  h4: '#4ADE80',
  d1: '#818CF8',
};

export function timeframeColor(tf?: string | null): string {
  if (!tf) return UNKNOWN_STRATEGY_COLOR;
  return TIMEFRAME_COLORS[tf.toLowerCase()] ?? UNKNOWN_STRATEGY_COLOR;
}

export const FRAMEWORK_LABELS: Record<FrameworkId, string> = {
  axe: 'AXE Algo',
  vbt: 'vectorbt',
  nt: 'NautilusTrader',
};

/**
 * Thirteen hues, spaced by measurement rather than by eye.
 *
 * The first attempt put all four vectorbt strategies in one amber family, on
 * the reasoning that the colour should also reveal the framework. Rendered at
 * 8px that produced seven near-identical oranges out of thirteen — and the
 * reasoning was wrong anyway: the framework has its own mark (a triangle), so
 * the dot is free to be purely distinctive.
 *
 * These are generated on an even arc with the cyan band (172-202) cut out,
 * since cyan is the app's own selection accent, and with lightness alternating
 * between neighbours so adjacent hues separate further. Measured: closest pair
 * 53 apart in RGB (was 33), closest approach to the app's cyan 58.
 */
export const STRATEGY_COLORS: Record<string, string> = {
  'smc-structure': '#E28383',
  'volumetric-ob': '#E87730',
  'fib-retracement': '#E2CD83',
  'pdh': '#C9E830',
  'ifvg': '#ACE283',
  'golden-pocket': '#37E830',
  'mean-reversion': '#83E2A4',
  'trend-follow': '#30E8BA',
  'crew-hybrid': '#83A7E2',
  'vbt:ma-cross': '#3430E8',
  'vbt:rsi-meanrev': '#AB83E2',
  'vbt:bbands': '#C330E8',
  'vbt:macd': '#E283CF',
  // NautilusTrader. Placed in the gaps the thirteen above left rather than
  // beside their own framework's amber: the triangle already says which engine
  // a strategy belongs to, so the dot stays free to be purely distinctive.
  // Measured against every existing hue — closest approach 58 in RGB, which is
  // wider than the 53 the original thirteen settled for.
  'nt:ema-bracket': '#E85A5A',
  'nt:atr-breakout': '#E8B430',
  'nt:donchian-trail': '#5FBF3A',
  'nt:rsi-pullback': '#7A5FE8',
};

/** Anything unrecognised — a broker tag we do not know, or a strategy added
 *  without a colour — gets one flat grey rather than a colour that belongs to
 *  something else. */
export const UNKNOWN_STRATEGY_COLOR = '#4B5563';

export function strategyColor(strategy?: string | null): string {
  if (!strategy) return UNKNOWN_STRATEGY_COLOR;
  return STRATEGY_COLORS[strategy] ?? UNKNOWN_STRATEGY_COLOR;
}

/** Prefix -> framework. One place, because the autopilot routes a strategy to
 *  its own engine off this same answer — a strategy attributed to the wrong
 *  framework would be asked the wrong VPS endpoint for its signal, and that
 *  endpoint would simply not recognise it and return nothing. */
export const FRAMEWORK_PREFIXES: Record<string, FrameworkId> = {
  'vbt:': 'vbt',
  'nt:': 'nt',
};

export function frameworkOf(strategy?: string | null): FrameworkId | null {
  if (!strategy) return null;
  for (const [prefix, id] of Object.entries(FRAMEWORK_PREFIXES)) {
    if (strategy.startsWith(prefix)) return id;
  }
  return 'axe';
}

export function frameworkColor(strategy?: string | null): string {
  const f = frameworkOf(strategy);
  return f ? FRAMEWORK_COLORS[f] : UNKNOWN_STRATEGY_COLOR;
}
