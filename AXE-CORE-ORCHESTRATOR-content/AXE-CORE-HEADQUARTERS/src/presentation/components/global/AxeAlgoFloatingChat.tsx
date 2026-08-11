/**
 * AxeAlgoFloatingChat — persistent floating chat window, mounted once at
 * the App shell root (sibling to <Outlet/>, same pattern as RightPanel) so
 * it stays open across every route in the app, not just the Trading tab.
 * position: fixed rather than absolute — several ancestors in the shell
 * are overflow-hidden, which would clip an absolutely-positioned panel.
 *
 * Draggable by its header (AxeAlgoChatSurface tags it with
 * data-axe-chat-drag-handle when onClose is passed, i.e. only in this
 * floating context — the Brain tab panel and RightPanel widget aren't
 * draggable, this window is). Position persists in localStorage so it
 * reopens where you left it.
 */
import { useCallback, useRef, useState } from 'react';
import { useAxeAlgoChat } from '@/presentation/hooks/useAxeAlgoChat';
import { AxeAlgoChatSurface } from '@/presentation/components/shared/AxeAlgoChatSurface';
import { useAxeAlgoWidgetStore } from '@/presentation/store/axeAlgoWidgetStore';

const WIDTH = 360;
const HEIGHT = 520;
const POS_KEY = 'axe_algo_floating_pos';

function loadPos(): { x: number; y: number } | null {
  try {
    const raw = localStorage.getItem(POS_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    return typeof p?.x === 'number' && typeof p?.y === 'number' ? p : null;
  } catch { return null; }
}

function clampPos(x: number, y: number): { x: number; y: number } {
  const maxX = Math.max(0, window.innerWidth - WIDTH - 8);
  const maxY = Math.max(0, window.innerHeight - HEIGHT - 8);
  return { x: Math.min(Math.max(8, x), maxX), y: Math.min(Math.max(8, y), maxY) };
}

export function AxeAlgoFloatingChat() {
  const floatingOpen = useAxeAlgoWidgetStore(s => s.floatingOpen);
  const closeFloating = useAxeAlgoWidgetStore(s => s.closeFloating);
  const chat = useAxeAlgoChat();

  // Lazy initializer, not an effect keyed on floatingOpen — this component
  // stays mounted at the shell root the whole time (only its render output
  // toggles null), so position only needs to be computed once, ever, and
  // then persists in state (+ localStorage) across close/reopen.
  const [pos, setPos] = useState<{ x: number; y: number }>(() => {
    const saved = loadPos();
    const initial = saved ?? { x: window.innerWidth - WIDTH - 16, y: window.innerHeight - HEIGHT - 16 };
    return clampPos(initial.x, initial.y);
  });
  const dragRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    const target = e.target as HTMLElement;
    if (!target.closest('[data-axe-chat-drag-handle]') || target.closest('button')) return;
    dragRef.current = { startX: e.clientX, startY: e.clientY, originX: pos.x, originY: pos.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [pos]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const { startX, startY, originX, originY } = dragRef.current;
    const next = clampPos(originX + (e.clientX - startX), originY + (e.clientY - startY));
    setPos(next);
  }, []);

  const endDrag = useCallback(() => {
    if (!dragRef.current) return;
    dragRef.current = null;
    try { localStorage.setItem(POS_KEY, JSON.stringify(pos)); } catch { /* ignore */ }
  }, [pos]);

  if (!floatingOpen) return null;

  return (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      className="flex flex-col"
      style={{
        position: 'fixed',
        left: pos.x,
        top: pos.y,
        width: WIDTH,
        height: HEIGHT,
        maxHeight: 'calc(100dvh - 32px)',
        zIndex: 200,
        boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
        borderRadius: 12,
      }}
    >
      <AxeAlgoChatSurface chat={chat} title="AXE ALGO" onClose={closeFloating} />
    </div>
  );
}
