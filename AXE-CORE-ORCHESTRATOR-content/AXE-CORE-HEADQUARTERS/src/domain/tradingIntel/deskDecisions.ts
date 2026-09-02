/**
 * Why the desk is the way it is: one entry per deliberate change.
 *
 * ## The half nothing else records
 *
 * The ledger knows what every strategy did. The cycle journal knows what every
 * cycle decided. Between them they answer "what happened" completely — and
 * neither can answer the only question that makes the next change better:
 *
 *     why did we change this, and what were we looking at when we decided?
 *
 * A month from now the ledger will show that mean-reversion on BTCUSD was
 * dropped. It cannot show that it was dropped on 55 trades at a 27% win rate
 * while three other strategies on the same pair were above 90%. Without that,
 * the next person — including a later version of this desk — has to rediscover
 * the reasoning or, more likely, quietly undo it.
 *
 * ## Written by hand, on purpose
 *
 * Everything else in the trading memory is generated, because generated data
 * is always true and never needs maintaining. This is the exception: a reason
 * cannot be derived from the numbers it was drawn from. What CAN be derived is
 * the evidence, so an entry carries the ledger rows it was based on and those
 * stay checkable.
 *
 * Pure: shapes and helpers. Storage lives in application/.
 */

/** What kind of change this was — the axis it moved. */
export type DecisionKind =
  | 'strategy'      // a strategy was promoted, demoted or dropped
  | 'sizing'        // how much is risked per trade
  | 'risk'          // stops, drawdown limits, circuit breakers
  | 'pipeline'      // how candidates are found and filtered
  | 'infrastructure'// how the desk runs, rather than what it decides
  | 'experiment';   // a new round, and what it is testing

export const DECISION_KIND_LABELS: Record<DecisionKind, string> = {
  strategy: 'Strategy',
  sizing: 'Sizing',
  risk: 'Risk',
  pipeline: 'Pipeline',
  infrastructure: 'Infrastructure',
  experiment: 'Experiment',
};

/**
 * One ledger row as it stood when the decision was taken.
 *
 * Copied rather than referenced. The live row keeps moving, and an entry whose
 * evidence silently changes underneath it is worse than one with no evidence:
 * it will eventually read as though the decision was made on numbers nobody
 * ever saw.
 */
export interface DecisionEvidence {
  run: string;
  pair: string;
  strategy: string;
  timeframe: string;
  trades: number;
  winRatePct: number;
  netReturnPct: number;
}

export interface DeskDecision {
  id: string;
  at: string;
  kind: DecisionKind;
  /** Which round this applies to. 'all' when it changed the desk itself. */
  run: string;
  /** One line, in plain words: what changed. */
  what: string;
  /** Why — the reasoning, not a restatement of what. */
  why: string;
  /** The rows that were on screen when this was decided. */
  evidence: DecisionEvidence[];
  /** What would show this was wrong. Optional, but the useful ones have it. */
  expectation?: string;
  /** Set later, when the expectation has been checked against reality. */
  outcome?: {
    at: string;
    verdict: 'held' | 'failed' | 'unclear';
    note: string;
  };
}

export function newDecisionId(at = new Date()): string {
  return `dd-${at.toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}-${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Decisions that are still claims rather than findings.
 *
 * An expectation nobody ever checks is a wish. This is what makes the log a
 * loop instead of a diary: it surfaces the entries that predicted something
 * and have not yet been graded, so the grading actually happens.
 */
export function unresolved(decisions: DeskDecision[]): DeskDecision[] {
  return decisions.filter(d => d.expectation && !d.outcome);
}

/** How well the desk's reasoning has actually been holding up. */
export function scoreboard(decisions: DeskDecision[]): {
  held: number; failed: number; unclear: number; ungraded: number;
} {
  const out = { held: 0, failed: 0, unclear: 0, ungraded: 0 };
  for (const d of decisions) {
    if (!d.outcome) { if (d.expectation) out.ungraded += 1; continue; }
    out[d.outcome.verdict] += 1;
  }
  return out;
}

/** Newest first, which is how a log is read. */
export function sortDecisions(decisions: DeskDecision[]): DeskDecision[] {
  return [...decisions].sort((a, b) => b.at.localeCompare(a.at));
}

/** Everything that applies to one round, including desk-wide changes. */
export function forRun(decisions: DeskDecision[], run: string): DeskDecision[] {
  const r = run.trim().toLowerCase();
  return sortDecisions(decisions.filter(d => d.run === 'all' || d.run === r));
}

/**
 * A one-line summary of an entry, for a list.
 *
 * Leads with the outcome when there is one: a decision that failed is the most
 * useful row on the page and should not be indistinguishable from the rest.
 */
export function summariseDecision(d: DeskDecision): string {
  const mark = d.outcome
    ? ({ held: '✓', failed: '✗', unclear: '?' } as const)[d.outcome.verdict]
    : d.expectation ? '·' : ' ';
  return `${mark} ${d.at.slice(0, 10)}  ${DECISION_KIND_LABELS[d.kind]} · ${d.run}  ${d.what}`;
}
