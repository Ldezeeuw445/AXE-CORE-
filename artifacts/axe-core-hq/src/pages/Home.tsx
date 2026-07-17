import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Network, Send, User, Bot, MessageSquare, Mic, RotateCcw, ChevronDown, ChevronUp, Zap, Volume2, VolumeX, BrainCircuit } from 'lucide-react';
import { HolographicSphere } from '@/components/axe-core/HolographicSphere';
import { RuntimeWorkspace } from '@/components/axe-core/RuntimeCanvas';
import { NeuralMemorySystem } from '@/components/axe-core/NeuralMemorySystem';
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
  const navigate = useNavigate();
  const [chatText, setChatText] = useState('');
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [coreView, setCoreView] = useState<'axe' | 'runtime' | 'neural'>('axe');
  // The chat folds down to a thin strip when the Runtime workspace opens, so the
  // draggable/pannable architecture canvas gets the full view. Users can still
  // expand it back over the canvas, or collapse it manually at any time.
  const [chatCollapsed, setChatCollapsed] = useState(false);

  // Run once on mount only — depending on `voice` (the whole store object)
  // causes an infinite loop: these calls update store state, which gives
  // `voice` a new reference every render, re-firing the effect forever.
  useEffect(() => { void voice.loadConversation(); void voice.loadAllConversations(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const el = chatScrollRef.current; if (el) el.scrollTop = el.scrollHeight; }, [voice.conversation]);

  // Runtime view and chat can both stay open — the user collapses manually.

  // Execute chat-driven actions AXE Core signaled (navigate / open URL),
  // then clear them so they don't re-fire.
  useEffect(() => {
    const action = voice.pendingAction;
    if (!action) return;
    if (action.kind === 'navigate') navigate(action.path);
    else if (action.kind === 'open_url') window.open(action.url, '_blank', 'noopener,noreferrer');
    voice.clearPendingAction();
  }, [voice.pendingAction]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const expandedChatHeight = isMobile ? '48%' : 380;
  const collapsedChatHeight = 34;
  const chatHeight = chatCollapsed ? collapsedChatHeight : expandedChatHeight;

  return (
    <motion.div className="flex flex-col h-full overflow-hidden" variants={cv} initial="hidden" animate="visible">
      {/* 3D Sphere / Runtime workspace — fills the space the chat frees up when folded */}
      <motion.div variants={iv} className="flex-1 min-h-0">
        <div
          className="h-full relative rounded-2xl overflow-hidden"
          style={{ backgroundColor: '#000000', border: '1px solid rgba(255,255,255,0.04)' }}
        >
          <div className="absolute top-4 left-4 flex items-center gap-2 z-10">
            {(() => {
              const lastMsg = voice.conversation[voice.conversation.length - 1];
              const hasError = lastMsg?.role === 'axe' && lastMsg?.provider === 'error';
              const hasProvider = !!voice.primarySlot || voice.routingLog.length > 0;
              const color = hasError ? 'var(--error)' : hasProvider ? 'var(--accent-cyan)' : 'var(--warning)';
              const label = hasError ? 'ERROR' : hasProvider ? 'CORE ACTIVE' : 'NO AI';
              return (<>
                <LiveIndicator size={6} color={hasError ? 'var(--error)' : hasProvider ? 'var(--success)' : 'var(--warning)'} />
                <span className="text-xs-custom font-mono-data" style={{ color }}>{label}</span>
              </>);
            })()}
          </div>
          <div className="absolute top-4 right-4 z-10 flex items-center gap-1.5">
            {/* Neural Memory toggle */}
            <button
              onClick={() => setCoreView(prev => prev === 'neural' ? 'axe' : 'neural')}
              className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] font-medium transition-all"
              style={{
                background: coreView === 'neural' ? 'rgba(139,92,246,0.18)' : 'rgba(139,92,246,0.06)',
                border: `1px solid ${coreView === 'neural' ? 'rgba(139,92,246,0.7)' : 'rgba(139,92,246,0.25)'}`,
                color: coreView === 'neural' ? '#a78bfa' : 'rgba(139,92,246,0.7)',
                boxShadow: coreView === 'neural' ? '0 0 10px rgba(139,92,246,0.25)' : 'none',
              }}
            >
              <BrainCircuit size={11} />
              {coreView === 'neural' ? 'AXE Core' : 'Neural Memory'}
            </button>
            {/* Architecture toggle */}
            <button
              onClick={() => setCoreView(prev => prev === 'runtime' ? 'axe' : 'runtime')}
              className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] font-medium transition-all"
              style={{
                background: coreView === 'runtime' ? 'rgba(34,211,238,0.14)' : 'rgba(34,211,238,0.08)',
                border: `1px solid ${coreView === 'runtime' ? 'rgba(34,211,238,0.6)' : 'rgba(34,211,238,0.25)'}`,
                color: 'var(--accent-cyan)',
                boxShadow: coreView === 'runtime' ? '0 0 10px rgba(34,211,238,0.2)' : 'none',
              }}
            >
              <Network size={11} />
              {coreView === 'runtime' ? 'AXE Core' : 'Architecture'}
            </button>
          </div>
          <div className="absolute top-4 right-[20rem] text-xs-custom font-mono-data z-10" style={{ color: 'var(--text-muted)' }}>v5.0</div>
          <div className="absolute inset-0">
            <AnimatePresence mode="wait">
              {coreView === 'axe' && (
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
              )}
              {coreView === 'runtime' && (
                <motion.div
                  key="arch"
                  initial={{ opacity: 0, scale: 1.04 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                  className="absolute inset-0"
                >
                  <RuntimeWorkspace />
                </motion.div>
              )}
              {coreView === 'neural' && (
                <motion.div
                  key="neural"
                  initial={{ opacity: 0, scale: 0.92 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 1.06 }}
                  transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                  className="absolute inset-0"
                >
                  <NeuralMemorySystem />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </motion.div>

      {/* AXE Core Chat — folds down to a thin strip while the Runtime workspace is open */}
      <motion.div
        variants={iv}
        className="flex-shrink-0 flex flex-col"
        animate={{ height: chatHeight }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      >
        <div
          className="h-full flex flex-col rounded-xl overflow-hidden"
          style={{ background: '#000000', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          {/* Chat header — also the fold handle: click/drag anywhere here to expand or collapse.
              This is a <div role="button"> rather than a real <button> because it contains
              its own nested action buttons (reload / new conversation) — a <button> cannot
              validly contain another <button> in HTML. */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => setChatCollapsed(c => !c)}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setChatCollapsed(c => !c); } }}
            className="flex items-center justify-between px-3 py-1.5 flex-shrink-0 w-full text-left cursor-pointer"
            style={{ borderBottom: chatCollapsed ? 'none' : '1px solid rgba(255,255,255,0.06)' }}
          >
            <span className="flex items-center gap-1.5 text-[10px] font-medium" style={{ color: 'var(--accent-cyan)' }}>
              {chatCollapsed ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
              AXE CHAT
            </span>
            <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
              {!chatCollapsed && voice.allConversations.length > 0 && (
                <button
                  onClick={() => voice.loadAllConversations()}
                  className="p-0.5 rounded"
                  style={{ color: 'var(--text-muted)' }}
                >
                  <RotateCcw size={11} />
                </button>
              )}
              {!chatCollapsed && (
                <button
                  onClick={() => voice.startNewConversation()}
                  className="flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[8px]"
                  style={{ background: 'rgba(34,211,238,0.08)', border: '1px solid rgba(34,211,238,0.2)', color: 'var(--accent-cyan)' }}
                >
                  <Plus size={8} /> New
                </button>
              )}
            </div>
          </div>

          {/* Conversation tabs */}
          {!chatCollapsed && voice.allConversations.length > 0 && (
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

          {!chatCollapsed && (
            <>
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
                      <div className="max-w-[85%] flex flex-col gap-0.5">
                        <div
                          className="rounded px-2 py-1 text-[10px] leading-snug"
                          style={{
                            background: isUser ? 'rgba(34,211,238,0.12)' : 'rgba(255,255,255,0.04)',
                            color: isUser ? 'var(--text-primary)' : 'rgba(165,243,252,0.8)',
                          }}
                        >
                          {m.text}
                        </div>
                        {!isUser && m.provider && m.provider !== 'none' && (
                          m.provider === 'error' ? (
                            <div className="flex items-start gap-0.5 px-1" style={{ color: 'rgba(239,68,68,0.55)' }}>
                              <span className="text-[7px] mt-px">⚠</span>
                              <span className="text-[7px] leading-tight">
                                {m.slotErrors ? m.slotErrors : 'all providers failed'}
                              </span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-0.5 px-1" style={{ color: 'rgba(255,255,255,0.2)' }}>
                              <Zap size={7} />
                              <span className="text-[7px]">
                                {m.provider}{m.model ? ` · ${m.model.split('/').pop()?.split(':')[0]}` : ''}
                                {m.slotErrors && <span style={{ color: 'rgba(239,68,68,0.4)' }}> ({m.slotErrors})</span>}
                              </span>
                            </div>
                          )
                        )}
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
                {/* Speak / type toggle — cyan = AXE speaks back, muted = text only */}
                <button
                  onClick={() => voice.setResponseMode(voice.responseMode === 'speak' ? 'type' : 'speak')}
                  className="flex-shrink-0 rounded-md p-1.5"
                  title={voice.responseMode === 'speak' ? 'AXE speaks back — click to switch to text-only' : 'Text-only — click to let AXE speak back'}
                  style={{ background: voice.responseMode === 'speak' ? 'rgba(34,211,238,0.15)' : 'rgba(255,255,255,0.04)', color: voice.responseMode === 'speak' ? 'var(--accent-cyan)' : 'var(--text-muted)', border: `1px solid ${voice.responseMode === 'speak' ? 'rgba(34,211,238,0.3)' : 'rgba(255,255,255,0.06)'}` }}
                >
                  {voice.responseMode === 'speak' ? <Volume2 size={12} /> : <VolumeX size={12} />}
                </button>
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
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
