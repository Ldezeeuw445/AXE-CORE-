import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { motion, AnimatePresence } from 'framer-motion';
import { HomeChatComposer } from '@/presentation/components/axe-core/HomeChatComposer';
import { Plus, Network, Send, User, Bot, MessageSquare, Mic, RotateCcw, ChevronDown, ChevronUp, Zap, Volume2, VolumeX, BrainCircuit, Mountain, Terminal, Check, X } from 'lucide-react';
import type { CoreStatus } from '@/presentation/components/axe-core/HolographicSphere';
import { SphereStage } from '@/presentation/components/axe-core/sphere/SphereStage';
import { AxeCoreSphere } from '@/presentation/components/axe-core/sphere/AxeCoreSphere';
import { useHeeftPlaat } from '@/presentation/components/axe-core/sceneBackdrop';
import { RuntimeWorkspace } from '@/presentation/components/axe-core/RuntimeCanvas';
import NeuralBrain from '@/presentation/components/axe-core/NeuralBrain';
import { NeuralMemorySystem } from '@/presentation/components/axe-core/NeuralMemorySystem';
import { AwarenessCenter } from '@/presentation/components/axe-core/AwarenessCenter';
import { MissionControlStrip } from '@/presentation/components/axe-core/MissionControlStrip';
import { MemoryGrowthBadge } from '@/presentation/components/axe-core/MemoryGrowthBadge';
import { AppGrowthBadge } from '@/presentation/components/axe-core/AppGrowthBadge';
import { LiveIndicator } from '@/presentation/components/shared/LiveIndicator';
import { useVoiceStore } from '@/presentation/store/voiceStore';
import { useIsMobile } from '@/presentation/hooks/use-mobile';
import {
  FileUploadButton,
  type NormalizedAttachment,
  filesToAttachments,
  buildCrewLaunchPrompt,
} from '@/presentation/components/axe-core/FileUploadButton';
import { MarkdownMessage } from '@/presentation/components/shared/MarkdownMessage';
import { VisionCaptureButton } from '@/presentation/components/voice/VisionCaptureButton';
import {
  projectionFromAttachments,
  directFromChat,
  directFromAssistantMessageAsync,
  shouldDismissProjection,
} from '@/application/sphere/sphereDirector';
import { resolveMap } from '@/application/sphere/projectionResolvers/mapResolver';
import { resolveChart } from '@/application/sphere/projectionResolvers/chartResolver';
import { useSphereProjectionStore } from '@/presentation/store/sphereProjectionStore';
import { emitAxeEvent } from '@/infrastructure/events/eventBus';

const cv = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.04, delayChildren: 0.15 } } };
const iv = { hidden: { opacity: 0, y: 14 }, visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.16, 1, 0.3, 1] as never } } };

type CoreView = 'axe' | 'runtime' | 'neural' | 'terrain';

const VIEW_SEGMENTS: Array<{ id: CoreView; label: string; icon: typeof BrainCircuit | null }> = [
  { id: 'axe', label: 'Core', icon: null },
  { id: 'neural', label: 'Neural', icon: BrainCircuit },
  { id: 'terrain', label: 'Terrain', icon: Mountain },
  { id: 'runtime', label: 'Architecture', icon: Network },
];

function looksLikeMapRequest(t: string): boolean {
  return /\b(kaart|map|maps|locatie|city|stad)\b/i.test(t)
    || /laat(\s+\S+){1,8}\s+zien/i.test(t)
    || /\b(new\s*york|nyc|tokyo|london|paris|amsterdam|dubai|singapore|berlin)\b/i.test(t);
}
function looksLikeChartRequest(t: string): boolean {
  return /\b(chart|grafiek|graph|plot|trading|btc|eth|koers)\b/i.test(t);
}

