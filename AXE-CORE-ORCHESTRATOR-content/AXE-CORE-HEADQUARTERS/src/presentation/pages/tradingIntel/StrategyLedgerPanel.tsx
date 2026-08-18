/**
 * StrategyLedgerPanel — AXE Algo's "what works where", made visible.
 *
 * Reads the per-(pair × strategy) ledger (tradingLedgerService) and shows, per
 * pair, how each strategy is actually performing — real closed-trade record
 * plus the latest self-test prior. This is the structured knowledge the agent
 * now uses to pick a strategy per pair, surfaced so you can see the same thing
 * it does. Empty until the agent has traded or self-tested — no fabricated rows.
 */
import { useEffect, useState } from 'react';
import { RefreshCw, TrendingUp, FlaskConical } from 'lucide-react';
import { WidgetCard } from '@/presentation/components/widgets/WidgetCard';
import { getLedger, MIN_LIVE_SAMPLE, type LedgerStats } from '@/infrastructure/persistence/tradingLedgerService';

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}
function pf(n: number): string {
  return Number.isFinite(n) ? n.toFixed(2) : '∞';
}

function StrategyRow({ s, best }: { s: LedgerStats; best: boolean }) {
  const net = s.netReturnPct;
  const netColor = net > 0 ? '#6ee7b7' : net < 0 ? '#fca5a5' : 'rgba(255,255,255,0.5)';
  const sampled = s.trades >= MIN_LIVE_SAMPLE;
  return (
    <div className="flex items-center gap-2 py-1.5" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: best ? '#a78bfa' : 'transparent', boxShadow: best ? '0 0 6px #a78bfa' : 'none' }} />
      <span className="text-[11px] min-w-[120px]" style={{ color: best ? '#c4b5fd' : '#F5F0E6' }}>{s.strategy}</span>
      <span className="text-[10px] font-mono-data min-w-[64px]" style={{ color: 'rgba(255,255,255,0.55)' }}>
        {s.trades > 0 ? `${s.trades}t · ${(s.winRate * 100).toFixed(0)}%` : '—'}
      </span>
      <span className="text-[10px] font-mono-data min-w-[62px]" style={{ color: netColor }}>
        {s.trades > 0 ? pct(net) : '—'}
      </span>
      <span className="text-[10px] font-mono-data min-w-[48px]" style={{ color: 'rgba(255,255,255,0.45)' }} title="Profit factor">
        {s.trades > 0 ? `pf ${pf(s.profitFactor)}` : ''}
      </span>
      {s.backtest && (
        <span className="text-[9px] flex items-center gap-1 ml-auto" style={{ color: 'rgba(255,255,255,0.4)' }} title="Latest self-test (backtest) prior">
          <FlaskConical size={9} /> {pct(s.backtest.netReturnPct)} · {(s.backtest.winRate * 100).toFixed(0)}% · {s.backtest.trades}t
        </span>
      )}
      {!sampled && s.trades > 0 && (
        <span className="text-[8px] px-1 py-0.5 rounded-full ml-auto" style={{ background: 'rgba(244,182,64,0.12)', color: '#f4c26e' }} title={`Fewer than ${MIN_LIVE_SAMPLE} live trades — ranking still leans on the self-test`}>
          low sample
        </span>
      )}
    </div>
  );
}

export function StrategyLedgerPanel() {
  const [rows, setRows] = useState<LedgerStats[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setRows(await getLedger());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    const poll = setInterval(() => void load(), 60_000);
    return () => { clearTimeout(t); clearInterval(poll); };
  }, []);

  // Group by pair, rank strategies within each pair by the same expectancy the agent uses.
  const byPair = new Map<string, LedgerStats[]>();
  for (const r of rows) {
    const arr = byPair.get(r.pair) ?? [];
    arr.push(r);
    byPair.set(r.pair, arr);
  }
  const pairs = [...byPair.entries()].map(([pair, list]) => ({
    pair,
    list: list.sort((a, b) => b.expectancy - a.expectancy),
  })).sort((a, b) => a.pair.localeCompare(b.pair));

  return (
    <WidgetCard
      title="Strategy ledger — what works per pair"
      headerAction={
        <button type="button" onClick={() => void load()} className="flex items-center gap-1 text-[10px]" style={{ color: 'rgba(255,255,255,0.45)' }}>
          <RefreshCw size={10} className={loading ? 'animate-spin' : ''} />
        </button>
      }
    >
      {pairs.length === 0 ? (
        <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.35)' }}>
          No ledger data yet — it fills as AXE Algo closes real trades (attributed per pair × strategy) or self-tests strategies. Nothing fabricated.
        </p>
      ) : (
        <div className="space-y-3">
          {pairs.map(({ pair, list }) => (
            <div key={pair}>
              <div className="flex items-center gap-1.5 mb-0.5">
                <TrendingUp size={11} style={{ color: '#a78bfa' }} />
                <span className="text-[12px] font-medium" style={{ color: '#F5F0E6' }}>{pair}</span>
                <span className="text-[9px]" style={{ color: 'rgba(255,255,255,0.35)' }}>
                  best: {list[0]?.strategy ?? '—'}
                </span>
              </div>
              {list.map((s, i) => <StrategyRow key={s.strategy} s={s} best={i === 0} />)}
            </div>
          ))}
        </div>
      )}
    </WidgetCard>
  );
}
