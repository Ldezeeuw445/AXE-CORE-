/**
 * The journal exists so a losing trade can be traced back to the stage that
 * was wrong about it. The properties that must hold: a cycle that died halfway
 * still says where, an attempted stage is not a reached one, and a cycle that
 * correctly traded nothing does not read as a failure.
 */
import { describe, it, expect } from 'vitest';
import {
  emptyCycle, withStage, cycleReach, stoppedAt, cycleOutcome, summarise,
  CYCLE_STAGE_ORDER, type CycleStage, type CycleRecord,
} from './cycleJournal';

function stage(id: CycleStage['id'], status: CycleStage['status'], headline = 'x'): CycleStage {
  return { id, at: '2026-08-25T12:00:00Z', status, headline };
}

function fullCycle(): CycleRecord {
  let r = emptyCycle('XAUUSD', '2026-08-25T12:00:00Z');
  for (const id of CYCLE_STAGE_ORDER) r = withStage(r, stage(id, 'ok'));
  return r;
}

describe('withStage', () => {
  it('keeps the pipeline order however the stages arrive', () => {
    let r = emptyCycle('XAUUSD');
    r = withStage(r, stage('execution', 'ok'));
    r = withStage(r, stage('research', 'ok'));
    r = withStage(r, stage('intel', 'ok'));
    expect(r.stages.map(s => s.id)).toEqual(['research', 'intel', 'execution']);
  });

  it('replaces a stage rather than recording it twice', () => {
    let r = emptyCycle('XAUUSD');
    r = withStage(r, stage('intel', 'failed', 'timed out'));
    r = withStage(r, stage('intel', 'ok', 'second attempt worked'));
    expect(r.stages.filter(s => s.id === 'intel')).toHaveLength(1);
    expect(r.stages[0].headline).toBe('second attempt worked');
  });
});

describe('cycleReach', () => {
  it('counts what produced something, not what was attempted', () => {
    // A cycle where every lane ran and every lane failed reached nothing.
    let r = emptyCycle('XAUUSD');
    for (const id of CYCLE_STAGE_ORDER) r = withStage(r, stage(id, 'failed'));
    expect(cycleReach(r)).toEqual({ reached: 0, total: 6 });
  });

  it('does not count an empty stage as a reached one', () => {
    // "Ran, and had nothing to say" is honest, but it is not a conclusion.
    let r = emptyCycle('XAUUSD');
    r = withStage(r, stage('research', 'ok'));
    r = withStage(r, stage('funnel', 'empty'));
    expect(cycleReach(r).reached).toBe(1);
  });
});

describe('stoppedAt', () => {
  it('names the first stage that failed', () => {
    let r = emptyCycle('XAUUSD');
    r = withStage(r, stage('research', 'ok'));
    r = withStage(r, stage('funnel', 'ok'));
    r = withStage(r, stage('intel', 'failed'));
    expect(stoppedAt(r)).toBe('intel');
  });

  it('names the first stage never reached at all', () => {
    // The half-finished cycle is the one worth studying, so it must not look
    // identical to a complete one.
    let r = emptyCycle('XAUUSD');
    r = withStage(r, stage('research', 'ok'));
    expect(stoppedAt(r)).toBe('funnel');
  });

  it('is null when the cycle ran the whole way', () => {
    expect(stoppedAt(fullCycle())).toBeNull();
  });

  it('reports the EARLIEST failure, not the last', () => {
    let r = emptyCycle('XAUUSD');
    r = withStage(r, stage('research', 'failed'));
    r = withStage(r, stage('execution', 'failed'));
    expect(stoppedAt(r)).toBe('research');
  });
});

describe('cycleOutcome', () => {
  it('separates filled from refused, and both from unasked', () => {
    const r: CycleRecord = {
      ...fullCycle(),
      accounts: [
        { accountId: 'a', label: 'OANDA', action: 'buy', confidence: 0.6, orderId: '123', refusedBecause: null },
        { accountId: 'b', label: 'MT5', action: 'buy', confidence: 0.6, orderId: null, refusedBecause: 'quote-only symbol' },
        { accountId: 'c', label: 'FTMO', action: 'buy', confidence: 0.6, orderId: '456', refusedBecause: null },
      ],
    };
    expect(cycleOutcome(r)).toEqual({ filled: 2, refused: 1, asked: 3 });
  });
});

describe('summarise', () => {
  it('keeps the shape of the cycle, not just the fills', () => {
    // "Judged thirty, traded none" is a healthy cycle. A fill count alone
    // cannot tell it apart from one that never got off the ground.
    const r: CycleRecord = {
      ...fullCycle(),
      verdicts: Array.from({ length: 30 }, (_, i) => ({
        pairId: `P${i}`, passed: false, droppedAt: 'rrr' as const, reason: 'below 2:1',
      })),
      finalists: [],
      accounts: [],
    };
    expect(summarise(r)).toContain('30 judged');
    expect(summarise(r)).toContain('0 finalist(s)');
    expect(summarise(r)).not.toContain('stopped at');
  });

  it('says where a broken cycle stopped', () => {
    let r = emptyCycle('XAUUSD');
    r = withStage(r, stage('research', 'ok'));
    r = withStage(r, stage('funnel', 'failed'));
    expect(summarise(r)).toContain('stopped at Decision funnel');
  });
});
