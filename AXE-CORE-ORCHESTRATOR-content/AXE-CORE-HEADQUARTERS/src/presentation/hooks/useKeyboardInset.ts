import { useEffect, useState } from 'react';

/**
 * Tracks the on-screen keyboard height via the VisualViewport API.
 *
 * On an installed iOS PWA the layout is `100dvh`, which does NOT shrink for the
 * software keyboard — the keyboard just overlays the bottom, hiding the chat
 * composer and the bottom nav. There's no CSS-only fix for that in standalone
 * mode, so we measure the overlap and let the shell pad it away.
 *
 * Returns the number of pixels the keyboard currently covers at the bottom of
 * the viewport (0 when closed).
 */
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const update = () => {
      // How much of the layout viewport is hidden below the visual viewport —
      // i.e. the keyboard (plus any bottom browser UI). Clamp tiny values so a
      // few stray pixels don't nudge the layout.
      const overlap = window.innerHeight - (vv.height + vv.offsetTop);
      setInset(overlap > 40 ? Math.round(overlap) : 0);
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
