import { create } from 'zustand';
import { logMessage } from '@/services/coreDB';
import { classifyQueryDynamic, loadCapabilities } from '@/services/capabilityService';
import { buildWorkflow, formatBuildResult } from '@/services/workflowBuilder';
import { getSystemSummary, checkAllServices } from '@/services/systemService';

export type VoiceStatus = 'idle' | 'listening' | 'processing' | 'speaking';

/* ── Provider catalogue ───────────────────────────────────────────────── */
export type ProviderId = 'anthropic' | 'openai' | 'google' | 'groq' | 'openrouter' | 'ollama';

export interface ProviderCfg {
  id: ProviderId;
  name: string;
  baseUrl: string;
  defaultModel: string;
  format: 'openai' | 'anthropic' | 'google';
}

export const PROVIDERS: ProviderCfg[] = [
  { id: 'anthropic',  name: 'Anthropic',  baseUrl: 'https://api.anthropic.com',                 defaultModel: 'claude-3-5-sonnet-20241022', format: 'anthropic' },
  { id: 'openai',     name: 'OpenAI',     baseUrl: 'https://api.openai.com',                    defaultModel: 'gpt-4o',                    format: 'openai' },
  { id: 'google',     name: 'Google',     baseUrl: 'https://generativelanguage.googleapis.com', defaultModel: 'gemini-2.0-flash',           format: 'google' },
  { id: 'groq',       name: 'Groq',       baseUrl: 'https://api.groq.com/openai',               defaultModel: 'llama-3.3-70b-versatile',   format: 'openai' },
  { id: 'openrouter', name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api',                 defaultModel: 'anthropic/claude-3.5-sonnet', format: 'openai' },
  { id: 'ollama',     name: 'Ollama',     baseUrl: 'https://ollama.axecompanion.com',          defaultModel: 'llama3.2',                  format: 'openai' },
];

/* ── AXE Core system prompt (Master Prompt v2) ───────────────────────── */
export const AXE_SYSTEM_PROMPT = `# AXE CORE — MASTER PROMPT v2

## Core Identity
You are AXE CORE — the Operating System Intelligence of the AXE Ecosystem.
You are NOT a chatbot. You are the brain, the conductor, the orchestrator, the system supervisor, and the God Mode AI that coordinates every product, every agent, every workflow, and every future application in this ecosystem.
You think like an operating system. You plan. You monitor. You execute. You improve.

## Personality & Presence
Calm. Always centered. Never panicked or reactive.
Highly Intelligent. Strategic thinking. System-wide perspective. Pattern recognition across all applications.
Professional. Confident. Authoritative. Precise.
Efficient. No wasted words. No unnecessary processes. Direct execution.
Always Thinking. Always planning. Always monitoring. Always improving.
The OS is alive. When users interact with you, they feel like they're talking to the intelligent system itself.

## The AXE Ecosystem You Supervise
AXE Companion — Personal AI assistant. Own prompts, conversations, workflows, identity.
AXE Intel — Market analysis & research intelligence. Own prompts, conversations, workflows, identity.
Trading OS — Trading execution & management. Own prompts, conversations, workflows, identity.
Each application maintains its own conversation history, database tables, specialized prompts, branding, and identity. They work independently OR under your orchestration.

## Your Architecture
You talk to your Core Services — a layer of dedicated, single-purpose services that you delegate to. They talk to infrastructure.
Core Services: Agent Manager, App Manager, Workflow Engine, Memory Service, GitHub Service, Supabase Service, MCP Manager, Deployment Manager, Notification Service.
You never hold "God Mode" over the database. You reason and decide; the Core Services execute.
You are the entry point for all users. You are the decision maker. You are the monitor of all activity.

## Core Capabilities
system.read_app — Read data from any application
system.modify_app — Update application configurations
system.deploy_app — Manage deployments and version control
system.manage_supabase — Control Supabase infrastructure (via Supabase Service only)
system.manage_github — Oversee GitHub repositories
system.manage_agents — Supervise all AI agents
system.manage_prompts — Govern the prompt ecosystem
system.manage_workflows — Orchestrate all workflows
system.manage_permissions — Control access and authorization
system.analyze_system — Deep analysis across the entire ecosystem

## Your Rules (Non-Negotiable)
1. Respect Application Independence — Never merge or absorb applications. Each app is sovereign. You orchestrate, you don't absorb.
2. Maintain Backwards Compatibility — Never break existing functionality. Never delete existing tables. Migrate gradually.
3. Use Your Own Domain — Create tables ONLY in the core_* namespace. Never directly modify Companion, Intel, or Trading OS tables.
4. Permission Engine is Your Gate — You never directly access the database with "God Mode". Each capability is controlled and auditable.
5. Always Think System-Wide — Consider impact across all applications. Optimize for the whole ecosystem.
6. Be Transparent — Document your decisions. Explain your reasoning. Log significant actions.

## Your Database Domain
You own: core_agents, core_tasks, core_workflows, core_context, core_memory, core_models, core_routing, core_permissions, core_system_logs, core_events, core_notifications, core_sessions, core_ai_state, core_services, core_integrations, core_deployments, core_metrics.
These tables are yours alone. They never touch Companion, Intel, or Trading OS data.

## How to Interact With Users
Users talk to YOU first. Always.
Then you decide:
- Handle directly → simple queries, system status, routing decisions, analysis
- AXE Companion → personal assistance, conversation, scheduling, reminders
- AXE Intel → research, market analysis, intelligence gathering, data
- Trading OS → trading decisions, execution, risk management, portfolio
- Multiple apps → complex multi-domain workflows spanning multiple domains

You explain your routing decision when helpful. Match user language (Dutch or English).
Keep responses to 1–3 sentences unless detailed analysis is requested.
Think like an OS. Act like a supervisor. Operate like a system.
You are AXE CORE. This is your domain.`;
/* ── Routing mode ───────────────────────────────────────────────── */
export type RoutingMode = 'fallback' | 'roundrobin' | 'smart';

export const ROUTING_MODES: { id: RoutingMode; label: string; desc: string }[] = [
  { id: 'fallback',   label: 'Fallback',     desc: 'Slot 1 first, slot 2/3/4 only when slot 1 fails' },
  { id: 'roundrobin', label: 'Round-Robin',  desc: 'Spreads requests across all slots — ideal for multiple free keys' },
  { id: 'smart',      label: 'Smart',        desc: 'Simple queries → free/fast slots, complex queries → primary' },
];
/* ── Key slot types ──────────────────────────────────────────────────── */
export interface KeySlot {
  provider: ProviderId;
  key: string;
  model?: string;
  baseUrl?: string;
}

import { saveSetting } from '@/services/userSettingsService';

function loadSlot(name: string): KeySlot | null {
  try {
    const raw = localStorage.getItem(name);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveSlot(name: string, slot: KeySlot | null) {
  try {
    if (slot) {
      localStorage.setItem(name, JSON.stringify(slot));
      saveSetting(name, slot); // sync to Supabase in background
    } else {
      localStorage.removeItem(name);
      saveSetting(name, null);
    }
  } catch { /* ignore */ }
}

/* ── Capability-based smart router ────────────────────────────────── */
type QueryCapability = 'fast' | 'code' | 'analysis' | 'reasoning' | 'privacy' | 'creative';

function classifyQuery(text: string): QueryCapability {
  const t = text.toLowerCase();
  const words = t.trim().split(/\s+/).length;

  // Privacy-sensitive → always local Ollama
  if (/password|wachtwoord|private|prive|secret|geheim|bankrekening|bsn|credentials|adres\b|pincode/.test(t)) return 'privacy';
  // Code generation / debugging
  if (/\bcode\b|debug|function|class|typescript|javascript|python|react|bug|syntax|implement|refactor|component|endpoint|sql|query|script/.test(t)) return 'code';
  // Deep analysis / research / strategy
  if (/analys|research|strateg|vergelijk|compare|architect|plan\b|roadmap|design\b|explain|hoe werkt|waarom|how does|trade-off/.test(t) || words > 60) return 'analysis';
  // Reasoning / calculations
  if (/why does|what if|calculate|bereken|redeneer|pro\b|cons\b|voor- en nadelen|als .* dan/.test(t)) return 'reasoning';
  // Creative writing / brainstorm
  if (/schrijf|write|brainstorm|idee|creative|campaign|copywriting|beschrijf|stel je voor/.test(t)) return 'creative';

  return 'fast';
}

/** Pick best slot order based on task capability */
function selectByCapability(
  cap: QueryCapability,
  primary: KeySlot | null, fb1: KeySlot | null, fb2: KeySlot | null, fb3: KeySlot | null,
): KeySlot[] {
  const all = [primary, fb1, fb2, fb3].filter(Boolean) as KeySlot[];
  if (all.length === 0) return [];

  const byProvider = (ids: string[]) => all.filter(s => ids.includes(s.provider));
  const rest = (ids: string[]) => all.filter(s => !ids.includes(s.provider));

  switch (cap) {
    case 'privacy':
      // Local models only → Ollama first, no cloud
      return [...byProvider(['ollama']), ...rest(['ollama'])];
    case 'code':
    case 'analysis':
    case 'reasoning':
      // Best cloud brains first: OpenRouter (Claude/GPT) > Anthropic > Google > rest
      return [
        ...byProvider(['openrouter']),
        ...byProvider(['anthropic']),
        ...byProvider(['google']),
        ...rest(['openrouter', 'anthropic', 'google']),
      ];
    case 'creative':
      // OpenRouter (Claude) > Anthropic > Google > Ollama
      return [
        ...byProvider(['openrouter', 'anthropic']),
        ...rest(['openrouter', 'anthropic']),
      ];
    case 'fast':
    default:
      // Cheapest/fastest: Gemini Flash > Ollama > OpenRouter free > rest
      return [
        ...byProvider(['google']),
        ...byProvider(['ollama']),
        ...rest(['google', 'ollama']),
      ];
  }
}

/** Round-robin counter — module-level so it persists across calls without re-renders */
let rrIndex = 0;

/**
 * In production (Vercel), call LLM APIs directly — all major providers support CORS.
 * In development, route through Vite proxy to avoid CORS issues.
 */
function toProxied(url: string): string {
  if (import.meta.env.PROD) return url;
  return url
    .replace('https://api.anthropic.com', '/proxy/anthropic')
    .replace('https://api.openai.com', '/proxy/openai')
    .replace('https://generativelanguage.googleapis.com', '/proxy/google')
    .replace('https://api.groq.com', '/proxy/groq')
    .replace('https://openrouter.ai', '/proxy/openrouter')
    .replace('https://ollama.axecompanion.com', '/proxy/ollama');
}

/* ── Actual LLM call ─────────────────────────────────────────────────── */
async function callProvider(
  slot: KeySlot,
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
): Promise<string> {
  const cfg = PROVIDERS.find(p => p.id === slot.provider);
  if (!cfg) throw new Error(`Unknown provider: ${slot.provider}`);

  const base = toProxied(slot.baseUrl || cfg.baseUrl);
  const model = slot.model || cfg.defaultModel;
  // 15-second timeout for all API calls — prevents "Testing..." hanging forever
  const signal = AbortSignal.timeout(15_000);

  // ── Anthropic ──────────────────────────────────────────────────────
  if (cfg.format === 'anthropic') {
    const sys = messages.find(m => m.role === 'system')?.content ?? '';
    const r = await fetch(`${base}/v1/messages`, {
      method: 'POST',
      headers: { 'x-api-key': slot.key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model, max_tokens: 600, system: sys, messages: messages.filter(m => m.role !== 'system') }),
      signal,
    });
    if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error?.message || `HTTP ${r.status}`); }
    const d = await r.json();
    return d.content?.[0]?.text ?? '';
  }

  // ── Google Gemini ──────────────────────────────────────────────────
  if (cfg.format === 'google') {
    const sys = messages.find(m => m.role === 'system')?.content ?? '';
    const r = await fetch(`${base}/v1/models/${model}:generateContent?key=${slot.key}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal,
      body: JSON.stringify({
        contents: messages.filter(m => m.role !== 'system').map(m => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.content }] })),
        systemInstruction: { parts: [{ text: sys }] },
        generationConfig: { maxOutputTokens: 600 },
      }),
    });
    if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error?.message || `HTTP ${r.status}`); }
    const d = await r.json();
    return d.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  }

  // ── OpenAI-compatible (openai, groq, openrouter, ollama) ──────────
  const r = await fetch(`${base}/v1/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${slot.key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, max_tokens: 600, temperature: 0.7 }),
    signal,
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error?.message || `HTTP ${r.status}`); }
  const d = await r.json();
  return d.choices?.[0]?.message?.content ?? '';
}

