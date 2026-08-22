/**
 * The keyboard inset is arithmetic over visualViewport, so it is tested as
 * arithmetic. The failure it prevents is specific: on Android the soft
 * keyboard does not resize the layout viewport, so a bottom-pinned composer
 * ends up underneath it and you cannot see what you are typing.
 */
import { describe, it, expect } from 'vitest';

/** Mirrors the calculation in useKeyboardInset.ts. */
function insetFrom(innerHeight: number, vvHeight: number, vvOffsetTop: number): number {
  return Math.max(0, Math.round(innerHeight - vvHeight - vvOffsetTop));
}

describe('keyboard inset', () => {
  it('is zero with no keyboard up', () => {
    expect(insetFrom(844, 844, 0)).toBe(0);
  });

  it('measures an Android keyboard that shrinks the visual viewport', () => {
    // Layout viewport stays 844; the visible region drops to 508.
    expect(insetFrom(844, 508, 0)).toBe(336);
  });

  it('still measures correctly when the visual viewport is also scrolled', () => {
    // This case is why offsetTop is in the formula at all, and the first
    // version of this test had it wrong: it assumed iOS keeps the height and
    // only offsets. It does not — iOS shrinks height like Android. offsetTop
    // covers something else: the visual viewport being SCROLLED inside the
    // layout viewport, which happens when a focused field is pushed up.
    //
    // Visible band runs from offsetTop to offsetTop + height, so the keyboard
    // covers whatever is left below it.
    expect(insetFrom(844, 460, 48)).toBe(336);
  });

  it('never returns a negative inset', () => {
    // Happens mid-animation and while the URL bar collapses: the visual
    // viewport briefly reports taller than the layout one. A negative margin
    // would yank the composer off the bottom of the screen.
    expect(insetFrom(844, 900, 0)).toBe(0);
  });

  it('rounds, so sub-pixel jitter does not re-render every frame', () => {
    expect(insetFrom(844, 507.6, 0)).toBe(336);
    expect(insetFrom(844, 507.4, 0)).toBe(337);
  });
});
