/**
 * The trading desk's memory, in one place, readable without a query tool.
 *
 * ## Why this exists
 *
 * Everything on this panel was already stored somewhere. None of it was
 * visible. That gap has a cost Luka names directly: he spends time wondering
 * what is done and whether it is any good, simply because he cannot see it —
 * and a desk you cannot inspect is one you end up trusting or distrusting on
 * feel rather than on evidence.
 *
 * ## Age before volume
 *
 * The agent table leads with when each agent last wrote, not with how much it
 * has written. Measured 2026-08-26: axe_trader held 5 133 facts whose newest
 * was three days old, while axe_intel and axe_companion had both written
 * within the hour, and axe_research had never written at all. Sorted by row
 * count, the agent that had stopped taking part was at the top of the page
 * looking healthiest. The number that matters is the timestamp.
 *
 * An agent that is expected but absent gets a row of its own, because a
 * missing row reads as "nothing to report" and a silent agent is the opposite
 * of that.
 */
import { useCallback, useEffect, useState } from 'react';
import { WidgetCard } from '@/presentation/components/widgets/WidgetCard';
import {
  listDecisions, agentMemoryHealth, EXPECTED_TRADING_AGENTS,
  type AgentMemoryHealth,
} from '@/application/tradingIntel/deskDecisionsService';
import {
  DECISION_KIND_LABELS, scoreboard, unresolved, type DeskDecision,
} from '@/domain/tradingIntel/deskDecisions';
import { getLedger, type LedgerStats } from '@/infrastructure/persistence/tradingLedgerService';
import { getAccounts } from '@/infrastructure/persistence/tradingAccountsService';
import { AddDecisionForm } from './AddDecisionForm';
import { SystemStatusPanel } from '@/presentation/components/axe-core/SystemStatusPanel';
import { ProvenanceLine } from '@/presentation/components/axe-core/ProvenanceLine';

/** What each agent is for, so an empty row is legible without reading code. */
const AGENT_ROLE: Record<string, string> = {
  axe_research: 'Finds the thesis',
  axe_intel: 'Adds what the feeds know',
  axe_companion: 'Second opinion, with levels',
  axe_trader: 'Places the trade',
  global: 'Shared handoffs between the four',
};

