import { describe, it, expect } from 'vitest';
import { emptyCycle, dedupeVerdicts, verdictsOf, type CycleRecord } from './cycleJournal';

const v = (n: number) => Array.from({ length: n }, (_, i) => ({
  pairId: `P${i}`, passed: i % 2 === 0, droppedAt: null, reason: 'r',
}));

const rec = (at: string, verdicts = v(3)): CycleRecord => ({
  ...emptyCycle('EURUSD', at), verdicts,
});

describe('dedupeVerdicts', () => {
  it('moves an identical list onto the newest record', () => {
    const older = rec('2026-08-27T10:00:00Z');
    const next = rec('2026-08-27T10:02:00Z');
    const out = dedupeVerdicts(next, [older]);
    expect(out.next.verdicts).toHaveLength(3);
    expect(out.existing[0].verdicts).toHaveLength(0);
    expect(out.existing[0].verdictsFrom).toBe(next.startedAt);
  });

  it('keeps a genuinely different judgement', () => {
    const older = rec('2026-08-27T09:00:00Z', v(5));
    const out = dedupeVerdicts(rec('2026-08-27T10:00:00Z', v(3)), [older]);
    expect(out.existing[0].verdicts).toHaveLength(5);
    expect(out.existing[0].verdictsFrom).toBeUndefined();
  });

  it('leaves everything alone when the new record has no verdicts', () => {
    // A record saved mid-cycle, before the funnel is read, must not strip the
    // evidence off the records that already have it.
    const older = rec('2026-08-27T09:00:00Z');
    const out = dedupeVerdicts(rec('2026-08-27T10:00:00Z', []), [older]);
    expect(out.existing[0].verdicts).toHaveLength(3);
  });

  it('does not re-point a record that is already a reference', () => {
    const ref = { ...rec('2026-08-27T09:00:00Z', []), verdictsFrom: 'older-holder' };
    const out = dedupeVerdicts(rec('2026-08-27T10:00:00Z'), [ref]);
    expect(out.existing[0].verdictsFrom).toBe('older-holder');
  });
});

describe('verdictsOf', () => {
  it('returns its own list when it has one', () => {
    const r = rec('2026-08-27T10:00:00Z');
    expect(verdictsOf(r, [r])).toHaveLength(3);
  });

  it('follows the reference', () => {
    const holder = rec('2026-08-27T10:02:00Z');
    const ref = { ...rec('2026-08-27T10:00:00Z', []), verdictsFrom: holder.startedAt };
    expect(verdictsOf(ref, [ref, holder])).toHaveLength(3);
  });

  it('returns empty rather than throwing when the holder was trimmed away', () => {
    // The byte cap can drop the holder. A reader must degrade, not crash.
    const ref = { ...rec('2026-08-27T10:00:00Z', []), verdictsFrom: 'gone' };
    expect(verdictsOf(ref, [ref])).toEqual([]);
  });

  it('returns empty for a record that genuinely has none', () => {
    const r = rec('2026-08-27T10:00:00Z', []);
    expect(verdictsOf(r, [r])).toEqual([]);
  });
});

describe('the size it buys', () => {
  it('a run of six symbols stores one list, not six', () => {
    let journal: CycleRecord[] = [];
    for (let i = 0; i < 6; i++) {
      const next = rec(`2026-08-27T10:0${i}:00Z`, v(30));
      const out = dedupeVerdicts(next, journal);
      journal = [out.next, ...out.existing];
    }
    const withLists = journal.filter(r => r.verdicts.length > 0);
    expect(withLists).toHaveLength(1);
    // And every record still resolves to the full judgement.
    for (const r of journal) expect(verdictsOf(r, journal)).toHaveLength(30);
  });
});
