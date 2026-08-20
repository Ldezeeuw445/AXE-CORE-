import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * A sub-chart pane you can drag taller or shorter, the way MT5 and Companion do.
 *
 * The panes were a fixed 72px each. That is enough to see that volume exists
 * and not enough to read it, and with three open the chart lost 216px it could
 * not get back. Height is the one thing a trader adjusts constantly and it was
 * the one thing frozen in the source.
 *
 * The drag is done on pointer events rather than mouse events so it works with
 * a finger on the phone, and it captures the pointer so a fast drag that leaves
 * the handle does not drop the gesture halfway.
 */
export function ResizablePane({
  id,
  children,
  defaultHeight = 72,
  min = 44,
  max = 320,
}: {
  /** Stable key — the height is remembered per pane. */
  id: string;
  children: ReactNode;
  defaultHeight?: number;
  min?: number;
  max?: number;
}) {
  const storageKey = `axe.chart.pane.${id}.h`;
  const [height, setHeight] = useState<number>(() => {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(storageKey) : null;
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : defaultHeight;
  });

  const drag = useRef<{ startY: number; startH: number } | null>(null);

  // Persisted on settle rather than on every pointer move — a drag fires
  // dozens of events and localStorage writes are synchronous.
  useEffect(() => {
    const t = window.setTimeout(() => {
      try { localStorage.setItem(storageKey, String(Math.round(height))); } catch { /* private mode */ }
    }, 250);
    return () => window.clearTimeout(t);
  }, [height, storageKey]);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    drag.current = { startY: e.clientY, startH: height };
    e.currentTarget.setPointerCapture(e.pointerId);
  }, [height]);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    // Dragging the handle UP makes the pane taller: the handle sits on its top
    // edge, so the pane grows toward the cursor. Inverting this reads as the
    // panel fighting you.
    const next = drag.current.startH - (e.clientY - drag.current.startY);
    setHeight(Math.min(max, Math.max(min, next)));
  }, [max, min]);

  const endDrag = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    drag.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  }, []);

  return (
    <div style={{ height, position: 'relative', flexShrink: 0 }}>
      <div
        role="separator"
        aria-label="Resize pane"
        aria-orientation="horizontal"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDoubleClick={() => setHeight(defaultHeight)}
        title="Drag to resize · double-click to reset"
        style={{
          position: 'absolute',
          top: -3,
          left: 0,
          right: 0,
          height: 8,
          cursor: 'ns-resize',
          zIndex: 5,
          // A wide invisible grab strip with a thin visible line: easy to hit
          // with a thumb without drawing a heavy divider across the chart.
          touchAction: 'none',
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <span style={{ height: 1, width: '100%', background: 'rgba(255,255,255,0.10)' }} />
      </div>
      {children}
    </div>
  );
}
