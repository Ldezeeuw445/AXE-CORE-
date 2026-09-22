/**
 * RobustnessPanel — overfitting zichtbaar maken. Het verschil tussen train en
 * test staat bovenaan, niet de beste historische opbrengst.
 */
import { useState } from 'react';
import { runRobustness, type RobustnessResult, type StrategyLabInput } from '@/application/tradingIntel/strategyLab';

const DIM = { color: 'rgba(255,255,255,0.4)' } as const;
const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
const col = (v: number) => (v > 0 ? '#6ee7b7' : v < 0 ? '#fca5a5' : 'rgba(255,255,255,0.6)');

export function RobustnessPanel({ input }: { input: () => StrategyLabInput | null }) {
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [r, setR] = useState<RobustnessResult | null>(null);

  const run = async () => {
    const i = input();
    if (!i) return;
    setRunning(true); setError(null);
    try {
      const res = await runRobustness(i);
      if (res.ok) setR(res.result); else setError(res.error);
    } finally {
      setRunning(false);
    }
  };

  const seg = (label: string, s: { metrics: { avgR: number; netReturnPct: number; totalTrades: number; maxDrawdownPct: number } } | null) => (
    <div>
      <div className="text-[9px] uppercase tracking-wider" style={DIM}>{label}</div>
      {s ? (
        <div className="text-[12px] font-mono-data">
          <span style={{ color: col(s.metrics.avgR) }}>R {s.metrics.avgR.toFixed(2)}</span>
          <span style={DIM}> · {pct(s.metrics.netReturnPct)} · {s.metrics.totalTrades}t · DD {pct(s.metrics.maxDrawdownPct)}</span>
        </div>
      ) : <div className="text-[12px]" style={DIM}>—</div>}
    </div>
  );

  return (
    <div className="mt-4 pt-3 space-y-2" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
      <p className="text-[10px] uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.35)' }}>Robustness — does the edge survive data it was not fitted on?</p>
      <div className="flex items-center gap-2">
        <button type="button" disabled={running} onClick={() => void run()} className="px-3 py-1.5 rounded text-[11px] disabled:opacity-40"
          style={{ border: '1px solid rgba(167,139,250,0.3)', color: '#c4b5fd' }}>
          {running ? 'Testing…' : 'Run robustness (sweep · train/val/test · walk-forward · bootstrap · regimes)'}
        </button>
        {error && <span className="text-[11px]" style={{ color: '#fca5a5' }}>{error}</span>}
      </div>
      {r && (
        <div className="space-y-3">
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(190px,1fr))]">
            <div>
              <div className="text-[9px] uppercase tracking-wider" style={DIM}>Chosen on train only</div>
              <div className="text-[12px] font-mono-data" style={{ color: '#F5F0E6' }}>
                {r.trainValTest.chosen ? `${r.trainValTest.chosen.atrMultiple}×ATR · ${r.trainValTest.chosen.rewardRisk ?? '—'}R` : 'nothing (too few trades)'}
              </div>
            </div>
            {seg('Train (60%)', r.trainValTest.train)}
            {seg('Validation (20%)', r.trainValTest.validation)}
            {seg('Test (20%, untouched)', r.trainValTest.test)}
            <div>
              <div className="text-[9px] uppercase tracking-wider" style={DIM}>Train → test drop in R</div>
              <div className="text-[12px] font-mono-data" style={{ color: r.trainValTest.degradationR != null && r.trainValTest.degradationR > 0.1 ? '#fca5a5' : '#F5F0E6' }}>
                {r.trainValTest.degradationR == null ? '—' : r.trainValTest.degradationR.toFixed(2)}
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <p className="text-[10px] mb-1" style={DIM}>Parameter sweep on the training segment (avg R · trades); cells under 30 trades cannot be chosen</p>
            <table className="text-[10.5px] font-mono-data">
              <thead><tr style={DIM}><th className="text-left font-normal pr-3">stop \ target</th>{r.grid.rewardRisk.map(rr => <th key={String(rr)} className="text-left font-normal pr-4">{rr ?? 'none'}R</th>)}</tr></thead>
              <tbody>
                {r.grid.atrMultiple.map(a => (
                  <tr key={a}>
                    <td className="pr-3" style={DIM}>{a}×ATR</td>
                    {r.grid.rewardRisk.map(rr => {
                      const c = r.trainValTest.sweep.find(x => x.params.atrMultiple === a && x.params.rewardRisk === rr);
                      const chosen = r.trainValTest.chosen?.atrMultiple === a && r.trainValTest.chosen?.rewardRisk === rr;
                      return (
                        <td key={String(rr)} className="pr-4" style={{ opacity: c && c.metrics.totalTrades < 30 ? 0.4 : 1, textDecoration: chosen ? 'underline' : undefined }}>
                          {c ? <><span style={{ color: col(c.metrics.avgR) }}>{c.metrics.avgR.toFixed(2)}</span><span style={DIM}> · {c.metrics.totalTrades}</span></> : '—'}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="text-[10.5px] font-mono-data space-y-0.5">
            <p style={DIM}>Walk-forward ({r.walkForward.folds.length} folds, re-optimised on each train window, scored only on the next test window):</p>
            {r.walkForward.folds.map((f, k) => (
              <p key={k} style={{ color: 'rgba(255,255,255,0.65)' }}>
                fold {k + 1}: {f.chosen ? `${f.chosen.atrMultiple}×ATR/${f.chosen.rewardRisk ?? '—'}R` : 'no choice'} →{' '}
                {f.testMetrics ? <span style={{ color: col(f.testMetrics.avgR) }}>R {f.testMetrics.avgR.toFixed(2)} · {f.testMetrics.totalTrades}t · {f.testMetrics.netProfit.toFixed(0)}</span> : '—'}
              </p>
            ))}
            <p style={{ color: '#F5F0E6' }}>
              Out-of-sample: {r.walkForward.oos.trades} trades · avg R <span style={{ color: col(r.walkForward.oos.avgR) }}>{r.walkForward.oos.avgR.toFixed(2)}</span> · net {r.walkForward.oos.netProfit.toFixed(0)} · {r.walkForward.oos.positiveFolds}/{r.walkForward.oos.scoredFolds} folds positive · parameter stability {(r.walkForward.paramStability * 100).toFixed(0)}%
            </p>
          </div>

          <p className="text-[10.5px] font-mono-data" style={{ color: 'rgba(255,255,255,0.65)' }}>
            Bootstrap ({r.bootstrap.iterations}× reshuffled {r.fullRunTrades} trades): return p5 <span style={{ color: col(r.bootstrap.finalReturn.p5) }}>{pct(r.bootstrap.finalReturn.p5)}</span> · p50 {pct(r.bootstrap.finalReturn.p50)} · p95 {pct(r.bootstrap.finalReturn.p95)} · max DD p50 {pct(r.bootstrap.maxDrawdown.p50)} · p95 {pct(r.bootstrap.maxDrawdown.p95)} · P(loss) {pct(r.bootstrap.probLoss)} · P(DD &gt; {pct(r.bootstrap.probDrawdownOver.threshold)}) {pct(r.bootstrap.probDrawdownOver.p)}
          </p>

          <div className="text-[10.5px] font-mono-data">
            <p style={DIM}>By regime at entry (trend = 50-bar average moving more than ½ ATR in 10 bars; volatility vs median ATR so far):</p>
            {r.regimes.map(g => (
              <p key={`${g.trend}${g.vol}`} style={{ color: 'rgba(255,255,255,0.65)', opacity: g.smallSample ? 0.5 : 1 }}>
                {g.trend} trend · {g.vol} vol: {g.trades}t · win {pct(g.winRate)} · R <span style={{ color: col(g.avgR) }}>{g.avgR.toFixed(2)}</span>{g.smallSample ? ' ⚠' : ''}
              </p>
            ))}
          </div>

          {r.divergence && (
            <p className="text-[10.5px] font-mono-data" style={{ color: r.divergence.flagged ? '#fca5a5' : 'rgba(255,255,255,0.65)' }}>
              Live vs ledger backtest: live {(r.divergence.liveExpectancy * 100).toFixed(3)}%/trade over {r.divergence.liveTrades} · backtest {(r.divergence.backtestExpectancy * 100).toFixed(3)}%/trade — {r.divergence.note}
            </p>
          )}

          {r.warnings.length > 0 && (
            <ul className="text-[10px] space-y-0.5" style={{ color: '#fcd34d' }}>{r.warnings.map(w => <li key={w}>⚠ {w}</li>)}</ul>
          )}
        </div>
      )}
    </div>
  );
}