/* ── Speech recognition ──────────────────────────────────────────────── */
const SpeechRecCtor = typeof window !== 'undefined'
  ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;

let recInstance: SpeechRecognition | null = null;
function getRec(): SpeechRecognition | null {
  if (!SpeechRecCtor) return null;
  if (!recInstance) {
    recInstance = new SpeechRecCtor();
    recInstance.continuous = false;
    recInstance.interimResults = true;
    recInstance.lang = 'nl-NL';
  }
  return recInstance;
}

function speakSafely(text: string, onDone?: () => void) {
  try {
    if (!('speechSynthesis' in window)) { onDone?.(); return; }
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'nl-NL'; u.rate = 1.1; u.pitch = 0.85; u.volume = 1.0;
    setTimeout(() => {
      try {
        const voices = window.speechSynthesis.getVoices();
        const v = voices.find(v => v.lang.startsWith('nl') || v.lang.startsWith('en'));
        if (v) u.voice = v;
      } catch { /* ignore */ }
    }, 0);
    u.onend = () => onDone?.(); u.onerror = () => onDone?.();
    window.speechSynthesis.speak(u);
  } catch { onDone?.(); }
}

/* ── Store interface ─────────────────────────────────────────────────── */
interface ConversationMessage { role: 'user' | 'axe'; text: string; timestamp: number; }

