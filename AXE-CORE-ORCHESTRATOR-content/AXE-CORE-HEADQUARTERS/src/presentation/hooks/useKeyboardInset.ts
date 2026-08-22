/**
 * How many pixels the on-screen keyboard is currently covering.
 *
 * THE PROBLEM THIS SOLVES
 *
 * On Android the soft keyboard does NOT resize the layout viewport. The page
 * keeps believing it is full height, so a composer pinned to the bottom stays
 * pinned to a bottom that is now underneath the keyboard — you type and cannot
 * see what you are typing. Which is exactly what Luka reported.
 *
 * `window.visualViewport` is the only thing that knows. It reports the region
 * actually visible to the user, so the difference between it and the layout
 * viewport IS the keyboard. Nothing else on the platform exposes this: there
 * is no keyboard event, and guessing a height is wrong on every device with a
 * different keyboard, a suggestion strip, or a split layout.
 *
 * `offsetTop` matters too, though not for the reason it first looks like. iOS
 * shrinks the height just as Android does; offsetTop is about the visual
 * viewport being SCROLLED inside the layout viewport, which happens when a
 * focused field gets pushed up. The visible band runs from offsetTop to
 * offsetTop + height, so both terms belong in the subtraction. (The first
 * version of this comment claimed iOS offsets instead of shrinking, and the
 * test written from that claim failed — correctly.)
 *
 * Returns 0 where the API is missing (older WebViews, desktop), which is the
 * correct answer there: no keyboard, no inset.
 */
import { useEffect, useState } from 'react';

export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const update = () => {
      // Round, and clamp at zero: sub-pixel jitter during the keyboard
      // animation otherwise produces a value that changes every frame and
      // re-renders the composer continuously.
      const covered = window.innerHeight - vv.height - vv.offsetTop;
      setInset(Math.max(0, Math.round(covered)));
    };

    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);

  return inset;
}
