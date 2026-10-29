/**
 * Trading Team TEST panel — run Scout→…→Decision and show recent Supabase rows.
 * Demo-only via allowlist; propose-only unless AXE_TRADING_TEAM_AUTO_EXECUTE=1.
 */
import { useCallback, useEffect, useState } from 'react';
import { Play, RefreshCw, Shield } from 'lucide-react';
import { WidgetCard } from '@/presentation/components/widgets/WidgetCard';
import { runTradingTeamCycle, listRecentRuns, backtestGoldOrb, goldOrbConfigFromEnv, GOLD_ORB_SYMBOL, GOLD_ORB_TIMEFRAME } from '@/application/tradingTeam';
import type { TradingTeamCycleResult, TradingTeamRunRow, GoldOrbBacktestResult } from '@/application/tradingTeam';
import { getHistory } from '@/application/tradingIntel/historyService';

export function TradingTeamTab() {
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<TradingTeamCycleResult | null>(null);
  const [runs, setRuns] = useState<TradingTeamRunRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [bt, setBt] = useState<GoldOrbBacktestResult | null>(null);
  const [btBusy, setBtBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const rows = await listRecentRuns(30);
      setRuns(rows);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const run = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await runTradingTeamCycle();
      setLast(r);
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const runBacktest = async () => {
    setBtBusy(true);
    setErr(null);
    try {
      const hist = await getHistory({ symbol: GOLD_ORB_SYMBOL, timeframe: GOLD_ORB_TIMEFRAME, minBars: 2000, provider: 'metaapi' });
      if (!('ok' in hist) || !hist.ok) {
        setErr(hist && 'error' in hist ? String(hist.error) : 'No m5 gold history for backtest');
        setBt(null);
        return;
      }
      const bars = hist.candles.map(c => ({
        time: c.time, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume,
      }));
      setBt(backtestGoldOrb(bars, goldOrbConfigFromEnv()));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBtBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <WidgetCard title="Trading Team TEST" icon={<Shield className="h-4 w-4" />}>
        <p className="text-[12px] text-tos-muted mb-3">
          Scout → News / Sentiment / Charts → Risk → Decision. Fail-closed on the
          Companion <span className="font-mono text-tos-text">MT5 DEMO 500K</span> only.
          Propose-only by default; set <span className="font-mono">AXE_TRADING_TEAM_AUTO_EXECUTE=1</span> to place on that demo.
          Scout also runs <span className="font-mono text-tos-text">Gold ORB 1AM NY</span> on XAUUSD m5 (volatility filter on; TP 0.5R).
        </p>
        <div className="flex gap-2 mb-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => { void run(); }}
            className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-[12px] text-tos-text hover:bg-white/10 disabled:opacity-50"
          >
            <Play className="h-3.5 w-3.5" />
            {busy ? 'Running…' : 'Run cycle'}
          </button>
          <button
            type="button"
            onClick={() => { void refresh(); }}
            className="inline-flex items-center gap-1.5 rounded-md border border-white/10 px-3 py-1.5 text-[12px] text-tos-muted hover:bg-white/5"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh log
          </button>
          <button
            type="button"
            disabled={btBusy}
            onClick={() => { void runBacktest(); }}
            className="inline-flex items-center gap-1.5 rounded-md border border-white/10 px-3 py-1.5 text-[12px] text-tos-muted hover:bg-white/5 disabled:opacity-50"
          >
            {btBusy ? 'Backtesting…' : 'Backtest Gold ORB'}
          </button>
        </div>
        {bt && (
          <div className="rounded-md border border-white/10 bg-black/20 p-3 text-[11px] font-mono space-y-1 mb-3">
            <div>Gold ORB backtest · trades {bt.trades.length} · W/L {bt.wins}/{bt.losses} · sumR {bt.sumR.toFixed(2)}</div>
            <div className="text-tos-muted">{bt.notes.slice(-2).join(' · ')}</div>
          </div>
        )}
        {err && <p className="text-[12px] text-red-300/90 mb-2">{err}</p>}
        {last && (
          <div className="rounded-md border border-white/10 bg-black/20 p-3 text-[11px] font-mono space-y-1 mb-3">
            <div>cycle <span className="text-tos-text">{last.cycleId}</span> · {last.status}</div>
            <div>guard: <span className={last.guard.status === 'allowed' ? 'text-emerald-300/90' : 'text-amber-300/90'}>{last.guard.status}</span> — {last.guard.reason}</div>
            <div>account: {last.guard.accountLabel ?? '—'} ({last.guard.accountId?.slice(0, 8) ?? '—'})</div>
            <div>verdict: <span className="text-tos-text">{last.decision.verdict}</span> · conf {last.decision.confidence.toFixed(2)}</div>
            <div>{last.decision.summary}</div>
            {last.decision.proposal && (
              <div className="text-tos-warm/90">
                proposal {last.decision.proposal.side.toUpperCase()} {last.decision.proposal.symbol}
                {last.decision.proposal.entry != null ? ` @ ${last.decision.proposal.entry}` : ''}
                {last.decision.proposal.riskReward != null ? ` R:R ${last.decision.proposal.riskReward.toFixed(2)}` : ''}
              </div>
            )}
            <div>exec: {JSON.stringify(last.execution)}</div>
          </div>
        )}
      </WidgetCard>

      <WidgetCard title="Recent runs (Supabase)">
        {runs.length === 0 ? (
          <p className="text-[12px] text-tos-muted">No rows yet (migration + first cycle required).</p>
        ) : (
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-left text-tos-dim border-b border-white/10">
                <th className="py-1.5 pr-2">When</th>
                <th className="py-1.5 pr-2">Verdict</th>
                <th className="py-1.5 pr-2">Symbol</th>
                <th className="py-1.5 pr-2">Guard</th>
                <th className="py-1.5">Account</th>
              </tr>
            </thead>
            <tbody>
              {runs.map(r => (
                <tr key={r.id} className="border-b border-white/5 text-tos-text/90">
                  <td className="py-1.5 pr-2 font-mono tabular-nums">{new Date(r.created_at).toLocaleString()}</td>
                  <td className="py-1.5 pr-2">{r.verdict ?? r.status}</td>
                  <td className="py-1.5 pr-2 font-mono">{r.symbol ?? '—'}</td>
                  <td className="py-1.5 pr-2">{r.account_guard}</td>
                  <td className="py-1.5 truncate max-w-[160px]">{r.account_label ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </WidgetCard>
    </div>
  );
}
