import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronRight, Plus, Check, X, ExternalLink, Clock, Cpu,
  Activity, Mic, Zap, Network, Send, User, Bot, MessageSquare,
  RotateCcw, Menu, Key, RefreshCw, AlertCircle,
} from 'lucide-react';
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from '@/components/ui/sheet';
import { useNavigate } from 'react-router';
import { HolographicSphere } from '@/components/axe-core/HolographicSphere';
import { ArchitectureRedesign, type ArchCard, ACCENTS } from '@/components/axe-core/ArchitectureRedesign';
import { OrganizationCanvas } from '@/components/axe-core/OrganizationCanvas';
import { BrowserPanel } from '@/components/axe-core/BrowserPanel';
import { AgentChatHub } from '@/components/axe-core/AgentChatHub';
import { KimiToolsPanel } from '@/components/axe-core/KimiToolsPanel';
import { WidgetCard } from '@/components/widgets/WidgetCard';
import { LiveIndicator } from '@/components/shared/LiveIndicator';
import { useUIStore } from '@/store/uiStore';
import { useVoiceStore } from '@/store/voiceStore';
import { loadSetting, saveSetting } from '@/services/userSettingsService';
import { loadAxeOrganization, type OrganizationNode } from '@/services/systemRegistryService';
import { normalizeProviderBaseUrl } from '@/services/providerConnectionDefaults';
import { useIsMobile } from '@/hooks/use-mobile';
import { useIsTablet } from '@/hooks/use-tablet';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { FileUploadButton, type ChatAttachment } from '@/components/axe-core/FileUploadButton';
import { AICoreLogs } from '@/components/axe-core/AICoreLogs';
import { CodeAgentPanel } from '@/components/axe-core/CodeAgentPanel';
import { MemoryPanel } from '@/components/axe-core/MemoryPanel';

const OLLAMA_BASE_URL = import.meta.env.VITE_OLLAMA_URL
  ?? (import.meta.env.DEV ? '/proxy/ollama' : 'https://ollama.axecompanion.com');

/* ─── types ─────────────────────────────────────────────────────────────── */
interface LLMEntry { id: string; name: string; model: string; docsUrl: string; needsKey: boolean; baseUrlDefault?: string; }
interface LLMConn  { key?: string; baseUrl?: string; latency?: number; }
interface TimelineItem { id: string; time: string; title: string; done: boolean; }

const LLM_CATALOGUE: LLMEntry[] = [
  { id: 'anthropic',   name: 'Anthropic',   model: 'Claude',  docsUrl: 'https://console.anthropic.com/keys',      needsKey: true },
  { id: 'openai',      name: 'OpenAI',      model: 'GPT-4o',  docsUrl: 'https://platform.openai.com/api-keys',    needsKey: true },
  { id: 'google',      name: 'Google',      model: 'Gemini',  docsUrl: 'https://aistudio.google.com/app/apikey',  needsKey: true },
  { id: 'xai',         name: 'Grok',       model: 'Grok',    docsUrl: 'https://docs.x.ai/developers/quickstart', needsKey: true },
  { id: 'groq',        name: 'Groq',        model: 'Qwen 3 32B', docsUrl: 'https://console.groq.com/keys',        needsKey: true, baseUrlDefault: 'https://api.groq.com/openai/v1' },
  { id: 'openrouter',  name: 'OpenRouter',  model: 'Multi',   docsUrl: 'https://openrouter.ai/keys',              needsKey: true },
  { id: 'ollama',      name: 'Ollama',      model: 'Local',   docsUrl: 'https://ollama.ai',                       needsKey: false, baseUrlDefault: OLLAMA_BASE_URL },
  { id: 'openhands',   name: 'OpenHands',   model: 'Local',   docsUrl: 'https://github.com/All-Hands-AI/OpenHands', needsKey: false, baseUrlDefault: '/proxy/openhands' },
  { id: 'openjarvis',  name: 'OpenJarvis',  model: 'Local',   docsUrl: 'https://github.com',                     needsKey: false, baseUrlDefault: '/proxy/openjarvis' },
  { id: 'openclaw',    name: 'OpenClaw',    model: 'Local',   docsUrl: 'https://github.com',                     needsKey: false, baseUrlDefault: '/proxy/openclaw' },
  { id: 'kilocode',    name: 'Kilo Code',   model: 'Local',   docsUrl: 'https://github.com',                     needsKey: false, baseUrlDefault: '/proxy/kilocode' },
  { id: 'crewai',      name: 'CrewAI',      model: 'Local',   docsUrl: 'https://github.com',                     needsKey: false, baseUrlDefault: '/proxy/crewai' },
  { id: 'hermes',      name: 'Hermes Agent', model: 'Local',  docsUrl: 'https://github.com/NousResearch/hermes-agent', needsKey: false, baseUrlDefault: '/proxy/hermes' },
];

