import { strategyColor, frameworkColor, frameworkOf, timeframeColor, FRAMEWORK_LABELS } from '@/domain/tradingIntel/strategyColors';

/**
 * The coloured dot that says which strategy — and which framework — was behind
 * something.
 *
 * One component on purpose. The dot in the strategy list, the dot beside an
 * open position and the dot beside a closed trade have to be the same size and
 * the same colour for the same strategy, or the whole idea collapses: the point
 * is that Luka can glance at a trade row and a strategy card and know they are
 * the same thing without reading either label.
 *
 * `live` is drawn as a ring rather than a different colour. A strategy that is
 * currently running is the same strategy — changing its hue would break the
 * one rule this system depends on. The ring says "in use now"; the fill always
 * says "which one".
 */
export function StrategyDot({
  strategy,
  size = 8,
  title,
}: {
  strategy?: string | null;
  size?: number;
  title?: string;
}) {
  const color = strategyColor(strategy);
  const fw = frameworkOf(strategy);
  const label = strategy
    ? `${strategy}${fw ? ` \u00b7 ${FRAMEWORK_LABELS[fw]}` : ''}`
    : 'no strategy recorded';

  return (
    <span
      title={title ?? label}
      aria-label={label}
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        borderRadius: '50%',
        // Colour means one thing and one thing only: which strategy. No state
        // is encoded here — not "selected", not "running". Two earlier versions
        // tried (a halo, then a grey-out) and both made you decode the mark
        // before you could read it. What is running is answered where it
        // actually matters, on the open and closed trades themselves.
        background: color,
        flexShrink: 0,
      }}
    />
  );
}

/**
 * Framework mark — a triangle.
 *
 * Shape carries the dimension, colour carries the value. A framework drawn as
 * another circle would read as a second strategy, which is the one thing this
 * system must never do: the whole point is that a glance at a trade row tells
 * you WHICH KIND of decision each mark represents before you read any of them.
 */
export function FrameworkMark({ strategy, size = 8 }: { strategy?: string | null; size?: number }) {
  const fw = frameworkOf(strategy);
  if (!fw) return null;
  const color = frameworkColor(strategy);
  return (
    <span
      title={`framework: ${FRAMEWORK_LABELS[fw]}`}
      aria-label={`framework ${FRAMEWORK_LABELS[fw]}`}
      style={{
        display: 'inline-block',
        width: 0,
        height: 0,
        flexShrink: 0,
        borderLeft: `${size / 2}px solid transparent`,
        borderRight: `${size / 2}px solid transparent`,
        borderBottom: `${size * 0.87}px solid ${color}`,
      }}
    />
  );
}

/** Kept as an alias so existing call sites keep working. */
export const FrameworkDot = FrameworkMark;

/**
 * Timeframe mark — the timeframe itself, written out.
 *
 * This was a coloured "T", following the same shape-plus-colour rule as the
 * dots and triangles. Luka called it: there are only five timeframes and their
 * names are two or three characters, so writing "h1" says in one glance what a
 * colour makes you look up. Colour is worth spending where the set is too
 * large to spell out — thirteen strategies — and a waste where it is not.
 *
 * Kept faintly tinted so a row of marks still reads as one family, but the
 * text carries the meaning and the colour is decoration, not a code.
 */
export function TimeframeMark({ timeframe, size = 9 }: { timeframe?: string | null; size?: number }) {
  if (!timeframe) return null;
  const color = timeframeColor(timeframe);
  return (
    <span
      title={`timeframe: ${timeframe}`}
      aria-label={`timeframe ${timeframe}`}
      style={{
        display: 'inline-block',
        fontSize: size,
        lineHeight: 1,
        fontWeight: 600,
        color,
        flexShrink: 0,
        letterSpacing: '0.02em',
        fontFamily: 'ui-monospace, monospace',
        textTransform: 'lowercase',
      }}
    >
      {timeframe}
    </span>
  );
}

/**
 * Every strategy behind one trade — one dot each.
 *
 * Two strategies means two dots, and that is the whole rule. A trade normally
 * rests on ONE framework and ONE timeframe, so those get a single mark; if a
 * decision ever spans two, they follow the same pattern — another mark of the
 * same shape in the other value's colour.
 */
export function StrategyDots({
  strategies,
  size = 8,
}: {
  strategies: (string | null | undefined)[];
  size?: number;
}) {
  const seen = Array.from(new Set(strategies.filter(Boolean) as string[]));
  if (!seen.length) {
    return <StrategyDot strategy={null} size={size} title="no strategy recorded on this trade" />;
  }
  return (
    <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
      {seen.map(s => (
        <StrategyDot key={s} strategy={s} size={size} />
      ))}
    </span>
  );
}

/** Several timeframes on one decision — one T each, same rule as the dots. */
export function TimeframeMarks({ timeframes, size = 9 }: { timeframes: (string | null | undefined)[]; size?: number }) {
  const seen = Array.from(new Set(timeframes.filter(Boolean) as string[]));
  if (!seen.length) return null;
  return (
    <span style={{ display: 'inline-flex', gap: 3, alignItems: 'center' }}>
      {seen.map(t => <TimeframeMark key={t} timeframe={t} size={size} />)}
    </span>
  );
}
