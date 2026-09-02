/**
 * Write down a decision, with the evidence attached at the moment it is taken.
 *
 * ## Why the evidence is picked, not typed
 *
 * A decision is only worth keeping if it can be argued with later, and that
 * needs the numbers it was drawn from. Typing them out invites two failures:
 * remembering them wrong, and rounding them into a story. So the ledger rows
 * are selected from a list and copied in verbatim.
 *
 * Copied, not referenced. The live row keeps moving — a strategy at 100% over
 * three trades will not stay there — and a decision whose evidence changes
 * underneath it eventually reads as though it was made on numbers nobody ever
 * saw. The snapshot is the whole point.
 *
 * ## The expectation is optional, and the form says why it should not be
 *
 * A change with no expectation cannot be graded, so it teaches nothing. It is
 * still allowed: some changes are repairs, not experiments, and forcing a
 * prediction onto a bug fix would produce noise. The field explains the
 * difference rather than blocking on it.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { WidgetCard } from '@/presentation/components/widgets/WidgetCard';
import { saveDecision } from '@/application/tradingIntel/deskDecisionsService';
import {
  DECISION_KIND_LABELS, type DecisionKind, type DecisionEvidence,
} from '@/domain/tradingIntel/deskDecisions';
import { getLedger, type LedgerStats } from '@/infrastructure/persistence/tradingLedgerService';

const KINDS = Object.keys(DECISION_KIND_LABELS) as DecisionKind[];

function evidenceOf(e: LedgerStats): DecisionEvidence {
  return {
    run: e.run,
    pair: e.pair,
    strategy: e.strategy,
    timeframe: e.timeframe,
    trades: e.trades,
    winRatePct: e.winRate * 100,
    netReturnPct: e.netReturnPct,
  };
}

const inputStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid var(--border-subtle)',
  color: 'var(--text-primary)',
  borderRadius: 6,
  padding: '6px 8px',
  fontSize: 12,
  width: '100%',
};

export function AddDecisionForm({ onSaved }: { onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<DecisionKind>('strategy');
  const [run, setRun] = useState('all');
  const [what, setWhat] = useState('');
  const [why, setWhy] = useState('');
  const [expectation, setExpectation] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [ledger, setLedger] = useState<LedgerStats[]>([]);
  const [filter, setFilter] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      void getLedger().then(setLedger).catch(() => setLedger([]));
    }, 0);
    return () => clearTimeout(t);
  }, [open]);

  const runs = useMemo(
    () => ['all', ...[...new Set(ledger.map(e => e.run))].sort()],
    [ledger],
  );

  // Most-traded first: a combination with a real sample is what a decision is
  // usually about, and one with two trades is rarely the reason for anything.
  const rows = useMemo(() => {
    const q = filter.trim().toUpperCase();
    return [...ledger]
      .filter(e => !q || e.pair.includes(q) || e.strategy.toUpperCase().includes(q))
      .sort((a, b) => b.trades - a.trades)
      .slice(0, 40);
  }, [ledger, filter]);

  const keyOf = (e: LedgerStats) => `${e.run}:${e.pair}:${e.strategy}:${e.timeframe}`;

  const submit = useCallback(async () => {
    if (!what.trim() || !why.trim()) return;
    setSaving(true);
    try {
      await saveDecision({
        kind, run, what, why,
        expectation: expectation.trim() || undefined,
        evidence: ledger.filter(e => picked.has(keyOf(e))).map(evidenceOf),
      });
      setWhat(''); setWhy(''); setExpectation(''); setPicked(new Set());
      setOpen(false);
      onSaved();
    } finally {
      setSaving(false);
    }
  }, [kind, run, what, why, expectation, ledger, picked, onSaved]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-[10px] px-2.5 py-1 rounded-lg"
        style={{
          background: 'rgba(34,211,238,0.10)',
          border: '1px solid rgba(34,211,238,0.35)',
          color: '#22d3ee',
        }}
      >
        Record a decision
      </button>
    );
  }

  const ready = what.trim() && why.trim();

  return (
    <WidgetCard
      title="Record a decision"
      headerAction={
        <button type="button" onClick={() => setOpen(false)} className="text-[10px]"
          style={{ color: 'rgba(255,255,255,0.4)' }}>
          Cancel
        </button>
      }
    >
      <div className="space-y-2.5">
        <div className="flex gap-2">
          <label className="flex-1 min-w-0">
            <span className="text-[9px] uppercase tracking-wider block mb-1" style={{ color: 'rgba(255,255,255,0.35)' }}>
              What kind
            </span>
            <select value={kind} onChange={e => setKind(e.target.value as DecisionKind)} style={inputStyle}>
              {KINDS.map(k => <option key={k} value={k}>{DECISION_KIND_LABELS[k]}</option>)}
            </select>
          </label>
          <label className="flex-1 min-w-0">
            <span className="text-[9px] uppercase tracking-wider block mb-1" style={{ color: 'rgba(255,255,255,0.35)' }}>
              Which round
            </span>
            <select value={run} onChange={e => setRun(e.target.value)} style={inputStyle}>
              {runs.map(r => <option key={r} value={r}>{r === 'all' ? 'all — changed the desk itself' : r}</option>)}
            </select>
          </label>
        </div>

        <label className="block">
          <span className="text-[9px] uppercase tracking-wider block mb-1" style={{ color: 'rgba(255,255,255,0.35)' }}>
            What changed
          </span>
          <input
            value={what}
            onChange={e => setWhat(e.target.value)}
            placeholder="Dropped mean-reversion on BTCUSD"
            style={inputStyle}
          />
        </label>

        <label className="block">
          <span className="text-[9px] uppercase tracking-wider block mb-1" style={{ color: 'rgba(255,255,255,0.35)' }}>
            Why — the reasoning, not a restatement
          </span>
          <textarea
            value={why}
            onChange={e => setWhy(e.target.value)}
            rows={3}
            placeholder="55 trades at 27% while three other strategies on the same pair are above 90%. The sample is large enough that this is not variance."
            style={{ ...inputStyle, resize: 'vertical' }}
          />
        </label>

        <label className="block">
          <span className="text-[9px] uppercase tracking-wider block mb-1" style={{ color: 'rgba(255,255,255,0.35)' }}>
            What would show this was wrong <span style={{ textTransform: 'none', letterSpacing: 0 }}>(optional)</span>
          </span>
          <input
            value={expectation}
            onChange={e => setExpectation(e.target.value)}
            placeholder="BTCUSD net improves over the next 20 trades"
            style={inputStyle}
          />
          <span className="text-[9px] block mt-1" style={{ color: 'rgba(255,255,255,0.3)' }}>
            Leave it empty for a repair. Fill it for an experiment — it stays visible until it is graded,
            and an ungraded prediction is the only thing on this page that nags.
          </span>
        </label>

        <div>
          <div className="flex items-baseline gap-2 mb-1">
            <span className="text-[9px] uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.35)' }}>
              Evidence — pick the rows you were looking at
            </span>
            <span className="text-[9px] ml-auto" style={{ color: picked.size ? '#6ee7b7' : 'rgba(255,255,255,0.3)' }}>
              {picked.size} selected
            </span>
          </div>
          <input
            value={filter}
            onChange={e => setFilter(e.target.value)}
            placeholder="Filter by pair or strategy"
            style={{ ...inputStyle, marginBottom: 6 }}
          />
          <div className="max-h-[180px] overflow-y-auto space-y-0.5 pr-0.5">
            {rows.length === 0 && (
              <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
                {ledger.length ? 'Nothing matches that filter.' : 'No ledger rows yet.'}
              </p>
            )}
            {rows.map(e => {
              const k = keyOf(e);
              const on = picked.has(k);
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setPicked(prev => {
                    const next = new Set(prev);
                    if (next.has(k)) next.delete(k); else next.add(k);
                    return next;
                  })}
                  className="w-full text-left rounded px-2 py-1 flex items-baseline gap-2"
                  style={{
                    background: on ? 'rgba(52,211,153,0.12)' : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${on ? 'rgba(52,211,153,0.4)' : 'transparent'}`,
                  }}
                >
                  <span className="text-[10px] font-mono-data" style={{ color: 'rgba(255,255,255,0.35)' }}>{e.run}</span>
                  <span className="text-[10px] font-mono-data w-[70px]" style={{ color: 'var(--text-primary)' }}>{e.pair}</span>
                  <span className="text-[10px] flex-1 min-w-0 truncate" style={{ color: 'rgba(255,255,255,0.5)' }}>
                    {e.strategy} {e.timeframe}
                  </span>
                  <span className="text-[10px] font-mono-data" style={{ color: 'rgba(255,255,255,0.4)' }}>
                    {e.trades}t · {(e.winRate * 100).toFixed(0)}%
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!ready || saving}
            className="text-[11px] px-3 py-1.5 rounded-lg"
            style={{
              background: ready ? 'rgba(52,211,153,0.14)' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${ready ? 'rgba(52,211,153,0.4)' : 'rgba(255,255,255,0.1)'}`,
              color: ready ? '#6ee7b7' : 'rgba(255,255,255,0.3)',
            }}
          >
            {saving ? 'Saving…' : 'Record it'}
          </button>
          {!ready && (
            <span className="text-[9px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
              What and why are both needed — a change with no reason is not a decision.
            </span>
          )}
        </div>
      </div>
    </WidgetCard>
  );
}
