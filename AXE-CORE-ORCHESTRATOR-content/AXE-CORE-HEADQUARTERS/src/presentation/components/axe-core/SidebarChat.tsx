import { useEffect, useRef, useState } from 'react';
import { Send, Mic, Bot, User } from 'lucide-react';
import { useVoiceStore } from '@/presentation/store/voiceStore';
import { MarkdownMessage } from '@/presentation/components/shared/MarkdownMessage';
import { VisionCaptureButton } from '@/presentation/components/voice/VisionCaptureButton';

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

  useEffect(() => {
    void loadConversation();
  }, [loadConversation]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [conversation]);

  const isListening = voiceStatus === 'listening';
  const isBusy = voiceStatus === 'processing' || voiceStatus === 'speaking';

  const handleSend = async () => {
    const t = text.trim();
    // Live chat: never block the composer — a new message interrupts the
    // current turn (stop TTS + supersede in-flight reply in sendMessage).
    if (!t) return;
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
    <div className="flex flex-1 flex-col min-h-0">
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-2 py-2 space-y-1.5 min-h-0">
        {conversation.length === 0 && (
          <div className="h-full flex items-center justify-center text-center">
            <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Ask AXE Core anything.<br />History saved to Supabase.</span>
          </div>
        )}
        {conversation.map((m, i) => {
          const isUser = m.role === 'user';
          return (
            <div key={i} className={`flex gap-1.5 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
              <div className="mt-0.5 flex-shrink-0">
                {isUser
                  ? <User size={10} style={{ color: 'var(--text-muted)' }} />
                  : <Bot size={10} style={{ color: 'var(--accent-cyan)' }} />}
              </div>
              <div
                className="max-w-[85%] rounded-lg px-2 py-1 text-[12px] leading-relaxed"
                style={{
                  background: isUser ? 'rgba(34,211,238,0.12)' : 'rgba(255,255,255,0.04)',
                  color: isUser ? 'var(--text-primary)' : 'rgba(165,243,252,0.8)',
                }}
              >
                {isUser ? m.text : <MarkdownMessage text={m.text} />}
              </div>
            </div>
          );
        })}
        {isBusy && (
          <div className="flex gap-1.5">
            <Bot size={10} style={{ color: 'var(--accent-cyan)' }} />
            <div className="rounded-lg px-2 py-1 text-[10px]" style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--text-muted)' }}>
              {voiceStatus === 'processing' ? 'Thinking…' : 'Speaking…'}
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-1 p-1.5 flex-shrink-0" style={{ borderTop: '1px solid var(--border-subtle)' }}>
        <button
          onClick={handleMic}
          className="flex-shrink-0 rounded-md p-1.5 transition-all"
          style={{
            background: isListening ? 'var(--accent-cyan)' : 'rgba(255,255,255,0.05)',
            color: isListening ? '#000' : 'var(--text-muted)',
          }}
          title="Microphone"
        >
          <Mic size={12} />
        </button>
        <VisionCaptureButton
          compact
          className="flex-shrink-0 rounded-md p-1.5 transition-all border-0 bg-white/5 text-white/50 hover:bg-white/10"
        />
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void handleSend(); }}
          placeholder="Message AXE…"
          className="flex-1 min-w-0 text-[12px] px-2 py-1.5 rounded-md outline-none"
          style={{ background: 'var(--bg-base)', border: '1px solid var(--border-active)', color: 'var(--text-primary)' }}
        />
        <button
          onClick={handleSend}
          disabled={!text.trim()}
          className="flex-shrink-0 rounded-md p-1.5 transition-all disabled:opacity-40"
          style={{ background: 'var(--accent-cyan)', color: '#000' }}
          title={isBusy ? 'Send now — interrupts current reply' : 'Send'}
        >
          <Send size={12} />
        </button>
      </div>
    </div>
  );
}
