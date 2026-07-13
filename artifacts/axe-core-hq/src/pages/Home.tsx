import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Network, Send, User, Bot, MessageSquare, Mic, RotateCcw } from 'lucide-react';
import { HolographicSphere } from '@/components/axe-core/HolographicSphere';
import { OrganizationCanvas } from '@/components/axe-core/OrganizationCanvas';
import { LiveIndicator } from '@/components/shared/LiveIndicator';
import { useVoiceStore } from '@/store/voiceStore';
import { useIsMobile } from '@/hooks/use-mobile';
import { FileUploadButton, type ChatAttachment } from '@/components/axe-core/FileUploadButton';

const cv = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.04, delayChildren: 0.15 } } };
const iv = { hidden: { opacity: 0, y: 14 }, visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.16,1,0.3,1] as never } } };

/* ══════════════════════════════════════════════════════════════════════════
   HOME — Center view only: 3D Sphere + AXE Core Chat
   Sidebars are now global (AppShell handles them)
   ══════════════════════════════════════════════════════════════════════════ */
export default function Home() {
  const isMobile = useIsMobile();
  const voice = useVoiceStore();
  const [chatText, setChatText] = useState('');
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [coreView, setCoreView] = useState<'axe' | 'organization'>('axe');

  useEffect(() => { void voice.loadConversation(); void voice.loadAllConversations(); }, [voice]);
  useEffect(() => { const el = chatScrollRef.current; if (el) el.scrollTop = el.scrollHeight; }, [voice.conversation]);

  const chatIsListening = voice.voiceStatus === 'listening';
  const chatIsBusy = voice.voiceStatus === 'processing' || voice.voiceStatus === 'speaking';

  const handleChatSend = async () => {
    const t = chatText.trim();
    if (!t || chatIsBusy) return;
    setChatText('');
    await voice.sendMessage(t);
  };
  const handleChatMic = async () => {
    try { if (chatIsListening) await voice.stopListening(); else await voice.startListening(); } catch { /* ignore */ }
  };

  const sphereHeight = isMobile ? '55%' : undefined;
  const chatHeight = isMobile ? '45%' : 280;

  return (
    <motion.div className="flex flex-col h-full overflow-hidden" variants={cv} initial="hidden" animate="visible">
      {/* 3D Sphere / Organization — fills most of the main view */}
      <motion.div
        variants={iv}
        className={isMobile ? 'flex-shrink-0' : 'flex-1 min-h-0'}
        style={isMobile ? { height: sphereHeight } : {}}
      >
        <div
          className="h-full relative rounded-2xl overflow-hidden"
          style={{ backgroundColor: '#000000', border: '1px solid rgba(255,255,255,0.04)' }}
        >
          <div className="absolute top-4 left-4 flex items-center gap-2 z-10">
            <LiveIndicator size={6} />
            <span className="text-xs-custom font-mono-data" style={{ color: 'var(--accent-cyan)' }}>CORE ACTIVE</span>
          </div>
          <div className="absolute top-4 right-4 z-10">
            <button
              onClick={() => setCoreView(prev => prev === 'axe' ? 'organization' : 'axe')}
              className="flex items-center gap-2 rounded-full px-3 py-1.5 text-[10px] font-medium"
              style={{ background: 'rgba(34,211,238,0.08)', border: '1px solid rgba(34,211,238,0.25)', color: 'var(--accent-cyan)' }}
            >
              <Network size={11} />{coreView === 'axe' ? 'Architecture' : 'AXE Core'}
            </button>
          </div>
          <div className="absolute top-4 right-[9.5rem] text-xs-custom font-mono-data z-10" style={{ color: 'var(--text-muted)' }}>v5.0</div>
          <div className="absolute inset-0">
            <AnimatePresence mode="wait">
              {coreView === 'axe' ? (
                <motion.div
                  key="axe"
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 1.04 }}
                  transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                  className="absolute inset-0"
                >
                  <HolographicSphere />
                </motion.div>
              ) : (
                <motion.div
                  key="arch"
                  initial={{ opacity: 0, scale: 1.04 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                  className="absolute inset-0"
                >
                  <OrganizationCanvas />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </motion.div>

      {/* AXE Core Chat — in main view on ALL platforms */}
      <motion.div
        variants={iv}
        className="flex-shrink-0 flex flex-col"
        style={{ height: chatHeight }}
      >
        <div
          className="h-full flex flex-col rounded-xl overflow-hidden"
          style={{ background: '#000000', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          {/* Chat header */}
          <div
            className="flex items-center justify-between px-3 py-1.5 flex-shrink-0"
            style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
          >
            <span className="text-[10px] font-medium" style={{ color: 'var(--accent-cyan)' }}>AXE CHAT</span>
            <div className="flex items-center gap-1.5">
              {voice.allConversations.length > 0 && (
                <button
                  onClick={() => voice.loadAllConversations()}
                  className="p-0.5 rounded"
                  style={{ color: 'var(--text-muted)' }}
                >
                  <RotateCcw size={11} />
                </button>
              )}
              <button
                onClick={() => voice.startNewConversation()}
                className="flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[8px]"
                style={{ background: 'rgba(34,211,238,0.08)', border: '1px solid rgba(34,211,238,0.2)', color: 'var(--accent-cyan)' }}
              >
                <Plus size={8} /> New
              </button>
            </div>
          </div>

          {/* Conversation tabs */}
          {voice.allConversations.length > 0 && (
            <div
              className="flex gap-1 overflow-x-auto px-2 py-1 flex-shrink-0"
              style={{ borderBottom: '1px solid var(--border-subtle)' }}
            >
              {voice.allConversations.slice(0, 5).map(conv => (
                <button
                  key={conv.id}
                  onClick={() => voice.switchConversation(conv.id)}
                  className="flex-shrink-0 rounded px-1.5 py-0.5 text-[8px] truncate max-w-[100px]"
                  style={{
                    background: conv.id === voice.sessionId ? 'rgba(34,211,238,0.15)' : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${conv.id === voice.sessionId ? 'rgba(34,211,238,0.4)' : 'rgba(255,255,255,0.06)'}`,
                    color: conv.id === voice.sessionId ? 'var(--accent-cyan)' : 'var(--text-muted)',
                  }}
                >
                  <MessageSquare size={7} className="inline mr-0.5" />{conv.title}
                </button>
              ))}
            </div>
          )}

          {/* Messages */}
          <div
            ref={chatScrollRef}
            className="flex-1 overflow-y-auto px-2 py-1 space-y-1 min-h-0"
          >
            {voice.conversation.length === 0 && (
              <div className="h-full flex items-center justify-center text-center">
                <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>Ask AXE Core anything</span>
              </div>
            )}
            {voice.conversation.map((m, i) => {
              const isUser = m.role === 'user';
              return (
                <div key={i} className={`flex gap-1 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
                  <div className="mt-0.5 flex-shrink-0">
                    {isUser ? (
                      <User size={10} style={{ color: 'var(--text-muted)' }} />
                    ) : (
                      <Bot size={10} style={{ color: 'var(--accent-cyan)' }} />
                    )}
                  </div>
                  <div
                    className="max-w-[85%] rounded px-2 py-1 text-[10px] leading-snug"
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
          </div>

          {/* Composer */}
          <div
            className="flex items-center gap-1 px-2 py-1.5 flex-shrink-0"
            style={{ borderTop: '1px solid var(--border-subtle)' }}
          >
            <FileUploadButton attachments={attachments} onAttachmentsChange={setAttachments} />
            <button
              onClick={handleChatMic}
              className="flex-shrink-0 rounded-md p-1.5"
              style={{ background: chatIsListening ? 'var(--accent-cyan)' : 'rgba(255,255,255,0.05)', color: chatIsListening ? '#000' : 'var(--text-muted)' }}
            >
              <Mic size={12} />
            </button>
            <input
              value={chatText}
              onChange={e => setChatText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') void handleChatSend(); }}
              placeholder="Message AXE…"
              className="flex-1 min-w-0 text-[10px] px-2 py-1 rounded-md outline-none"
              style={{ background: 'var(--bg-base)', border: '1px solid var(--border-active)', color: 'var(--text-primary)' }}
            />
            <button
              onClick={handleChatSend}
              disabled={!chatText.trim() || chatIsBusy}
              className="flex-shrink-0 rounded-md p-1.5 disabled:opacity-40"
              style={{ background: 'var(--accent-cyan)', color: '#000' }}
            >
              <Send size={12} />
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