function loadLLMs(): Record<string, LLMConn> {
  try {
    const parsed = JSON.parse(localStorage.getItem('axe_llm_connections') ?? '{}') as Record<string, LLMConn>;
    const next: Record<string, LLMConn> = {};
    for (const [id, conn] of Object.entries(parsed)) {
      next[id] = { ...conn, baseUrl: normalizeProviderBaseUrl(id as Parameters<typeof normalizeProviderBaseUrl>[0], conn?.baseUrl) };
    }
    return next;
  } catch { return {}; }
}
function saveLLMs(d: Record<string, LLMConn>) { localStorage.setItem('axe_llm_connections', JSON.stringify(d)); void saveSetting('axe_llm_connections', d); }
function loadTimeline(): TimelineItem[] { try { return JSON.parse(localStorage.getItem('axe_timeline') ?? '[]'); } catch { return []; } }
function saveTimeline(d: TimelineItem[]) { localStorage.setItem('axe_timeline', JSON.stringify(d)); void saveSetting('axe_timeline', d); }

const cv = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.04, delayChildren: 0.15 } } };
const iv = { hidden: { opacity: 0, y: 14 }, visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.16,1,0.3,1] as never } } };

/* ══════════════════════════════════════════════════════════════════════════
   HOME
   ══════════════════════════════════════════════════════════════════════════ */
