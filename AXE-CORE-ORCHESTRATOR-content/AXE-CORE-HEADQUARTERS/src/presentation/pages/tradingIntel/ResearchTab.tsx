/**
 * ResearchTab — the whole board at once, and what the desk made of it.
 *
 * Was a flat, newest-first list of every report ever written. That answers
 * "what has research said lately" and nothing about "where do we stand right
 * now", because one pair with forty reports buried the twenty-nine pairs with
 * none — and a pair with no opinion at all was invisible rather than empty.
 *
 * Now the pair list is FIXED — every pair in the registry, in registry order,
 * three columns of ten — and only the content moves cycle to cycle. That is
 * what makes it scannable: the tile for XAUUSD is in the same place every
 * time, so you read the change rather than hunting for the row.
 *
 * Above it sits the six-phase funnel that turns those pairs into the two or
 * three actually worth trading, so the filtering and the material it filtered
 * are on one screen. Reading down a column then tells you not just what the
 * crew thinks of a pair, but where that pair stopped and why.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { DataPlanePanel } from '@/presentation/components/trading/DataPlanePanel';
import { DataSourcesPanel } from '@/presentation/components/trading/DataSourcesPanel';
import { DecisionPipelinePanel } from './DecisionPipelinePanel';
import { signalMeta } from './useTradingDeskState';
import type { TradingDeskState } from './useTradingDeskState';
import type { TradingIntelReport } from '@/domain/tradingIntel/types';
import { allPairIds } from '@/domain/tradingIntel/pairRegistry';
import {
  runDecisionFunnel, loadLastFunnelRun, type FunnelVote,
} from '@/application/tradingIntel/runDecisionFunnel';
import type { FunnelRun, PairOutcome, PhaseId } from '@/domain/tradingIntel/decisionFunnel';

/** One colour per phase, so where a pair stopped is readable without the word. */
const PHASE_COLOR: Record<PhaseId, string> = {
  strength: '#64748b',
  agenda: 'var(--warning)',
  correlation: '#a78bfa',
  rrr: '#fb7185',
  liquidity: '#38bdf8',
  vote: '#f472b6',
};

function num(v: number | null | undefined, digits = 2, suffix = ''): string {
  return v == null || !Number.isFinite(v) ? '—' : `${v.toFixed(digits)}${suffix}`;
}

function PairTile({
  pairId, outcome, latest,
}: {
  pairId: string;
  outcome: PairOutcome | undefined;
  latest: TradingIntelReport | undefined;
}) {
  const passed = outcome?.passed === true;
  const stopColor = outcome?.droppedAt ? PHASE_COLOR[outcome.droppedAt] : 'rgba(255,255,255,0.2)';
  const sig = latest ? signalMeta(latest.signal) : null;

  return (
    <div
      className="rounded-lg px-2.5 py-2"
      style={{
        background: passed ? 'rgba(52,211,153,0.06)' : 'rgba(255,255,255,0.02)',
        border: `1px solid ${passed ? 'rgba(52,211,153,0.4)' : 'var(--border-subtle)'}`,
      }}
    >
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-[11px] font-mono-data" style={{ color: 'var(--text-primary)' }}>{pairId}</span>

        {sig && (
          <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ color: sig.color, background: sig.bg }}>
            {sig.label}
          </span>
        )}
        {latest && (
          <span className="text-[9px] font-mono-data" style={{ color: 'rgba(255,255,255,0.35)' }}>
            {(latest.confidence * 100).toFixed(0)}%
          </span>
        )}

        <span
          className="ml-auto text-[8px] uppercase tracking-wider px-1.5 py-0.5 rounded"
          style={{
            color: passed ? '#6ee7b7' : stopColor,
            background: passed ? 'rgba(52,211,153,0.12)' : 'rgba(255,255,255,0.04)',
          }}
        >
          {passed ? 'trading' : outcome?.droppedAt ?? 'not ranked'}
        </span>
      </div>

      {/* The three numbers the funnel actually judged it on. Shown for every
          pair, not just survivors, so a drop can be argued with. */}
      <div className="flex gap-2.5 mb-1 text-[9px] font-mono-data" style={{ color: 'rgba(255,255,255,0.4)' }}>
        <span title="distance from its own 50-period mean">str {num(outcome?.strength, 2, '%')}</span>
        <span title="reward to risk">rr {num(outcome?.rrr)}</span>
        <span title="spread as a percentage of price">sp {num(outcome?.spreadPct, 3, '%')}</span>
      </div>

      {outcome?.reason && !passed && (
        <p className="text-[9px] leading-snug mb-1" style={{ color: stopColor }}>{outcome.reason}</p>
      )}

      <p className="text-[10px] leading-snug" style={{ color: 'rgba(255,255,255,0.5)' }}>
        {latest?.thesis
          ? latest.thesis.slice(0, 180) + (latest.thesis.length > 180 ? '…' : '')
          : <span style={{ color: 'rgba(255,255,255,0.25)' }}>No research on this pair yet.</span>}
      </p>

      {latest?.createdAt && (
        <p className="text-[8px] mt-1 font-mono-data" style={{ color: 'rgba(255,255,255,0.25)' }}>
          {latest.createdAt.slice(0, 16).replace('T', ' ')}
        </p>
      )}
    </div>
  );
}

