import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronRight, Plus, Check, X, ExternalLink, Clock, Cpu,
  Activity, Mic, Zap, Network, Send, User, Bot, MessageSquare,
  RotateCcw, Menu, X as XIcon, Key, RefreshCw, AlertCircle,
} from 'lucide-react';
import { useNavigate } from 'react-router';
import { HolographicSphere } from '@/components/axe-core/HolographicSphere';
import { ArchitectureRedesign, type ArchCard, ACCENTS } from '@/components/axe-core/ArchitectureRedesign';
import { OrganizationCanvas } from '@/components/axe-core/OrganizationCanvas';
import { BrowserPanel } from '@/components/axe-core/BrowserPanel';
import { AgentChatHub } from '@/components/axe-core/AgentChatHub';
import { WidgetCard } from '@/components/widgets/WidgetCard';
import { LiveIndicator } from '@/components/shared/LiveIndicator';
import { useUIStore } from '@/store/uiStore';
import { useVoiceStore } from '@/store/voiceStore';
import { loadSetting, saveSetting } from '@/services/userSettingsService';
import { loadAxeOrganization, type OrganizationNode } from '@/services/systemRegistryService';
import { normalizeProviderBaseUrl } from '@/services/providerConnectionDefaults';
import { useIsMobile } from '@/hooks/use-mobile';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { ChatToolbar, type ChatMode } from '@/components/axe-core/ChatToolbar';
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
  const [mobileLeftOpen, setMobileLeftOpen] = useState(false);
  const [mobileRightOpen, setMobileRightOpen] = useState(false);
  const [chatMode, setChatMode] = useState<ChatMode>('default');
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);

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
    const modePrefixes: Record<ChatMode, string> = { default: '', kimiclaw: '[SEARCH] ', kimicode: '[CODE] ', kimiwork: '[ANALYZE] ' };
    await voice.sendMessage(modePrefixes[chatMode] + t);
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

  /* ── MOBILE: Left Drawer ── */
  const MobileLeftDrawer = () => (
    <AnimatePresence>
      {mobileLeftOpen && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[110]" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={() => setMobileLeftOpen(false)} />
          <motion.div initial={{ x: -280 }} animate={{ x: 0 }} exit={{ x: -280 }} transition={{ type: 'spring', damping: 28, stiffness: 280 }} className="fixed top-0 left-0 bottom-0 z-[111] w-[280px] overflow-y-auto p-3 space-y-2" style={{ backgroundColor: '#0a0a0a', borderRight: '1px solid rgba(255,255,255,0.08)' }}>
            <button onClick={() => setMobileLeftOpen(false)} className="absolute top-3 right-3 p-1 rounded z-10" style={{ color: 'var(--text-muted)' }}><XIcon size={18} /></button>
            <div className="mt-8 space-y-2">{aiCoreWidget}{timelineWidget}<WidgetCard title="AI CORE LOGS"><AICoreLogs /></WidgetCard></div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );

  /* ── MOBILE: Right Drawer ── */
  const MobileRightDrawer = () => (
    <AnimatePresence>
      {mobileRightOpen && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[110]" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={() => setMobileRightOpen(false)} />
          <motion.div initial={{ x: 280 }} animate={{ x: 0 }} exit={{ x: 280 }} transition={{ type: 'spring', damping: 28, stiffness: 280 }} className="fixed top-0 right-0 bottom-0 z-[111] w-[280px] overflow-y-auto p-3 space-y-2" style={{ backgroundColor: '#0a0a0a', borderLeft: '1px solid rgba(255,255,255,0.08)' }}>
            <button onClick={() => setMobileRightOpen(false)} className="absolute top-3 right-3 p-1 rounded z-10" style={{ color: 'var(--text-muted)' }}><XIcon size={18} /></button>
            <div className="mt-8 space-y-2">
              <WidgetCard title="AGENT CHATS" noPadding style={{ height: '45vh' }}><AgentChatHub /></WidgetCard>
              <WidgetCard title="BROWSER"><BrowserPanel /></WidgetCard>
              <WidgetCard title="LLM STATUS"><div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{connectedCount} models connected</div></WidgetCard>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );

  /* ════════════════════════════════════════════════════════════════════════
     MOBILE LAYOUT
     ════════════════════════════════════════════════════════════════════════ */
  if (isMobile) {
    return (
      <motion.div className="flex flex-col h-full overflow-hidden relative" variants={cv} initial="hidden" animate="visible">
        <MobileLeftDrawer />
        <MobileRightDrawer />

        {/* Left Handle */}
        <button onClick={() => setMobileLeftOpen(true)} className="absolute left-0 top-[26vh] z-[60] flex items-center justify-center" style={{ width: 18, height: 50, background: 'rgba(34,211,238,0.08)', border: '1px solid rgba(34,211,238,0.2)', borderLeft: 'none', borderRadius: '0 8px 8px 0' }}><ChevronRight size={12} style={{ color: 'var(--accent-cyan)' }} /></button>
        {/* Right Handle */}
        <button onClick={() => setMobileRightOpen(true)} className="absolute right-0 top-[26vh] z-[60] flex items-center justify-center" style={{ width: 18, height: 50, background: 'rgba(34,211,238,0.08)', border: '1px solid rgba(34,211,238,0.2)', borderRight: 'none', borderRadius: '8px 0 0 8px' }}><ChevronRight size={12} style={{ color: 'var(--accent-cyan)', transform: 'rotate(180deg)' }} /></button>

        {/* 3D Sphere — smaller on mobile so chat has more room */}
        <motion.div variants={iv} className="relative flex-shrink-0" style={{ height: '35vh', minHeight: 140 }}>
          <div className="absolute inset-0 rounded-2xl overflow-hidden" style={{ backgroundColor: '#000', border: '1px solid rgba(255,255,255,0.04)' }}>
            <div className="absolute top-3 left-3 flex items-center gap-2 z-10"><LiveIndicator size={6} /><span className="text-xs-custom font-mono-data" style={{ color: 'var(--accent-cyan)' }}>CORE ACTIVE</span></div>
            <div className="absolute top-3 right-3 z-10 flex items-center gap-2">
              <button onClick={() => setMobileRightOpen(true)} className="flex items-center gap-1 rounded-full px-2 py-1 text-[9px]" style={{ background: 'rgba(34,211,238,0.08)', border: '1px solid rgba(34,211,238,0.25)', color: 'var(--accent-cyan)' }}><Menu size={10} /> Tools</button>
              <button onClick={() => setCoreView(prev => prev === 'axe' ? 'organization' : 'axe')} className="flex items-center gap-1 rounded-full px-2 py-1 text-[9px] font-medium" style={{ background: 'rgba(34,211,238,0.08)', border: '1px solid rgba(34,211,238,0.25)', color: 'var(--accent-cyan)' }}><Network size={10} />{coreView === 'axe' ? 'Arch' : 'AXE'}</button>
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

        {/* Chat — LARGER on mobile, takes remaining space */}
        <motion.div variants={iv} className="flex-shrink-0 mt-2 flex-1" style={{ minHeight: 200 }}>
          <div className="h-full flex flex-col rounded-xl overflow-hidden" style={{ background: 'var(--bg-surface)', border: '1px solid rgba(255,255,255,0.06)' }}>
            {/* Chat header */}
            <div className="flex items-center justify-between px-2 py-1 flex-shrink-0" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              <span className="text-[10px] font-medium" style={{ color: 'var(--accent-cyan)' }}>AXE CORE CHAT</span>
              <button onClick={() => voice.startNewConversation()} className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px]" style={{ background: 'rgba(34,211,238,0.1)', border: '1px solid rgba(34,211,238,0.25)', color: 'var(--accent-cyan)' }}><Plus size={9} /> New</button>
            </div>
            {/* Toolbar */}
            <div className="px-2 pt-1 flex-shrink-0"><ChatToolbar mode={chatMode} onModeChange={setChatMode} /></div>
            {/* Messages */}
            <div ref={chatScrollRef} className="flex-1 overflow-y-auto px-2 py-1 space-y-1 min-h-0">
              {voice.conversation.length === 0 && <div className="h-full flex items-center justify-center text-center"><span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>Ask AXE Core anything</span></div>}
              {voice.conversation.map((m, i) => {
                const isUser = m.role === 'user';
                return (<div key={i} className={`flex gap-1 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}><div className="mt-0.5 flex-shrink-0">{isUser ? <User size={10} style={{ color: 'var(--text-muted)' }} /> : <Bot size={10} style={{ color: 'var(--accent-cyan)' }} />}</div><div className="max-w-[85%] rounded px-2 py-1 text-[10px] leading-snug" style={{ background: isUser ? 'rgba(34,211,238,0.12)' : 'rgba(255,255,255,0.04)', color: isUser ? 'var(--text-primary)' : 'rgba(165,243,252,0.8)' }}>{m.text}</div></div>);
              })}
            </div>
            {/* Composer — ALTIJD ZICHTBAAR */}
            <div className="flex items-center gap-1 px-2 py-1.5 flex-shrink-0" style={{ borderTop: '1px solid var(--border-subtle)' }}>
              <FileUploadButton attachments={attachments} onAttachmentsChange={setAttachments} />
              <button onClick={handleChatMic} className="flex-shrink-0 rounded-md p-1.5" style={{ background: chatIsListening ? 'var(--accent-cyan)' : 'rgba(255,255,255,0.05)', color: chatIsListening ? '#000' : 'var(--text-muted)' }}><Mic size={13} /></button>
              <input value={chatText} onChange={e => setChatText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void handleChatSend(); }} placeholder="Message AXE…" className="flex-1 min-w-0 text-[11px] px-2 py-1.5 rounded-md outline-none" style={{ background: 'var(--bg-base)', border: '1px solid var(--border-active)', color: 'var(--text-primary)' }} />
              <button onClick={handleChatSend} disabled={!chatText.trim() || chatIsBusy} className="flex-shrink-0 rounded-md p-1.5 disabled:opacity-40" style={{ background: 'var(--accent-cyan)', color: '#000' }}><Send size={13} /></button>
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
      {/* LEFT SIDEBAR — Chat takes priority, other widgets compact */}
      <div className="w-[280px] flex-shrink-0 flex flex-col gap-2 overflow-y-auto" style={{ maxHeight: 'calc(100dvh - 48px - 88px)' }}>
        {/* Compact system status */}
        <motion.div variants={iv} className="flex-shrink-0">
          <WidgetCard title="AI CORE SYSTEM" headerAction={<span className="text-[9px] font-mono-data" style={{ color: connectedCount > 0 ? 'var(--success)' : 'var(--text-muted)' }}>{connectedCount} LLMs</span>}>
            <div className="flex items-center gap-3">
              {[{ label: 'Status', val: 'Online', ok: true }, { label: 'Voice', val: 'Piper', ok: true }, { label: 'Memory', val: supaConnected ? 'Linked' : '—', ok: supaConnected }].map(({ label, val, ok }) => (
                <div key={label} className="flex items-center gap-1"><span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>{label}</span><span className="text-[9px] font-mono-data" style={{ color: ok ? 'var(--text-primary)' : 'var(--text-muted)' }}>{val}</span></div>
              ))}
            </div>
          </WidgetCard>
        </motion.div>

        {/* Compact timeline */}
        <motion.div variants={iv} className="flex-shrink-0">
          <WidgetCard title="MISSION TIMELINE" headerAction={
            <button onClick={() => setAddingEvent(v => !v)} style={{ color: 'var(--accent-blue)', fontSize: '0.65rem', display: 'flex', alignItems: 'center', gap: 2 }}><Plus size={11} /> Add</button>
          }>
            <AnimatePresence>
              {addingEvent && (
                <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="flex gap-1.5 mb-2">
                  <input ref={addEventRef} value={newEvent} onChange={e => setNewEvent(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addEvent(); if (e.key === 'Escape') setAddingEvent(false); }} placeholder="Event..." className="flex-1 text-[10px] px-2 py-1 rounded" style={{ background: 'var(--bg-base)', border: '1px solid var(--border-active)', color: 'var(--text-primary)' }} />
                  <button onClick={addEvent} className="px-1.5 py-1 rounded" style={{ background: 'var(--accent-cyan)', color: '#000' }}><Check size={11} /></button>
                </motion.div>
              )}
            </AnimatePresence>
            {timeline.length === 0 ? (
              <div className="flex items-center gap-1 py-1"><Clock size={12} style={{ color: 'var(--text-muted)', opacity: 0.35 }} /><span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>No events</span></div>
            ) : (
              <div className="space-y-0.5 max-h-20 overflow-y-auto">
                {timeline.slice(-3).map(ev => (
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
        </motion.div>

        {/* Chat — LARGE, takes remaining space */}
        <motion.div variants={iv} className="flex-1 min-h-0">
          <WidgetCard title="AXE CORE CHAT" headerAction={
            <div className="flex items-center gap-1.5">
              <button onClick={() => voice.startNewConversation()} className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px]" style={{ background: 'rgba(34,211,238,0.1)', border: '1px solid rgba(34,211,238,0.25)', color: 'var(--accent-cyan)' }}><Plus size={9} /> New</button>
              <button onClick={() => voice.loadAllConversations()} className="p-0.5 rounded" style={{ color: 'var(--text-muted)' }}><RotateCcw size={9} /></button>
            </div>
          }>
            <div className="flex flex-col h-full" style={{ minHeight: 300 }}>
              <ChatToolbar mode={chatMode} onModeChange={setChatMode} />
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
        <div className="relative flex-1 min-h-0 rounded-2xl overflow-hidden" style={{ backgroundColor: '#000', border: '1px solid rgba(255,255,255,0.04)' }}>
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

      {/* RIGHT SIDEBAR — Agent Chats + Quick Status */}
      <div className="flex flex-col gap-2 w-[280px] flex-shrink-0 overflow-y-auto" style={{ maxHeight: 'calc(100dvh - 48px - 88px)' }}>
        {/* Agent Chat Hub — main feature */}
        <motion.div variants={iv} className="flex-shrink-0" style={{ height: '55%' }}>
          <WidgetCard title="AGENT CHATS" noPadding>
            <AgentChatHub />
          </WidgetCard>
        </motion.div>

        {/* Browser — quick access */}
        <motion.div variants={iv} className="flex-shrink-0">
          <WidgetCard title="BROWSER"><BrowserPanel /></WidgetCard>
        </motion.div>

        {/* Compact LLM Status */}
        <motion.div variants={iv} className="flex-shrink-0">
          <WidgetCard title="LLM STATUS" headerAction={<span className="text-[9px]" style={{ color: connectedCount > 0 ? 'var(--success)' : 'var(--text-muted)' }}>{connectedCount} linked</span>}>
            <div className="flex flex-wrap gap-1">
              {LLM_CATALOGUE.map(cat => {
                const connected = !!llmConns[cat.id];
                return (
                  <span key={cat.id} className="text-[8px] px-1.5 py-0.5 rounded-full" style={{ background: connected ? 'rgba(16,185,129,0.1)' : 'rgba(255,255,255,0.03)', border: `1px solid ${connected ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.06)'}`, color: connected ? '#10B981' : 'rgba(255,255,255,0.3)' }}>
                    {cat.name}
                  </span>
                );
              })}
            </div>
          </WidgetCard>
        </motion.div>
      </div>
    </motion.div>
  );
}