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

  useEffect(() => {
    void loadConversation();
  }, [loadConversation]);

  // Listen for code-agent actions from CodeAgentPanel
  useEffect(() => {
    const handleCodeAction = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.prompt) {
        sendMessage(detail.prompt);
      }
    };
    window.addEventListener('axe-code-action', handleCodeAction);
    return () => window.removeEventListener('axe-code-action', handleCodeAction);
  }, [sendMessage]);

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
    <div className="flex flex-1 flex-col min-h-0">
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-2 py-2 space-y-1.5 min-h-0">
        {conversation.length === 0 && (
          <div className="h-full flex items-center justify-center text-center">
            <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>Ask AXE Core anything.<br />History saved to Supabase.</span>
          </div>
        )}
        {conversation.map((m, i) => {
          const isUser = m.role === 'user';
          const isSystem = m.provider === 'system';
          
          // System messages (LangGraph decisions, provider switches) show as WhatsApp-style status
          if (isSystem) {
            return (
              <div key={i} className="flex justify-center my-2">
                <div 
                  className="rounded-full px-3 py-1 text-[9px] text-center max-w-[90%]"
                  style={{ 
                    background: 'rgba(255,255,255,0.06)', 
                    color: 'var(--text-muted)',
                    border: '1px solid rgba(255,255,255,0.08)'
                  }}
                >
                  {m.text}
                </div>
              </div>
            );
          }
          
          return (
            <div key={i} className={`flex gap-1.5 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
              <div className="mt-0.5 flex-shrink-0">
                {isUser
                  ? <User size={10} style={{ color: 'var(--text-muted)' }} />
                  : <Bot size={10} style={{ color: 'var(--accent-cyan)' }} />}
              </div>
              <div
                className="max-w-[85%] rounded-lg px-2 py-1 text-[10px] leading-snug"
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
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void handleSend(); }}
          placeholder="Message AXE…"
          className="flex-1 min-w-0 text-[10px] px-2 py-1 rounded-md outline-none"
          style={{ background: 'var(--bg-base)', border: '1px solid var(--border-active)', color: 'var(--text-primary)' }}
        />
        <button
          onClick={handleSend}
          disabled={!text.trim() || isBusy}
          className="flex-shrink-0 rounded-md p-1.5 transition-all disabled:opacity-40"
          style={{ background: 'var(--accent-cyan)', color: '#000' }}
        >
          <Send size={12} />
        </button>
      </div>
    </div>
  );
}
