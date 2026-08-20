/**
 * TradeBadge — the five things every trade must show, in one place.
 *
 * THE RULE: no trade renders without strategy dot(s), framework triangle(s),
 * timeframe, side and pair. Open or closed, MT5 or the local book, desktop or
 * phone.
 *
 * It exists as ONE component because it was already drifting. The Demo book
 * rendered the full taxonomy for MT5 positions and closed trades, and the local
 * book rows immediately below rendered `BUY 0.2 XAUUSD @ 2431` with no dot, no
 * triangle and no timeframe — the same information, two formats, on one screen.
 * Three primitives composed by hand at each call site is how that happens.
 *
 * The framework is DERIVED from the strategy prefix rather than passed in, so a
 * caller cannot label a vbt: strategy as AXE's own by mistake. frameworkOf() is
 * the same function the autopilot uses to route a strategy to its engine, so
 * the triangle on screen and the engine that produced the decision can never
 * disagree.
 *
 * An untagged trade is shown as untagged. Most trades close at the broker on SL
 * or TP where AXE never sees the call, and some brokers truncate the order
 * comment the strategy rides on — so "no strategy" is a real and frequent state.
 * Drawing it as AXE's own would be inventing attribution, which is worse than
 * admitting the gap: the ledger already refuses to credit a trade it cannot
 * attribute, and this must tell the same story.
 */
import { StrategyDot, FrameworkMark, TimeframeMark } from '@/presentation/components/trading/StrategyDot';
import { frameworkOf } from '@/domain/tradingIntel/strategyColors';
import { canonicalTimeframe } from '@/domain/tradingIntel/timeframes';

export interface TradeBadgeProps {
  /** One or more. A trade can have several strategies active at once. */
  strategies?: (string | null | undefined)[];
  timeframe?: string | null;
  side?: string | null;
  pair: string;
  /** Extra trailing detail — size, price, P&L. Rendered after the five. */
  detail?: string;
  size?: number;
  className?: string;
}

const BUY = '#34d399';
const SELL = '#f87171';
const MUTED = 'rgba(255,255,255,0.35)';

export function TradeBadge({
  strategies,
  timeframe,
  side,
  pair,
  detail,
  size = 8,
  className = '',
}: TradeBadgeProps) {
  const named = (strategies ?? []).filter((s): s is string => !!s && s.trim().length > 0);

  // One triangle per DISTINCT framework. Two vbt: strategies on the same trade
  // are one engine, not two, and drawing two identical triangles would imply
  // otherwise.
  const frameworks = Array.from(
    new Set(named.map(s => frameworkOf(s)).filter((f): f is NonNullable<typeof f> => !!f)),
  );

  const tf = canonicalTimeframe(timeframe ?? undefined);
  const dir = (side ?? '').toLowerCase();
  const dirLabel = dir === 'buy' || dir === 'sell' ? dir.toUpperCase() : '—';
  const dirColor = dir === 'buy' ? BUY : dir === 'sell' ? SELL : MUTED;

  return (
    <span className={`inline-flex items-center gap-1.5 min-w-0 ${className}`}>
      {named.length ? (
        <>
          {named.map(s => <StrategyDot key={s} strategy={s} size={size} />)}
          {frameworks.map(f => (
            // FrameworkMark takes a strategy and derives the framework itself;
            // a bare prefix is enough to select the right colour.
            <FrameworkMark key={f} strategy={f === 'axe' ? 'x' : `${f}:x`} size={size + 1} />
          ))}
        </>
      ) : (
        <span className="text-[9px] uppercase tracking-wide" style={{ color: MUTED }} title="This trade carries no strategy tag — most close at the broker on SL/TP, where AXE never sees the call">
          untagged
        </span>
      )}

      <TimeframeMark timeframe={tf} size={size + 1} />

      <span className="text-[11px] font-mono-data truncate" style={{ color: '#F5F0E6' }}>
        {pair}
      </span>
      <span className="text-[11px] font-medium" style={{ color: dirColor }}>
        {dirLabel}
      </span>

      {detail && (
        <span className="text-[10px] font-mono-data truncate" style={{ color: 'rgba(255,255,255,0.45)' }}>
          {detail}
        </span>
      )}
    </span>
  );
}
