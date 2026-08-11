/**
 * AxeAlgoChatSurface — the actual chat UI (message list + composer),
 * shared by every place AXE ALGO chat appears (Brain tab, RightPanel
 * widget expanded to full view, the floating window) so they render
 * identically instead of three drifting copies.
 */
import { useRef } from 'react';
import { Send, Loader2, Trash2, Paperclip, X, Maximize2 } from 'lucide-react';
import { useAxeAlgoChat } from '@/presentation/hooks/useAxeAlgoChat';

type ChatState = ReturnType<typeof useAxeAlgoChat>;

export function AxeAlgoChatSurface({
  chat,
  title,
  onExpand,
  onClose,
  composerOnly,
}: {
  chat: ChatState;
  title: string;
  /** Shows a maximize button that opens the floating window (RightPanel widget use). */
  onExpand?: () => void;
  /** Shows a close button (floating window use). */
  onClose?: () => void;
  /** Composer-only mode: no message list, no header — just input + attach + send. */
  composerOnly?: boolean;
}) {
  const { messages, listRef, input, setInput, pendingAttachments, addAttachment, removeAttachment, sending, send, clear } = chat;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const composer = (
    <div className="flex flex-col gap-1.5 p-2 border-t shrink-0" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
      {pendingAttachments.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {pendingAttachments.map((a, i) => (
            <div key={i} className="flex items-center gap-1 rounded px-1.5 py-1 text-[10px]" style={{ background: 'rgba(167,139,250,0.12)', color: '#c4b5fd' }}>
              {a.kind === 'image' && a.dataUrl ? (
                <img src={a.dataUrl} alt={a.name} className="w-4 h-4 rounded object-cover" />
              ) : null}
              <span className="max-w-[100px] truncate">{a.name}</span>
              <button type="button" onClick={() => removeAttachment(i)}><X size={10} /></button>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2">
        <button
          type="button"
          title="Attach photo or file"
          onClick={() => fileInputRef.current?.click()}
          className="p-1.5 rounded shrink-0"
          style={{ color: 'rgba(255,255,255,0.45)' }}
        >
          <Paperclip size={15} />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,.pdf,.txt,.csv"
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) void addAttachment(f); e.target.value = ''; }}
        />
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') void send(); }}
          placeholder="Message AXE ALGO…"
          className="flex-1 rounded px-2 py-1.5 text-[12px]"
          style={{ background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.1)', color: '#F5F0E6' }}
        />
        <button
          type="button"
          disabled={sending || (!input.trim() && !pendingAttachments.length)}
          onClick={() => void send()}
          className="p-1.5 rounded disabled:opacity-40 shrink-0"
          style={{ background: 'rgba(167,139,250,0.15)', color: '#c4b5fd' }}
        >
          <Send size={14} />
        </button>
      </div>
    </div>
  );

  if (composerOnly) return composer;

  return (
    <div className="flex flex-col h-full min-h-0 rounded-xl overflow-hidden" style={{ background: '#0A0A0A', border: '1px solid rgba(255,255,255,0.08)' }}>
      <div className="flex items-center justify-between px-3 py-2 border-b shrink-0" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
        <span className="text-[12px] font-semibold" style={{ color: '#F5F0E6' }}>{title}</span>
        <div className="flex items-center gap-2">
          {onExpand && (
            <button type="button" title="Open full chat window" onClick={onExpand} style={{ color: 'rgba(255,255,255,0.4)' }}>
              <Maximize2 size={13} />
            </button>
          )}
          <button type="button" title="Clear chat" onClick={() => void clear()} style={{ color: 'rgba(255,255,255,0.35)' }}>
            <Trash2 size={13} />
          </button>
          {onClose && (
            <button type="button" title="Close" onClick={onClose} style={{ color: 'rgba(255,255,255,0.4)' }}>
              <X size={15} />
            </button>
          )}
        </div>
      </div>

      <div ref={listRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-2 min-h-0">
        {!messages.length && (
          <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.35)' }}>
            Ask him why he took a trade, what he's watching, or what he'd do differently next time.
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} className="flex" style={{ justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
            <div
              className="max-w-[85%] rounded-lg px-2.5 py-1.5 text-[12px] leading-relaxed whitespace-pre-wrap"
              style={{
                background: m.role === 'user' ? 'rgba(167,139,250,0.15)' : 'rgba(255,255,255,0.05)',
                color: m.role === 'user' ? '#e9d5ff' : 'rgba(255,255,255,0.75)',
              }}
            >
              {m.attachments?.map((a, ai) => a.kind === 'image' && a.dataUrl ? (
                <img key={ai} src={a.dataUrl} alt={a.name} className="max-w-[160px] rounded mb-1.5" />
              ) : (
                <span key={ai} className="block text-[10px] opacity-70 mb-1">📎 {a.name}</span>
              ))}
              {m.text}
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex items-center gap-1.5 text-[11px]" style={{ color: 'rgba(255,255,255,0.4)' }}>
            <Loader2 size={12} className="animate-spin" /> thinking…
          </div>
        )}
      </div>

      {composer}
    </div>
  );
}
