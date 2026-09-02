/**
 * The log is only worth keeping if it closes the loop: a decision that
 * predicted something must stay visible until someone says whether it held.
 */
import { describe, it, expect } from 'vitest';
import {
  unresolved, scoreboard, forRun, sortDecisions, summariseDecision, newDecisionId,
  type DeskDecision,
} from './deskDecisions';

function d(over: Partial<DeskDecision> = {}): DeskDecision {
  return {
    id: 'dd-1', at: '2026-08-26T12:00:00Z', kind: 'strategy', run: 'run-1',
    what: 'x', why: 'y', evidence: [],
    ...over,
  };
}

describe('unresolved', () => {
  it('surfaces predictions nobody has graded yet', () => {
    // An expectation nobody checks is a wish, not a method.
    const list = [
      d({ id: 'a', expectation: 'win rate above 50% after 20 trades' }),
      d({ id: 'b', expectation: 'fewer correlated fills', outcome: { at: 'x', verdict: 'held', note: '' } }),
      d({ id: 'c' }),
    ];
    expect(unresolved(list).map(x => x.id)).toEqual(['a']);
  });

  it('does not chase entries that never claimed anything', () => {
    expect(unresolved([d()])).toHaveLength(0);
  });
});

describe('scoreboard', () => {
  it('counts how well the reasoning actually held up', () => {
    const list = [
      d({ expectation: 'e', outcome: { at: 'x', verdict: 'held', note: '' } }),
      d({ expectation: 'e', outcome: { at: 'x', verdict: 'failed', note: '' } }),
      d({ expectation: 'e', outcome: { at: 'x', verdict: 'unclear', note: '' } }),
      d({ expectation: 'e' }),
      d(),
    ];
    expect(scoreboard(list)).toEqual({ held: 1, failed: 1, unclear: 1, ungraded: 1 });
  });
});

describe('forRun', () => {
  it('includes desk-wide changes in every round', () => {
    // A change to how the desk works applies to the control as much as to the
    // round that introduced it; hiding it would make run-1 look untouched.
    const list = [
      d({ id: 'wide', run: 'all' }),
      d({ id: 'one', run: 'run-1' }),
      d({ id: 'two', run: 'run-2' }),
    ];
    expect(forRun(list, 'run-2').map(x => x.id).sort()).toEqual(['two', 'wide']);
  });

  it('matches rounds case-insensitively', () => {
    expect(forRun([d({ run: 'run-2' })], 'RUN-2')).toHaveLength(1);
  });
});

describe('sortDecisions', () => {
  it('reads newest first', () => {
    const list = [
      d({ id: 'old', at: '2026-08-01T00:00:00Z' }),
      d({ id: 'new', at: '2026-08-26T00:00:00Z' }),
    ];
    expect(sortDecisions(list).map(x => x.id)).toEqual(['new', 'old']);
  });

  it('does not mutate what it was given', () => {
    const list = [d({ id: 'a', at: '2026-08-01T00:00:00Z' }), d({ id: 'b', at: '2026-08-26T00:00:00Z' })];
    sortDecisions(list);
    expect(list.map(x => x.id)).toEqual(['a', 'b']);
  });
});

describe('summariseDecision', () => {
  it('makes a failed decision stand out from the rest', () => {
    // The entries worth reading are the ones that were wrong.
    const failed = summariseDecision(d({ outcome: { at: 'x', verdict: 'failed', note: '' } }));
    const plain = summariseDecision(d());
    expect(failed.startsWith('✗')).toBe(true);
    expect(plain.startsWith('✗')).toBe(false);
  });
});

describe('newDecisionId', () => {
  it('is unique for two decisions taken in the same second', () => {
    const at = new Date('2026-08-26T12:00:00Z');
    expect(newDecisionId(at)).not.toBe(newDecisionId(at));
  });
});