export default function Home() {
  const isMobile = useIsMobile();
  const voice = useVoiceStore();
  const navigate = useNavigate();
  const dismiss = useSphereProjectionStore(s => s.dismiss);
  const spherePhase = useSphereProjectionStore(s => s.phase);
  const spherePayload = useSphereProjectionStore(s => s.payload);
  const [chatText, setChatText] = useState('');
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const [attachments, setAttachments] = useState<NormalizedAttachment[]>([]);
  const [coreView, setCoreView] = useState<CoreView>('axe');
  const opPlaat = useHeeftPlaat();
  const [showAwareness, setShowAwareness] = useState(false);
  const [chatCollapsed, setChatCollapsed] = useState(false);
  const [dropActive, setDropActive] = useState(false);
  const lastProjectedMsgRef = useRef<string>('');
  const lastUserTextRef = useRef<string>('');

  useEffect(() => { void voice.loadConversation(); void voice.loadAllConversations(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const el = chatScrollRef.current; if (el) el.scrollTop = el.scrollHeight; }, [voice.conversation]);

  // Any living-display project → force Core view so SphereStage is visible
  useEffect(() => {
    if (spherePhase === 'opening' || spherePhase === 'projecting') {
      setCoreView('axe');
    }
  }, [spherePhase, spherePayload?.id]);

  useEffect(() => {
    const onLiving = () => setCoreView('axe');
    window.addEventListener('axe-living-display', onLiving);
    return () => window.removeEventListener('axe-living-display', onLiving);
  }, []);

  // Neural / Terrain are both full memory explorers (sidebars, composer, depth
  // control) — give them the room they need by collapsing the chat drawer
  // instead of squeezing under it.
  useEffect(() => {
    if (coreView === 'neural' || coreView === 'terrain') setChatCollapsed(true);
  }, [coreView]);

  useEffect(() => {
    const last = [...voice.conversation].reverse().find(m => m.role === 'axe');
    if (!last?.text || last.text === lastProjectedMsgRef.current) return;
    lastProjectedMsgRef.current = last.text;
    let cancelled = false;
    void (async () => {
      let proj = await directFromAssistantMessageAsync(last.text);
      if (!proj && /\[OPEN_WINDOW:[^\]]*maps?/i.test(last.text)) {
        proj = await resolveMap(lastUserTextRef.current || last.text);
      }
      if (!proj && /\[OPEN_WINDOW:[^\]]*trading/i.test(last.text)) {
        proj = await resolveChart(lastUserTextRef.current || last.text);
      }
      if (cancelled || !proj) return;
      setCoreView('axe');
      useSphereProjectionStore.getState().project(proj);
    })();
    return () => { cancelled = true; };
  }, [voice.conversation]);

  useEffect(() => {
    const onScrollToApproval = () => {
      setChatCollapsed(false);
      requestAnimationFrame(() => {
        const el = chatScrollRef.current;
        if (el) el.scrollTop = el.scrollHeight;
      });
    };
    window.addEventListener('axe-scroll-to-approval', onScrollToApproval);
    return () => window.removeEventListener('axe-scroll-to-approval', onScrollToApproval);
  }, []);

  useEffect(() => {
    const action = voice.pendingAction;
    if (!action) return;
    if (action.kind === 'navigate') {
      const path = action.path || '';
      if (/maps|trading|chart/i.test(path)) {
        voice.clearPendingAction();
        return;
      }
      navigate(path);
    } else if (action.kind === 'open_url') {
      window.open(action.url, '_blank', 'noopener,noreferrer');
    }
    voice.clearPendingAction();
  }, [voice.pendingAction]); // eslint-disable-line react-hooks/exhaustive-deps

  const chatIsListening = voice.voiceStatus === 'listening';

  const coreStatus: CoreStatus = voice.pendingExec
    ? 'awaiting-approval'
    : voice.voiceStatus === 'listening'
      ? 'listening'
      : voice.voiceStatus === 'processing'
        ? 'thinking'
        : voice.voiceStatus === 'speaking'
          ? 'speaking'
          : 'idle';

  const showOnSphere = (proj: NonNullable<Awaited<ReturnType<typeof directFromChat>>>) => {
    setCoreView('axe');
    useSphereProjectionStore.getState().project(proj);
  };

  const ingestFiles = async (files: FileList | File[]) => {
    const next = await filesToAttachments(files, attachments);
    setAttachments(next);
    setChatCollapsed(false);
    emitAxeEvent('axe:files-attached', { names: next.map(a => a.name), count: next.length });
    const proj = projectionFromAttachments(next, 'drop');
    if (proj) showOnSphere(proj);
  };

  const handleChatSend = async () => {
    const t = chatText.trim();
    if (!t && attachments.length === 0) return;

    if (shouldDismissProjection(t)) {
      dismiss();
      setChatText('');
      return;
    }

    lastUserTextRef.current = t;

    try {
      let directed = await directFromChat({ text: t, attachments });
      if (!directed && looksLikeChartRequest(t)) {
        directed = await resolveChart(t);
      }
      if (!directed && looksLikeMapRequest(t)) {
        directed = await resolveMap(t);
      }
      // Ultimate fallback: any "laat … zien" / "show …" → map resolve
      if (!directed && (/laat(\s+\S+){1,10}\s+zien/i.test(t) || /\b(show|toon)\s+/i.test(t))) {
        directed = await resolveMap(t);
      }
      if (directed) {
        showOnSphere(directed);
      } else {
        console.warn('[Home] no sphere projection resolved for:', t);
      }
    } catch (err) {
      console.warn('[Home] sphere director failed', err);
    }

    const payload = buildCrewLaunchPrompt(t, attachments);
    setChatText('');
    setAttachments([]);
    await voice.sendMessage(payload);
  };

  const handleChatMic = async () => {
    try { if (chatIsListening) await voice.stopListening(); else await voice.startListening(); } catch { /* ignore */ }
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes('Files')) setDropActive(true);
  };
  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.currentTarget === e.target) setDropActive(false);
  };
  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDropActive(false);
    if (e.dataTransfer.files?.length) await ingestFiles(e.dataTransfer.files);
  };

  const expandedChatHeight = isMobile ? '48%' : 380;
  const collapsedChatHeight = 34;
  const chatHeight = chatCollapsed ? collapsedChatHeight : expandedChatHeight;

  return (
    <motion.div className="flex flex-col h-full overflow-hidden" variants={cv} initial="hidden" animate="visible">
      <motion.div variants={iv} className="flex-1 min-h-0">
        <div
          className="axe-scene h-full relative rounded-2xl overflow-hidden"
          style={{
            backgroundColor: 'var(--bg-base)',
            border: dropActive ? '1px solid var(--tint-line)' : '1px solid rgba(255,255,255,0.04)',
            boxShadow: dropActive ? 'inset 0 0 40px rgba(34,211,238,0.06)' : 'none',
          }}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={(e) => { void onDrop(e); }}
        >
          {dropActive && (
            <div className="absolute inset-0 z-40 flex items-center justify-center pointer-events-none" style={{ background: 'rgba(0,0,0,0.55)' }}>
              <div className="rounded-2xl px-6 py-4 text-center" style={{ border: '1px dashed var(--tint-line)', background: 'var(--tint-line)' }}>
                <div className="text-[13px] font-medium" style={{ color: 'var(--accent-cyan)' }}>Drop any file into AXE</div>
                <div className="text-[10px] mt-1" style={{ color: 'rgba(255,255,255,0.4)' }}>
                  Projects from the sphere · pdf · images · code · docs
                </div>
              </div>
            </div>
          )}

          <div className="axe-home-status absolute top-4 left-4 flex items-center gap-2 z-20 over-canvas-group">
            {(() => {
              const lastMsg = voice.conversation[voice.conversation.length - 1];
              const hasError = lastMsg?.role === 'axe' && lastMsg?.provider === 'error';
              // "Is there anything that can answer?" — not "is a Primary set?".
              //
              // This read !!primarySlot || routingLog.length, so switching the
              // Primary slot off (which is now allowed on purpose) made the
              // badge say NO AI on a machine where Ollama answered in 184ms and
              // OpenRouter in 180ms. The whole point of the fallback chain is
              // that no single slot decides whether AXE works, so the badge must
              // not be tied to one either.
              const hasProvider = !!voice.primarySlot
                || !!voice.fallback1Slot || !!voice.fallback2Slot || !!voice.fallback3Slot
                || voice.routingLog.length > 0;
              const statusLabel: Partial<Record<CoreStatus, string>> = {
                'awaiting-approval': 'AWAITING APPROVAL', listening: 'LISTENING', thinking: 'THINKING', speaking: 'SPEAKING',
              };
              const statusColor: Partial<Record<CoreStatus, string>> = {
                'awaiting-approval': 'rgb(251,146,60)', listening: 'var(--accent-cyan)', thinking: '#a78bfa', speaking: 'var(--accent-cyan)',
              };
              const label = statusLabel[coreStatus] ?? (hasError ? 'ERROR' : hasProvider ? 'CORE ACTIVE' : 'NO AI');
              const color = statusColor[coreStatus] ?? (hasError ? 'var(--error)' : hasProvider ? 'var(--accent-cyan)' : 'var(--warning)');
              const dotColor = statusColor[coreStatus] ?? (hasError ? 'var(--error)' : hasProvider ? 'var(--success)' : 'var(--warning)');
              return (<>
                <LiveIndicator size={6} color={dotColor} />
                <span className="text-xs-custom font-mono-data" style={{ color }}>{label}</span>
              </>);
            })()}
          </div>

          {/* Home-level proof that store has payload — cannot be missed */}
          {spherePayload && spherePhase !== 'idle' && (
            <div
              className="absolute top-12 left-1/2 -translate-x-1/2 z-50 rounded-full px-3 py-1 text-[10px] font-medium pointer-events-none"
              style={{
                background: 'rgba(167,139,250,0.25)',
                border: '1px solid rgba(167,139,250,0.7)',
                color: '#e9d5ff',
                boxShadow: '0 0 24px rgba(167,139,250,0.35)',
              }}
            >
              {spherePayload.mode} · {spherePayload.title}
            </div>
          )}

          <div className="axe-viewctl absolute top-4 right-4 z-20 flex items-center gap-2 over-canvas-group">
            {/* Badges and the "Awareness" label were never given a mobile
                layout — on a 375px viewport this whole cluster is wider than
                half the screen and runs straight into the CORE ACTIVE status
                pill on the left. Trimming to icon-only / dropping the
                decorative pieces on mobile keeps the row inside its half
                without touching desktop at all. */}
            {!isMobile && <AppGrowthBadge />}
            {!isMobile && <MemoryGrowthBadge />}
            <button
              onClick={() => setShowAwareness(v => !v)}
              className="flex items-center gap-1.5 rounded-full text-[10px] font-medium transition-all"
              style={{
                padding: isMobile ? '6px' : '6px 12px',
                background: showAwareness ? 'var(--tint)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${showAwareness ? 'var(--tint-line)' : 'rgba(255,255,255,0.08)'}`,
                color: showAwareness ? 'var(--accent-cyan)' : 'rgba(255,255,255,0.45)',
              }}
              aria-label="Awareness"
            >
              {isMobile ? <Zap size={12} /> : 'Awareness'}
            </button>
            <div
              className="flex items-center rounded-full p-0.5"
              style={{ background: 'rgba(8,10,14,0.85)', border: '1px solid rgba(255,255,255,0.08)', backdropFilter: 'blur(8px)' }}
              role="tablist"
              aria-label="Core view"
            >
              {VIEW_SEGMENTS.map(seg => {
                const active = coreView === seg.id;
                const Icon = seg.icon;
                const accent =
                  seg.id === 'neural'
                    ? { activeBg: 'rgba(139,92,246,0.28)', activeBorder: 'rgba(139,92,246,0.55)', activeColor: '#c4b5fd', glow: '0 0 12px rgba(139,92,246,0.25)' }
                    : seg.id === 'runtime'
                      ? { activeBg: 'var(--tint-line)', activeBorder: 'var(--tint-line)', activeColor: 'var(--accent-cyan)', glow: '0 0 12px var(--tint-line)' }
                      : { activeBg: 'rgba(255,255,255,0.1)', activeBorder: 'rgba(255,255,255,0.14)', activeColor: 'rgba(255,255,255,0.92)', glow: 'none' };
                return (
                  <button
                    key={seg.id}
                    role="tab"
                    aria-selected={active}
                    onClick={() => setCoreView(seg.id)}
                    className="flex items-center gap-1 rounded-full text-[10px] font-medium transition-all"
                    style={{
                      padding: isMobile ? '6px' : '6px 10px',
                      background: active ? accent.activeBg : 'transparent',
                      border: `1px solid ${active ? accent.activeBorder : 'transparent'}`,
                      color: active ? accent.activeColor : 'rgba(255,255,255,0.38)',
                      boxShadow: active ? accent.glow : 'none',
                    }}
                    aria-label={seg.label}
                  >
                    {Icon ? <Icon size={11} /> : null}
                    {!isMobile && seg.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Purely decorative watermark — on mobile it sits directly behind
              the tab pills above, so it only adds visual noise to the exact
              spot that's already tight on room. Desktop has space to spare. */}
          {!isMobile && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 text-[9px] font-mono-data z-20 pointer-events-none" style={{ color: 'rgba(255,255,255,0.12)' }}>
              v5.0
            </div>
          )}

          {showAwareness && (
            <AwarenessCenter
              onClose={() => setShowAwareness(false)}
              onApprove={(proposal) => {
                void voice.sendMessage(`${proposal.title}: ${proposal.context}`);
                setShowAwareness(false);
              }}
            />
          )}

          {/* SphereStage ALWAYS mounted on Home — never unmount on view switch */}
          <div className="absolute inset-0">
            <div
              className="absolute inset-0"
              style={{
                opacity: coreView === 'axe' ? 1 : 0,
                pointerEvents: coreView === 'axe' ? 'auto' : 'none',
                zIndex: coreView === 'axe' ? 10 : 0,
              }}
            >
              {/* Op de plaat onze canvas-sphere, daarbuiten de Three-versie.
                  Die stapelt bloom en additief gemengde halo's: dat werkt op
                  zwart, maar slaat dicht op een lichte plaat en dan verdwijnt
                  de vorm in de gloed. Beide blijven bestaan. */}
              {opPlaat ? <AxeCoreSphere /> : <SphereStage status={coreStatus} />}
            </div>
            <AnimatePresence>
              {coreView === 'runtime' && (
                <motion.div key="arch" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }} className="absolute inset-0 z-10">
                  <RuntimeWorkspace />
                </motion.div>
              )}
              {coreView === 'neural' && (
                <motion.div key="neural" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }} className="absolute inset-0 z-10">
                  <NeuralBrain />
                </motion.div>
              )}
              {coreView === 'terrain' && (
                <motion.div key="terrain" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }} className="absolute inset-0 z-10">
                  <NeuralMemorySystem />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </motion.div>


      <motion.div variants={iv} className="flex-shrink-0 flex flex-col" animate={{ height: chatHeight }} transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}>
        <div
          data-dicht={chatCollapsed ? 'ja' : 'nee'}
          className="axe-chatplaat h-full flex flex-col rounded-xl overflow-hidden relative"
          style={{ background: 'var(--bg-base)', border: '1px solid rgba(255,255,255,0.06)' }}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={(e) => { void onDrop(e); }}
        >
          <div
            role="button"
            tabIndex={0}
            onClick={() => setChatCollapsed(c => !c)}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setChatCollapsed(c => !c); } }}
            className="flex items-center justify-between px-3 py-1.5 flex-shrink-0 w-full text-left cursor-pointer"
            style={{ borderBottom: chatCollapsed ? 'none' : '1px solid rgba(255,255,255,0.06)' }}
          >
            <span className="flex items-center gap-1.5 text-[11px] font-medium tracking-wide" style={{ color: 'var(--accent-cyan)' }}>
              {chatCollapsed ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              AXE CHAT
              {attachments.length > 0 && (
                <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ background: 'var(--tint)', color: 'var(--accent-cyan)' }}>
                  {attachments.length} file{attachments.length > 1 ? 's' : ''}
                </span>
              )}
              {/* De tellers stonden als losse pillen BOVEN de plaat, en dat is
                  waarom er een rij zwevende doosjes tussen de scene en de chat
                  hing. In de demo staan ze op dezelfde regel als de naam, ín de
                  kop, gescheiden door een streepje in plaats van door een
                  kader: het zijn tellers, geen knoppen. */}
              <span className="axe-cpills" onClick={e => e.stopPropagation()}>
                <MissionControlStrip />
              </span>
            </span>
            <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
              {!chatCollapsed && voice.allConversations.length > 0 && (
                <button onClick={() => voice.loadAllConversations()} className="p-0.5 rounded" style={{ color: 'var(--text-muted)' }}>
                  <RotateCcw size={11} />
                </button>
              )}
              {!chatCollapsed && (
                <button onClick={() => voice.startNewConversation()} className="flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[9px]" style={{ background: 'var(--tint-line)', border: '1px solid var(--tint-line)', color: 'var(--accent-cyan)' }}>
                  <Plus size={9} /> New
                </button>
              )}
            </div>
          </div>

          {!chatCollapsed && voice.allConversations.length > 0 && (
            <div className="flex gap-1 overflow-x-auto px-2 py-1.5 flex-shrink-0" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              {voice.allConversations.slice(0, 5).map(conv => (
                <button
                  key={conv.id}
                  onClick={() => voice.switchConversation(conv.id)}
                  className="flex-shrink-0 rounded px-2 py-1 text-[9px] truncate max-w-[110px]"
                  style={{
                    background: conv.id === voice.sessionId ? 'var(--tint)' : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${conv.id === voice.sessionId ? 'var(--tint-line)' : 'rgba(255,255,255,0.06)'}`,
                    color: conv.id === voice.sessionId ? 'var(--accent-cyan)' : 'var(--text-muted)',
                  }}
                >
                  <MessageSquare size={8} className="inline mr-0.5" />{conv.title}
                </button>
              ))}
            </div>
          )}

          {!chatCollapsed && (
            <>
              <div ref={chatScrollRef} className="flex-1 overflow-y-auto px-2.5 py-2 space-y-1.5 min-h-0">
                {voice.conversation.length === 0 && (
                  <div className="h-full flex items-center justify-center text-center px-4">
                    <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                      “toon chart” · “laat New York zien” · drop files · “klaar”
                    </span>
                  </div>
                )}
                {voice.conversation.map((m, i) => {
                  const isUser = m.role === 'user';
                  const displayText = isUser && (m.text.includes('## Attached files') || m.text.includes('LAUNCH CREWAI'))
                    ? (m.text.includes('LAUNCH CREWAI') ? 'Launch CrewAI · attached brief' : m.text.split('## Attached files')[0].trim() || 'Attached file(s)')
                    : m.text;
                  return (
                    <div key={i} className={`flex gap-1.5 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
                      <div className="mt-0.5 flex-shrink-0">
                        {isUser ? <User size={11} style={{ color: 'var(--text-muted)' }} /> : <Bot size={11} style={{ color: 'var(--accent-cyan)' }} />}
                      </div>
                      <div className="max-w-[85%] flex flex-col gap-0.5">
                        <div className="rounded-lg px-2.5 py-1.5 text-[13px] leading-relaxed" style={{ background: isUser ? 'var(--tint)' : 'rgba(255,255,255,0.04)', color: isUser ? 'var(--text-primary)' : 'rgba(165,243,252,0.85)' }}>
                          {isUser ? displayText : <MarkdownMessage text={m.text} />}
                        </div>
                        {!isUser && m.provider && m.provider !== 'none' && (
                          m.provider === 'error' ? (
                            <div className="flex items-start gap-0.5 px-1" style={{ color: 'rgba(239,68,68,0.55)' }}>
                              <span className="text-[8px] mt-px">⚠</span>
                              <span className="text-[8px] leading-tight">{m.slotErrors ? m.slotErrors : 'all providers failed'}</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-0.5 px-1" style={{ color: 'rgba(255,255,255,0.22)' }}>
                              <Zap size={8} />
                              <span className="text-[8px]">{m.provider}{m.model ? ` · ${m.model.split('/').pop()?.split(':')[0]}` : ''}</span>
                            </div>
                          )
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {voice.pendingExec && (
                <div className="mx-2.5 mb-2 p-2.5 rounded-lg flex-shrink-0" style={{ background: 'rgba(251,146,60,0.08)', border: '1px solid rgba(251,146,60,0.3)' }}>
                  <div className="flex items-center gap-1.5 mb-1.5" style={{ color: 'rgb(251,146,60)' }}>
                    <Terminal size={12} />
                    <span className="text-[10px] font-semibold uppercase tracking-wide">{voice.pendingExec.title}</span>
                  </div>
                  <pre className="block text-[11px] px-2 py-1.5 rounded mb-2 whitespace-pre-wrap break-all max-h-40 overflow-y-auto" style={{ background: 'rgba(0,0,0,0.4)', color: 'var(--text-primary)' }}>
                    {voice.pendingExec.detail}
                  </pre>
                  <div className="flex gap-1.5">
                    <button onClick={() => voice.resolvePendingExec(voice.pendingExec!.id, true)} className="flex-1 flex items-center justify-center gap-1 text-[11px] font-medium py-1.5 rounded-md" style={{ background: 'var(--tint-line)', color: 'var(--accent-cyan)', border: '1px solid var(--tint-line)' }}>
                      <Check size={12} /> Approve
                    </button>
                    <button onClick={() => voice.resolvePendingExec(voice.pendingExec!.id, false)} className="flex-1 flex items-center justify-center gap-1 text-[11px] font-medium py-1.5 rounded-md" style={{ background: 'rgba(239,68,68,0.1)', color: 'rgb(248,113,113)', border: '1px solid rgba(239,68,68,0.25)' }}>
                      <X size={12} /> Deny
                    </button>
                  </div>
                </div>
              )}

            </>
          )}
        </div>
      </motion.div>
      {/* De composer staat ONDER de chatplaat, niet erin.
          In de demo zijn dat twee losse dingen: de plaat met het gesprek,
          en daaronder de pil waarin je typt. Hier zat hij binnenin, wat twee
          dingen brak -- hij verdween zodra je de chat inklapte (in de demo
          blijft hij staan), en hij kreeg de breedte van de plaat MIN de
          padding, dus hij was altijd smaller dan de plaat erboven. */}
              <HomeChatComposer>
                    <FileUploadButton attachments={attachments} onAttachmentsChange={setAttachments} />
                    {/* Speak/text toggle dropped on mobile: five icon buttons plus
                        the input squeezed the input down to ~150px on a 375px
                        screen, clipping even a short placeholder — this is the
                        least essential of the row, a preference toggle rather
                        than an action. */}
                    {!isMobile && (
                      <button onClick={() => voice.setResponseMode(voice.responseMode === 'speak' ? 'type' : 'speak')} className="flex-shrink-0 rounded-md p-2" title={voice.responseMode === 'speak' ? 'AXE speaks back' : 'Text-only'} style={{ background: voice.responseMode === 'speak' ? 'var(--tint-line)' : 'rgba(255,255,255,0.04)', color: voice.responseMode === 'speak' ? 'var(--accent-cyan)' : 'var(--text-muted)', border: `1px solid ${voice.responseMode === 'speak' ? 'var(--tint-line)' : 'rgba(255,255,255,0.06)'}` }}>
                        {voice.responseMode === 'speak' ? <Volume2 size={13} /> : <VolumeX size={13} />}
                      </button>
                    )}
                    <button onClick={handleChatMic} className="flex-shrink-0 rounded-md p-2" style={{ background: chatIsListening ? 'var(--accent-cyan)' : 'rgba(255,255,255,0.05)', color: chatIsListening ? '#000' : 'var(--text-muted)' }}>
                      <Mic size={13} />
                    </button>
                    <VisionCaptureButton compact className="flex-shrink-0 rounded-md p-2 border-0 bg-white/5 text-white/50 hover:bg-white/10 disabled:opacity-50" />
                    <input
                      value={chatText}
                      onChange={e => setChatText(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') void handleChatSend(); }}
                      placeholder={attachments.length ? 'Send · toon · chart · klaar' : (isMobile ? 'Vraag iets...' : 'toon chart · laat New York zien')}
                      className="flex-1 min-w-0 text-[13px] px-3 py-2 rounded-lg outline-none bg-transparent"
                      style={{ color: 'var(--text-primary)', border: 'none' }}
                    />
                    <button onClick={() => void handleChatSend()} disabled={!chatText.trim() && attachments.length === 0} className="flex-shrink-0 rounded-md p-2 disabled:opacity-40" style={{ background: 'var(--accent-cyan)', color: '#000' }}>
                      <Send size={13} />
                    </button>
              </HomeChatComposer>
    </motion.div>
  );
}
