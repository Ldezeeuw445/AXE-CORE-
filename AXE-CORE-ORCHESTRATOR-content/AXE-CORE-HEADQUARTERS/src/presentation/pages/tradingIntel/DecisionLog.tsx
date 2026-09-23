/**
 * DecisionLog — AXE Algo's recent decisions as PASS / BLOCK / WAIT cards.
 *
 * Every field comes from the verdict the engine wrote at decision time
 * (domain/tradingIntel/decisionVerdict). Older traces written before the
 * verdict existed show their headline and the raw steps, labelled as such —
 * nothing is reconstructed or guessed for them.
 */
import { useState } from 'react';
import type { ThinkingTrace } from '@/domain/tradingIntel/botTypes';
import type { DecisionVerdict, LaneContribution } from '@/domain/tradingIntel/decisionVerdict';

const STATE_COLOR: Record<DecisionVerdict['state'], string> = {
  PASS: '#6ee7b7',
  BLOCK: '#fca5a5',
  WAIT: 'rgba(255,255,255,0.55)',
};
const GATE_COLOR = { PASS: '#6ee7b7', BLOCK: '#fca5a5', SKIP: 'rgba(255,255,255,0.4)' } as const;
const MUTED = 'rgba(255,255,255,0.45)';

function ago(iso: string): string {
  const min = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (!Number.isFinite(min) || min < 0) return '—';
  if (min < 60) return `${min}m ago`;
  if (min < 48 * 60) return `${Math.round(min / 60)}h ago`;
  return `${Math.round(min / 1440)}d ago`;
}

function Lane({ name, lane }: { name: string; lane: LaneContribution }) {
  return (
    <div className="text-[10px] leading-snug">
      <span style={{ color: MUTED }}>{name}: </span>
      {lane.stance || lane.summary
        ? <>
          {lane.stance && <span className="uppercase" style={{ color: '#F5F0E6' }}>{lane.stance} </span>}
          <span style={{ color: 'rgba(255,255,255,0.6)' }}>{lane.summary ?? ''}</span>
        </>
        : <span style={{ color: MUTED }}>no read this cycle</span>}
    </div>
  );
}

function VerdictCard({ trace, v }: { trace: ThinkingTrace; v: DecisionVerdict }) {
  const [open, setOpen] = useState(false);
  const color = STATE_COLOR[v.state];
  return (
    <div className="rounded-lg p-2.5 space-y-1.5" style={{ border: `1px solid ${color}55` }}>
      <button type="button" onClick={() => setOpen(o => !o)} className="w-full flex flex-wrap items-center gap-x-2 gap-y-1 text-left">
        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ color, border: `1px solid ${color}` }}>{v.state}</span>
        <span className="text-[11px] font-mono-data" style={{ color: '#F5F0E6' }}>{v.symbol} · {v.action.toUpperCase()}</span>
        <span className="text-[10px] font-mono-data" style={{ color: MUTED }}>
          {v.strategy ?? 'strategy —'} · {v.timeframe ?? 'tf —'} · conf {(v.confidence * 100).toFixed(0)}%
          {v.confidenceFloor != null ? ` / floor ${(v.confidenceFloor * 100).toFixed(0)}%` : ''}
        </span>
        <span className="ml-auto text-[9px]" style={{ color: MUTED }}>{ago(trace.createdAt)}</span>
      </button>

      {v.blockReason && <div className="text-[10.5px]" style={{ color: '#fca5a5' }}>{v.blockReason}</div>}

      <div className="text-[10px] font-mono-data flex flex-wrap gap-x-3 gap-y-0.5" style={{ color: 'rgba(255,255,255,0.6)' }}>
        <span>{v.account.live ? 'live broker' : 'paper'}{v.account.id ? ` ${v.account.id.slice(0, 8)}` : ''}{v.account.environment ? ` · ${v.account.environment}` : ''}</span>
        {v.sizing && v.sizing.lots > 0 && (
          <span>{v.sizing.lots} lots · {v.sizing.riskAtStop.toFixed(2)} at stop ({(v.sizing.riskPct * 100).toFixed(2)}%)</span>
        )}
        <span>execution: {v.execution.state}{v.execution.state !== 'not-sent' ? ` — ${v.execution.detail}` : ''}</span>
        {v.outcome
          ? <span style={{ color: v.outcome.pnl >= 0 ? '#6ee7b7' : '#fca5a5' }}>outcome {v.outcome.pnl >= 0 ? '+' : ''}{v.outcome.pnl.toFixed(2)}{v.outcome.exitReason ? ` (${v.outcome.exitReason})` : ''}</span>
          : v.execution.state === 'filled' && <span>outcome: open or not reconciled yet</span>}
      </div>

      {open && (
        <div className="space-y-1.5 pt-1" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="text-[10px] leading-snug">
            <span style={{ color: MUTED }}>Research: </span>
            {v.contributions.research
              ? <span style={{ color: 'rgba(255,255,255,0.6)' }}><span className="uppercase" style={{ color: '#F5F0E6' }}>{v.contributions.research.signal}</span> {(v.contributions.research.confidence * 100).toFixed(0)}% — {v.contributions.research.thesis}</span>
              : <span style={{ color: MUTED }}>no usable report (tape mode)</span>}
          </div>
          <Lane name="AXE Intel" lane={v.contributions.intel} />
          <Lane name="AXE Companion" lane={v.contributions.companion} />
          {v.gates.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {v.gates.map(g => (
                <span key={g.id} title={g.detail} className="text-[9.5px] font-mono-data px-1.5 py-0.5 rounded"
                  style={{ color: GATE_COLOR[g.status], border: '1px solid rgba(255,255,255,0.1)' }}>
                  {g.status} {g.id}
                </span>
              ))}
            </div>
          )}
          {v.sizing && (
            <div className="text-[10px] font-mono-data" style={{ color: 'rgba(255,255,255,0.55)' }}>
              {v.sizing.stopLoss != null ? `SL ${v.sizing.stopLoss.toFixed(5)} · ` : ''}
              {v.sizing.takeProfit != null ? `TP ${v.sizing.takeProfit.toFixed(5)} · ` : ''}
              {v.sizing.note}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function DecisionLog({ traces }: { traces: ThinkingTrace[] }) {
  if (!traces.length) {
    return <p className="text-[11px]" style={{ color: MUTED }}>No AXE Algo decision recorded yet.</p>;
  }
  return (
    <div className="space-y-1.5">
      <div className="text-[11px] font-medium" style={{ color: '#F5F0E6' }}>Recent decisions</div>
      {traces.map(t => t.verdict
        ? <VerdictCard key={t.decisionId} trace={t} v={t.verdict} />
        : (
          <div key={t.decisionId} className="rounded-lg p-2.5 text-[10px]" style={{ border: '1px solid rgba(255,255,255,0.08)', color: MUTED }}>
            <span className="font-mono-data" style={{ color: 'rgba(255,255,255,0.7)' }}>{t.symbol} · {t.finalAction.toUpperCase()} {(t.confidence * 100).toFixed(0)}%</span>
            {' '}· recorded before structured verdicts{t.blockedByRisk ? ` · ${t.blockedByRisk}` : ''} · {ago(t.createdAt)}
          </div>
        ))}
    </div>
  );
}
