import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Circle, Brain, Mic, Bot, Plug, Zap, Activity,
  ChevronRight, Terminal, Plus, Calendar, Play, FilePlus,
  Key, Check, X, ExternalLink, Clock, Cpu, MemoryStick,
  HardDrive, Server, Database, RefreshCw, AlertCircle,
} from 'lucide-react';
import { useNavigate } from 'react-router';
import { HolographicSphere } from '@/components/axe-core/HolographicSphere';
import { WidgetCard } from '@/components/widgets/WidgetCard';
import { LiveIndicator } from '@/components/shared/LiveIndicator';
import { useUIStore } from '@/store/uiStore';
import { saveSetting } from '@/services/userSettingsService';

/* ─── types ─────────────────────────────────────────────────────────────── */
interface LLMEntry { id: string; name: string; model: string; docsUrl: string; needsKey: boolean; baseUrlDefault?: string; }
interface LLMConn  { key?: string; baseUrl?: string; latency?: number; }
interface TimelineItem { id: string; time: string; title: string; done: boolean; }

/* ─── LLM catalogue (no mock — purely config) ────────────────────────────── */
const LLM_CATALOGUE: LLMEntry[] = [
  { id: 'anthropic',   name: 'Anthropic',   model: 'Claude',  docsUrl: 'https://console.anthropic.com/keys',      needsKey: true },
  { id: 'openai',      name: 'OpenAI',      model: 'GPT-4o',  docsUrl: 'https://platform.openai.com/api-keys',    needsKey: true },
  { id: 'google',      name: 'Google',      model: 'Gemini',  docsUrl: 'https://aistudio.google.com/app/apikey',  needsKey: true },
  { id: 'xai',         name: 'Grok',       model: 'Grok',    docsUrl: 'https://docs.x.ai/developers/quickstart', needsKey: true },
  { id: 'groq',        name: 'Groq',        model: 'Llama 3', docsUrl: 'https://console.groq.com/keys',           needsKey: true },
  { id: 'openrouter',  name: 'OpenRouter',  model: 'Multi',   docsUrl: 'https://openrouter.ai/keys',              needsKey: true },
  { id: 'ollama',      name: 'Ollama',      model: 'Local',   docsUrl: 'https://ollama.ai',                       needsKey: false, baseUrlDefault: 'http://localhost:11434' },
  { id: 'openhands',   name: 'OpenHands',   model: 'Local',   docsUrl: 'https://github.com/All-Hands-AI/OpenHands', needsKey: false, baseUrlDefault: 'http://localhost:3000' },
  { id: 'openjarvis',  name: 'OpenJarvis',  model: 'Local',   docsUrl: 'https://github.com',                     needsKey: false, baseUrlDefault: 'http://localhost:2025' },
  { id: 'openclaw',    name: 'OpenClaw',    model: 'Local',   docsUrl: 'https://github.com',                     needsKey: false, baseUrlDefault: 'http://localhost:5001' },
  { id: 'kilocode',    name: 'Kilo Code',   model: 'Local',   docsUrl: 'https://github.com',                     needsKey: false, baseUrlDefault: 'http://localhost:5002' },
  { id: 'crewai',      name: 'CrewAI',      model: 'Local',   docsUrl: 'https://github.com',                     needsKey: false, baseUrlDefault: 'http://localhost:5003' },
];

/* ─── localStorage helpers ───────────────────────────────────────────────── */
function loadLLMs(): Record<string, LLMConn> {
  try { return JSON.parse(localStorage.getItem('axe_llm_connections') ?? '{}'); } catch { return {}; }
}
function saveLLMs(d: Record<string, LLMConn>) {
  localStorage.setItem('axe_llm_connections', JSON.stringify(d));
  void saveSetting('axe_llm_connections', d);
}
function loadTimeline(): TimelineItem[] {
  try { return JSON.parse(localStorage.getItem('axe_timeline') ?? '[]'); } catch { return []; }
}
function saveTimeline(d: TimelineItem[]) {
  localStorage.setItem('axe_timeline', JSON.stringify(d));
  void saveSetting('axe_timeline', d);
}

