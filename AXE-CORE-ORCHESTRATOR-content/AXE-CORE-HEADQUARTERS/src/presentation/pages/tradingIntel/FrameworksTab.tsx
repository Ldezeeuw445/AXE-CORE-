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
import { getLedger, MIN_LIVE_SAMPLE, type LedgerStats } from '@/infrastructure/persistence/tradingLedgerService';
import { frameworksStatus } from '@/infrastructure/gateways/axeCoreApiService';

interface FrameworkDef {
  id: string;
  label: string;
  /** How its strategies are named in the ledger. null = not built. */
  prefix: string | null;
  language: string;
  note: string;
}

/**
 * Three states, not two.
 *
 * 'built' only says this app knows how to talk to the engine. Whether the
 * engine EXISTS is a fact about the VPS, and the two came apart the moment a
 * second framework was added: the code shipped in the bundle before anything
 * was installed on the box. A card that read "wired" then would have been the
 * fourth time in this project that something written but not connected looked
 * finished — on the one screen whose entire job is to tell them apart.
 */
type Wiring = 'live' | 'built' | 'absent';

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
  {
    id: 'nautilus',
    label: 'NautilusTrader',
    prefix: 'nt:',
    language: 'Python / Rust',
    note: 'Event-driven matching engine on the VPS — every nt: strategy is a bracket with a real stop and target, filled against each bar\u2019s high and low.',
  },
  {
    id: 'tradingagents',
    label: 'TradingAgents',
    prefix: 'ta:',
    language: 'Python',
    note: 'A simulated firm — fundamentals, sentiment, news and technical analysts, a bull and a bear who argue, a risk manager. Runs on the VPS\u2019s own Ollama, so it costs no provider quota. Built for equities: on FX, metals, indices and crypto there are no earnings or fundamentals to read, so only its technical, news and sentiment analysts contribute. Decisions are refreshed on a schedule — one debate takes minutes.',
  },
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
  const [installed, setInstalled] = useState<Record<string, boolean> | null>(null);

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
    (async () => {
      try {
        const st = await frameworksStatus();
        if (alive && st?.ok) {
          setInstalled(Object.fromEntries(
            Object.entries(st.frameworks).map(([k, v]) => [k, !!v.installed]),
          ));
        }
      } catch {
        // An unreachable API is not evidence either way, so leave it null and
        // say "can't tell" rather than claiming the engines are gone.
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
        // AXE's own engine is in the bundle, so it is live by definition —
        // there is no VPS install that could be missing.
        const key = fw.prefix ? fw.prefix.replace(':', '') : null;
        const wiring: Wiring = fw.prefix === null
          ? 'absent'
          : key === null || installed === null
            ? 'built'
            : installed[key] ? 'live' : 'built';
        const wired = fw.prefix !== null;
        const badge = wiring === 'live'
          ? { text: 'live', color: '#34d399', bg: 'rgba(52,211,153,0.10)' }
          : wiring === 'built'
            ? { text: installed === null ? 'built · unknown' : 'built · not installed', color: '#f59e0b', bg: 'rgba(245,158,11,0.10)' }
            : { text: 'not built', color: 'rgba(255,255,255,0.35)', bg: 'rgba(255,255,255,0.04)' };

        return (
          <WidgetCard
            key={fw.id}
            title={fw.label}
            headerAction={
              <span className="flex items-center gap-2">
                <FrameworkMark strategy={fw.prefix ? `${fw.prefix}x` : 'x'} size={9} />
                <span
                  className="text-[9px] px-1.5 py-0.5 rounded uppercase tracking-wide"
                  style={{ color: badge.color, background: badge.bg }}
                >
                  {badge.text}
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
            ) : wiring === 'built' && installed !== null ? (
              <div className="text-[11px]" style={{ color: 'rgba(255,255,255,0.35)' }}>
                AXE can drive this engine, but it is not installed on the VPS — see
                backend/axe_trading/README.md. Until it is, it writes no ledger rows and
                the algo cannot select it.
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
