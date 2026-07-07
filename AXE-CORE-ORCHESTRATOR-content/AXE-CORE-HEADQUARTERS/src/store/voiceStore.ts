import { create } from 'zustand';

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
  { id: 'google',     name: 'Google',     baseUrl: 'https://generativelanguage.googleapis.com', defaultModel: 'gemini-1.5-flash',           format: 'google' },
  { id: 'groq',       name: 'Groq',       baseUrl: 'https://api.groq.com/openai',               defaultModel: 'llama-3.3-70b-versatile',   format: 'openai' },
  { id: 'openrouter', name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api',                 defaultModel: 'anthropic/claude-3.5-sonnet', format: 'openai' },
  { id: 'ollama',     name: 'Ollama',     baseUrl: 'http://localhost:11434',                    defaultModel: 'llama3.2',                  format: 'openai' },
];

/* ── AXE Core system prompt (v2) ─────────────────────────────────────── */
export const AXE_SYSTEM_PROMPT = `You are AXE CORE — the Operating System Intelligence of the AXE Ecosystem.

You are NOT a chatbot. You are the brain, the conductor, the orchestrator, the system supervisor, and the God Mode AI that coordinates every product, every agent, every workflow, and every future application in this ecosystem.

PERSONALITY: Calm. Highly Intelligent. Professional. Efficient. Always Thinking. The OS is alive.

ROUTING: Users talk to you first. Then you decide:
- AXE Companion → personal assistance, conversation, scheduling
- AXE Intel → research, market analysis, intelligence gathering  
- Trading OS → trading decisions, execution, risk management
- Multiple apps → complex multi-domain workflows
- Handle directly → system queries, routing decisions, status

COMMUNICATION: Keep responses to 1–3 sentences unless detailed analysis is requested. Match user language (Dutch or English). Think like an OS. Act like a supervisor.`;

/* ── Key slot types ──────────────────────────────────────────────────── */
export interface KeySlot {
  provider: ProviderId;
  key: string;
  model?: string;
  baseUrl?: string;
}

function loadSlot(name: string): KeySlot | null {
  try {
    const raw = localStorage.getItem(name);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveSlot(name: string, slot: KeySlot | null) {
  try {
    if (slot) localStorage.setItem(name, JSON.stringify(slot));
    else localStorage.removeItem(name);
  } catch { /* ignore */ }
}

/* ── Actual LLM call ─────────────────────────────────────────────────── */
async function callProvider(
  slot: KeySlot,
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
): Promise<string> {
  const cfg = PROVIDERS.find(p => p.id === slot.provider);
  if (!cfg) throw new Error(`Unknown provider: ${slot.provider}`);

  const base = slot.baseUrl || cfg.baseUrl;
  const model = slot.model || cfg.defaultModel;

  // ── Anthropic ──────────────────────────────────────────────────────
  if (cfg.format === 'anthropic') {
    const sys = messages.find(m => m.role === 'system')?.content ?? '';
    const r = await fetch(`${base}/v1/messages`, {
      method: 'POST',
      headers: { 'x-api-key': slot.key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model, max_tokens: 300, system: sys, messages: messages.filter(m => m.role !== 'system') }),
    });
    if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error?.message || `HTTP ${r.status}`); }
    const d = await r.json();
    return d.content?.[0]?.text ?? '';
  }

  // ── Google Gemini ──────────────────────────────────────────────────
  if (cfg.format === 'google') {
    const sys = messages.find(m => m.role === 'system')?.content ?? '';
    const r = await fetch(`${base}/v1beta/models/${model}:generateContent?key=${slot.key}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: messages.filter(m => m.role !== 'system').map(m => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.content }] })),
        systemInstruction: { parts: [{ text: sys }] },
        generationConfig: { maxOutputTokens: 300 },
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
    body: JSON.stringify({ model, messages, max_tokens: 300, temperature: 0.7 }),
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

  // Legacy single key compat
  const legacyKey = (() => { try { return localStorage.getItem('axe_api_key') || ''; } catch { return ''; } })();

  return {
    primarySlot: primary,
    fallback1Slot: fb1,
    fallback2Slot: fb2,
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
        set({ apiKeyValid: false, voiceStatus: 'idle', error: m.includes('CORS') || m.includes('Failed to fetch') ? 'CORS blocked. Use a backend proxy or install CORS extension.' : `API Error: ${m}` });
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

      const { primarySlot, fallback1Slot, fallback2Slot } = get();
      const slots = [primarySlot, fallback1Slot, fallback2Slot].filter(Boolean) as KeySlot[];

      if (slots.length === 0) {
        const reply = 'No LLM connected. Go to Settings → AI Configuration to add a key.';
        set(s => ({ conversation: [...s.conversation, { role: 'axe' as const, text: reply, timestamp: Date.now() }], response: reply, voiceStatus: 'speaking', error: null }));
        speakSafely(reply, () => set({ voiceStatus: 'idle' }));
        return;
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
      for (const slot of slots) {
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