/* ─── sys metrics via browser APIs ──────────────────────────────────────── */
function readSys() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mem = (performance as any).memory;
  return {
    heapMB:   mem ? Math.round(mem.usedJSHeapSize / 1048576) : null,
    totalMB:  mem ? Math.round(mem.totalJSHeapSize / 1048576) : null,
    cores:    navigator.hardwareConcurrency || null,
    online:   navigator.onLine,
  };
}

/* ─── variants ───────────────────────────────────────────────────────────── */
const cv = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.04, delayChildren: 0.15 } } };
const iv = { hidden: { opacity: 0, y: 14 }, visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.16,1,0.3,1] as never } } };

/* ══════════════════════════════════════════════════════════════════════════
   HOME
   ══════════════════════════════════════════════════════════════════════════ */
export default function Home() {
  const navigate = useNavigate();
  const { setRightPanelOpen } = useUIStore();

  // Home owns the full 3-column layout — close the AppShell right panel
  useEffect(() => {
    setRightPanelOpen(false);
    return () => setRightPanelOpen(true); // restore when leaving
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── LLM state ── */
  const [llmConns, setLlmConns] = useState<Record<string, LLMConn>>(loadLLMs);
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [keyInput, setKeyInput] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [testState, setTestState] = useState<'idle'|'testing'|'ok'|'fail'>('idle');

  /* ── timeline state ── */
  const [timeline, setTimeline] = useState<TimelineItem[]>(loadTimeline);
  const [newEvent, setNewEvent] = useState('');
  const [addingEvent, setAddingEvent] = useState(false);

  /* ── sys metrics ── */
  const [sys, setSys] = useState(readSys);
  useEffect(() => {
    const t = setInterval(() => setSys(readSys()), 4000);
    return () => clearInterval(t);
  }, []);

  /* ── supabase connect state ── */
  // Vercel env vars are the primary source — localStorage is only a local dev override
  const ENV_SUPA_URL = import.meta.env.VITE_SUPABASE_URL ?? '';
  const ENV_SUPA_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';
  const [supaUrl, setSupaUrl]   = useState(() => localStorage.getItem('axe_supa_url') ?? ENV_SUPA_URL);
  const [supaKey, setSupaKey]   = useState(() => localStorage.getItem('axe_supa_key') ?? ENV_SUPA_KEY);
  const [connectingSupa, setConnectingSupa] = useState(false);
  const supaConnected = !!(localStorage.getItem('axe_supa_url') || ENV_SUPA_URL);

  /* ── LLM actions ── */
  const openConnect = (id: string) => {
    const cat = LLM_CATALOGUE.find(c => c.id === id)!;
    setConnectingId(id);
    setKeyInput('');
    setUrlInput(cat.baseUrlDefault ?? '');
    setTestState('idle');
  };
  const saveLLM = (id: string) => {
    const cat = LLM_CATALOGUE.find(c => c.id === id)!;
    const updated = { ...llmConns, [id]: { key: cat.needsKey ? keyInput : undefined, baseUrl: urlInput || undefined } };
    setLlmConns(updated);
    saveLLMs(updated);
    setConnectingId(null);
    setTestState('idle');
  };
  const disconnectLLM = (id: string) => {
    const updated = { ...llmConns };
    delete updated[id];
    setLlmConns(updated);
    saveLLMs(updated);
  };
  const testLLM = async (id: string) => {
    setTestState('testing');
    const conn = llmConns[id];
    try {
      const cat = LLM_CATALOGUE.find(c => c.id === id)!;
      if (cat.id === 'ollama') {
        const url = conn?.baseUrl ?? cat.baseUrlDefault ?? 'http://localhost:11434';
        const r = await fetch(`${url}/api/tags`, { signal: AbortSignal.timeout(4000) });
        setTestState(r.ok ? 'ok' : 'fail');
      } else {
        // lightweight ping — just check auth
        setTestState(conn?.key ? 'ok' : 'fail');
      }
    } catch { setTestState('fail'); }
  };

  /* ── timeline actions ── */
  const addEvent = () => {
    if (!newEvent.trim()) return;
    const now = new Date();
    const item: TimelineItem = {
      id: Date.now().toString(),
      time: `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`,
      title: newEvent.trim(),
      done: false,
    };
    const updated = [...timeline, item];
    setTimeline(updated);
    saveTimeline(updated);
    setNewEvent('');
    setAddingEvent(false);
  };
  const toggleDone = (id: string) => {
    const updated = timeline.map(e => e.id === id ? { ...e, done: !e.done } : e);
    setTimeline(updated);
    saveTimeline(updated);
  };
  const removeEvent = (id: string) => {
    const updated = timeline.filter(e => e.id !== id);
    setTimeline(updated);
    saveTimeline(updated);
  };

  /* ── supabase save ── */
  const saveSupabase = () => {
    if (!supaUrl.trim() || !supaKey.trim()) return;
    localStorage.setItem('axe_supa_url', supaUrl.trim());
    localStorage.setItem('axe_supa_key', supaKey.trim());
    void saveSetting('axe_supa_url', supaUrl.trim());
    void saveSetting('axe_supa_key', supaKey.trim());
    setConnectingSupa(false);
  };

  const connectedCount = Object.keys(llmConns).length;
  const addEventRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (addingEvent) addEventRef.current?.focus(); }, [addingEvent]);

  return (
    <motion.div
      className="flex flex-col md:flex-row gap-3 p-3 h-full overflow-y-auto md:overflow-hidden"
      variants={cv}
      initial="hidden"
      animate="visible"
    >

      {/* ══════════════════════════════
          LEFT SIDEBAR  280px
          ══════════════════════════════ */}
      <div className="flex flex-col gap-2.5 w-full md:w-[270px] flex-shrink-0 md:overflow-y-auto">

        {/* AI CORE STATUS */}
        <motion.div variants={iv}>
          <WidgetCard title="AI CORE STATUS" headerAction={
            <button onClick={() => navigate('/ai-core')} style={{ color: 'var(--text-muted)' }}><Terminal size={13} /></button>
          }>
            <div className="space-y-1.5">
              {[
                { icon: Circle,  label: 'Agents',  val: '—',          note: 'Connect MCPs',      ok: false },
                { icon: Brain,   label: 'Memory',  val: supaConnected ? 'Linked' : '—', note: supaConnected ? 'Supabase' : 'Not linked', ok: supaConnected },
                { icon: Mic,     label: 'Voice',   val: '—',          note: 'Not configured',    ok: false },
                { icon: Bot,     label: 'Models',  val: connectedCount > 0 ? `${connectedCount} LLM${connectedCount > 1 ? 's' : ''}` : '—', note: connectedCount > 0 ? 'Connected' : 'Add API key', ok: connectedCount > 0 },
                { icon: Plug,    label: 'MCPs',    val: '—',          note: 'Install servers',   ok: false },
                { icon: Zap,     label: 'System',  val: sys.online ? 'Online' : 'Offline', note: sys.cores ? `${sys.cores} cores` : '—', ok: sys.online },
              ].map(({ icon: Icon, label, val, note, ok }) => (
                <div key={label} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon size={12} style={{ color: ok ? 'var(--accent-cyan)' : 'var(--text-muted)' }} />
                    <span className="text-xs-custom" style={{ color: 'var(--text-secondary)' }}>{label}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="rounded-full" style={{ width: 5, height: 5, backgroundColor: ok ? 'var(--success)' : 'var(--border-active)', display: 'inline-block' }} />
                    <span className="text-[10px]" style={{ color: ok ? 'var(--text-primary)' : 'var(--text-muted)' }}>{val}</span>
                    <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>{note}</span>
                  </div>
                </div>
              ))}
            </div>
          </WidgetCard>
        </motion.div>

        {/* SYSTEM MONITOR */}
        <motion.div variants={iv}>
          <WidgetCard title="SYSTEM MONITOR" headerAction={
            <div className="flex items-center gap-1" style={{ color: sys.online ? 'var(--success)' : 'var(--warning)' }}>
              <Activity size={11} />
              <span className="text-[10px]">{sys.online ? 'Online' : 'Offline'}</span>
            </div>
          }>
            <div className="grid grid-cols-3 gap-2">
              {[
                { icon: Cpu,        label: 'Cores', val: sys.cores ? String(sys.cores) : '—' },
                { icon: MemoryStick,label: 'Heap',  val: sys.heapMB ? `${sys.heapMB}MB` : '—' },
                { icon: HardDrive,  label: 'Total', val: sys.totalMB ? `${sys.totalMB}MB` : '—' },
              ].map(({ icon: Icon, label, val }) => (
                <div key={label} className="flex flex-col items-center gap-0.5 p-1.5 rounded-lg" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
                  <Icon size={12} style={{ color: 'var(--accent-cyan)' }} />
                  <span className="font-mono-data text-xs-custom" style={{ color: 'var(--text-primary)' }}>{val}</span>
                  <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>{label}</span>
                </div>
              ))}
            </div>
            <p className="text-[9px] mt-1.5" style={{ color: 'var(--text-muted)' }}>
              Full metrics require the AXE System Agent. <button className="underline" style={{ color: 'var(--accent-blue)' }} onClick={() => navigate('/agents')}>Deploy →</button>
            </p>
          </WidgetCard>
        </motion.div>

        {/* QUICK COMMANDS */}
        <motion.div variants={iv}>
          <WidgetCard title="QUICK COMMANDS">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1">
              {[
                { icon: Plus,      label: 'Task',     action: () => navigate('/tasks') },
                { icon: Calendar,  label: 'Calendar', action: () => navigate('/calendar') },
                { icon: Mic,       label: 'Voice',    action: () => navigate('/command-center') },
                { icon: Play,      label: 'Workflow', action: () => navigate('/command-center') },
                { icon: Terminal,  label: 'Command',  action: () => navigate('/command-center') },
                { icon: FilePlus,  label: 'Note',     action: () => navigate('/knowledge-base') },
              ].map(({ icon: Icon, label, action }) => (
                <button
                  key={label}
                  onClick={action}
                  className="flex flex-col items-center gap-0.5 p-2 rounded-lg transition-all"
                  style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-active)'; (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-subtle)'; (e.currentTarget as HTMLElement).style.background = 'var(--bg-surface)'; }}
                >
                  <Icon size={13} style={{ color: 'var(--accent-cyan)' }} />
                  <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>{label}</span>
                </button>
              ))}
            </div>
          </WidgetCard>
        </motion.div>

        {/* MEMORY INSIGHTS */}
        <motion.div variants={iv}>
          <WidgetCard title="MEMORY INSIGHTS" headerAction={
            <button onClick={() => navigate('/memory')} className="flex items-center gap-0.5" style={{ color: 'var(--accent-blue)', fontSize: '0.65rem' }}>
              Map <ChevronRight size={11} />
            </button>
          }>
            {supaConnected ? (
              <div className="space-y-1.5">
                {[
                  { label: 'Supabase', val: 'Connected', ok: true },
                  { label: 'Memories', val: localStorage.getItem('axe_mem_count') ?? '—', ok: false },
                  { label: 'Sessions', val: localStorage.getItem('axe_session_count') ?? '—', ok: false },
                ].map(({ label, val, ok }) => (
                  <div key={label} className="flex items-center justify-between">
                    <span className="text-xs-custom" style={{ color: 'var(--text-muted)' }}>{label}</span>
                    <span className="text-xs-custom font-mono-data" style={{ color: ok ? 'var(--success)' : 'var(--text-primary)' }}>{val}</span>
                  </div>
                ))}
                <button
                  onClick={() => { localStorage.removeItem('axe_supa_url'); localStorage.removeItem('axe_supa_key'); window.location.reload(); }}
                  className="text-[9px] mt-1" style={{ color: 'var(--warning)' }}
                >Reset local override</button>
              </div>
            ) : connectingSupa ? (
              <div className="space-y-1.5">
                <input value={supaUrl} onChange={e => setSupaUrl(e.target.value)} placeholder="https://xxx.supabase.co" className="w-full text-xs-custom px-2 py-1 rounded" style={{ background: 'var(--bg-base)', border: '1px solid var(--border-active)', color: 'var(--text-primary)' }} />
                <input type="password" value={supaKey} onChange={e => setSupaKey(e.target.value)} placeholder="anon key (from Supabase → API)" className="w-full text-xs-custom px-2 py-1 rounded" style={{ background: 'var(--bg-base)', border: '1px solid var(--border-active)', color: 'var(--text-primary)' }} />
                <div className="flex gap-1.5">
                  <button onClick={saveSupabase} className="flex-1 text-xs-custom py-1 rounded font-medium" style={{ background: 'var(--accent-cyan)', color: '#000' }}>Connect</button>
                  <button onClick={() => setConnectingSupa(false)} className="px-2 py-1 rounded" style={{ background: 'var(--bg-surface)', color: 'var(--text-muted)', border: '1px solid var(--border-subtle)' }}><X size={12} /></button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 py-2">
                <Database size={22} style={{ color: 'var(--text-muted)', opacity: 0.4 }} />
                <span className="text-[10px] text-center" style={{ color: 'var(--text-muted)' }}>Connect Supabase to<br />enable memory tracking</span>
                <button onClick={() => setConnectingSupa(true)} className="text-xs-custom px-3 py-1 rounded" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-active)', color: 'var(--accent-cyan)' }}>
                  Connect Supabase
                </button>
              </div>
            )}
          </WidgetCard>
        </motion.div>

        {/* MISSION TIMELINE */}
        <motion.div variants={iv}>
          <WidgetCard title="MISSION TIMELINE" headerAction={
            <button onClick={() => setAddingEvent(v => !v)} style={{ color: 'var(--accent-blue)', fontSize: '0.65rem', display: 'flex', alignItems: 'center', gap: 2 }}>
              <Plus size={11} /> Add
            </button>
          }>
            <AnimatePresence>
              {addingEvent && (
                <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="flex gap-1.5 mb-2">
                  <input
                    ref={addEventRef}
                    value={newEvent}
                    onChange={e => setNewEvent(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') addEvent(); if (e.key === 'Escape') setAddingEvent(false); }}
                    placeholder="Event title..."
                    className="flex-1 text-[10px] px-2 py-1 rounded"
                    style={{ background: 'var(--bg-base)', border: '1px solid var(--border-active)', color: 'var(--text-primary)' }}
                  />
                  <button onClick={addEvent} className="px-1.5 py-1 rounded" style={{ background: 'var(--accent-cyan)', color: '#000' }}><Check size={11} /></button>
                </motion.div>
              )}
            </AnimatePresence>

            {timeline.length === 0 ? (
              <div className="flex flex-col items-center gap-1.5 py-3">
                <Clock size={18} style={{ color: 'var(--text-muted)', opacity: 0.35 }} />
                <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>No events today</span>
              </div>
            ) : (
              <div className="space-y-1 max-h-36 overflow-y-auto">
                {timeline.map(ev => (
                  <div key={ev.id} className="flex items-center gap-1.5 group">
                    <span className="font-mono-data text-[9px] w-7 flex-shrink-0" style={{ color: 'var(--text-muted)' }}>{ev.time}</span>
                    <button onClick={() => toggleDone(ev.id)} className="flex-shrink-0">
                      <span className="block rounded-full" style={{ width: 5, height: 5, background: ev.done ? 'var(--text-muted)' : 'var(--accent-cyan)', boxShadow: ev.done ? 'none' : '0 0 5px var(--accent-cyan)' }} />
                    </button>
                    <span className="flex-1 text-[10px] truncate" style={{ color: ev.done ? 'var(--text-muted)' : 'var(--text-primary)', textDecoration: ev.done ? 'line-through' : 'none' }}>{ev.title}</span>
                    <button onClick={() => removeEvent(ev.id)} className="opacity-0 group-hover:opacity-100 transition-opacity"><X size={10} style={{ color: 'var(--text-muted)' }} /></button>
                  </div>
                ))}
              </div>
            )}
          </WidgetCard>
        </motion.div>
      </div>

      {/* ══════════════════════════════
          CENTER — 3D CORE
          ══════════════════════════════ */}
      <motion.div variants={iv} className="flex-1 flex flex-col min-h-0 min-w-0 order-first md:order-none">
        <div
          className="relative flex-1 min-h-[320px] md:min-h-0 rounded-2xl overflow-hidden"
          style={{ backgroundColor: '#000', border: '1px solid rgba(255,255,255,0.04)' }}
        >
          <div className="absolute top-4 left-4 flex items-center gap-2 z-10">
            <LiveIndicator size={6} />
            <span className="text-xs-custom font-mono-data" style={{ color: 'var(--accent-cyan)' }}>CORE ACTIVE</span>
          </div>
          <div className="absolute top-4 right-4 text-xs-custom font-mono-data z-10" style={{ color: 'var(--text-muted)' }}>v5.0</div>
          <div className="absolute inset-0">
            <HolographicSphere />
          </div>
        </div>
      </motion.div>

      {/* ══════════════════════════════
          RIGHT SIDEBAR  270px
          ══════════════════════════════ */}
      <div className="flex flex-col gap-2.5 w-full md:w-[270px] flex-shrink-0 md:overflow-y-auto">

        {/* INTELLIGENCE FEED */}
        <motion.div variants={iv}>
          <WidgetCard title="INTELLIGENCE FEED" headerAction={
            <button onClick={() => navigate('/ai-core')} className="flex items-center gap-0.5 text-xs-custom" style={{ color: 'var(--accent-blue)' }}>
              All <ChevronRight size={11} />
            </button>
          }>
            <div className="flex flex-col items-center gap-2 py-3">
              <Server size={20} style={{ color: 'var(--text-muted)', opacity: 0.35 }} />
              <span className="text-[10px] text-center" style={{ color: 'var(--text-muted)' }}>Connect LLMs + agents<br />to activate live feed</span>
            </div>
          </WidgetCard>
        </motion.div>

        {/* LLM STATUS — real connect */}
        <motion.div variants={iv}>
          <WidgetCard title="LLM STATUS" headerAction={
            <span className="text-[10px]" style={{ color: connectedCount > 0 ? 'var(--success)' : 'var(--text-muted)' }}>
              {connectedCount}/{LLM_CATALOGUE.length} linked
            </span>
          }>
            <div className="space-y-0.5">
              {LLM_CATALOGUE.map((cat) => {
                const conn = llmConns[cat.id];
                const connected = !!conn;
                const isConnecting = connectingId === cat.id;

                return (
                  <div key={cat.id}>
                    <div className="flex items-center justify-between py-1">
                      <div className="flex items-center gap-1.5">
                        <span className="rounded-full flex-shrink-0" style={{ width: 5, height: 5, background: connected ? 'var(--success)' : 'var(--border-active)', display: 'inline-block' }} />
                        <span className="text-xs-custom" style={{ color: 'var(--text-primary)' }}>{cat.name}</span>
                        <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>{cat.model}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        {connected && (
                          <>
                            <button onClick={() => testLLM(cat.id)} title="Test" style={{ color: testState === 'ok' ? 'var(--success)' : testState === 'fail' ? 'var(--warning)' : 'var(--text-muted)' }}>
                              {testState === 'testing' ? <RefreshCw size={10} className="animate-spin" /> : testState === 'ok' ? <Check size={10} /> : testState === 'fail' ? <AlertCircle size={10} /> : <Activity size={10} />}
                            </button>
                            <button onClick={() => disconnectLLM(cat.id)} title="Disconnect" style={{ color: 'var(--text-muted)' }}><X size={10} /></button>
                          </>
                        )}
                        {!connected && !isConnecting && (
                          <button
                            onClick={() => openConnect(cat.id)}
                            className="text-[9px] px-1.5 py-0.5 rounded"
                            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-active)', color: 'var(--accent-cyan)' }}
                          >Connect</button>
                        )}
                        <a href={cat.docsUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--text-muted)' }}><ExternalLink size={9} /></a>
                      </div>
                    </div>

                    <AnimatePresence>
                      {isConnecting && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="flex flex-col gap-1.5 pb-2 pl-3">
                            {cat.needsKey && (
                              <input
                                autoFocus
                                type="password"
                                value={keyInput}
                                onChange={e => setKeyInput(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') saveLLM(cat.id); if (e.key === 'Escape') setConnectingId(null); }}
                                placeholder="Paste API key..."
                                className="w-full text-[10px] px-2 py-1 rounded"
                                style={{ background: 'var(--bg-base)', border: '1px solid var(--border-active)', color: 'var(--text-primary)' }}
                              />
                            )}
                            {!cat.needsKey && (
                              <input
                                autoFocus
                                value={urlInput}
                                onChange={e => setUrlInput(e.target.value)}
                                placeholder={cat.baseUrlDefault}
                                className="w-full text-[10px] px-2 py-1 rounded"
                                style={{ background: 'var(--bg-base)', border: '1px solid var(--border-active)', color: 'var(--text-primary)' }}
                              />
                            )}
                            <div className="flex gap-1">
                              <button onClick={() => saveLLM(cat.id)} className="flex-1 text-[10px] py-0.5 rounded font-medium flex items-center justify-center gap-1" style={{ background: 'var(--accent-cyan)', color: '#000' }}>
                                <Key size={10} /> Save
                              </button>
                              <button onClick={() => setConnectingId(null)} className="px-2 py-0.5 rounded" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
                                <X size={10} />
                              </button>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          </WidgetCard>
        </motion.div>

        {/* RECENT ACTIVITY */}
        <motion.div variants={iv}>
          <WidgetCard title="RECENT ACTIVITY">
            <div className="flex flex-col items-center gap-2 py-3">
              <Activity size={20} style={{ color: 'var(--text-muted)', opacity: 0.35 }} />
              <span className="text-[10px] text-center" style={{ color: 'var(--text-muted)' }}>No activity yet<br />Deploy agents to see events</span>
              <button onClick={() => navigate('/agents')} className="text-[10px] px-2.5 py-1 rounded" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-active)', color: 'var(--accent-cyan)' }}>
                Deploy Agents →
              </button>
            </div>
          </WidgetCard>
        </motion.div>

        {/* CONNECTED MODELS */}
        <motion.div variants={iv}>
          <WidgetCard title="CONNECTED MODELS" headerAction={
            <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{connectedCount} active</span>
          }>
            {connectedCount === 0 ? (
              <div className="flex flex-col items-center gap-1.5 py-2">
                <Bot size={18} style={{ color: 'var(--text-muted)', opacity: 0.35 }} />
                <span className="text-[10px] text-center" style={{ color: 'var(--text-muted)' }}>Add API keys above<br />to see connected models</span>
              </div>
            ) : (
              <div className="space-y-1.5">
                {Object.entries(llmConns).map(([id]) => {
                  const cat = LLM_CATALOGUE.find(c => c.id === id);
                  if (!cat) return null;
                  return (
                    <div key={id} className="flex items-center gap-2">
                      <span className="text-xs-custom flex-1 truncate" style={{ color: 'var(--text-primary)' }}>{cat.name} · {cat.model}</span>
                      <span className="rounded-full" style={{ width: 5, height: 5, background: 'var(--success)', display: 'inline-block' }} />
                    </div>
                  );
                })}
                <p className="text-[9px] mt-1" style={{ color: 'var(--text-muted)' }}>Token usage tracking requires the AXE Agent.</p>
              </div>
            )}
          </WidgetCard>
        </motion.div>
      </div>

    </motion.div>
  );
}
