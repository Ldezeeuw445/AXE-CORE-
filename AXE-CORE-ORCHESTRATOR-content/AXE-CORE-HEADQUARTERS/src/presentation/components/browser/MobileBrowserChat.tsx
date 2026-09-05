/**
 * MobileBrowserChat — the browser's chat, shaped for a phone.
 *
 * `AISidebar` is a side panel. On the Galaxy A17 the viewport is 384 CSS px
 * wide, so a sidebar either covers the page it is meant to discuss or leaves
 * a column too narrow to read — which is why the Browser tab read as "not
 * really made for mobile". A phone has vertical room to trade, not
 * horizontal, so this docks under the page and the two split the height.
 *
 * ## The drag is the feature
 *
 * How much page versus how much chat is not a decision that can be made once:
 * reading a page wants a sliver, working through an answer wants most of the
 * screen. So the divider is draggable and the height is remembered. Snapping
 * to fixed stops was tempting and rejected — the useful height depends on the
 * page, and a snap point is someone else's guess about it.
 *
 * Pointer events rather than touch events: the same code then works when this
 * is opened on a desktop at a narrow width, and inside the Android WebView,
 * without a second path to keep in step.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Send, Loader2 } from 'lucide-react';
import { useKeyboardInset } from '@/presentation/hooks/useKeyboardInset';

export interface MobileChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

interface Props {
  messages: MobileChatMessage[];
  onSend: (text: string) => void;
  /** Height of the container the dock lives in, used to clamp the drag. */
  containerHeight: number;
}

const STORAGE_KEY = 'axe_browser_chat_height';
/** Composer only — the dock never disappears, it just gets out of the way. */
const MIN_HEIGHT = 64;
const DEFAULT_HEIGHT = 280;

function clampHeight(px: number, container: number): number {
  // Always leave a usable strip of page: a chat that can cover the whole
  // browser is a chat you cannot check against what it is describing.
  const max = Math.max(MIN_HEIGHT, Math.round(container * 0.8));
  return Math.min(Math.max(px, MIN_HEIGHT), max);
}

export function MobileBrowserChat({ messages, onSend, containerHeight }: Props) {
  /** What the user dragged to. The height actually used is this, clamped. */
  const [requested, setRequested] = useState(() => {
    const saved = Number(localStorage.getItem(STORAGE_KEY));
    return Number.isFinite(saved) && saved >= MIN_HEIGHT ? saved : DEFAULT_HEIGHT;
  });
  const [input, setInput] = useState('');
  const [dragging, setDragging] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef<{ y: number; h: number } | null>(null);

  /**
   * Clamped at render, not synced in an effect.
   *
   * Re-clamping via setState inside an effect renders twice and briefly paints
   * the unclamped height — visible as a flicker on rotation, and one more
   * piece of state that can disagree with itself. Derived here, a height saved
   * on a taller screen simply cannot overflow a shorter one, and the number
   * the user dragged to survives so the dock returns to it when there is room
   * again.
   */
  const height = clampHeight(requested, containerHeight || DEFAULT_HEIGHT * 2);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(height));
  }, [height]);

  // Follow the conversation, but only when it grows — re-pinning on every
  // render would fight the user scrolling back through it.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    dragStart.current = { y: e.clientY, h: height };
    setDragging(true);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, [height]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const start = dragStart.current;
    if (!start) return;
    // Dragging UP grows the dock, so the delta is inverted.
    setRequested(clampHeight(start.h + (start.y - e.clientY), containerHeight));
  }, [containerHeight]);

  const endDrag = useCallback((e: React.PointerEvent) => {
    dragStart.current = null;
    setDragging(false);
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
  }, []);

  const collapsed = height <= MIN_HEIGHT + 8;

  const toggle = useCallback(() => {
    setRequested(h => (clampHeight(h, containerHeight) <= MIN_HEIGHT + 8 ? DEFAULT_HEIGHT : MIN_HEIGHT));
  }, [containerHeight]);

  const submit = useCallback(() => {
    const text = input.trim();
    if (!text) return;
    onSend(text);
    setInput('');
    // Asking something with the dock shut would send the answer somewhere
    // invisible.
    if (collapsed) setRequested(DEFAULT_HEIGHT);
  }, [input, onSend, collapsed]);

  // Lift the whole composer clear of the on-screen keyboard.
  //
  // Android does not resize the layout viewport when the keyboard opens, so
  // "pinned to the bottom" means pinned underneath it — you type and cannot
  // see what you typed. visualViewport is the only thing that knows how much
  // is actually covered; see useKeyboardInset.
  const keyboardInset = useKeyboardInset();

  return (
    <div
      className="flex flex-col flex-shrink-0 border-t border-white/[0.08] bg-[#030405]"
      style={{
        height,
        transition: dragging ? 'none' : 'height 0.18s ease-out, margin-bottom 0.18s ease-out',
        marginBottom: keyboardInset,
      }}
    >
      {/* Grab bar. 28px tall because a 4px divider is a desktop affordance —
          a thumb needs a target, and this one is dragged often. */}
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className="h-7 flex items-center justify-center cursor-row-resize flex-shrink-0 select-none"
        style={{ touchAction: 'none' }}
        role="separator"
        aria-label="Resize chat"
      >
        <div className={`h-1 w-10 rounded-full transition-colors ${dragging ? 'bg-cyan-400' : 'bg-white/20'}`} />
      </div>

      {!collapsed && (
        <div ref={listRef} className="flex-1 overflow-y-auto px-3 pb-2 space-y-2 scrollbar-thin">
          {messages.map(m => (
            <div
              key={m.id}
              className={`max-w-[85%] px-3 py-2 rounded-2xl text-[13px] leading-relaxed whitespace-pre-wrap break-words ${
                m.role === 'user'
                  ? 'ml-auto bg-cyan-400/15 border border-cyan-400/20 text-cyan-50'
                  : 'mr-auto bg-white/[0.04] border border-white/[0.06] text-white/80'
              }`}
            >
              {m.content === '…'
                ? <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                : m.content}
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 px-3 py-2 flex-shrink-0">
        <button
          onClick={toggle}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-white/40 hover:text-white/70 hover:bg-white/5 flex-shrink-0"
          aria-label={collapsed ? 'Open chat' : 'Collapse chat'}
        >
          {collapsed ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }}
          placeholder="Ask AXE about this page…"
          className="flex-1 h-10 px-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-[13px] text-white placeholder:text-white/25 outline-none focus:border-cyan-400/40"
          // enterKeyHint so the Android keyboard offers Send, not a newline.
          enterKeyHint="send"
        />

        <button
          onClick={submit}
          disabled={!input.trim()}
          className="w-10 h-10 rounded-xl flex items-center justify-center bg-cyan-400/20 border border-cyan-400/30 text-cyan-400 disabled:opacity-30 flex-shrink-0"
          aria-label="Send"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
