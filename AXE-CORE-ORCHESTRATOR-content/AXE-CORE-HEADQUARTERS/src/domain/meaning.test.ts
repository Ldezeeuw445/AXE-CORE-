import { describe, it, expect } from 'vitest';
import {
  meaningVar, meaningVarDim, meaningOfTest, meaningOfStage,
  meaningOfTradeAttempt, meaningOfFreshness, type Meaning,
} from './meaning';

const ALL: Meaning[] = ['happened', 'budget', 'broken', 'structure', 'idle'];

describe('the tokens', () => {
  it('names a variable per meaning, and a dim companion for each', () => {
    for (const m of ALL) {
      expect(meaningVar(m)).toBe(`var(--m-${m})`);
      expect(meaningVarDim(m)).toBe(`var(--m-${m}-dim)`);
    }
  });

  it('hands back a variable, never a colour', () => {
    // The whole point: the stylesheet decides what it looks like, so the
    // palette stays re-tunable in one file.
    for (const m of ALL) expect(meaningVar(m)).not.toMatch(/#|rgb/);
  });
});

describe('what a test result means', () => {
  it('maps pass and fail', () => {
    expect(meaningOfTest('ok')).toBe('happened');
    expect(meaningOfTest('fail')).toBe('broken');
  });

  it('gives "testing" no colour of its own', () => {
    // In progress is not a result. Colouring it teaches the reader to read the
    // colour before the answer exists.
    expect(meaningOfTest('testing')).toBe('idle');
    expect(meaningOfTest(undefined)).toBe('idle');
  });
});

describe('what a stage outcome means', () => {
  it('leaves an empty stage quiet', () => {
    // "Ran and had nothing to say" is the healthy normal case -- a crossover
    // detector holds on most bars. Amber on every quiet row is decoration, and
    // decoration is what makes the amber that matters invisible.
    expect(meaningOfStage('empty')).toBe('idle');
  });

  it('separates a lane that failed from one that was merely quiet', () => {
    // Different problems: "no signal" and "no provider", and only one is worth
    // chasing.
    expect(meaningOfStage('failed')).toBe('broken');
    expect(meaningOfStage('ok')).toBe('happened');
  });
});

describe('what a trade attempt means', () => {
  it('is green when it filled', () => {
    expect(meaningOfTradeAttempt({ orderId: '7', refusedBecause: null })).toBe('happened');
  });

  it('calls a refusal amber — the risk layer declining is the system working', () => {
    expect(meaningOfTradeAttempt({ orderId: null, refusedBecause: 'margin below floor' })).toBe('budget');
  });

  it('is quiet when nothing was decided at all', () => {
    expect(meaningOfTradeAttempt({ orderId: null, refusedBecause: null })).toBe('idle');
  });

  it('prefers the fill when a partial refusal is also recorded', () => {
    expect(meaningOfTradeAttempt({ orderId: '7', refusedBecause: 'partial' })).toBe('happened');
  });
});

describe('what an age means', () => {
  it('is amber when stale, never red', () => {
    // An old number is usually still the best answer available; red invites
    // throwing it away.
    expect(meaningOfFreshness(90_000, 60_000)).toBe('budget');
    expect(meaningOfFreshness(30_000, 60_000)).toBe('happened');
  });

  it('treats unknown age as idle, not as old', () => {
    expect(meaningOfFreshness(null, 60_000)).toBe('idle');
    expect(meaningOfFreshness(Number.NaN, 60_000)).toBe('idle');
  });
});

describe('states that are not results', () => {
  it('treats an untested slot the same as one mid-test — both are idle', () => {
    // Settings carries a literal 'idle' for "never tested". Neither it nor
    // 'testing' is an answer, and giving either a colour of its own would put
    // three states on a two-state button.
    expect(meaningOfTest('idle')).toBe('idle');
    expect(meaningOfTest('testing')).toBe('idle');
  });
});
