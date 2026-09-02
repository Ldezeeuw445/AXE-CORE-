/**
 * Every cycle, end to end, and where each one stopped.
 *
 * The other screens each show one stage well: Research shows the ranking,
 * Brain shows the lanes, Accounts book shows the fills. None of them can
 * answer the question that makes the desk improve — of everything we concluded
 * that cycle, which part was wrong? — because nothing joined the stages
 * together.
 *
 * A row here is one cycle. The six dots are the six stages in order, so a
 * cycle that died at the funnel and one that traded nothing on purpose look
 * completely different at a glance, which they should: only one of them is a
 * problem.
 */
import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, ChevronDown, ChevronRight } from 'lucide-react';
import { WidgetCard } from '@/presentation/components/widgets/WidgetCard';
import { recentCycles } from '@/application/tradingIntel/cycleJournalService';
import { meaningVar, meaningOfTradeAttempt } from '@/domain/meaning';
import {
  CYCLE_STAGE_ORDER, CYCLE_STAGE_LABELS, summarise, stoppedAt, cycleOutcome,
  type CycleRecord,
} from '@/domain/tradingIntel/cycleJournal';

// Three of these four were hand-picked hexes, and #34d399 was one of three
// greens in the app that all meant "happened". They go through the vocabulary
// now, so a palette change reaches them. `missing` keeps a literal on purpose:
// "this stage was never reached" is an absence, not a state, and it has to sit
// quieter than idle or the row reads as four dots of equal weight.
const DOT: Record<'ok' | 'empty' | 'failed' | 'missing', string> = {
  ok: meaningVar('happened'),
  empty: meaningVar('idle'),
  failed: meaningVar('broken'),
  missing: 'rgba(255,255,255,0.10)',
};

function StageDots({ record }: { record: CycleRecord }) {
  return (
    <span className="flex items-center gap-1">
      {CYCLE_STAGE_ORDER.map(id => {
        const s = record.stages.find(st => st.id === id);
        const state = s ? s.status : 'missing';
        return (
          <span
            key={id}
            title={`${CYCLE_STAGE_LABELS[id]} — ${s ? s.headline : 'never reached'}`}
            className="rounded-full"
            style={{ width: 6, height: 6, background: DOT[state] }}
          />
        );
      })}
    </span>
  );
}

function Row({ record }: { record: CycleRecord }) {
  const [open, setOpen] = useState(false);
  const stop = stoppedAt(record);
  const out = cycleOutcome(record);
  const dropped = record.verdicts.filter(v => !v.passed);

  return (
    <div style={{ borderBottom: '1px solid var(--border-subtle)' }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 py-1.5 text-left"
      >
        {open ? <ChevronDown size={11} style={{ color: 'rgba(255,255,255,0.35)' }} />
              : <ChevronRight size={11} style={{ color: 'rgba(255,255,255,0.35)' }} />}
        <span className="text-[10px] font-mono-data" style={{ color: 'rgba(255,255,255,0.4)' }}>
          {record.startedAt.slice(5, 16).replace('T', ' ')}
        </span>
        <span className="text-[11px] font-mono-data" style={{ color: 'var(--text-primary)' }}>
          {record.symbol}
        </span>
        <StageDots record={record} />
        <span className="text-[10px] ml-auto" style={{ color: stop ? meaningVar('broken') : 'rgba(255,255,255,0.45)' }}>
          {summarise(record)}
        </span>
      </button>

      {open && (
        <div className="pb-2 pl-5 space-y-1.5">
          {CYCLE_STAGE_ORDER.map(id => {
            const s = record.stages.find(st => st.id === id);
            return (
              <div key={id} className="flex gap-2">
                <span
                  className="rounded-full mt-1 shrink-0"
                  style={{ width: 6, height: 6, background: DOT[s ? s.status : 'missing'] }}
                />
                <div className="min-w-0">
                  <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.5)' }}>
                    {CYCLE_STAGE_LABELS[id]}
                  </span>
                  <p className="text-[10px] leading-snug" style={{ color: s ? 'var(--text-primary)' : 'rgba(255,255,255,0.25)' }}>
                    {s ? s.headline : 'never reached'}
                  </p>
                  {s?.detail && (
                    <p className="text-[9px] leading-snug" style={{ color: 'rgba(255,255,255,0.35)' }}>
                      {s.detail}
                    </p>
                  )}
                </div>
              </div>
            );
          })}

          {record.accounts.length > 0 && (
            <div className="pt-1">
              <span className="text-[9px] uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.3)' }}>
                Accounts · {out.filled} filled, {out.refused} refused
              </span>
              {record.accounts.map(a => (
                <p key={a.accountId} className="text-[10px]" style={{ color: meaningVar(meaningOfTradeAttempt(a)) }}>
                  {a.label}: {a.action}
                  {a.orderId ? ` · fill ${a.orderId}` : a.refusedBecause ? ` · ${a.refusedBecause}` : ''}
                </p>
              ))}
            </div>
          )}

          {/* The pairs that did NOT make it, with the reason each was dropped —
              the half of the cycle every other screen throws away. */}
          {dropped.length > 0 && (
            <details className="pt-1">
              <summary className="text-[9px] uppercase tracking-wider cursor-pointer" style={{ color: 'rgba(255,255,255,0.3)' }}>
                {dropped.length} pair(s) dropped
              </summary>
              <div className="mt-1 space-y-0.5 max-h-[180px] overflow-y-auto">
                {dropped.map(v => (
                  <p key={v.pairId} className="text-[9px]" style={{ color: 'rgba(255,255,255,0.35)' }}>
                    <span style={{ color: 'rgba(255,255,255,0.55)' }}>{v.pairId}</span>
                    {' — '}{v.reason}
                  </p>
                ))}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

export function CycleJournalPanel() {
  const [cycles, setCycles] = useState<CycleRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setCycles(await recentCycles(30));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  const broken = cycles.filter(c => stoppedAt(c) !== null).length;

  return (
    <WidgetCard
      title="Cycle journal"
      headerAction={
        <button
          type="button"
          onClick={() => void load()}
          className="flex items-center gap-1 text-[10px]"
          style={{ color: 'rgba(255,255,255,0.45)' }}
        >
          <RefreshCw size={10} className={loading ? 'animate-spin' : ''} />
          {cycles.length} cycles{broken > 0 ? ` · ${broken} incomplete` : ''}
        </button>
      }
    >
      <p className="text-[10px] mb-2" style={{ color: 'rgba(255,255,255,0.35)' }}>
        One row per cycle, six dots for the six stages in order. Green ran and concluded something,
        grey ran and had nothing to say, red failed, faint was never reached. Click a row for what
        each stage actually decided — including every pair that was dropped and why.
      </p>

      {!cycles.length && !loading && (
        <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.35)' }}>
          No cycles recorded yet. The journal fills as the autopilot runs.
        </p>
      )}

      <div className="max-h-[480px] overflow-y-auto">
        {cycles.map(c => <Row key={c.startedAt} record={c} />)}
      </div>
    </WidgetCard>
  );
}