function ageLabel(hours: number | null): string {
  if (hours == null) return 'never';
  if (hours < 1) return `${Math.round(hours * 60)}m ago`;
  if (hours < 48) return `${Math.round(hours)}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function AgentTable({ health }: { health: AgentMemoryHealth[] }) {
  const byAgent = new Map(health.map(h => [h.agent, h]));
  // Every expected agent gets a row whether or not it has written anything.
  const rows = EXPECTED_TRADING_AGENTS.map(agent =>
    byAgent.get(agent) ?? { agent, rows: 0, newest: null, ageHours: null, live: false });
  const extra = health.filter(h => !EXPECTED_TRADING_AGENTS.includes(h.agent as never));

  return (
    <div className="space-y-1">
      {[...rows, ...extra].map(h => {
        const missing = h.rows === 0;
        const colour = missing ? '#f87171' : h.live ? '#6ee7b7' : '#fbbf24';
        return (
          <div
            key={h.agent}
            className="flex items-baseline gap-2 rounded px-2 py-1.5"
            style={{ background: 'rgba(255,255,255,0.03)' }}
          >
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: colour }} />
            <span className="text-[11px] font-mono-data w-[130px] shrink-0" style={{ color: 'var(--text-primary)' }}>
              {h.agent}
            </span>
            <span className="text-[10px] flex-1 min-w-0 truncate" style={{ color: 'rgba(255,255,255,0.35)' }}>
              {AGENT_ROLE[h.agent] ?? 'not a desk agent'}
            </span>
            {/* Age first: the timestamp is the health signal, the count is not. */}
            <span className="text-[11px] font-mono-data w-[80px] text-right" style={{ color: colour }}>
              {ageLabel(h.ageHours)}
            </span>
            <span className="text-[10px] font-mono-data w-[70px] text-right" style={{ color: 'rgba(255,255,255,0.3)' }}>
              {h.rows.toLocaleString('en-US')}
            </span>
          </div>
        );
      })}
      <p className="text-[9px] mt-1.5" style={{ color: 'rgba(255,255,255,0.28)' }}>
        Green wrote within six hours, amber has gone quiet, red has never written. The count is
        last on purpose — an agent that stopped three days ago still has the biggest number here.
      </p>
    </div>
  );
}

function DecisionRow({ d }: { d: DeskDecision }) {
  const mark = d.outcome
    ? ({ held: '✓', failed: '✗', unclear: '?' } as const)[d.outcome.verdict]
    : d.expectation ? '·' : '';
  const colour = d.outcome
    ? ({ held: '#6ee7b7', failed: '#f87171', unclear: '#fbbf24' } as const)[d.outcome.verdict]
    : 'rgba(255,255,255,0.3)';

  return (
    <div className="rounded px-2 py-1.5" style={{ background: 'rgba(255,255,255,0.03)' }}>
      <div className="flex items-baseline gap-2">
        <span className="text-[11px] w-3" style={{ color: colour }}>{mark}</span>
        <span className="text-[9px] font-mono-data" style={{ color: 'rgba(255,255,255,0.3)' }}>
          {d.at.slice(0, 10)}
        </span>
        <span className="text-[9px] px-1.5 rounded" style={{ background: 'rgba(167,139,250,0.14)', color: '#a78bfa' }}>
          {DECISION_KIND_LABELS[d.kind]}
        </span>
        <span className="text-[9px] font-mono-data" style={{ color: 'rgba(255,255,255,0.35)' }}>{d.run}</span>
      </div>
      <p className="text-[11px] mt-1" style={{ color: 'var(--text-primary)' }}>{d.what}</p>
      <p className="text-[10px] mt-0.5" style={{ color: 'rgba(255,255,255,0.45)' }}>{d.why}</p>

      {d.evidence.length > 0 && (
        <div className="mt-1 space-y-0.5">
          {d.evidence.slice(0, 4).map((e, i) => (
            <p key={i} className="text-[9px] font-mono-data" style={{ color: 'rgba(255,255,255,0.3)' }}>
              {e.run} · {e.pair} {e.strategy} {e.timeframe} — {e.trades} trades, {e.winRatePct.toFixed(0)}% win,
              {' '}{(e.netReturnPct * 100).toFixed(2)}% net
            </p>
          ))}
        </div>
      )}

      {d.expectation && (
        <p className="text-[9px] mt-1" style={{ color: d.outcome ? 'rgba(255,255,255,0.3)' : '#fbbf24' }}>
          Expected: {d.expectation}
          {!d.outcome && ' — not graded yet'}
        </p>
      )}
      {d.outcome && (
        <p className="text-[9px] mt-0.5" style={{ color: colour }}>
          {d.outcome.verdict} · {d.outcome.note}
        </p>
      )}
    </div>
  );
}

export function TradingMemoryPanel() {
  const [health, setHealth] = useState<AgentMemoryHealth[]>([]);
  const [decisions, setDecisions] = useState<DeskDecision[]>([]);
  const [ledger, setLedger] = useState<LedgerStats[]>([]);
  // Rounds are made of ACCOUNTS, not of trades. A round that exists and has not
  // traded yet was invisible here, which is the state a new round spends its
  // first days in — exactly when you most want to see it.
  const [accountRuns, setAccountRuns] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [loadedAt, setLoadedAt] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [h, d, l, acc] = await Promise.all([
      agentMemoryHealth().catch(() => [] as AgentMemoryHealth[]),
      listDecisions().catch(() => [] as DeskDecision[]),
      getLedger().catch(() => [] as LedgerStats[]),
      getAccounts().catch(() => null),
    ]);
    setHealth(h);
    setDecisions(d);
    setLedger(l);
    setLoadedAt(new Date().toISOString());
    const runs: Record<string, number> = {};
    for (const a of acc?.accounts ?? []) {
      if (!a.enabled) continue;
      const r = a.run || 'run-1';
      runs[r] = (runs[r] ?? 0) + 1;
    }
    setAccountRuns(runs);
    setLoading(false);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  const score = scoreboard(decisions);
  const open = unresolved(decisions);

  // Rounds, and how much record each has. This is what makes an experiment
  // legible: run-2 with four trades is not yet evidence of anything.
  const byRun = new Map<string, { rows: number; trades: number }>();
  for (const r of Object.keys(accountRuns)) byRun.set(r, { rows: 0, trades: 0 });
  for (const e of ledger) {
    const cur = byRun.get(e.run) ?? { rows: 0, trades: 0 };
    byRun.set(e.run, { rows: cur.rows + 1, trades: cur.trades + e.trades });
  }
  // A round nobody wrote a reason for. The journal cannot invent the why — that
  // is the one thing only the person who decided it has — so this asks rather
  // than fabricating an entry that would then be read as reasoning.
  const unexplained = [...byRun.keys()].filter(
    r => (accountRuns[r] ?? 0) > 0 && !decisions.some(d => d.run === r),
  );

  return (
    <div className="space-y-3">
      {/* First on the page: the questions you would otherwise have to ask
          someone. It stays collapsed until something is actually wrong. */}
      <SystemStatusPanel />

      <div className="flex items-center gap-3">
        <span className="text-[11px]" style={{ color: 'var(--text-primary)' }}>Trading memory</span>
        <button type="button" onClick={() => void load()} className="text-[10px] ml-auto"
          style={{ color: 'rgba(255,255,255,0.4)' }}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      <WidgetCard title="Agents — who is still writing">
        <AgentTable health={health} />
        {/* Which table this is counting. The same panel called axe_research
            "never" for forty days while the crew ran every cycle — it was
            reading one store while the lane wrote to another, and nothing on
            screen said which store it meant. */}
        <ProvenanceLine source="memory table, per agent namespace" at={loadedAt} staleAfterMs={10 * 60_000} />
      </WidgetCard>

      <WidgetCard title="Rounds — how much record each one has">
        {byRun.size === 0 ? (
          <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.35)' }}>
            No ledger rows yet.
          </p>
        ) : (
          <div className="space-y-1">
            {[...byRun.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([run, v]) => {
              const accounts = accountRuns[run] ?? 0;
              return (
                <div key={run} className="flex items-baseline gap-2 rounded px-2 py-1.5"
                  style={{ background: 'rgba(255,255,255,0.03)' }}>
                  <span className="text-[11px] font-mono-data w-[80px]" style={{ color: 'var(--text-primary)' }}>{run}</span>
                  <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.4)' }}>
                    {accounts} account{accounts === 1 ? '' : 's'} · {v.rows} combination{v.rows === 1 ? '' : 's'} · {v.trades} live trade{v.trades === 1 ? '' : 's'}
                  </span>
                  <span className="text-[9px] ml-auto" style={{ color: '#fbbf24' }}>
                    {v.trades === 0
                      ? (accounts ? 'trading, nothing closed yet' : 'no accounts')
                      : v.trades < 20 ? 'too little to compare yet' : ''}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </WidgetCard>

      {unexplained.length > 0 && (
        <p className="text-[10px] px-2" style={{ color: '#fbbf24' }}>
          {unexplained.join(', ')} {unexplained.length === 1 ? 'has' : 'have'} accounts trading and no recorded
          reason. The ledger will show what this round did; only you can say what it was for — record it below.
        </p>
      )}

      <AddDecisionForm onSaved={() => void load()} />

      <WidgetCard
        title="Decisions — what we changed and why"
        headerAction={
          <span className="text-[9px] font-mono-data" style={{ color: 'rgba(255,255,255,0.4)' }}>
            {score.held}✓ {score.failed}✗ {score.unclear}? {score.ungraded} ungraded
          </span>
        }
      >
        {open.length > 0 && (
          // Surfaced first: an expectation nobody checks is a wish, and the
          // whole value of writing one down is that it gets graded.
          <p className="text-[10px] mb-2" style={{ color: '#fbbf24' }}>
            {open.length} decision{open.length === 1 ? '' : 's'} predicted something and{' '}
            {open.length === 1 ? 'has' : 'have'} not been graded yet.
          </p>
        )}
        {decisions.length === 0 ? (
          <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.35)' }}>
            Nothing recorded yet. Every deliberate change to the desk belongs here — the ledger
            will show that a strategy was dropped, but only this can say what was on screen when
            that was decided.
          </p>
        ) : (
          <div className="space-y-1.5 max-h-[420px] overflow-y-auto pr-0.5">
            {decisions.map(d => <DecisionRow key={d.id} d={d} />)}
          </div>
        )}
      </WidgetCard>
    </div>
  );
}