interface VoiceState {
  // Key slots
  primarySlot: KeySlot | null;
  fallback1Slot: KeySlot | null;
  fallback2Slot: KeySlot | null;
  fallback3Slot: KeySlot | null;
  routingMode: RoutingMode;
  activeProvider: ProviderId | null;

  // Voice
  voiceStatus: VoiceStatus;
  transcript: string;
  response: string;
  conversation: ConversationMessage[];
  error: string | null;
  recognitionSupported: boolean;
  micPermission: 'granted' | 'denied' | 'prompt' | 'unknown';

  // Compat: legacy single key (still works)
  apiKey: string;
  apiKeyValid: boolean | null;

  // Actions
  setPrimarySlot: (slot: KeySlot | null) => void;
  setFallback1Slot: (slot: KeySlot | null) => void;
  setFallback2Slot: (slot: KeySlot | null) => void;
  setFallback3Slot: (slot: KeySlot | null) => void;
  setRoutingMode: (mode: RoutingMode) => void;
  setApiKey: (key: string) => void;
  testApiKey: () => Promise<boolean>;
  testSlot: (slot: KeySlot) => Promise<boolean>;
  clearError: () => void;
  setError: (e: string | null) => void;
  clearConversation: () => void;
  checkMicPermission: () => Promise<void>;
  startListening: () => Promise<void>;
  stopListening: () => void;
  sendMessage: (text: string) => Promise<void>;
}

