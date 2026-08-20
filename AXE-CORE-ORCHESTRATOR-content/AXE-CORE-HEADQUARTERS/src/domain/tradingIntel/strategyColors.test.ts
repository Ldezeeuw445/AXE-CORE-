/**
 * The two things about this table that break silently.
 *
 * A wrong colour is visible. These are not: a strategy the engine emits but
 * the table has never heard of renders as plain grey and simply looks like
 * "no framework", and a strategy routed to the wrong framework is asked the
 * wrong VPS endpoint, gets no signal back, and holds forever while the ledger
 * goes on ranking it.
 */
import { describe, it, expect } from 'vitest';
import { STRATEGY_COLORS, frameworkOf, strategyColor, UNKNOWN_STRATEGY_COLOR } from './strategyColors';

/** Exactly the names the two VPS engines emit. Kept here by hand on purpose:
 *  if an engine gains or renames a strategy, this list is what fails. */
const VBT = ['vbt:ma-cross', 'vbt:rsi-meanrev', 'vbt:bbands', 'vbt:macd'];
const NT = ['nt:ema-bracket', 'nt:atr-breakout', 'nt:donchian-trail', 'nt:rsi-pullback'];

describe('framework routing', () => {
  it('sends each engine its own strategies', () => {
    for (const s of VBT) expect(frameworkOf(s)).toBe('vbt');
    for (const s of NT) expect(frameworkOf(s)).toBe('nt');
  });

  it("treats AXE's own unprefixed strategies as axe", () => {
    expect(frameworkOf('volumetric-ob')).toBe('axe');
    expect(frameworkOf('trend-follow')).toBe('axe');
  });

  it('has no opinion about nothing', () => {
    expect(frameworkOf(null)).toBeNull();
    expect(frameworkOf('')).toBeNull();
  });

  it('does not route an nt: strategy to vectorbt', () => {
    // The exact bug this replaced: anything containing ':' went to vectorbt,
    // whose signals map has no nt: key, so the strategy never traded.
    expect(frameworkOf('nt:donchian-trail')).not.toBe('vbt');
  });
});

describe('colour table', () => {
  it('knows every strategy both engines can emit', () => {
    for (const s of [...VBT, ...NT]) {
      expect(STRATEGY_COLORS[s], `${s} has no colour`).toBeDefined();
      expect(strategyColor(s)).not.toBe(UNKNOWN_STRATEGY_COLOR);
    }
  });

  it('gives every strategy a colour of its own', () => {
    const seen = new Map<string, string>();
    for (const [name, hex] of Object.entries(STRATEGY_COLORS)) {
      expect(seen.has(hex), `${name} reuses ${seen.get(hex)}'s colour`).toBe(false);
      seen.set(hex, name);
    }
  });

  it('keeps every colour clear of the cyan selection accent', () => {
    // Selection and attribution mean different things; a strategy dot that
    // reads as cyan would say "you picked this" when it means "the algo did".
    const cyan = [0x22, 0xd3, 0xee];
    for (const [name, hex] of Object.entries(STRATEGY_COLORS)) {
      const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
      const d = Math.hypot(r - cyan[0], g - cyan[1], b - cyan[2]);
      expect(d, `${name} (${hex}) sits ${d.toFixed(0)} from the accent`).toBeGreaterThan(50);
    }
  });
});
