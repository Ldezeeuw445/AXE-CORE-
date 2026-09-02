/**
 * The six-phase funnel, read left to right: 30 pairs in, two or three out.
 *
 * Each panel shows how many pairs walked in, how many walked out, and why —
 * so the narrowing is legible as a chain rather than six unrelated numbers.
 * The count leaving one phase is the count entering the next, and the layout
 * says so, because that is the property that makes the whole thing checkable
 * at a glance.
 *
 * ## An unavailable phase looks unavailable
 *
 * Phase 2 has no economic calendar in this build. It passes every pair, and it
 * is drawn in amber saying so, because a phase that removes nothing and a
 * phase that cannot run are the same picture otherwise — and the second one is
 * a hole in the process you would never notice.
 */
import type { FunnelRun, PhaseResult } from '@/domain/tradingIntel/decisionFunnel';

/** What each phase is actually for, in the desk's own terms. */
const PHASE_BLURB: Record<string, string> = {
  strength: 'Drop what is drifting sideways, then keep only the strongest moves — up and down alike, so short setups survive.',
  agenda: 'Hold back anything with a rate decision or major release inside 48 hours.',
  correlation: 'EUR/USD, GBP/USD and AUD/USD moving as one is a single bet at triple size. Keep the best, strike the rest.',
  rrr: 'Measure the target against the stop. Anything that cannot pay two to one is not worth a slot.',
  liquidity: 'Can this be entered now without the spread eating the edge?',
  vote: 'The agents get the last word on the live setup: go or no-go.',
};

const STAGE_LABEL: Record<1 | 2 | 3, string> = {
  1: 'Stage 1 · the coarse filter',
  2: 'Stage 2 · risk & efficiency',
  3: 'Stage 3 · the final execution',
};

function Panel({ phase, index }: { phase: PhaseResult; index: number }) {
  const unavailable = phase.status === 'unavailable';
  const removed = phase.inCount - phase.outCount;
  const accent = unavailable ? '#f59e0b' : '#22d3ee';

  return (
    <div
      className="flex-1 min-w-[200px] rounded-xl p-3 flex flex-col"
      style={{
        background: unavailable ? 'rgba(245,158,11,0.05)' : 'rgba(34,211,238,0.04)',
        border: `1px solid ${unavailable ? 'rgba(245,158,11,0.35)' : 'rgba(34,211,238,0.22)'}`,
      }}
    >
      <div className="flex items-baseline gap-1.5 mb-1">
        <span className="text-[9px] font-mono-data" style={{ color: accent, opacity: 0.7 }}>
          {String(index + 1).padStart(2, '0')}
        </span>
        <span className="text-[12px] font-semibold" style={{ color: accent }}>{phase.title}</span>
      </div>

      <p className="text-[10px] leading-snug mb-2 flex-1" style={{ color: 'rgba(255,255,255,0.5)' }}>
        {PHASE_BLURB[phase.id] ?? ''}
      </p>

      <div className="flex items-baseline gap-1.5 mb-1">
        <span className="text-[18px] font-mono-data leading-none" style={{ color: 'var(--text-primary)' }}>
          {phase.outCount}
        </span>
        <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.4)' }}>
          of {phase.inCount} kept
        </span>
        {removed > 0 && (
          <span className="text-[10px] ml-auto font-mono-data" style={{ color: '#f87171' }}>−{removed}</span>
        )}
      </div>

      <p
        className="text-[9px] leading-snug"
        style={{ color: unavailable ? '#fbbf24' : 'rgba(255,255,255,0.35)' }}
      >
        {unavailable ? '⚠ ' : ''}{phase.note}
      </p>
    </div>
  );
}

export function DecisionPipelinePanel({
  run, busy, onRun,
}: {
  run: FunnelRun | null;
  busy: boolean;
  onRun: () => void;
}) {
  if (!run) {
    return (
      <div
        className="rounded-xl p-4 flex items-center justify-between"
        style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-subtle)' }}
      >
        <div>
          <p className="text-[12px]" style={{ color: 'var(--text-primary)' }}>
            The decision pipeline has not run yet.
          </p>
          <p className="text-[10px] mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>
            It ranks every pair in the registry down to the two or three worth trading this cycle.
          </p>
        </div>
        <button
          type="button"
          onClick={onRun}
          disabled={busy}
          className="px-3 py-1.5 rounded-lg text-[11px]"
          style={{ background: 'rgba(34,211,238,0.12)', border: '1px solid rgba(34,211,238,0.4)', color: '#22d3ee' }}
        >
          {busy ? 'Ranking…' : 'Run the pipeline'}
        </button>
      </div>
    );
  }

  // Stage boundaries are drawn where the stage number changes, so the three
  // coarse stages read as groups without hard-coding which phase sits where.
  const stages = run.phases.reduce<Array<{ stage: 1 | 2 | 3; phases: PhaseResult[] }>>((acc, p) => {
    const last = acc[acc.length - 1];
    if (last && last.stage === p.stage) last.phases.push(p);
    else acc.push({ stage: p.stage, phases: [p] });
    return acc;
  }, []);

  const started = run.phases[0]?.inCount ?? 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-[11px]" style={{ color: 'var(--text-primary)' }}>
          Decision pipeline · {started} pairs → {run.finalists.length} trade{run.finalists.length === 1 ? '' : 's'}
        </span>
        <span className="text-[10px] font-mono-data" style={{ color: 'rgba(255,255,255,0.35)' }}>
          {run.ranAt.slice(0, 19).replace('T', ' ')}
        </span>
        {run.finalists.length > 0 && (
          <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: 'rgba(52,211,153,0.14)', color: '#6ee7b7' }}>
            {run.finalists.join(' · ')}
          </span>
        )}
        <button
          type="button"
          onClick={onRun}
          disabled={busy}
          className="ml-auto px-2.5 py-1 rounded-lg text-[10px]"
          style={{ background: 'rgba(34,211,238,0.1)', border: '1px solid rgba(34,211,238,0.35)', color: '#22d3ee' }}
        >
          {busy ? 'Ranking…' : 'Re-run'}
        </button>
      </div>

      <div className="flex gap-2 items-stretch flex-wrap xl:flex-nowrap">
        {stages.map((group, gi) => (
          <div key={group.stage} className="flex gap-2 flex-1 min-w-0 items-stretch">
            {group.phases.map((p) => (
              <Panel key={p.id} phase={p} index={run.phases.indexOf(p)} />
            ))}
            {gi < stages.length - 1 && (
              <div className="hidden xl:flex items-center px-0.5" style={{ color: 'rgba(34,211,238,0.45)' }}>→</div>
            )}
          </div>
        ))}
      </div>

      <div className="flex gap-2 flex-wrap">
        {stages.map(group => (
          <span
            key={group.stage}
            className="text-[9px] uppercase tracking-[0.14em] flex-1 text-center"
            style={{ color: 'rgba(255,255,255,0.28)' }}
          >
            {STAGE_LABEL[group.stage]}
          </span>
        ))}
      </div>
    </div>
  );
}
