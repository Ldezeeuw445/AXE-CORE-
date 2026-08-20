/**
 * FrameworksTab — what each engine is, what colour it wears, and what it has
 * actually done.
 *
 * A framework "plugs in" here as more candidates in the same ledger, not as a
 * new brain: selfTestPairs writes AXE's own strategies and vectorbt's vbt:*
 * ones into identical (pair x strategy x timeframe) rows, and the ranking
 * cannot tell which engine produced a number. That is the whole design, and it
 * is why this tab can be a plain read of the ledger rather than a per-framework
 * integration of its own.
 *
 * The four unbuilt ones are listed on purpose. Three separate things in this
 * project turned out to be written but never connected, and each one *looked*
 * finished from the outside. A framework that is only a plan should say so on
 * the same screen as the ones that are real.
 */
import { useEffect, useState } from 'react';
import { WidgetCard } from '@/presentation/components/widgets/WidgetCard';
import { StrategyDot, FrameworkMark, TimeframeMark } from '@/presentation/components/trading/StrategyDot';
import { FRAMEWORK_COLORS, FRAMEWORK_LABELS } from '@/domain/tradingIntel/strategyColors';
import { getLedger, MIN_LIVE_SAMPLE, type LedgerStats } from '@/infrastructure/persistence/tradingLedgerService';

interface FrameworkDef {
  id: string;
  label: string;
  /** How its strategies are named in the ledger. null = not wired yet. */
  prefix: string | null;
  language: string;
  note: string;
}

const FRAMEWORKS: FrameworkDef[] = [
  {
    id: 'axe',
    label: 'AXE Algo',
    prefix: '',
    language: 'TypeScript',
    note: "AXE's own engine — the eight distinct strategies, backtested in-process.",
  },
  {
    id: 'vbt',
    label: 'vectorbt',
    prefix: 'vbt:',
    language: 'Python',
    note: 'Runs in its own venv on the VPS; signals fetched off-box and traded like any other candidate.',
  },
  { id: 'nautilus', label: 'NautilusTrader', prefix: null, language: 'Python / Rust', note: 'Not built yet.' },
  { id: 'qlib', label: 'Qlib', prefix: null, language: 'Python', note: 'Not built yet.' },
  { id: 'lean', label: 'LEAN', prefix: null, language: 'C# / Python', note: 'Not built yet.' },
  { id: 'tensortrade', label: 'TensorTrade', prefix: null, language: 'Python', note: 'Not built yet.' },
];

function belongsTo(strategy: string, prefix: string | null): boolean {
  if (prefix === null) return false;
  if (prefix === '') return !strategy.includes(':');
  return strategy.startsWith(prefix);
}

function pct(v: number): string {
  return `${v >= 0 ? '+' : ''}${(v * 100).toFixed(2)}%`;
}

export function FrameworksTab() {
  const [rows, setRows] = useState<LedgerStats[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await getLedger();
        if (alive) setRows(r);
      } catch {
        /* the ledger being unreadable is not worth an error screen here */
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  return (
    <div className="space-y-3">
      {FRAMEWORKS.map(fw => {
        const mine = rows.filter(r => belongsTo(r.strategy, fw.prefix));
        const liveTrades = mine.reduce((n, r) => n + r.trades, 0);
        const net = mine.reduce((n, r) => n + r.netReturnPct, 0);
        // Best = highest expectancy among rows with enough live trades to mean
        // something. Below MIN_LIVE_SAMPLE a single lucky fill outranks a real
        // edge, so "best" there would be noise dressed as a recommendation.
        const ranked = [...mine]
          .filter(r => r.trades >= MIN_LIVE_SAMPLE)
          .sort((a, b) => b.expectancy - a.expectancy);
        const wired = fw.prefix !== null;

        return (
          <WidgetCard
            key={fw.id}
            title={fw.label}
            headerAction={
              <span className="flex items-center gap-2">
                <FrameworkMark strategy={fw.prefix === 'vbt:' ? 'vbt:x' : 'x'} size={9} />
                <span
                  className="text-[9px] px-1.5 py-0.5 rounded uppercase tracking-wide"
                  style={{
                    color: wired ? '#34d399' : 'rgba(255,255,255,0.35)',
                    background: wired ? 'rgba(52,211,153,0.10)' : 'rgba(255,255,255,0.04)',
                  }}
                >
                  {wired ? 'wired' : 'not built'}
                </span>
              </span>
            }
          >
            <div className="text-[10px]" style={{ color: 'rgba(255,255,255,0.4)' }}>
              {fw.language} · {fw.note}
            </div>

            {!wired ? (
              <div className="text-[11px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
                Nothing in the ledger — it plugs in as more candidates alongside the others,
                so it will appear here the moment it writes its first self-test.
              </div>
            ) : loading ? (
              <div className="text-[11px]" style={{ color: 'rgba(255,255,255,0.35)' }}>Reading the ledger…</div>
            ) : !mine.length ? (
              <div className="text-[11px]" style={{ color: 'rgba(255,255,255,0.35)' }}>No entries yet.</div>
            ) : (
              <>
                <div className="flex gap-5 text-[11px]" style={{ color: 'rgba(255,255,255,0.55)' }}>
                  <span>{mine.length} combinations</span>
                  <span>{liveTrades} live trades</span>
                  <span style={{ color: net >= 0 ? '#34d399' : '#f87171' }}>{pct(net)} net</span>
                </div>

                <div className="space-y-1">
                  {(ranked.length ? ranked : mine).slice(0, 8).map(r => (
                    <div
                      key={`${r.pair}:${r.strategy}:${r.timeframe}`}
                      className="flex items-center gap-2 text-[11px]"
                      style={{ color: 'rgba(255,255,255,0.6)' }}
                    >
                      <StrategyDot strategy={r.strategy} size={8} />
                      <TimeframeMark timeframe={r.timeframe} size={9} />
                      <span style={{ color: '#F5F0E6' }}>{r.pair}</span>
                      <span>{r.strategy}</span>
                      <span className="ml-auto" style={{ color: 'rgba(255,255,255,0.35)' }}>
                        {r.trades} trades
                      </span>
                      <span
                        style={{ color: r.netReturnPct >= 0 ? '#34d399' : '#f87171', minWidth: 62, textAlign: 'right' }}
                      >
                        {pct(r.netReturnPct)}
                      </span>
                    </div>
                  ))}
                </div>

                {!ranked.length && (
                  <div className="text-[10px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
                    Nothing has {MIN_LIVE_SAMPLE}+ live trades yet, so these are unranked — a single
                    fill would otherwise look like an edge.
                  </div>
                )}
              </>
            )}
          </WidgetCard>
        );
      })}
    </div>
  );
}