export default function Home() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  const { setRightPanelOpen } = useUIStore();

  useEffect(() => { setRightPanelOpen(false); return () => setRightPanelOpen(true); }, []);

  const [llmConns, setLlmConns] = useState<Record<string, LLMConn>>(loadLLMs);
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [keyInput, setKeyInput] = useState('');
  const [urlInput, setUrlInput] = useState('');

  const [timeline, setTimeline] = useState<TimelineItem[]>(loadTimeline);
  const [newEvent, setNewEvent] = useState('');
  const [addingEvent, setAddingEvent] = useState(false);

  const [organization, setOrganization] = useState<OrganizationNode | null>(null);
  const [coreView, setCoreView] = useState<'axe' | 'organization'>('axe');
  useEffect(() => { let alive = true; void loadAxeOrganization().then(s => { if (alive) setOrganization(s.root); }); return () => { alive = false; }; }, [navigate]);

  const [supaUrl] = useState(() => localStorage.getItem('axe_supa_url') ?? import.meta.env.VITE_SUPABASE_URL ?? '');
  const supaConnected = !!supaUrl;

  const voice = useVoiceStore();
  const [chatText, setChatText] = useState('');
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);

  /* ── Mobile widget drawers ── */
  const [mobileLeftOpen, setMobileLeftOpen] = useState(false);
  const [mobileRightOpen, setMobileRightOpen] = useState(false);

  /* ── Architecture cards (generated from LLM connections) ── */
  const [archCards, setArchCards] = useState<ArchCard[]>(() => generateArchCards(llmConns));
  useEffect(() => { setArchCards(generateArchCards(llmConns)); }, [llmConns]);

  function generateArchCards(conns: Record<string, LLMConn>): ArchCard[] {
    const providerCards: ArchCard[] = LLM_CATALOGUE.map(cat => {
      const connected = !!conns[cat.id];
      return {
        id: cat.id,
        type: 'provider',
        title: cat.name,
        subtitle: cat.model,
        accent: ACCENTS[cat.id] || '#22D3EE',
        status: connected ? 'active' : 'idle',
        expanded: false,
        editable: connected,
        items: connected
          ? [
              { id: 'model', label: 'Model', value: cat.model, status: 'ok' },
              { id: 'status', label: 'Connection', value: 'Connected', status: 'ok' },
              { id: 'api', label: 'API', value: conns[cat.id]?.baseUrl || 'Default', status: 'neutral' },
            ]
          : [{ id: 'status', label: 'Status', value: 'Not connected', status: 'neutral' }],
      };
    });

    const toolCards: ArchCard[] = [
      {
        id: 'kimiclaw', type: 'tool', title: 'KimiClaw', subtitle: 'Search & Browse', accent: ACCENTS.kimiclaw, status: 'active', expanded: false, editable: true,
        items: [
          { id: 'web', label: 'Web Search', value: 'Exa API', status: 'ok' },
          { id: 'browse', label: 'Browser Fetch', value: 'Active', status: 'ok' },
          { id: 'analyze', label: 'Page Analyze', value: 'Ready', status: 'ok' },
        ],
      },
      {
        id: 'kimicode', type: 'tool', title: 'KimiCode', subtitle: 'Code Agent', accent: ACCENTS.kimicode, status: 'active', expanded: false, editable: true,
        items: [
          { id: 'edit', label: 'File Edit', value: 'Enabled', status: 'ok' },
          { id: 'terminal', label: 'Terminal', value: 'Integrated', status: 'ok' },
          { id: 'git', label: 'Git', value: 'Connected', status: 'ok' },
        ],
      },
      {
        id: 'kimiwork', type: 'tool', title: 'KimiWork', subtitle: 'Analysis Engine', accent: ACCENTS.kimiwork, status: 'active', expanded: false, editable: true,
        items: [
          { id: 'data', label: 'Data Analysis', value: 'Ready', status: 'ok' },
          { id: 'charts', label: 'Charts', value: 'Enabled', status: 'ok' },
        ],
      },
    ];

    const systemCards: ArchCard[] = [
      {
        id: 'memory', type: 'memory', title: 'Memory System', subtitle: 'Supabase persistence', accent: ACCENTS.memory, status: supaConnected ? 'active' : 'error', expanded: false, editable: false,
        items: [
          { id: 'db', label: 'Database', value: supaConnected ? 'Connected' : 'Offline', status: supaConnected ? 'ok' : 'error' },
          { id: 'chats', label: 'Stored chats', value: String(voice.allConversations.length), status: 'ok' },
        ],
      },
      {
        id: 'health', type: 'health', title: 'System Health', subtitle: 'Core status', accent: ACCENTS.health, status: 'active', expanded: false, editable: false,
        items: [
          { id: 'core', label: 'Core', value: 'Online', status: 'ok' },
          { id: 'voice', label: 'Voice', value: 'Piper TTS', status: 'ok' },
          { id: 'providers', label: 'Providers', value: `${Object.keys(conns).length} active`, status: Object.keys(conns).length > 0 ? 'ok' : 'warn' },
        ],
      },
    ];

    return [...providerCards, ...toolCards, ...systemCards];
  }

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
  const handleChatMic = async () => { try { if (chatIsListening) await voice.stopListening(); else await voice.startListening(); } catch { /* ignore */ } };

  // Spacebar on Home = toggle microphone — must be after handleChatMic definition
  useKeyboardShortcuts({ onSpacebar: handleChatMic });

  const addEventRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (addingEvent) addEventRef.current?.focus(); }, [addingEvent]);
  const addEvent = () => {
    if (!newEvent.trim()) return;
    const now = new Date();
    const item: TimelineItem = { id: Date.now().toString(), time: `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`, title: newEvent.trim(), done: false };
    const updated = [...timeline, item]; setTimeline(updated); saveTimeline(updated); setNewEvent(''); setAddingEvent(false);
  };
  const toggleDone = (id: string) => { const updated = timeline.map(e => e.id === id ? { ...e, done: !e.done } : e); setTimeline(updated); saveTimeline(updated); };
  const removeEvent = (id: string) => { const updated = timeline.filter(e => e.id !== id); setTimeline(updated); saveTimeline(updated); };

  const openConnect = (id: string) => { const cat = LLM_CATALOGUE.find(c => c.id === id)!; setConnectingId(id); setKeyInput(''); setUrlInput(cat.baseUrlDefault ?? ''); };
  const saveLLM = (id: string) => { const cat = LLM_CATALOGUE.find(c => c.id === id)!; const updated = { ...llmConns, [id]: { key: cat.needsKey ? keyInput : undefined, baseUrl: urlInput || undefined } }; setLlmConns(updated); saveLLMs(updated); setConnectingId(null); };
  const disconnectLLM = (id: string) => { const updated = { ...llmConns }; delete updated[id]; setLlmConns(updated); saveLLMs(updated); };

  const connectedCount = Object.keys(llmConns).length;

  /* ── Drawer content (shared) ── */
  const aiCoreWidget = (
    <WidgetCard title="AI CORE SYSTEM">
      <div className="space-y-1.5">
        {[
          { icon: Activity, label: 'Status', val: 'Online', ok: true },
          { icon: Cpu, label: 'Models', val: `${connectedCount} active`, ok: connectedCount > 0 },
          { icon: Mic, label: 'Voice', val: 'Piper TTS', ok: true },
          { icon: Zap, label: 'Memory', val: supaConnected ? 'Linked' : '\u2014', ok: supaConnected },
        ].map(({ icon: Icon, label, val, ok }) => (
          <div key={label} className="flex items-center justify-between">
            <div className="flex items-center gap-1.5"><Icon size={11} style={{ color: ok ? 'var(--accent-cyan)' : 'var(--text-muted)' }} /><span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>{label}</span></div>
            <span className="text-[11px] font-mono-data" style={{ color: ok ? 'var(--text-primary)' : 'var(--text-muted)' }}>{val}</span>
          </div>
        ))}
      </div>
    </WidgetCard>
  );

  const timelineWidget = (
    <WidgetCard title="MISSION TIMELINE" headerAction={
      <button onClick={() => setAddingEvent(v => !v)} style={{ color: 'var(--accent-blue)', fontSize: '0.65rem', display: 'flex', alignItems: 'center', gap: 2 }}><Plus size={11} /> Add</button>
    }>
      <AnimatePresence>
        {addingEvent && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="flex gap-1.5 mb-2">
            <input ref={addEventRef} value={newEvent} onChange={e => setNewEvent(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addEvent(); if (e.key === 'Escape') setAddingEvent(false); }} placeholder="Event title..." className="flex-1 text-[10px] px-2 py-1 rounded" style={{ background: 'var(--bg-base)', border: '1px solid var(--border-active)', color: 'var(--text-primary)' }} />
            <button onClick={addEvent} className="px-1.5 py-1 rounded" style={{ background: 'var(--accent-cyan)', color: '#000' }}><Check size={11} /></button>
          </motion.div>
        )}
      </AnimatePresence>
      {timeline.length === 0 ? (
        <div className="flex flex-col items-center gap-1.5 py-2"><Clock size={16} style={{ color: 'var(--text-muted)', opacity: 0.35 }} /><span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>No events today</span></div>
      ) : (
        <div className="space-y-1 max-h-32 overflow-y-auto">
          {timeline.map(ev => (
            <div key={ev.id} className="flex items-center gap-1.5 group">
              <span className="font-mono-data text-[8px] w-6 flex-shrink-0" style={{ color: 'var(--text-muted)' }}>{ev.time}</span>
              <button onClick={() => toggleDone(ev.id)} className="flex-shrink-0"><span className="block rounded-full" style={{ width: 4, height: 4, background: ev.done ? 'var(--text-muted)' : 'var(--accent-cyan)', boxShadow: ev.done ? 'none' : '0 0 4px var(--accent-cyan)' }} /></button>
              <span className="flex-1 text-[9px] truncate" style={{ color: ev.done ? 'var(--text-muted)' : 'var(--text-primary)', textDecoration: ev.done ? 'line-through' : 'none' }}>{ev.title}</span>
              <button onClick={() => removeEvent(ev.id)} className="opacity-0 group-hover:opacity-100 transition-opacity"><X size={9} style={{ color: 'var(--text-muted)' }} /></button>
            </div>
          ))}
        </div>
      )}
    </WidgetCard>
  );

  /* ════════════════════════════════════════════════════════════════════════
     MOBILE LAYOUT — sphere + chat + composer, thin edge handles for drawers
     ════════════════════════════════════════════════════════════════════════ */
  if (isMobile) {
    return (
      <motion.div className="flex flex-col h-full overflow-hidden relative" style={{ background: '#000000' }} variants={cv} initial="hidden" animate="visible">

        {/* Thin LEFT edge handle — opens left widget drawer */}
        <Sheet open={mobileLeftOpen} onOpenChange={setMobileLeftOpen}>
          <SheetTrigger asChild>
            <div className="absolute left-0 top-[25%] bottom-[25%] w-[3px] z-30 cursor-pointer rounded-r" style={{ background: 'rgba(34,211,238,0.15)' }} />
          </SheetTrigger>
          <SheetContent side="left" className="w-[280px] p-0 border-r-0" style={{ background: '#000000', borderRight: '1px solid rgba(255,255,255,0.06)' }}>
            <SheetTitle className="sr-only">Left Widgets</SheetTitle>
            <div className="h-full overflow-y-auto p-3 space-y-2" style={{ background: '#000000' }}>
              <div className="text-[10px] font-medium mb-1" style={{ color: 'var(--accent-cyan)' }}>WIDGETS</div>
              {aiCoreWidget}
              {timelineWidget}
              <WidgetCard title="AI CORE LOGS"><AICoreLogs /></WidgetCard>
              <WidgetCard title="AXE CORE CHAT" headerAction={
                <button onClick={() => voice.startNewConversation()} className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px]" style={{ background: 'rgba(34,211,238,0.1)', border: '1px solid rgba(34,211,238,0.25)', color: 'var(--accent-cyan)' }}><Plus size={9} /> New</button>
              }>
                <div className="flex flex-col" style={{ minHeight: 120 }}>
                  {voice.allConversations.length > 0 && (
                    <div className="flex gap-1 overflow-x-auto pb-1 mb-1" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      {voice.allConversations.slice(0, 5).map(conv => (
                        <button key={conv.id} onClick={() => voice.switchConversation(conv.id)} className="flex-shrink-0 rounded px-1.5 py-0.5 text-[8px] truncate max-w-[100px]" style={{ background: conv.id === voice.sessionId ? 'rgba(34,211,238,0.15)' : 'rgba(255,255,255,0.03)', border: `1px solid ${conv.id === voice.sessionId ? 'rgba(34,211,238,0.4)' : 'rgba(255,255,255,0.06)'}`, color: conv.id === voice.sessionId ? 'var(--accent-cyan)' : 'var(--text-muted)' }}><MessageSquare size={7} className="inline mr-0.5" />{conv.title}</button>
                      ))}
                    </div>
                  )}
                  <div ref={chatScrollRef} className="flex-1 overflow-y-auto space-y-1 min-h-0" style={{ maxHeight: 160 }}>
                    {voice.conversation.map((m, i) => {
                      const isUser = m.role === 'user';
                      return (<div key={i} className={`flex gap-1 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}><div className="mt-0.5 flex-shrink-0">{isUser ? <User size={9} style={{ color: 'var(--text-muted)' }} /> : <Bot size={9} style={{ color: 'var(--accent-cyan)' }} />}</div><div className="max-w-[85%] rounded px-2 py-1 text-[10px] leading-snug" style={{ background: isUser ? 'rgba(34,211,238,0.1)' : 'rgba(255,255,255,0.04)', color: isUser ? 'var(--text-primary)' : 'rgba(165,243,252,0.8)' }}>{m.text}</div></div>);
                    })}
                  </div>
                </div>
              </WidgetCard>
            </div>
          </SheetContent>
        </Sheet>

        {/* Thin RIGHT edge handle — opens right widget drawer */}
        <Sheet open={mobileRightOpen} onOpenChange={setMobileRightOpen}>
          <SheetTrigger asChild>
            <div className="absolute right-0 top-[25%] bottom-[25%] w-[3px] z-30 cursor-pointer rounded-l" style={{ background: 'rgba(34,211,238,0.15)' }} />
          </SheetTrigger>
          <SheetContent side="right" className="w-[280px] p-0 border-l-0" style={{ background: '#000000', borderLeft: '1px solid rgba(255,255,255,0.06)' }}>
            <SheetTitle className="sr-only">Right Tools</SheetTitle>
            <div className="h-full overflow-y-auto p-3 space-y-2" style={{ background: '#000000' }}>
              <div className="text-[10px] font-medium mb-1" style={{ color: 'var(--accent-cyan)' }}>TOOLS</div>
              <WidgetCard title="KIMI TOOLS" action={{ label: 'All ›', onClick: () => navigate('/kimik2') }}><KimiToolsPanel /></WidgetCard>
              <WidgetCard title="CODE AGENT" icon={<Zap size={12} style={{ color: 'var(--accent-cyan)' }} />}><CodeAgentPanel /></WidgetCard>
              <WidgetCard title="BROWSER" icon={<ExternalLink size={12} style={{ color: 'var(--accent-cyan)' }} />}><BrowserPanel /></WidgetCard>
              <WidgetCard title="MEMORY" icon={<Activity size={12} style={{ color: 'var(--accent-cyan)' }} />}><MemoryPanel /></WidgetCard>
              <WidgetCard title="AGENT CHATS" icon={<MessageSquare size={12} style={{ color: 'var(--accent-cyan)' }} />}><AgentChatHub /></WidgetCard>
            </div>
          </SheetContent>
        </Sheet>

        {/* 3D Sphere — flexible height */}
        <motion.div variants={iv} className="flex-shrink-0" style={{ height: '55%' }}>
          <div className="h-full relative rounded-xl overflow-hidden" style={{ backgroundColor: '#000000', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="absolute top-2 left-4 flex items-center gap-1.5 z-10"><LiveIndicator size={5} /><span className="text-[9px] font-mono-data" style={{ color: 'var(--accent-cyan)' }}>CORE</span></div>
            <div className="absolute top-2 right-4 z-10 flex items-center gap-1">
              <button onClick={() => setCoreView(prev => prev === 'axe' ? 'organization' : 'axe')} className="flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[8px] font-medium" style={{ background: 'rgba(34,211,238,0.08)', border: '1px solid rgba(34,211,238,0.25)', color: 'var(--accent-cyan)' }}><Network size={9} />{coreView === 'axe' ? 'Arch' : 'AXE'}</button>
            </div>
            <div className="absolute inset-0">
              <AnimatePresence mode="wait">
                {coreView === 'axe' ? (
                  <motion.div key="axe" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0"><HolographicSphere /></motion.div>
                ) : (
                  <motion.div key="arch" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0"><OrganizationCanvas /></motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </motion.div>

        {/* Chat — 45% height, scrollable messages + composer */}
        <motion.div variants={iv} className="flex-shrink-0 flex flex-col" style={{ height: '45%' }}>
          <div className="flex-1 flex flex-col rounded-xl overflow-hidden" style={{ background: '#000000', border: '1px solid rgba(255,255,255,0.06)' }}>
            {/* Chat header */}
            <div className="flex items-center justify-between px-2 py-1 flex-shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <span className="text-[9px] font-medium" style={{ color: 'var(--accent-cyan)' }}>AXE CHAT</span>
              <button onClick={() => voice.startNewConversation()} className="flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[8px]" style={{ background: 'rgba(34,211,238,0.08)', border: '1px solid rgba(34,211,238,0.2)', color: 'var(--accent-cyan)' }}><Plus size={8} /> New</button>
            </div>
            {/* Messages — scrollable */}
            <div ref={chatScrollRef} className="flex-1 overflow-y-auto px-2 py-1 space-y-1 min-h-0">
              {voice.conversation.length === 0 && <div className="h-full flex items-center justify-center text-center"><span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>Ask AXE anything...</span></div>}
              {voice.conversation.map((m, i) => {
                const isUser = m.role === 'user';
                return (<div key={i} className={`flex gap-1 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}><div className="mt-0.5 flex-shrink-0">{isUser ? <User size={9} style={{ color: 'var(--text-muted)' }} /> : <Bot size={9} style={{ color: 'var(--accent-cyan)' }} />}</div><div className="max-w-[85%] rounded px-2 py-1 text-[10px] leading-snug" style={{ background: isUser ? 'rgba(34,211,238,0.1)' : 'rgba(255,255,255,0.04)', color: isUser ? 'var(--text-primary)' : 'rgba(165,243,252,0.8)' }}>{m.text}</div></div>);
              })}
            </div>
            {/* Composer — inline, small */}
            <div className="flex-shrink-0 px-2 py-1.5" style={{ borderTop: '1px solid rgba(255,255,255,0.06)', background: '#000000' }}>
              <div className="flex items-center gap-1.5">
                <FileUploadButton onUpload={files => setAttachments(prev => [...prev, ...files])} />
                <div className="flex-1 flex items-center rounded-lg px-2 py-1" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <input
                    type="text"
                    value={chatText}
                    onChange={e => setChatText(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && chatText.trim()) { e.preventDefault(); void handleChatSend(); } }}
                    placeholder="Ask AXE..."
                    className="flex-1 bg-transparent text-[11px] outline-none placeholder:text-[var(--text-muted)]"
                    style={{ color: 'var(--text-primary)' }}
                  />
                </div>
                <button
                  onClick={() => { if (chatText.trim()) void handleChatSend(); }}
                  disabled={!chatText.trim()}
                  className="flex-shrink-0 rounded-lg p-1.5"
                  style={{ background: chatText.trim() ? 'rgba(34,211,238,0.15)' : 'rgba(255,255,255,0.04)', border: `1px solid ${chatText.trim() ? 'rgba(34,211,238,0.3)' : 'rgba(255,255,255,0.08)'}` }}
                >
                  <Send size={12} style={{ color: chatText.trim() ? 'var(--accent-cyan)' : 'var(--text-muted)' }} />
                </button>
                <button
                  onClick={() => voice.isListening ? voice.stopListening() : voice.startListening()}
                  className="flex-shrink-0 rounded-lg p-1.5"
                  style={{ background: voice.isListening ? 'rgba(34,211,238,0.15)' : 'rgba(255,255,255,0.04)', border: `1px solid ${voice.isListening ? 'rgba(34,211,238,0.3)' : 'rgba(255,255,255,0.08)'}` }}
                >
                  <Mic size={12} style={{ color: voice.isListening ? 'var(--accent-cyan)' : 'var(--text-muted)' }} />
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    );
  }

  /* ════════════════════════════════════════════════════════════════════════
     DESKTOP LAYOUT
     ════════════════════════════════════════════════════════════════════════ */
  return (
    <motion.div className="flex flex-row gap-3 p-3 h-full overflow-hidden" variants={cv} initial="hidden" animate="visible">
      {/* LEFT SIDEBAR — Original layout: AI Core, Timeline, Logs, Chat */}
      <div className="w-[220px] lg:w-[280px] flex-shrink-0 flex flex-col gap-2 overflow-y-auto scrollable" style={{ maxHeight: '100%' }}>
        <motion.div variants={iv}>{aiCoreWidget}</motion.div>
        <motion.div variants={iv}>{timelineWidget}</motion.div>
        <motion.div variants={iv}><WidgetCard title="AI CORE LOGS"><AICoreLogs /></WidgetCard></motion.div>
        <motion.div variants={iv} className="flex-1 min-h-0">
          <WidgetCard title="AXE CORE CHAT" headerAction={
            <div className="flex items-center gap-1.5">
              <button onClick={() => voice.startNewConversation()} className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px]" style={{ background: 'rgba(34,211,238,0.1)', border: '1px solid rgba(34,211,238,0.25)', color: 'var(--accent-cyan)' }}><Plus size={9} /> New</button>
              <button onClick={() => voice.loadAllConversations()} className="p-0.5 rounded" style={{ color: 'var(--text-muted)' }}><RotateCcw size={9} /></button>
            </div>
          }>
            <div className="flex flex-col h-full" style={{ minHeight: 280 }}>
              {voice.allConversations.length > 0 && (
                <div className="flex gap-1 overflow-x-auto pb-1 mb-1" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  {voice.allConversations.slice(0, 5).map(conv => (
                    <button key={conv.id} onClick={() => voice.switchConversation(conv.id)} className="flex-shrink-0 rounded px-1.5 py-0.5 text-[8px] truncate max-w-[100px]" style={{ background: conv.id === voice.sessionId ? 'rgba(34,211,238,0.15)' : 'rgba(255,255,255,0.03)', border: `1px solid ${conv.id === voice.sessionId ? 'rgba(34,211,238,0.4)' : 'rgba(255,255,255,0.06)'}`, color: conv.id === voice.sessionId ? 'var(--accent-cyan)' : 'var(--text-muted)' }}><MessageSquare size={7} className="inline mr-0.5" />{conv.title}</button>
                  ))}
                </div>
              )}
              <div ref={chatScrollRef} className="flex-1 overflow-y-auto px-1 py-1 space-y-1 min-h-0">
                {voice.conversation.length === 0 && <div className="h-full flex items-center justify-center text-center"><span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>Ask AXE Core anything</span></div>}
                {voice.conversation.map((m, i) => { const isUser = m.role === 'user'; return (<div key={i} className={`flex gap-1 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}><div className="mt-0.5 flex-shrink-0">{isUser ? <User size={10} style={{ color: 'var(--text-muted)' }} /> : <Bot size={10} style={{ color: 'var(--accent-cyan)' }} />}</div><div className="max-w-[85%] rounded px-2 py-1 text-[10px] leading-snug" style={{ background: isUser ? 'rgba(34,211,238,0.12)' : 'rgba(255,255,255,0.04)', color: isUser ? 'var(--text-primary)' : 'rgba(165,243,252,0.8)' }}>{m.text}</div></div>); })}
              </div>
              <div className="flex items-center gap-1 mt-1 pt-1 flex-shrink-0" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                <FileUploadButton attachments={attachments} onAttachmentsChange={setAttachments} />
                <button onClick={handleChatMic} className="flex-shrink-0 rounded-md p-1.5" style={{ background: chatIsListening ? 'var(--accent-cyan)' : 'rgba(255,255,255,0.05)', color: chatIsListening ? '#000' : 'var(--text-muted)' }}><Mic size={12} /></button>
                <input value={chatText} onChange={e => setChatText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void handleChatSend(); }} placeholder="Message AXE…" className="flex-1 min-w-0 text-[10px] px-2 py-1 rounded-md outline-none" style={{ background: 'var(--bg-base)', border: '1px solid var(--border-active)', color: 'var(--text-primary)' }} />
                <button onClick={handleChatSend} disabled={!chatText.trim() || chatIsBusy} className="flex-shrink-0 rounded-md p-1.5 disabled:opacity-40" style={{ background: 'var(--accent-cyan)', color: '#000' }}><Send size={12} /></button>
              </div>
            </div>
          </WidgetCard>
        </motion.div>
      </div>

      {/* CENTER */}
      <motion.div variants={iv} className="flex-1 flex flex-col min-h-0 min-w-0">
        <div className="relative flex-1 min-h-0 rounded-2xl overflow-hidden" style={{ backgroundColor: '#000000', border: '1px solid rgba(255,255,255,0.04)' }}>
          <div className="absolute top-4 left-4 flex items-center gap-2 z-10"><LiveIndicator size={6} /><span className="text-xs-custom font-mono-data" style={{ color: 'var(--accent-cyan)' }}>CORE ACTIVE</span></div>
          <div className="absolute top-4 right-4 z-10">
            <button onClick={() => setCoreView(prev => prev === 'axe' ? 'organization' : 'axe')} className="flex items-center gap-2 rounded-full px-3 py-1.5 text-[10px] font-medium" style={{ background: 'rgba(34,211,238,0.08)', border: '1px solid rgba(34,211,238,0.25)', color: 'var(--accent-cyan)' }}><Network size={11} />{coreView === 'axe' ? 'Architecture' : 'AXE Core'}</button>
          </div>
          <div className="absolute top-4 right-[9.5rem] text-xs-custom font-mono-data z-10" style={{ color: 'var(--text-muted)' }}>v5.0</div>
          <div className="absolute inset-0">
            <AnimatePresence mode="wait">
              {coreView === 'axe' ? (
                <motion.div key="axe" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.04 }} transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }} className="absolute inset-0"><HolographicSphere /></motion.div>
              ) : (
                <motion.div key="arch" initial={{ opacity: 0, scale: 1.04 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }} transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }} className="absolute inset-0"><OrganizationCanvas /></motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </motion.div>

      {/* RIGHT SIDEBAR — Original layout: Kimi Tools, Code Agent, Browser, Memory, LLM Status, Agent Chats */}
      <div className="flex flex-col gap-2 w-[210px] lg:w-[270px] flex-shrink-0 overflow-y-auto scrollable" style={{ maxHeight: '100%' }}>
        <motion.div variants={iv}><WidgetCard title="KIMI TOOLS" headerAction={<button onClick={() => navigate('/ai-core')} className="flex items-center gap-0.5 text-xs-custom" style={{ color: 'var(--accent-blue)' }}>All <ChevronRight size={11} /></button>}><KimiToolsPanel /></WidgetCard></motion.div>
        <motion.div variants={iv}><WidgetCard title="CODE AGENT"><CodeAgentPanel /></WidgetCard></motion.div>
        <motion.div variants={iv}><WidgetCard title="BROWSER"><BrowserPanel /></WidgetCard></motion.div>
        <motion.div variants={iv}><WidgetCard title="MEMORY"><MemoryPanel /></WidgetCard></motion.div>
        <motion.div variants={iv}>
          <WidgetCard title="LLM STATUS" headerAction={<span className="text-[10px]" style={{ color: connectedCount > 0 ? 'var(--success)' : 'var(--text-muted)' }}>{connectedCount}/{LLM_CATALOGUE.length} linked</span>}>
            <div className="space-y-0.5">
              {LLM_CATALOGUE.map(cat => {
                const conn = llmConns[cat.id]; const connected = !!conn; const isConnecting = connectingId === cat.id;
                return (<div key={cat.id}>
                  <div className="flex items-center justify-between py-1">
                    <div className="flex items-center gap-1.5"><span className="rounded-full flex-shrink-0" style={{ width: 5, height: 5, background: connected ? 'var(--success)' : 'var(--border-active)', display: 'inline-block' }} /><span className="text-xs-custom" style={{ color: 'var(--text-primary)' }}>{cat.name}</span><span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>{cat.model}</span></div>
                    <div className="flex items-center gap-1">
                      {connected && <button onClick={() => disconnectLLM(cat.id)} style={{ color: 'var(--text-muted)' }}><X size={10} /></button>}
                      {!connected && !isConnecting && <button onClick={() => openConnect(cat.id)} className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-active)', color: 'var(--accent-cyan)' }}>Connect</button>}
                      <a href={cat.docsUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--text-muted)' }}><ExternalLink size={9} /></a>
                    </div>
                  </div>
                  <AnimatePresence>
                    {isConnecting && (
                      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                        <div className="flex flex-col gap-1.5 pb-2 pl-3">
                          {cat.needsKey && <input autoFocus type="password" value={keyInput} onChange={e => setKeyInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') saveLLM(cat.id); if (e.key === 'Escape') setConnectingId(null); }} placeholder="Paste API key..." className="w-full text-[10px] px-2 py-1 rounded" style={{ background: 'var(--bg-base)', border: '1px solid var(--border-active)', color: 'var(--text-primary)' }} />}
                          {!cat.needsKey && <input autoFocus value={urlInput} onChange={e => setUrlInput(e.target.value)} placeholder={cat.baseUrlDefault} className="w-full text-[10px] px-2 py-1 rounded" style={{ background: 'var(--bg-base)', border: '1px solid var(--border-active)', color: 'var(--text-primary)' }} />}
                          <div className="flex gap-1"><button onClick={() => saveLLM(cat.id)} className="flex-1 text-[10px] py-0.5 rounded font-medium flex items-center justify-center gap-1" style={{ background: 'var(--accent-cyan)', color: '#000' }}><Check size={10} /> Save</button><button onClick={() => setConnectingId(null)} className="px-2 py-0.5 rounded" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}><X size={10} /></button></div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>);
              })}
            </div>
          </WidgetCard>
        </motion.div>
        <motion.div variants={iv}>
          <WidgetCard title="CONNECTED MODELS" headerAction={<span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{connectedCount} active</span>}>
            {connectedCount === 0 ? <div className="flex flex-col items-center gap-1.5 py-2"><Bot size={18} style={{ color: 'var(--text-muted)', opacity: 0.35 }} /><span className="text-[10px] text-center" style={{ color: 'var(--text-muted)' }}>Add API keys to see connected models</span></div> : <div className="space-y-1.5">{Object.entries(llmConns).map(([id]) => { const cat = LLM_CATALOGUE.find(c => c.id === id); if (!cat) return null; return (<div key={id} className="flex items-center gap-2"><span className="text-xs-custom flex-1 truncate" style={{ color: 'var(--text-primary)' }}>{cat.name} &middot; {cat.model}</span><span className="rounded-full" style={{ width: 5, height: 5, background: 'var(--success)', display: 'inline-block' }} /></div>); })}</div>}
          </WidgetCard>
        </motion.div>
        {/* Agent Chat Hub — NEW, at the bottom */}
        <motion.div variants={iv} className="flex-shrink-0" style={{ height: 260 }}>
          <WidgetCard title="AGENT CHATS" noPadding>
            <AgentChatHub />
          </WidgetCard>
        </motion.div>
      </div>
    </motion.div>
  );
}