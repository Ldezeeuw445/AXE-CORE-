import { useEffect, useRef, useState } from 'react';
import { Send, Mic, Bot, User } from 'lucide-react';
import { useVoiceStore } from '@/store/voiceStore';

export function SidebarChat() {
  const conversation = useVoiceStore((s) => s.conversation);
  const voiceStatus = useVoiceStore((s) => s.voiceStatus);
  const sendMessage = useVoiceStore((s) => s.sendMessage);
  const startListening = useVoiceStore((s) => s.startListening);
  const stopListening = useVoiceStore((s) => s.stopListening);
  const loadConversation = useVoiceStore((s) => s.loadConversation);

  const [text, setText] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Restore chat history from Supabase on mount (same on every device).
  useEffect(() => {
    void loadConversation();
  }, [loadConversation]);

  // Keep scrolled to the latest message.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [conversation]);

  const isListening = voiceStatus === 'listening';
  const isBusy = voiceStatus === 'processing' || voiceStatus === 'speaking';

  const handleSend = async () => {
    const t = text.trim();
    if (!t || isBusy) return;
    setText('');
    await sendMessage(t);
  };

  const handleMic = async () => {
    try {
      if (isListening) stopListening();
      else await startListening();
    } catch { /* ignore */ }
  };

  return (
    <div className="flex h-[320px] flex-col rounded-xl overflow-hidden" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
      <div className="flex items-center gap-2 px-3 py-2" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        <Bot size={13} style={{ color: 'var(--accent-cyan)' }} />
        <span className="text-[10px] font-medium tracking-wide" style={{ color: 'var(--text-secondary)' }}>AXE CORE CHAT</span>
        <span
          className="ml-auto rounded-full"
          style={{ width: 6, height: 6, background: isBusy ? 'var(--warning)' : 'var(--success)', display: 'inline-block' }}
        />
      </div>

      {/* history */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
        {conversation.length === 0 && (
          <div className="h-full flex items-center justify-center text-center">
            <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Ask AXE Core anything.<br />History is saved to Supabase.</span>
          </div>
        )}
        {conversation.map((m, i) => {
          const isUser = m.role === 'user';
          return (
            <div key={i} className={`flex gap-2 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
              <div className="mt-0.5 flex-shrink-0">
                {isUser
                  ? <User size={12} style={{ color: 'var(--text-muted)' }} />
                  : <Bot size={12} style={{ color: 'var(--accent-cyan)' }} />}
              </div>
              <div
                className="max-w-[85%] rounded-lg px-2.5 py-1.5 text-[11px] leading-snug"
                style={{
                  background: isUser ? 'rgba(34,211,238,0.12)' : 'rgba(255,255,255,0.04)',
                  color: isUser ? 'var(--text-primary)' : 'rgba(165,243,252,0.8)',
                }}
              >
                {m.text}
              </div>
            </div>
          );
        })}
        {isBusy && (
          <div className="flex gap-2">
            <Bot size={12} style={{ color: 'var(--accent-cyan)' }} />
            <div className="rounded-lg px-2.5 py-1.5 text-[11px]" style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--text-muted)' }}>
              {voiceStatus === 'processing' ? 'Thinking…' : 'Speaking…'}
            </div>
          </div>
        )}
      </div>

      {/* composer */}
      <div className="flex items-center gap-1.5 p-2" style={{ borderTop: '1px solid var(--border-subtle)' }}>
        <button
          onClick={handleMic}
          className="flex-shrink-0 rounded-lg p-2 transition-all"
          style={{
            background: isListening ? 'var(--accent-cyan)' : 'rgba(255,255,255,0.05)',
            color: isListening ? '#000' : 'var(--text-muted)',
          }}
          title="Microphone"
        >
          <Mic size={13} />
        </button>
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void handleSend(); }}
          placeholder="Message AXE Core…"
          className="flex-1 min-w-0 text-[11px] px-2.5 py-1.5 rounded-lg outline-none"
          style={{ background: 'var(--bg-base)', border: '1px solid var(--border-active)', color: 'var(--text-primary)' }}
        />
        <button
          onClick={handleSend}
          disabled={!text.trim() || isBusy}
          className="flex-shrink-0 rounded-lg p-2 transition-all disabled:opacity-40"
          style={{ background: 'var(--accent-cyan)', color: '#000' }}
        >
          <Send size={13} />
        </button>
      </div>
    </div>
  );
}
