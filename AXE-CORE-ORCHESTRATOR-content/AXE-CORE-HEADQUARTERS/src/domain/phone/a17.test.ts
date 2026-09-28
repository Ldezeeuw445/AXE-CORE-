/**
 * De pin, op zichzelf.
 *
 * De device manager mag maar één toestel aanraken. Deze test bewaakt dat de
 * A17-familie erin mag en al het andere eruit blijft — de streep/underscore
 * mag niet uitmaken, en een naburig Samsung-model (A15, A54) is niet de A17.
 */
import { describe, it, expect } from 'vitest';
import { isA17Model } from './a17';

describe('isA17Model', () => {
  it('accepts the A17 family however the separator is written', () => {
    expect(isA17Model('SM-A175F')).toBe(true);
    expect(isA17Model('SM_A175F')).toBe(true);
    expect(isA17Model('SM-A176B')).toBe(true);
  });

  it('rejects a neighbouring Samsung that is not an A17', () => {
    expect(isA17Model('SM-A155F')).toBe(false);
    expect(isA17Model('SM-A546B')).toBe(false);
    expect(isA17Model('Pixel 8')).toBe(false);
  });

  it('treats a missing model as not-the-A17 rather than a match', () => {
    expect(isA17Model(null)).toBe(false);
    expect(isA17Model(undefined)).toBe(false);
    expect(isA17Model('')).toBe(false);
  });
});
