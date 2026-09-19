import { useEffect, useRef, useState } from 'react';
import { AxeStatusOrb } from '@/presentation/components/layout/AxeStatusOrb';

export const AXE_BROWSER_GUIDE_EVENT = 'axe-browser-guide';

export interface AxeBrowserGuideDetail {
  /** Viewport/client coordinates — the emitter owns mapping from page pixels. */
  x: number;
  y: number;
  /** Optional short explanation shown beside the particle. */
  label?: string;
  durationMs?: number;
}

/**
 * A temporary, pointer-transparent AXE presence for browser-agent guidance.
 *
 * It is intentionally NOT another permanent sphere. The permanent presence
 * lives in the right rail. When the browser agent has a concrete on-screen
 * coordinate, this 64px instance travels out over the view, points at that
 * location, then disappears. That gives AXE a visual "look here" language
 * without blocking clicks or inventing coordinates.
 */
export function AxeBrowserGuide() {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [label, setLabel] = useState('');
  const hideTimer = useRef<number | null>(null);

  useEffect(() => {
    const onGuide = (event: Event) => {
      const detail = (event as CustomEvent<AxeBrowserGuideDetail>).detail;
      if (!detail || !Number.isFinite(detail.x) || !Number.isFinite(detail.y)) return;

      if (hideTimer.current) window.clearTimeout(hideTimer.current);

      // Start from the browser companion rail so the moving particle reads as
      // AXE leaving its dock, rather than an unrelated orb popping into being.
      setPos({ x: Math.max(32, window.innerWidth - 165), y: 105 });
      setLabel(detail.label ?? '');
      setVisible(true);

      requestAnimationFrame(() => {
        requestAnimationFrame(() => setPos({ x: detail.x, y: detail.y }));
      });

      hideTimer.current = window.setTimeout(() => {
        setVisible(false);
        hideTimer.current = null;
      }, detail.durationMs ?? 1800);
    };

    window.addEventListener(AXE_BROWSER_GUIDE_EVENT, onGuide);
    return () => {
      window.removeEventListener(AXE_BROWSER_GUIDE_EVENT, onGuide);
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
    };
  }, []);

  return (
    <div
      className={
        'fixed z-[80] pointer-events-none transition-[left,top,opacity,transform] duration-500 ease-out ' +
        (visible ? 'opacity-100 scale-100' : 'opacity-0 scale-75')
      }
      style={{ left: pos.x, top: pos.y, transform: 'translate(-50%, -50%)' }}
      aria-hidden="true"
    >
      <div className="relative flex items-center">
        <div className="absolute inset-2 rounded-full border border-cyan-300/30 animate-ping" />
        <div className="w-16 h-16">
          <AxeStatusOrb size={64} status="processing" />
        </div>
        {label && (
          <div className="ml-2 max-w-[190px] rounded-xl border border-white/10 bg-black/75 px-2.5 py-1.5 text-[10px] text-white/80 backdrop-blur-md shadow-xl">
            {label}
          </div>
        )}
      </div>
    </div>
  );
}
