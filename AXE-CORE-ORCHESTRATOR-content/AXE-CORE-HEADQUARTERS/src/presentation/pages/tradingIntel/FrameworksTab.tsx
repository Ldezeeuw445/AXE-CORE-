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
import {
  frameworksStatus, kronosSignal, tradingAgentsSignal, nautilusSignal, vectorbtSignal,
} from '@/infrastructure/gateways/axeCoreApiService';

interface FrameworkDef {
  id: string;
  label: string;
  /** How its strategies are named in the ledger. null = not built. */
  /**
   * The tag every strategy from this framework carries, e.g. 'nt:'. Empty
   * string means AXE's own engine, whose strategies carry no prefix.
   *
   * Not nullable any more. `null` used to mean "listed but not built", which
   * put three permanently grey rows on the page — Qlib, LEAN and TensorTrade —
   * that had never done anything and could not. A framework earns its row by
   * running; until then it does not belong on a page whose job is showing what
   * is actually trading.
   */
  prefix: string;
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
// 'absent' is gone with the unbuilt frameworks: nothing on this page can
// be listed-but-missing any more.
type Wiring = 'live' | 'built';

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
  {
    id: 'kronos',
    label: 'Kronos',
    prefix: 'kr:',
    language: 'Python',
    note: 'A foundation model for candlesticks (NeoQuasar/Kronos-small), running in its own venv on the VPS. Unlike every other framework here it does not score rules against history — it forecasts the next bars and the signal is how far that forecast sits from price, measured in ATR so a move means the same thing on gold as on crypto. One strategy, because it is one model producing one forecast.',
  },
];

function belongsTo(strategy: string, prefix: string): boolean {
  if (prefix === '') return !strategy.includes(':');
  return strategy.startsWith(prefix);
}

/** Ask one engine for a signal, purely to find out whether it is there. */
async function probeSignal(key: string): Promise<{ ok?: boolean } | null> {
  const ask = key === 'kr' ? kronosSignal
    : key === 'ta' ? tradingAgentsSignal
      : key === 'nt' ? nautilusSignal
        : key === 'vbt' ? vectorbtSignal
          : null;
  if (!ask) return null;
  return ask('XAUUSD', '1h');
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
      let known: Record<string, boolean> = {};
      try {
        const st = await frameworksStatus();
        if (st?.ok) {
          known = Object.fromEntries(
            Object.entries(st.frameworks).map(([k, v]) => [k, !!v.installed]),
          );
        }
      } catch {
        // An unreachable API is not evidence either way, so leave it null and
        // say "can't tell" rather than claiming the engines are gone.
        return;
      }
      if (alive) setInstalled(known);

      // ASK THE ENGINE, DO NOT TRUST THE LIST.
      //
      // /frameworks/status reports vbt, nt and ta and has never mentioned kr,
      // so `installed['kr']` was undefined and the Kronos card read
      // "BUILT · NOT INSTALLED" — while /signal/kronos answered in 17 seconds
      // with a real forecast off NeoQuasar/Kronos-small (verified 2026-08-25:
      // XAUUSD sell, forecast 4528.98 against 4664.16, −7.5 ATR). The engine
      // was live the whole time; the roster simply had a hole in it.
      //
      // An engine that answers IS installed, whatever the list says. Only
      // frameworks the roster does not vouch for are probed, so this costs one
      // extra call for the gap and nothing for the rest.
      // Same derivation the cards use: 'kr:' → 'kr'. AXE's own engine has no
      // prefix and needs no probe.
      const probes = FRAMEWORKS
        .map(fw => (fw.prefix ? fw.prefix.replace(':', '') : null))
        .filter((k): k is string => !!k && !known[k])
        .map(async (k: string) => {
          try {
            const r = await probeSignal(k);
            return r?.ok ? k : null;
          } catch {
            return null;
          }
        });
      const answered = (await Promise.all(probes)).filter((k): k is string => !!k);
      if (alive && answered.length) {
        setInstalled(prev => ({ ...(prev ?? {}), ...Object.fromEntries(answered.map(k => [k, true])) }));
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
        // AXE's own engine ships IN THIS BUNDLE. There is no VPS install that
        // could be missing, so it is live whenever the app is running.
        //
        // Its prefix is '' — empty string, not null — and `''` is falsy, so
        // `fw.prefix ? ... : null` put it in the same branch as a framework
        // with no engine and the card read "BUILT · NOT INSTALLED". The comment
        // above this line already said it was live by definition while the code
        // below said the opposite, which is exactly the failure this tab exists
        // to catch, committed into the tab itself.
        //
        // Nothing about trading was affected: the autopilot selects strategies
        // from the ledger and never reads this badge. It was a label, and the
        // label was wrong.
        const isOwnEngine = fw.prefix === '';
        const key = fw.prefix ? fw.prefix.replace(':', '') : null;
        const wiring: Wiring = isOwnEngine
          ? 'live'
          : key === null || installed === null
            ? 'built'
            : installed[key] ? 'live' : 'built';
        // Every framework listed here has a prefix now, so every one is wired.
        const wired = true;
        const badge = wiring === 'live'
          ? { text: 'live', color: 'var(--success)', bg: 'rgba(52,211,153,0.10)' }
          : { text: installed === null ? 'built · unknown' : 'built · not installed', color: 'var(--warning)', bg: 'rgba(245,158,11,0.10)' };

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
                  <span style={{ color: net >= 0 ? 'var(--success)' : 'var(--error)' }}>{pct(net)} net</span>
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
                      <span style={{ color: 'var(--text-primary)' }}>{r.pair}</span>
                      <span>{r.strategy}</span>
                      <span className="ml-auto" style={{ color: 'rgba(255,255,255,0.35)' }}>
                        {r.trades} trades
                      </span>
                      {/* A number that cannot be true is marked rather than
                          hidden. The rows are a record of what happened, bug
                          included — but shown plainly they read as an edge,
                          and this one read as +72 495%. */}
                      {!r.liveTrusted && (
                        <span
                          className="text-[9px] px-1.5 rounded uppercase tracking-wide"
                          style={{ color: '#fbbf24', background: 'rgba(251,191,36,0.12)' }}
                          title="These live counters were recorded before the return divisor was fixed on 2026-08-20. They are impossible and are ignored for ranking; the backtest prior is used instead."
                        >
                          not trusted
                        </span>
                      )}
                      <span
                        style={{
                          color: !r.liveTrusted ? 'rgba(255,255,255,0.25)'
                            : r.netReturnPct >= 0 ? 'var(--success)' : 'var(--error)',
                          minWidth: 62,
                          textAlign: 'right',
                          textDecoration: r.liveTrusted ? undefined : 'line-through',
                        }}
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
