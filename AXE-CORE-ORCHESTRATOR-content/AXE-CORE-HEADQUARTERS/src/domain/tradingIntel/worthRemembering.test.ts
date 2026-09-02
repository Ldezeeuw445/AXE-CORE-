import { describe, it, expect } from 'vitest';
import { notesWorthRemembering } from './worthRemembering';
import { emptyCycle, withStage, type CycleRecord } from './cycleJournal';

const base = (over: Partial<CycleRecord> = {}): CycleRecord => ({
  ...emptyCycle('XAUUSD', '2026-08-27T10:00:00.000Z'),
  endedAt: '2026-08-27T10:08:00.000Z',
  ...over,
});

const acct = (over: Partial<CycleRecord['accounts'][number]> = {}) => ({
  accountId: 'a1', label: 'OANDA DEMO 50K', action: 'buy',
  confidence: 0.72, orderId: null as string | null, refusedBecause: null as string | null,
  ...over,
});

const none = new Set<string>();

describe('the quiet majority', () => {
  it('says nothing about a cycle that judged the board and opened nothing', () => {
    // This is the healthy normal case and there are ~96 of them a day. If it
    // wrote a memory, AXON would hold a hundred rows a day saying nothing.
    const r = base({ verdicts: [], finalists: [], accounts: [acct()] });
    expect(notesWorthRemembering(r, none)).toEqual([]);
  });

  it('says nothing when there were no finalists to refuse', () => {
    const r = base({ finalists: [], accounts: [acct({ refusedBecause: 'no setup' })] });
    expect(notesWorthRemembering(r, none)).toEqual([]);
  });
});

describe('fills', () => {
  it('records a fill, with the order id and the strategy', () => {
    const r = base({
      strategy: 'ema-cross', timeframe: 'h1', finalists: ['XAUUSD'],
      accounts: [acct({ orderId: '77123' })],
    });
    const [note] = notesWorthRemembering(r, none);
    expect(note.dedupeKey).toBe('fill:77123');
    expect(note.title).toContain('XAUUSD');
    expect(note.content).toContain('77123');
    expect(note.content).toContain('ema-cross');
    expect(note.tags).toContain('axe-core');
  });

  it('does not write the same fill twice as the cycle is re-saved', () => {
    // The autopilot saves the record after every stage, so this function sees
    // the same fill several times in one cycle.
    const r = base({ finalists: ['XAUUSD'], accounts: [acct({ orderId: '77123' })] });
    expect(notesWorthRemembering(r, new Set(['fill:77123']))).toEqual([]);
  });

  it('keeps two fills on two accounts apart', () => {
    const r = base({
      finalists: ['XAUUSD'],
      accounts: [acct({ orderId: '1' }), acct({ accountId: 'a2', label: 'FTMO 100K', orderId: '2' })],
    });
    expect(notesWorthRemembering(r, none).map(n => n.dedupeKey)).toEqual(['fill:1', 'fill:2']);
  });
});

describe('problems', () => {
  const failedResearch = (headline: string) => base({
    finalists: [], accounts: [],
    stages: withStage(base(), {
      id: 'research', at: '2026-08-27T10:01:00.000Z', status: 'failed', headline,
    }).stages,
  });

  it('records a stage that could not run', () => {
    const [note] = notesWorthRemembering(failedResearch('all providers 429'), none);
    expect(note.dedupeKey).toBe('stage:research:all providers 429');
    expect(note.content).toContain('all providers 429');
    expect(note.tags).toContain('problem');
  });

  it('records a recurring failure once, not every fifteen minutes', () => {
    const seen = new Set(['stage:research:all providers 429']);
    expect(notesWorthRemembering(failedResearch('all providers 429'), seen)).toEqual([]);
  });

  it('still records a DIFFERENT failure in the same stage', () => {
    const seen = new Set(['stage:research:all providers 429']);
    expect(notesWorthRemembering(failedResearch('no key configured'), seen)).toHaveLength(1);
  });

  it('records a refusal in the risk layer\'s own words', () => {
    const r = base({
      finalists: ['XAUUSD'],
      accounts: [acct({ refusedBecause: 'margin below floor' })],
    });
    const [note] = notesWorthRemembering(r, none);
    expect(note.dedupeKey).toBe('refused:margin below floor');
    expect(note.title).toContain('margin below floor');
  });

  it('keys a refusal on the reason, so the same reason on another account is one memory', () => {
    const r = base({
      finalists: ['XAUUSD'],
      accounts: [
        acct({ refusedBecause: 'margin below floor' }),
        acct({ accountId: 'a2', label: 'FTMO 100K', refusedBecause: 'margin below floor' }),
      ],
    });
    expect(notesWorthRemembering(r, none)).toHaveLength(1);
  });

  it('ignores a blank refusal rather than writing an empty memory', () => {
    const r = base({ finalists: ['XAUUSD'], accounts: [acct({ refusedBecause: '   ' })] });
    expect(notesWorthRemembering(r, none)).toEqual([]);
  });

  it('does not report a refusal on an account that filled', () => {
    const r = base({
      finalists: ['XAUUSD'],
      accounts: [acct({ orderId: '9', refusedBecause: 'partial' })],
    });
    expect(notesWorthRemembering(r, none).map(n => n.dedupeKey)).toEqual(['fill:9']);
  });
});

describe('a cycle that is two things at once', () => {
  it('separates a fill from a first-time refusal', () => {
    // Folding these together would bury the refusal behind the fill, and the
    // refusal is the half someone goes looking for.
    const r = base({
      finalists: ['XAUUSD'],
      accounts: [
        acct({ orderId: '5' }),
        acct({ accountId: 'a2', label: 'FTMO 100K', refusedBecause: 'daily loss cap' }),
      ],
    });
    // The refusal branch only runs when nothing filled -- a cycle that traded
    // somewhere is not a refused cycle. The fill is what it earned.
    expect(notesWorthRemembering(r, none).map(n => n.dedupeKey)).toEqual(['fill:5']);
  });
});