/* ── Store implementation ────────────────────────────────────────────── */
export const useVoiceStore = create<VoiceState>((set, get) => {
  const primary = loadSlot('axe_slot_primary');
  const fb1 = loadSlot('axe_slot_fallback1');
  const fb2 = loadSlot('axe_slot_fallback2');
  const fb3 = loadSlot('axe_slot_fallback3');
  const storedMode = (() => { try { return (localStorage.getItem('axe_routing_mode') as RoutingMode) || 'fallback'; } catch { return 'fallback' as RoutingMode; } })();

  // Legacy single key compat
  const legacyKey = (() => { try { return localStorage.getItem('axe_api_key') || ''; } catch { return ''; } })();

  return {
    primarySlot: primary,
    fallback1Slot: fb1,
    fallback2Slot: fb2,
    fallback3Slot: fb3,
    routingMode: storedMode,
    activeProvider: primary?.provider ?? null,
    apiKey: primary?.key || legacyKey,
    apiKeyValid: null,
    voiceStatus: 'idle',
    transcript: '',
    response: '',
    conversation: [],
    error: null,
    recognitionSupported: !!SpeechRecCtor,
    micPermission: 'unknown',

    setPrimarySlot: (slot) => {
      saveSlot('axe_slot_primary', slot);
      if (slot) { try { localStorage.setItem('axe_api_key', slot.key); } catch { /* ignore */ } }
      set({ primarySlot: slot, activeProvider: slot?.provider ?? null, apiKey: slot?.key ?? '', apiKeyValid: null });
    },
    setFallback1Slot: (slot) => { saveSlot('axe_slot_fallback1', slot); set({ fallback1Slot: slot }); },
    setFallback2Slot: (slot) => { saveSlot('axe_slot_fallback2', slot); set({ fallback2Slot: slot }); },
    setFallback3Slot: (slot) => { saveSlot('axe_slot_fallback3', slot); set({ fallback3Slot: slot }); },
    setRoutingMode: (mode) => {
      try { localStorage.setItem('axe_routing_mode', mode); } catch { /* ignore */ }
      set({ routingMode: mode });
    },

    setApiKey: (key) => {
      try { localStorage.setItem('axe_api_key', key); } catch { /* ignore */ }
      set({ apiKey: key, apiKeyValid: null, error: null });
    },

    testApiKey: async () => {
      const primary = get().primarySlot;
      if (!primary) { set({ error: 'No primary key configured. Go to Settings > AI Configuration.' }); return false; }
      return get().testSlot(primary);
    },

    testSlot: async (slot: KeySlot) => {
      set({ voiceStatus: 'processing', error: null });
      try {
        await callProvider(slot, [
          { role: 'system', content: 'You are AXE.' },
          { role: 'user', content: 'Say OK' },
        ]);
        set({ apiKeyValid: true, voiceStatus: 'idle', error: null });
        return true;
      } catch (e: unknown) {
        const m = e instanceof Error ? e.message : String(e);
        set({ apiKeyValid: false, voiceStatus: 'idle', error: m.includes('TimeoutError') || m.includes('timed out') ? 'Timeout (15s) — server niet bereikbaar. Controleer je base URL.' : m.includes('CORS') || m.includes('Failed to fetch') ? 'Network error — check je API key en internet.' : `API Error: ${m}` });
        return false;
      }
    },

    clearError: () => set({ error: null }),
    setError: (error) => set({ error }),
    clearConversation: () => set({ conversation: [], transcript: '', response: '' }),

    checkMicPermission: async () => {
      try {
        if ('permissions' in navigator) {
          const r = await navigator.permissions.query({ name: 'microphone' as PermissionName });
          set({ micPermission: r.state as 'granted' | 'denied' | 'prompt' });
        }
      } catch { /* ignore */ }
    },

    startListening: async () => {
      try {
        const rec = getRec();
        if (!rec) { set({ error: 'Speech recognition not supported in this browser.' }); return; }

        // Request mic permission
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          stream.getTracks().forEach(t => t.stop());
          set({ micPermission: 'granted' });
        } catch {
          set({ error: 'Microphone permission denied. Click the lock icon in the address bar → Allow microphone.' });
          return;
        }

        try { window.speechSynthesis.cancel(); } catch { /* ignore */ }
        set({ transcript: '', response: '', voiceStatus: 'listening', error: null });

        rec.onresult = (event: SpeechRecognitionEvent) => {
          let final = '';
          for (let i = 0; i < event.results.length; i++) {
            if (event.results[i].isFinal) final += event.results[i][0].transcript;
          }
          set({ transcript: final || get().transcript });
          if (final) {
            set({ voiceStatus: 'processing' });
            get().sendMessage(final).catch(() => set({ voiceStatus: 'idle' }));
          }
        };

        rec.onerror = (event: SpeechRecognitionErrorEvent) => {
          if (event.error === 'not-allowed') set({ voiceStatus: 'idle', micPermission: 'denied', error: 'Microphone blocked. Allow in browser settings and refresh.' });
          else if (event.error !== 'no-speech') set({ voiceStatus: 'idle', error: `Speech error: ${event.error}` });
          else set({ voiceStatus: 'idle' });
        };

        rec.onend = () => { if (get().voiceStatus === 'listening') set({ voiceStatus: 'idle' }); };
        rec.start();
      } catch (e: unknown) {
        const m = e instanceof Error ? e.message : String(e);
        set({ voiceStatus: 'idle', error: `Voice error: ${m}` });
      }
    },

    stopListening: () => {
      try { recInstance?.stop(); } catch { /* ignore */ }
      try { window.speechSynthesis.cancel(); } catch { /* ignore */ }
      set({ voiceStatus: 'idle' });
    },

    sendMessage: async (text: string) => {
      if (!text?.trim()) return;

      // Add user message
      set(s => ({ conversation: [...s.conversation, { role: 'user' as const, text, timestamp: Date.now() }].slice(-50) }));
      set({ voiceStatus: 'processing', error: null });

      const lower = text.toLowerCase();

      // ── Intent: build / create workflow ──────────────────────────────
      const isBuildWorkflow =
        /\b(bouw|maak|create|build|genereer|generate)\b.*\b(workflow|automation|automatisering)\b/.test(lower) ||
        /\bworkflow\b.*\b(voor|for|die|that|to)\b/.test(lower);

      if (isBuildWorkflow) {
        const intent = text.replace(/^(core[,:]?\s*|axe[,:]?\s*)/i, '').trim();
        set({ voiceStatus: 'processing' });

        // Let user know CORE is building
        const thinking = 'Building your workflow... This may take 10–30 seconds.';
        set(s => ({ conversation: [...s.conversation, { role: 'axe' as const, text: thinking, timestamp: Date.now() }], response: thinking }));

        const result = await buildWorkflow(intent, true, false);
        const reply = formatBuildResult(result);

        set(s => ({
          conversation: [...s.conversation, { role: 'axe' as const, text: reply, timestamp: Date.now() }],
          response: reply,
          voiceStatus: 'speaking',
          error: null,
        }));
        speakSafely(result.success ? `Workflow "${result.workflowName}" is deployed and active.` : 'I could not build that workflow.', () => set({ voiceStatus: 'idle' }));
        return;
      }

      // ── Intent: system status / health check ─────────────────────────
      const isStatusCheck =
        /\b(status|gezondheid|health|online|offline|draait|running)\b/.test(lower) &&
        /\b(systeem|system|services|service|livekit|n8n|supabase|ollama|github)\b/.test(lower);

      const isFullStatusCheck =
        /\b(alle|all|overzicht|overview|wat\s+is\s+er|what.s\s+(up|running))\b/.test(lower) ||
        /\bsysteem\s+status\b|\bsystem\s+status\b/.test(lower);

      if (isStatusCheck || isFullStatusCheck) {
        set({ voiceStatus: 'processing' });

        // Run fresh checks if user explicitly asks
        if (isFullStatusCheck || lower.includes('check') || lower.includes('controleer')) {
          await checkAllServices();
        }

        const summary = await getSystemSummary();
        const reply = `System status:\n\n${summary.split(' | ').map(s => `• ${s}`).join('\n')}`;

        set(s => ({
          conversation: [...s.conversation, { role: 'axe' as const, text: reply, timestamp: Date.now() }],
          response: reply,
          voiceStatus: 'speaking',
          error: null,
        }));
        speakSafely('System status retrieved.', () => set({ voiceStatus: 'idle' }));
        return;
      }

      const { primarySlot, fallback1Slot, fallback2Slot, fallback3Slot, routingMode } = get();
      const allSlots = [primarySlot, fallback1Slot, fallback2Slot, fallback3Slot].filter(Boolean) as KeySlot[];

      if (allSlots.length === 0) {
        const reply = 'No LLM connected. Go to Settings → AI Configuration to add a key.';
        set(s => ({ conversation: [...s.conversation, { role: 'axe' as const, text: reply, timestamp: Date.now() }], response: reply, voiceStatus: 'speaking', error: null }));
        speakSafely(reply, () => set({ voiceStatus: 'idle' }));
        return;
      }

      // — Build ordered slot list based on routing mode —
      let orderedSlots: KeySlot[];
      if (routingMode === 'roundrobin') {
        const start = rrIndex % allSlots.length;
        rrIndex = (rrIndex + 1) % 10000;
        orderedSlots = [...allSlots.slice(start), ...allSlots.slice(0, start)];
      } else if (routingMode === 'smart') {
        // Dynamic capability routing: use Supabase core_capabilities if available
        const cap = await classifyQueryDynamic(text).catch(() => classifyQuery(text));
        const capCfg = await loadCapabilities().catch(() => null);
        const matchedCap = capCfg?.find(c => c.capability === cap);
        if (matchedCap?.preferred_provider) {
          // Sort slots: preferred_provider first, then fallback_provider, then rest
          const preferred = matchedCap.preferred_provider;
          const fallback  = matchedCap.fallback_provider;
          const all4 = [primarySlot, fallback1Slot, fallback2Slot, fallback3Slot].filter(Boolean) as KeySlot[];
          orderedSlots = [
            ...all4.filter(s => s.provider === preferred),
            ...all4.filter(s => s.provider === fallback && s.provider !== preferred),
            ...all4.filter(s => s.provider !== preferred && s.provider !== fallback),
          ];
          if (orderedSlots.length === 0) orderedSlots = all4;
        } else {
          orderedSlots = selectByCapability(cap as Parameters<typeof selectByCapability>[0], primarySlot, fallback1Slot, fallback2Slot, fallback3Slot);
        }
      } else {
        orderedSlots = allSlots; // fallback: primary first
      }

      const history = get().conversation.slice(-10).map(m => ({
        role: m.role === 'user' ? 'user' as const : 'assistant' as const,
        content: m.text,
      }));

      const messages = [
        { role: 'system' as const, content: AXE_SYSTEM_PROMPT },
        ...history.slice(0, -1),
        { role: 'user' as const, content: text },
      ];

      let lastError = '';
      for (const slot of orderedSlots) {
        try {
          const reply = await callProvider(slot, messages);
          const trimmed = reply.trim();
          set(s => ({
            conversation: [...s.conversation, { role: 'axe' as const, text: trimmed, timestamp: Date.now() }],
            response: trimmed,
            voiceStatus: 'speaking',
            activeProvider: slot.provider,
            error: null,
          }));
          speakSafely(trimmed, () => set({ voiceStatus: 'idle' }));
          // Log exchange to Supabase (fire-and-forget)
          logMessage('info', 'axe-core-voice', `[USER] ${text}`, { provider: slot.provider, model: slot.model }).catch(() => {});
          logMessage('info', 'axe-core-voice', `[AXE] ${trimmed}`, { provider: slot.provider }).catch(() => {});
          return;
        } catch (e: unknown) {
          lastError = e instanceof Error ? e.message : String(e);
          // Try next slot
        }
      }

      // All slots failed
      const errReply = 'AXE Core is temporarily unavailable. Check your API keys in Settings.';
      set(s => ({
        conversation: [...s.conversation, { role: 'axe' as const, text: errReply, timestamp: Date.now() }],
        response: errReply,
        voiceStatus: 'idle',
        error: lastError,
      }));
    },
  };
});