export function ResearchTab({ desk }: { desk: TradingDeskState }) {
  const { reports, summary, isAxeApiConfigured, chartSymbol } = desk;

  const [run, setRun] = useState<FunnelRun | null>(null);
  const [busy, setBusy] = useState(false);
  // Held in a ref so the mount effect can call the latest version without
  // taking it as a dependency and re-running on every reports change.
  const doRunRef = useRef<(() => Promise<void>) | null>(null);

  // How stale a stored ranking may be before opening the tab re-runs it.
  // Long enough that switching tabs is free; short enough that what you are
  // looking at describes this session rather than yesterday.
  const RUN_STALE_MS = 30 * 60 * 1000;

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => {
      void (async () => {
        const stored = await loadLastFunnelRun().catch(() => null);
        if (cancelled) return;
        setRun(stored);

        // "The decision pipeline has not run yet" is a true sentence and a
        // useless screen. Nothing called it except a button, so the tab that
        // exists to show the ranking opened empty every time. Run it once on
        // arrival when there is nothing fresh to show.
        const age = stored?.ranAt ? Date.now() - Date.parse(stored.ranAt) : Infinity;
        if (!cancelled && age > RUN_STALE_MS) void doRunRef.current?.();
      })();
    }, 0);
    return () => { cancelled = true; clearTimeout(t); };
  }, []);

  // The desk's own latest call per pair becomes the phase-6 vote, so the
  // ranking finishes on what the agents concluded rather than on price alone.
  const doRun = useCallback(async () => {
    setBusy(true);
    try {
      const votes: Record<string, FunnelVote> = {};
      for (const r of reports) {
        if (votes[r.ticker]) continue; // reports arrive newest-first
        const signal = r.signal?.toString().toLowerCase();
        votes[r.ticker] = {
          signal: signal === 'buy' ? 'buy' : signal === 'sell' ? 'sell' : 'hold',
          confidence: r.confidence,
        };
      }
      setRun(await runDecisionFunnel({ votes }));
    } finally {
      setBusy(false);
    }
  }, [reports]);

  // Kept current in an effect, not during render: writing a ref while
  // rendering is exactly the impurity React warns about.
  useEffect(() => { doRunRef.current = doRun; }, [doRun]);

  // Newest report per pair. reports is already newest-first, so first wins.
  const latestByPair = new Map<string, TradingIntelReport>();
  for (const r of reports) if (!latestByPair.has(r.ticker)) latestByPair.set(r.ticker, r);

  const outcomeByPair = new Map<string, PairOutcome>();
  for (const o of run?.outcomes ?? []) outcomeByPair.set(o.pairId, o);

  // Fixed board, fixed order: three columns of ten. The tiles never move, only
  // what is written on them.
  const pairs = allPairIds();
  const perColumn = Math.ceil(pairs.length / 3);
  const columns = [
    pairs.slice(0, perColumn),
    pairs.slice(perColumn, perColumn * 2),
    pairs.slice(perColumn * 2),
  ];

  return (
    // Column on a phone, row on a desk: a fixed 280px sidebar on a 400px
    // screen leaves the board 120px wide, which is not a narrower version of
    // this page — it is an unusable one.
    <div className="flex flex-col xl:flex-row gap-4">
      <div className="space-y-3 flex-1 min-w-0">
        <DecisionPipelinePanel run={run} busy={busy} onRun={() => void doRun()} />

        <div className="flex items-center gap-3">
          <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.4)' }}>
            {pairs.length} pairs · {summary.total} reports · bullish {summary.bySignal.BUY} · bearish {summary.bySignal.SELL}
          </span>
          <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: 'rgba(167,139,250,0.15)', color: '#a78bfa' }}>
            {isAxeApiConfigured ? 'CrewAI research crew connected' : 'Local desk — CrewAI not configured'}
          </span>
          <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
            {latestByPair.size} of {pairs.length} pairs have an opinion
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-2">
          {columns.map((col, i) => (
            <div key={i} className="space-y-1.5 min-w-0">
              {col.map(pairId => (
                <PairTile
                  key={pairId}
                  pairId={pairId}
                  outcome={outcomeByPair.get(pairId)}
                  latest={latestByPair.get(pairId)}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="w-full xl:w-[280px] shrink-0 space-y-3 order-first xl:order-last">
        {/* Everything the desk can pull from, and whether it answered — the
            keys were never the problem; the silence about them was. */}
        <DataSourcesPanel />
        <DataPlanePanel symbol={chartSymbol} />
      </div>
    </div>
  );
}
