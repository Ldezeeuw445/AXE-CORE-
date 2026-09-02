/**
 * Whether the viewport is wide enough for the row-major panel grid.
 *
 * A real measurement rather than a media query, because the wide and narrow
 * layouts are different DOM ORDERS -- row-major against item-major -- and CSS
 * cannot reorder one into the other. See domain/panelGrid.ts for why the two
 * orders differ at all.
 *
 * Lives here rather than beside the component because a file that exports both
 * a component and a hook loses fast refresh, which is a small tax paid on every
 * edit to that file.
 */
import { useEffect, useState } from 'react';

/** Below this the row-major grid stops helping and starts hurting. */
export const WIDE_BREAKPOINT = 1280;

export function useIsWide(breakpoint = WIDE_BREAKPOINT): boolean {
  const [wide, setWide] = useState(() =>
    typeof window === 'undefined' ? true : window.innerWidth >= breakpoint);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia(`(min-width: ${breakpoint}px)`);
    const onChange = () => setWide(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [breakpoint]);

  return wide;
}
