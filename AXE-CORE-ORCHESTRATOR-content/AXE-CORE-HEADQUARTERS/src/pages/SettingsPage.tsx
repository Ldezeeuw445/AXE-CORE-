import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { WidgetCard } from '@/components/widgets/WidgetCard';
import { useVoiceStore, PROVIDERS, type ProviderId, type KeySlot } from '@/store/voiceStore';
import { CapabilityRouterSection } from '@/components/settings/CapabilityRouterSection';
import { loadSetting, saveSetting } from '@/services/userSettingsService';
import { getDefaultOllamaModelNames } from '@/services/ollamaModelCatalog';
import { getStoredLlmModelRegistry, registryEntriesFromNames, saveLlmModelRegistry } from '@/services/llmModelRegistryService';
import { checkAllServices, getSystemState, type ServiceState } from '@/services/systemService';
import { normalizeProviderBaseUrl } from '@/services/providerConnectionDefaults';
import {
  Key, Check, X, Eye, EyeOff, Mic, Save, AlertTriangle,
  RefreshCw, Zap,
  ExternalLink, Github, GitBranch, Trash2,
  Activity, Server, Plus,
} from 'lucide-react';

/* ─── Per-provider key store ─────────────────────────────────────── */
const PROVIDER_KEY_CATALOGUE = [
  { id: 'openrouter',  name: 'OpenRouter',    emoji: '🔓', accent: '#F59E0B', placeholder: 'sk-or-v1-...',        defaultModel: 'meta-llama/llama-3.1-8b-instruct:free', docsUrl: 'https://openrouter.ai/keys',              free: true,  needsKey: true  },
  { id: 'google',      name: 'Gemini',         emoji: '✨', accent: '#3B82F6', placeholder: 'AIza...',             defaultModel: 'gemini-flash-lite-latest',              docsUrl: 'https://aistudio.google.com/app/apikey',  free: true,  needsKey: true  },
  { id: 'xai',         name: 'Grok (xAI)',     emoji: '🚀', accent: '#F97316', placeholder: 'xai-...',              defaultModel: 'grok-4.3',                              docsUrl: 'https://docs.x.ai/developers/quickstart', free: false, needsKey: true  },
  { id: 'groq',        name: 'Groq',           emoji: '🚀', accent: '#EC4899', placeholder: 'gsk_...',             defaultModel: 'qwen/qwen3-32b',                        docsUrl: 'https://console.groq.com/keys',           free: true,  needsKey: true  },
  { id: 'anthropic',   name: 'Anthropic',      emoji: '🤖', accent: '#A78BFA', placeholder: 'sk-ant-api03-...',    defaultModel: 'claude-sonnet-5',            docsUrl: 'https://console.anthropic.com/keys',      free: false, needsKey: true  },
  { id: 'openai',      name: 'OpenAI',         emoji: '⚡', accent: '#10B981', placeholder: 'sk-proj-...',         defaultModel: 'gpt-4o-mini',                           docsUrl: 'https://platform.openai.com/api-keys',    free: false, needsKey: true  },
  { id: 'krater',      name: 'Krater',         emoji: '🧿', accent: '#22D3EE', placeholder: 'kr_live_...',         defaultModel: 'openai/gpt-4o-mini',                    docsUrl: 'https://api.krater.ai',                   free: false, needsKey: true  },
  { id: 'ollama',      name: 'Ollama (VPS)',   emoji: '🦙', accent: '#10B981', placeholder: '(geen key nodig)',    defaultModel: 'llama3.1:8b',                           docsUrl: 'https://ollama.ai',                       free: true,  needsKey: false },
  { id: 'openhands',   name: 'OpenHands (VPS)', emoji: '🙌', accent: '#8B5CF6', placeholder: '(geen key nodig)',    defaultModel: 'claude-sonnet-4-5',                     docsUrl: 'https://github.com/All-Hands-AI/OpenHands', free: true, needsKey: false },
  { id: 'openjarvis',  name: 'OpenJarvis (VPS)', emoji: '🧭', accent: '#C084FC', placeholder: '(geen key nodig)',    defaultModel: 'gpt-4o-mini',                           docsUrl: 'https://github.com',                      free: true, needsKey: false },
  { id: 'openclaw',    name: 'OpenClaw (VPS)',  emoji: '🦞', accent: '#F97316', placeholder: '(geen key nodig)',    defaultModel: 'gpt-4o-mini',                           docsUrl: 'https://github.com',                      free: true, needsKey: false },
  { id: 'kilocode',    name: 'Kilo Code (VPS)', emoji: '⌘', accent: '#14B8A6', placeholder: '(geen key nodig)',    defaultModel: 'gpt-4o-mini',                           docsUrl: 'https://github.com',                      free: true, needsKey: false },
  { id: 'crewai',      name: 'CrewAI (VPS)',    emoji: '🧠', accent: '#84CC16', placeholder: '(geen key nodig)',    defaultModel: 'gpt-4o-mini',                           docsUrl: 'https://github.com',                      free: true, needsKey: false },
  { id: 'hermes',      name: 'Hermes Agent (VPS)', emoji: '🜁', accent: '#06B6D4', placeholder: '(geen key nodig)', defaultModel: 'gpt-4o-mini',                           docsUrl: 'https://github.com/NousResearch/hermes-agent', free: true, needsKey: false },
  { id: 'exa',         name: 'Exa Search',         emoji: '🔍', accent: '#6366F1', placeholder: 'exa-...',              defaultModel: '',                                     docsUrl: 'https://docs.exa.ai',                         free: false, needsKey: true },
] as const;

const OPTIONAL_KEY_PROVIDERS = new Set(['ollama', 'openhands', 'openjarvis', 'openclaw', 'kilocode', 'crewai', 'hermes']);

type ProviderConn = {
  key?: string;
  model?: string;
  models?: string[];
  baseUrl?: string;
  lastTest?: 'ok' | 'fail' | 'testing';
  lastTestAt?: string;
  lastError?: string;
};

type OllamaModelHealth = {
  status?: 'ok' | 'fail' | 'testing';
  lastTestAt?: string;
  lastError?: string;
  baseUrl?: string;
};

const OPENHANDS_BASE_URL = import.meta.env.VITE_OPENHANDS_URL ?? '/proxy/openhands';
const OPENJARVIS_BASE_URL = import.meta.env.VITE_OPENJARVIS_URL ?? '/proxy/openjarvis';
const OPENCLAW_BASE_URL = import.meta.env.VITE_OPENCLAW_URL ?? '/proxy/openclaw';
const KILOCODE_BASE_URL = import.meta.env.VITE_KILOCODE_URL ?? '/proxy/kilocode';
const CREWAI_BASE_URL = import.meta.env.VITE_CREWAI_URL ?? '/proxy/crewai';
const HERMES_BASE_URL = import.meta.env.VITE_HERMES_URL ?? '/proxy/hermes';
const GROQ_BASE_URL = import.meta.env.VITE_GROQ_URL ?? 'https://api.groq.com/openai/v1';
const OLLAMA_BASE_URL = import.meta.env.VITE_OLLAMA_URL
  ?? (import.meta.env.DEV ? '/proxy/ollama' : 'https://ollama.axecompanion.com');
const OLLAMA_MODEL_HEALTH_KEY = 'axe_ollama_model_health';

// Outdated models that should be auto-migrated on load
const MODEL_MIGRATIONS: Record<string, Record<string, string>> = {
  google: {
    'gemini-1.5-flash':    'gemini-flash-lite-latest',
    'gemini-1.5-pro':      'gemini-flash-lite-latest',
    'gemini-1.0-pro':      'gemini-flash-lite-latest',
    'gemini-2.0-flash-lite': 'gemini-flash-lite-latest',
  },
  anthropic: {
    'claude-3-5-sonnet-20241022': 'claude-sonnet-5',
    'claude-3-5-haiku-20241022':  'claude-sonnet-5',
  },
  openrouter: {
    'google/gemma-3-4b-it:free': 'meta-llama/llama-3.1-8b-instruct:free',
  },
  openai: {
    'gpt-4o': 'gpt-4o-mini',
  },
};

function loadProviderKeys(): Record<string, ProviderConn> {
  try {
    const stored = JSON.parse(localStorage.getItem('axe_llm_connections') ?? '{}') as Record<string, ProviderConn>;
    const defaultOllamaModels = getStoredLlmModelRegistry().map(m => m.name);
    // Seed from Vercel env vars if not yet in localStorage
    const envSeeds: Record<string, string> = {
      openrouter: import.meta.env.VITE_OPENROUTER_API_KEY ?? '',
      google:     import.meta.env.VITE_GEMINI_API_KEY     ?? '',
      xai:        import.meta.env.VITE_XAI_API_KEY        ?? '',
      openai:     import.meta.env.VITE_OPENAI_API_KEY     ?? '',
      anthropic:  import.meta.env.VITE_ANTHROPIC_API_KEY  ?? '',
      groq:       import.meta.env.VITE_GROQ_API_KEY       ?? '',
      krater:     import.meta.env.VITE_KRATER_API_KEY     ?? '',
    };
    let changed = false;
    for (const [id, envKey] of Object.entries(envSeeds)) {
      if (envKey && !stored[id]?.key) {
        stored[id] = { ...stored[id], key: envKey };
        changed = true;
      }
    }
    // Migrate outdated stored models
    for (const [providerId, migrations] of Object.entries(MODEL_MIGRATIONS)) {
      const conn = stored[providerId];
      if (conn?.model && migrations[conn.model]) {
        stored[providerId] = { ...conn, model: migrations[conn.model] };
        changed = true;
      }
    }
    for (const id of Object.keys(stored)) {
      const conn = stored[id];
      if (!conn) continue;
      const normalizedBaseUrl = normalizeProviderBaseUrl(id as ProviderId, conn.baseUrl ?? undefined);
      if (normalizedBaseUrl && normalizedBaseUrl !== conn.baseUrl) {
        stored[id] = { ...conn, baseUrl: normalizedBaseUrl };
        changed = true;
      }
    }
    if (stored.qrok && !stored.xai) {
      stored.xai = stored.qrok;
      delete stored.qrok;
      changed = true;
    }
    if (stored.openhandss && !stored.openhands) {
      stored.openhands = stored.openhandss;
      delete stored.openhandss;
      changed = true;
    }
    if (!stored.ollama?.models?.length) {
      stored.ollama = { ...stored.ollama, models: defaultOllamaModels };
      changed = true;
    }
    if (changed) localStorage.setItem('axe_llm_connections', JSON.stringify(stored));
    return stored;
  } catch { return {}; }
}
function saveProviderKeys(d: Record<string, ProviderConn>) {
  localStorage.setItem('axe_llm_connections', JSON.stringify(d));
  void saveSetting('axe_llm_connections', d);
  void saveLlmModelRegistry(registryEntriesFromNames(d.ollama?.models ?? getDefaultOllamaModelNames()));
}

function loadOllamaModelHealth(): Record<string, OllamaModelHealth> {
  try {
    return JSON.parse(localStorage.getItem(OLLAMA_MODEL_HEALTH_KEY) ?? '{}') as Record<string, OllamaModelHealth>;
  } catch {
    return {};
  }
}

function saveOllamaModelHealth(next: Record<string, OllamaModelHealth>) {
  localStorage.setItem(OLLAMA_MODEL_HEALTH_KEY, JSON.stringify(next));
  void saveSetting(OLLAMA_MODEL_HEALTH_KEY, next);
}

/* ─── Custom provider management ──────────────────────────────────── */
const CUSTOM_PROVIDERS_KEY = 'axe_custom_providers';

interface CustomProvider {
  id: string;
  name: string;
  accent: string;
  baseUrl: string;
  defaultModel: string;
  needsKey: boolean;
  format: 'openai' | 'anthropic' | 'google';
}

function loadCustomProviders(): CustomProvider[] {
  try { return JSON.parse(localStorage.getItem(CUSTOM_PROVIDERS_KEY) ?? '[]'); } catch { return []; }
}
function saveCustomProviders(list: CustomProvider[]) {
  localStorage.setItem(CUSTOM_PROVIDERS_KEY, JSON.stringify(list));
  void saveSetting(CUSTOM_PROVIDERS_KEY, list);
}

function ProviderKeysSection() {
  const voice = useVoiceStore();
  const [keys, setKeys] = useState<Record<string, ProviderConn>>(loadProviderKeys);
  const [showKey, setShowKey] = useState<Record<string, boolean>>({});
  const [testing, setTesting] = useState<Record<string, 'idle'|'ok'|'fail'|'testing'>>({});
  const [testErrors, setTestErrors] = useState<Record<string, string>>({});
  const [customProviders, setCustomProviders] = useState<CustomProvider[]>(loadCustomProviders);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newProvider, setNewProvider] = useState<CustomProvider>({ id: '', name: '', accent: '#22D3EE', baseUrl: '', defaultModel: '', needsKey: true, format: 'openai' });

  useEffect(() => {
    let alive = true;
    const hydrate = async () => {
      const stored = await loadSetting<Record<string, ProviderConn>>('axe_llm_connections', {});
      const storedCustom = await loadSetting<CustomProvider[]>(CUSTOM_PROVIDERS_KEY, []);
      if (!alive) return;
      if (Object.keys(stored).length > 0) setKeys(prev => ({ ...prev, ...stored }));
      if (storedCustom.length > 0) setCustomProviders(storedCustom);
    };
    void hydrate();
    return () => { alive = false; };
  }, []);

  const update = (id: string, field: keyof ProviderConn, val: string) => {
    setKeys(prev => {
      const next = { ...prev, [id]: { ...prev[id], [field]: val } };
      saveProviderKeys(next);
      return next;
    });
  };

  const testProvider = async (id: string, isCustom = false) => {
    const conn = keys[id] ?? {};
    const cat = isCustom ? null : PROVIDER_KEY_CATALOGUE.find(p => p.id === id);
    const custom = isCustom ? customProviders.find(p => p.id === id) : null;
    const needsKey = cat ? cat.needsKey : custom ? custom.needsKey : true;
    if (needsKey && !conn.key) return;
    setTesting(t => ({ ...t, [id]: 'testing' }));
    setKeys(prev => {
      const next = { ...prev, [id]: { ...prev[id], lastTest: 'testing' as const } };
      void saveSetting('axe_llm_connections', next);
      return next;
    });
    const cfg = PROVIDERS.find(p => p.id === id);
    const slot: KeySlot = {
      provider: id as ProviderId,
      key: conn.key ?? '',
      model: conn.model || cat?.defaultModel || custom?.defaultModel || '',
      baseUrl: normalizeProviderBaseUrl(id as ProviderId, conn.baseUrl || custom?.baseUrl || cfg?.baseUrl),
    };
    const ok = await voice.testSlot(slot);
    setTesting(t => ({ ...t, [id]: ok ? 'ok' : 'fail' }));
    if (!ok) {
      const raw = useVoiceStore.getState().error ?? 'Test mislukt';
      const retryMatch = raw.match(/retry[^\d]*(\d+(?:\.\d+)?)\s*s/i);
      const msg = retryMatch
        ? `Rate limit — probeer opnieuw over ${Math.ceil(Number(retryMatch[1]))}s`
        : raw.replace(/\s*https?:\/\/\S+/g, '').trim().slice(0, 140);
      setTestErrors(e => ({ ...e, [id]: msg }));
      setKeys(prev => {
        const next = { ...prev, [id]: { ...prev[id], lastTest: 'fail' as const, lastTestAt: new Date().toISOString(), lastError: msg } };
        void saveSetting('axe_llm_connections', next);
        return next;
      });
    } else {
      setTestErrors(e => { const n = { ...e }; delete n[id]; return n; });
      setKeys(prev => {
        const next = { ...prev, [id]: { ...prev[id], lastTest: 'ok' as const, lastTestAt: new Date().toISOString(), lastError: undefined } };
        void saveSetting('axe_llm_connections', next);
        return next;
      });
    }
    if (ok && !voice.primarySlot) voice.setPrimarySlot(slot);
  };

  const addCustomProvider = () => {
    if (!newProvider.id || !newProvider.name || !newProvider.baseUrl) return;
    const updated = [...customProviders, { ...newProvider }];
    setCustomProviders(updated);
    saveCustomProviders(updated);
    setShowAddForm(false);
    setNewProvider({ id: '', name: '', accent: '#22D3EE', baseUrl: '', defaultModel: '', needsKey: true, format: 'openai' });
  };

  const removeCustomProvider = (id: string) => {
    const updated = customProviders.filter(p => p.id !== id);
    setCustomProviders(updated);
    saveCustomProviders(updated);
  };

  const builtinIds = new Set<string>(PROVIDER_KEY_CATALOGUE.map(p => p.id));
  const allCatalogue = [
    ...PROVIDER_KEY_CATALOGUE,
    ...customProviders.filter(c => !builtinIds.has(c.id)).map(c => ({ ...c, emoji: '🔌', free: false, docsUrl: c.baseUrl })),
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-body font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <Key size={15} style={{ color: 'var(--accent-cyan)' }} /> Provider Keys
          </h2>
          <p className="text-xs-custom" style={{ color: 'var(--text-muted)' }}>
            LangGraph orchestrator kiest automatisch de juiste provider per taak — test elk model individueel.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { voice.clearRoutingLog(); }}
            title="Wis routing history (ROUTER TRACE)"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs-custom font-medium"
            style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: 'var(--error)' }}>
            <Trash2 size={12} /> Wis routing log
          </button>
          <button onClick={() => setShowAddForm(s => !s)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs-custom font-medium"
            style={{ background: 'rgba(34,211,238,0.1)', border: '1px solid rgba(34,211,238,0.3)', color: 'var(--accent-cyan)' }}>
            <Plus size={12} /> Add Provider
          </button>
        </div>
      </div>

      {/* Add custom provider form */}
      {showAddForm && (
        <div className="rounded-xl p-4 mb-3" style={{ background: 'var(--bg-surface)', border: '1px solid rgba(34,211,238,0.25)' }}>
          <h3 className="text-xs-custom font-semibold mb-2" style={{ color: 'var(--accent-cyan)' }}>Add Custom Provider</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            <input value={newProvider.id} onChange={e => setNewProvider(p => ({ ...p, id: e.target.value.toLowerCase().replace(/\s+/g, '-') }))} placeholder="Provider ID (e.g. my-llm)" className="w-full px-2.5 py-1.5 rounded-lg text-[11px] font-mono outline-none" style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }} />
            <input value={newProvider.name} onChange={e => setNewProvider(p => ({ ...p, name: e.target.value }))} placeholder="Display name" className="w-full px-2.5 py-1.5 rounded-lg text-[11px] outline-none" style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }} />
            <input value={newProvider.baseUrl} onChange={e => setNewProvider(p => ({ ...p, baseUrl: e.target.value }))} placeholder="Base URL (e.g. https://api.example.com/v1)" className="w-full px-2.5 py-1.5 rounded-lg text-[11px] font-mono outline-none" style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }} />
            <input value={newProvider.defaultModel} onChange={e => setNewProvider(p => ({ ...p, defaultModel: e.target.value }))} placeholder="Default model" className="w-full px-2.5 py-1.5 rounded-lg text-[11px] font-mono outline-none" style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }} />
            <select value={newProvider.format} onChange={e => setNewProvider(p => ({ ...p, format: e.target.value as 'openai' | 'anthropic' | 'google' }))} className="w-full px-2.5 py-1.5 rounded-lg text-[11px] outline-none" style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}>
              <option value="openai">OpenAI-compatible</option>
              <option value="anthropic">Anthropic</option>
              <option value="google">Google</option>
            </select>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1 text-[10px]" style={{ color: 'var(--text-muted)' }}>
                <input type="checkbox" checked={newProvider.needsKey} onChange={e => setNewProvider(p => ({ ...p, needsKey: e.target.checked }))} /> Needs API key
              </label>
            </div>
          </div>
          <div className="flex gap-2 mt-2">
            <button onClick={addCustomProvider} className="px-3 py-1.5 rounded-lg text-xs-custom font-medium" style={{ background: 'var(--accent-cyan)', color: '#000' }}><Check size={12} className="inline mr-1" /> Add</button>
            <button onClick={() => setShowAddForm(false)} className="px-3 py-1.5 rounded-lg text-xs-custom" style={{ background: 'var(--bg-active)', border: '1px solid var(--border-active)', color: 'var(--text-muted)' }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Provider cards grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
        {allCatalogue.map(cat => {
          const conn = keys[cat.id] ?? {};
          const needsKey = 'needsKey' in cat && cat.needsKey;
          const hasKey = !!conn.key;
          const configured = !needsKey || hasKey;
          const ts = testing[cat.id] ?? 'idle';
          // Cloudflare Pages: show key-status instead of network test result
          // (CORS blocks direct VPS health checks from static hosting)
          const keyStatus: 'configured' | 'missing' | 'not-needed' = needsKey ? (hasKey ? 'configured' : 'missing') : 'not-needed';
          const isCustom = customProviders.some(p => p.id === cat.id);
          return (
            <div key={cat.id} className="rounded-xl p-3 space-y-2"
              style={{ background: 'var(--bg-surface)', border: `1px solid ${configured ? `${('accent' in cat ? cat.accent : '#22D3EE')}30` : 'var(--border-subtle)'}`, transition: 'border-color 0.2s' }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-base shrink-0">{'emoji' in cat ? cat.emoji : '🔌'}</span>
                  <span className="text-xs-custom font-medium truncate" style={{ color: 'var(--text-primary)' }}>{cat.name}</span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <span className="text-[9px]" style={{
                    color: keyStatus === 'configured' || keyStatus === 'not-needed' ? 'var(--success)'
                      : keyStatus === 'missing' ? 'var(--error)'
                      : 'var(--text-muted)'
                  }}>
                    {keyStatus === 'configured' ? '● Configured' : keyStatus === 'not-needed' ? '● Ready' : '● Not Configured'}
                  </span>
                  {isCustom && (
                    <button onClick={() => removeCustomProvider(cat.id)} style={{ color: 'var(--text-muted)' }}><Trash2 size={9} /></button>
                  )}
                </div>
              </div>

              {'docsUrl' in cat && cat.docsUrl && (
                <a href={cat.docsUrl} target="_blank" rel="noreferrer" className="flex items-center gap-0.5 text-[9px]" style={{ color: 'var(--text-muted)' }}>
                  docs <ExternalLink size={8} />
                </a>
              )}

              {testErrors[cat.id] && (
                <p className="text-[10px]" style={{ color: 'var(--error)' }}>{testErrors[cat.id]}</p>
              )}
              {conn.lastTestAt && (
                <p className="text-[9px]" style={{ color: 'var(--text-muted)' }}>Last: {new Date(conn.lastTestAt).toLocaleTimeString()}</p>
              )}

              {('needsKey' in cat && cat.needsKey) ? (
                <div className="relative">
                  <input
                    type={showKey[cat.id] ? 'text' : 'password'}
                    value={conn.key ?? ''}
                    onChange={e => update(cat.id, 'key', e.target.value)}
                    placeholder={'placeholder' in cat ? cat.placeholder : 'API key...'}
                    className="w-full px-2.5 py-1.5 pr-7 rounded-lg text-[11px] font-mono outline-none"
                    style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
                  />
                  <button className="absolute right-2 top-1/2 -translate-y-1/2" onClick={() => setShowKey(s => ({ ...s, [cat.id]: !s[cat.id] }))} style={{ color: 'var(--text-muted)' }}>
                    {showKey[cat.id] ? <EyeOff size={11} /> : <Eye size={11} />}
                  </button>
                </div>
              ) : null}

              {/* Base URL for all providers */}
              <input
                type="text"
                value={conn.baseUrl ?? ('baseUrl' in cat ? cat.baseUrl : '')}
                onChange={e => update(cat.id, 'baseUrl', e.target.value)}
                placeholder="Base URL"
                className="w-full px-2.5 py-1.5 rounded-lg text-[11px] font-mono outline-none"
                style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
              />

              {/* Model input */}
              <input
                type="text"
                value={conn.model ?? ''}
                onChange={e => update(cat.id, 'model', e.target.value)}
                placeholder={'defaultModel' in cat ? cat.defaultModel : 'model'}
                className="w-full px-2.5 py-1.5 rounded-lg text-[11px] font-mono outline-none"
                style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
              />

              {/* Model quick-select for known providers */}
              {cat.id === 'groq' && (
                <div className="flex flex-wrap gap-1">
                  {['qwen/qwen3-32b', 'openai/gpt-oss-20b', 'groq/compound', 'llama-3.3-70b-versatile'].map(model => (
                    <button key={model} onClick={() => update(cat.id, 'model', model)} className="px-1.5 py-0.5 rounded-full text-[8px] font-mono" style={{ background: 'rgba(236,72,153,0.08)', border: '1px solid rgba(236,72,153,0.18)', color: 'var(--text-secondary)' }}>{model}</button>
                  ))}
                </div>
              )}

              <button
                onClick={() => testProvider(cat.id, isCustom)}
                disabled={ts === 'testing' || (('needsKey' in cat && cat.needsKey) && !conn.key)}
                className="w-full flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium"
                style={{
                  background: ts === 'ok' ? 'rgba(16,185,129,0.1)' : ts === 'fail' ? 'rgba(239,68,68,0.1)' : 'var(--bg-active)',
                  border: `1px solid ${ts === 'ok' ? 'rgba(16,185,129,0.3)' : ts === 'fail' ? 'rgba(239,68,68,0.3)' : 'var(--border-active)'}`,
                  color: ts === 'ok' ? 'var(--success)' : ts === 'fail' ? 'var(--error)' : 'var(--text-secondary)',
                  opacity: (ts === 'testing' || (('needsKey' in cat && cat.needsKey) && !conn.key)) ? 0.5 : 1,
                }}>
                {ts === 'testing' ? <RefreshCw size={11} className="animate-spin" /> : ts === 'ok' ? <Check size={11} /> : ts === 'fail' ? <X size={11} /> : <Zap size={11} />}
                <span>{ts === 'testing' ? 'Testing...' : ts === 'ok' ? 'OK' : ts === 'fail' ? 'Fail' : 'Test'}</span>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function OllamaModelsSection() {
  const voice = useVoiceStore();
  const [registry, setRegistry] = useState(getStoredLlmModelRegistry());
  const [health, setHealth] = useState<Record<string, OllamaModelHealth>>(loadOllamaModelHealth());
  const [syncing, setSyncing] = useState(false);
  const [testing, setTesting] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let alive = true;
    const hydrate = async () => {
      const storedRegistry = await loadSetting('axe_ollama_model_registry', getStoredLlmModelRegistry());
      const storedHealth = await loadSetting<Record<string, OllamaModelHealth>>(OLLAMA_MODEL_HEALTH_KEY, {});
      if (!alive) return;
      if (Array.isArray(storedRegistry) && storedRegistry.length) setRegistry(storedRegistry);
      if (storedHealth && typeof storedHealth === 'object') setHealth(storedHealth);
    };
    void hydrate();
    void syncFromVps();
    return () => { alive = false; };
  }, []);

  const saveHealth = (next: Record<string, OllamaModelHealth>) => {
    setHealth(next);
    saveOllamaModelHealth(next);
  };

  const syncFromVps = async () => {
    setSyncing(true);
    try {
      const conns = JSON.parse(localStorage.getItem('axe_llm_connections') ?? '{}') as Record<string, ProviderConn>;
      const baseUrl = conns.ollama?.baseUrl ?? OLLAMA_BASE_URL;
      const res = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(8000) });
      const data = res.ok ? await res.json() : null;
      const names = (data?.models ?? []).map((m: { name: string }) => m.name).filter(Boolean);
      const nextRegistry = names.length ? registryEntriesFromNames(names) : getStoredLlmModelRegistry();
      setRegistry(nextRegistry);
      await saveLlmModelRegistry(nextRegistry);
    } catch {
      // keep current registry
    } finally {
      setSyncing(false);
    }
  };

  const testModel = async (modelName: string) => {
    setTesting(prev => ({ ...prev, [modelName]: true }));
    const conns = JSON.parse(localStorage.getItem('axe_llm_connections') ?? '{}') as Record<string, ProviderConn>;
    const baseUrl = conns.ollama?.baseUrl ?? OLLAMA_BASE_URL;
    saveHealth({
      ...health,
      [modelName]: { ...health[modelName], status: 'testing', lastTestAt: new Date().toISOString(), baseUrl },
    });
    const ok = await voice.testSlot({ provider: 'ollama', key: '', model: modelName, baseUrl });
    const err = ok ? undefined : (useVoiceStore.getState().error ?? 'Test mislukt').slice(0, 180);
    saveHealth({
      ...health,
      [modelName]: { status: ok ? 'ok' : 'fail', lastTestAt: new Date().toISOString(), lastError: err, baseUrl },
    });
    setTesting(prev => ({ ...prev, [modelName]: false }));
  };

  const models = [...registry].sort((a, b) => a.priority - b.priority);

  return (
    <WidgetCard title="🦙 OLLAMA MODELS (VPS)">
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-xs-custom" style={{ color: 'var(--text-secondary)' }}>Elk model heeft zijn eigen kaart en opgeslagen teststatus.</p>
            <p className="text-[9px]" style={{ color: 'var(--text-muted)' }}>Alleen modellen die echt via de VPS beschikbaar zijn, horen hier OK te blijven.</p>
          </div>
          <button onClick={syncFromVps} disabled={syncing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px]"
            style={{ background: 'var(--bg-active)', border: '1px solid var(--border-active)', color: 'var(--text-secondary)' }}>
            <RefreshCw size={11} className={syncing ? 'animate-spin' : ''} />
            sync van VPS
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
          {models.map(model => {
            const state = health[model.name];
            const isOk = state?.status === 'ok';
            const isFail = state?.status === 'fail';
            const isTesting = !!testing[model.name];
            return (
              <div key={model.name} className="rounded-xl p-3 space-y-2"
                style={{ background: 'var(--bg-surface)', border: `1px solid ${isOk ? 'rgba(16,185,129,0.28)' : isFail ? 'rgba(239,68,68,0.28)' : 'var(--border-subtle)'}` }}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs-custom font-semibold" style={{ color: 'var(--text-primary)' }}>{model.displayName}</span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(16,185,129,0.08)', color: 'var(--success)' }}>VPS</span>
                    </div>
                    <p className="text-[10px] font-mono truncate" style={{ color: 'var(--text-muted)' }}>{model.name}</p>
                  </div>
                  <span className="text-[9px]" style={{ color: isOk ? 'var(--success)' : isFail ? 'var(--error)' : 'var(--text-muted)' }}>
                    {isOk ? '● OK' : isFail ? '● Fail' : '● Saved'}
                  </span>
                </div>
                <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{model.description}</p>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(34,211,238,0.08)', color: 'var(--accent-cyan)' }}>{model.category}</span>
                  <button
                    onClick={() => testModel(model.name)}
                    disabled={isTesting}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-medium"
                    style={{ background: 'var(--bg-active)', border: '1px solid var(--border-active)', color: 'var(--text-secondary)', opacity: isTesting ? 0.65 : 1 }}>
                    {isTesting ? <RefreshCw size={10} className="animate-spin" /> : <Zap size={10} />}
                    {isTesting ? 'Testing...' : 'Test'}
                  </button>
                  {state?.lastTestAt && <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>{new Date(state.lastTestAt).toLocaleString()}</span>}
                </div>
                {state?.lastError && <p className="text-[10px]" style={{ color: 'var(--error)' }}>{state.lastError}</p>}
              </div>
            );
          })}
        </div>
      </div>
    </WidgetCard>
  );
}

function ServiceHealthSection() {
  const [services, setServices] = useState<ServiceState[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    const next = await getSystemState();
    setServices(next);
    setLoading(false);
  };

  useEffect(() => {
    void refresh();
    return () => { /* no-op */ };
  }, []);

  const refresh = async () => {
    setRefreshing(true);
    try {
      await checkAllServices();
      await load();
    } finally {
      setRefreshing(false);
    }
  };

  const focusOrder = ['supabase', 'github', 'n8n', 'langgraph', 'terminal', 'ollama', 'openhands', 'openjarvis', 'openclaw', 'kilocode', 'crewai', 'hermes'];
  const ordered = focusOrder
    .map(name => services.find(service => service.service === name))
    .filter((service): service is ServiceState => !!service)
    .concat(services.filter(service => !focusOrder.includes(service.service)));

  return (
    <WidgetCard title="🌐 LIVE SERVICES">
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-xs-custom" style={{ color: 'var(--text-secondary)' }}>Groene pulse betekent online, niet alleen geconfigureerd.</p>
            <p className="text-[9px]" style={{ color: 'var(--text-muted)' }}>Dit volgt de health registry die AXE Core gebruikt.</p>
          </div>
          <button onClick={refresh} disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px]"
            style={{ background: 'var(--bg-active)', border: '1px solid var(--border-active)', color: 'var(--text-secondary)' }}>
            <Activity size={11} className={refreshing ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
        {loading ? (
          <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Loading service health…</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {ordered.map(service => {
              const online = service.status === 'online';
              const degraded = service.status === 'degraded';
              const label = service.service === 'n8n' ? 'n8n' : service.display || service.service;
              const isVps = ['openhands', 'openjarvis', 'openclaw', 'kilocode', 'crewai', 'hermes', 'ollama'].includes(service.service);
              return (
                <div key={service.service} className="rounded-xl p-3 flex items-center gap-3"
                  style={{ background: 'var(--bg-surface)', border: `1px solid ${online ? 'rgba(16,185,129,0.28)' : degraded ? 'rgba(245,158,11,0.28)' : 'var(--border-subtle)'}` }}>
                  <span className={`h-2.5 w-2.5 rounded-full ${online ? 'animate-pulse' : ''}`} style={{ background: online ? 'var(--success)' : degraded ? 'var(--warning)' : 'var(--error)' }} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs-custom font-medium" style={{ color: 'var(--text-primary)' }}>{label}</span>
                      {isVps && <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>(VPS)</span>}
                    </div>
                    <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                      {service.status}{service.latency_ms ? ` · ${service.latency_ms}ms` : ''}{service.version ? ` · ${service.version}` : ''}
                    </p>
                  </div>
                  <Server size={12} style={{ color: online ? 'var(--success)' : 'var(--text-muted)' }} />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </WidgetCard>
  );
}

function RemoteTerminalSection() {
  const [service, setService] = useState<ServiceState | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    const next = (await getSystemState()).find(item => item.service === 'terminal') ?? null;
    setService(next);
    setLoading(false);
  };

  useEffect(() => {
    void refresh();
    return () => { /* no-op */ };
  }, []);

  const refresh = async () => {
    setRefreshing(true);
    try {
      await checkAllServices();
      await load();
    } finally {
      setRefreshing(false);
    }
  };

  const online = service?.status === 'online';
  const degraded = service?.status === 'degraded';

  return (
    <WidgetCard title="🖥️ REMOTE TERMINAL">
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-xs-custom" style={{ color: 'var(--text-secondary)' }}>Beveiligde shell via `wss://api.axecompanion.com/terminal`.</p>
            <p className="text-[9px]" style={{ color: 'var(--text-muted)' }}>Status komt uit dezelfde registry als de rest van AXE Core.</p>
          </div>
          <button onClick={refresh} disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px]"
            style={{ background: 'var(--bg-active)', border: '1px solid var(--border-active)', color: 'var(--text-secondary)' }}>
            <Activity size={11} className={refreshing ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Loading terminal status…</div>
        ) : (
          <div className="rounded-xl p-3 flex items-center gap-3"
            style={{ background: 'var(--bg-surface)', border: `1px solid ${online ? 'rgba(16,185,129,0.28)' : degraded ? 'rgba(245,158,11,0.28)' : 'var(--border-subtle)'}` }}>
            <span className={`h-2.5 w-2.5 rounded-full ${online ? 'animate-pulse' : ''}`} style={{ background: online ? 'var(--success)' : degraded ? 'var(--warning)' : 'var(--error)' }} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-xs-custom font-medium" style={{ color: 'var(--text-primary)' }}>AXE Terminal</span>
                <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>(VPS)</span>
              </div>
              <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                {service?.status ?? 'unknown'}{service?.latency_ms ? ` · ${service.latency_ms}ms` : ''}{service?.version ? ` · ${service.version}` : ''}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <a
                href="/terminal"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-medium"
                style={{ background: 'rgba(34,211,238,0.1)', border: '1px solid rgba(34,211,238,0.25)', color: 'var(--accent-cyan)' }}>
                Open
              </a>
              <Server size={12} style={{ color: online ? 'var(--success)' : 'var(--text-muted)' }} />
            </div>
          </div>
        )}
      </div>
    </WidgetCard>
  );
}

/* ─── Quick-fill presets ──────────────────────────────────────────── */
const QUICK_PRESETS = [
  {
    label: 'OpenJarvis',
    sublabel: 'proxy / VPS · auto-routes all LLMs',
    emoji: '🤖',
    accent: '#A78BFA',
    values: { provider: 'openjarvis' as const, key: '', baseUrl: '/proxy/openjarvis', model: '' },
    tip: 'VPS bridge endpoint. The health test checks the live model registry.',
  },
  {
    label: 'Ollama',
    sublabel: 'proxy / VPS · llama3.2',
    emoji: '🦙',
    accent: '#10B981',
    values: { provider: 'ollama' as const, key: '', baseUrl: OLLAMA_BASE_URL, model: 'llama3.1:8b' },
    tip: 'Ollama draait op je VPS via Cloudflare tunnel. Zorg dat OLLAMA_ORIGINS=* is ingesteld.',
  },
  {
    label: 'OpenRouter Free',
    sublabel: 'Llama 3.1 · gratis tier',
    emoji: '🔓',
    accent: '#F59E0B',
    values: { provider: 'openrouter' as const, key: '', baseUrl: '', model: 'meta-llama/llama-3.1-8b-instruct:free' },
    tip: 'Get free key at openrouter.ai — models ending in :free have no cost. Paste your key above.',
  },
  {
    label: 'Gemini Flash',
    sublabel: 'Google AI Studio · gratis',
    emoji: '✨',
    accent: '#3B82F6',
    values: { provider: 'google' as const, key: '', baseUrl: '', model: 'gemini-2.0-flash' },
    tip: 'Get free key at aistudio.google.com — Gemini 2.0 Flash is generous on the free tier. Paste your key above.',
  },
];

/* ─── Slot editor ─────────────────────────────────────────────────── */
function SlotEditor({ label, slot, onSave, onClear, accent }:
  { label: string; slot: KeySlot | null; onSave: (s: KeySlot) => void; onClear: () => void; accent: string }) {

  const [provider, setProvider] = useState<ProviderId>(slot?.provider ?? 'anthropic');
  const [key, setKey]     = useState(slot?.key ?? '');
  const [model, setModel] = useState(slot?.model ?? '');
  const [baseUrl, setBaseUrl] = useState(slot?.baseUrl ?? '');
  const [show, setShow]   = useState(false);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<boolean | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const voice = useVoiceStore();

  // Sync form when slot is updated externally (e.g. 'Setup Free Config' button)
  useEffect(() => {
    setProvider(slot?.provider ?? 'anthropic');
    setKey(slot?.key ?? '');
    setModel(slot?.model ?? '');
    setBaseUrl(slot?.baseUrl ?? '');
    setTestResult(null);
    setTestError(null);
  }, [slot]);

  const cfg = PROVIDERS.find(p => p.id === provider)!;
  const needsKey = !OPTIONAL_KEY_PROVIDERS.has(provider);
  const [activeTip, setActiveTip] = useState<string | null>(null);

  const applyPreset = (preset: typeof QUICK_PRESETS[0]) => {
    setProvider(preset.values.provider);
    setKey(preset.values.key);
    setBaseUrl(preset.values.baseUrl);
    setModel(preset.values.model);
    setTestResult(null);
    setActiveTip(preset.tip);
    setTimeout(() => setActiveTip(null), 5000);
    // Auto-save if no API key is required (Ollama, OpenHands, OpenJarvis)
    const canAutoSave = OPTIONAL_KEY_PROVIDERS.has(preset.values.provider) || preset.values.key !== '';
    if (canAutoSave) {
      const s: KeySlot = {
        provider: preset.values.provider,
        key: preset.values.key,
        model: preset.values.model || undefined,
        baseUrl: preset.values.baseUrl || undefined,
      };
      onSave(s);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  };

  const handleSave = () => {
    if (needsKey && !key.trim()) return;
    const s: KeySlot = { provider, key: key.trim(), model: model.trim() || undefined, baseUrl: baseUrl.trim() || undefined };
    onSave(s);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleTest = async () => {
    if (needsKey && !key.trim()) return;
    setTesting(true);
    setTestResult(null);
    setTestError(null);
    const s: KeySlot = { provider, key: key.trim(), model: model.trim() || undefined, baseUrl: baseUrl.trim() || undefined };
    const ok = await voice.testSlot(s);
    setTestResult(ok);
    // Capture error immediately for THIS slot — before any other test can overwrite shared store.error
    if (!ok) setTestError(useVoiceStore.getState().error);
    setTesting(false);
  };

  return (
    <WidgetCard title={label} headerAction={
      <div className="flex items-center gap-1">
        {slot && <span className="rounded-full" style={{ width: 6, height: 6, background: 'var(--success)', display: 'inline-block', boxShadow: '0 0 4px var(--success)' }} />}
        {slot && <span className="text-[10px]" style={{ color: 'var(--success)' }}>{PROVIDERS.find(p => p.id === slot.provider)?.name} geconfigureerd</span>}
      </div>
    }>
      <div className="space-y-2.5">
        {/* Quick presets */}
        <div>
          <p className="text-[10px] mb-1.5" style={{ color: 'var(--text-muted)' }}>Quick presets</p>
          <div className="flex flex-wrap gap-2">
            {QUICK_PRESETS.map(preset => (
              <button
                key={preset.label}
                onClick={() => applyPreset(preset)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all hover:brightness-125"
                style={{ background: `${preset.accent}18`, border: `1px solid ${preset.accent}35`, color: preset.accent }}
                title={preset.tip}
              >
                <span>{preset.emoji}</span>
                <span>{preset.label}</span>
                <span className="text-[9px] opacity-60">{preset.sublabel}</span>
              </button>
            ))}
          </div>
          {activeTip && (
            <p className="text-[10px] mt-1.5 px-2 py-1 rounded" style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--text-muted)' }}>
              ℹ️ {activeTip}
            </p>
          )}
        </div>

        {/* Provider select */}
        <div>
          <label className="text-xs-custom block mb-1" style={{ color: 'var(--text-muted)' }}>Provider</label>
          <select value={provider} onChange={e => { setProvider(e.target.value as ProviderId); setKey(''); setModel(''); setBaseUrl(''); setTestResult(null); }}
            className="w-full px-3 py-2 rounded-lg text-small outline-none"
            style={{ background: '#0A0A0A', border: '1px solid rgba(255,255,255,0.06)', color: 'var(--text-primary)' }}>
            {PROVIDERS.map(p => <option key={p.id} value={p.id}>{p.name} — {p.defaultModel}</option>)}
          </select>
        </div>

        {/* API Key */}
        {needsKey && (
          <div>
            <label className="text-xs-custom block mb-1" style={{ color: 'var(--text-muted)' }}>API Key</label>
            <div className="relative">
              <input
                type={show ? 'text' : 'password'}
                value={key}
                onChange={e => setKey(e.target.value)}
                placeholder={`${cfg.name} API key...`}
                className="w-full px-3 py-2 pr-8 rounded-lg text-small font-mono-data outline-none"
                style={{ background: '#0A0A0A', border: '1px solid rgba(255,255,255,0.06)', color: 'var(--text-primary)' }}
                onFocus={e => { e.currentTarget.style.borderColor = accent; }}
                onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'; }}
              />
              <button className="absolute right-2 top-1/2 -translate-y-1/2" onClick={() => setShow(v => !v)} style={{ color: 'var(--text-muted)' }}>
                {show ? <EyeOff size={13} /> : <Eye size={13} />}
              </button>
            </div>
          </div>
        )}

        {/* Base URL — shown for optional-key providers and OpenAI-compatible custom endpoints */}
        {(!needsKey || provider === 'openai') && (
          <div>
            <label className="text-xs-custom block mb-1" style={{ color: 'var(--text-muted)' }}>Base URL</label>
              <input value={baseUrl} onChange={e => setBaseUrl(e.target.value)}
              placeholder={provider === 'openjarvis'
                ? '/proxy/openjarvis'
                : provider === 'openhands'
                ? '/proxy/openhands'
                  : provider === 'openclaw'
                    ? '/proxy/openclaw'
                    : provider === 'kilocode'
                      ? '/proxy/kilocode'
                      : provider === 'crewai'
                        ? '/proxy/crewai'
                        : provider === 'hermes'
                          ? '/proxy/hermes'
                  : provider === 'ollama'
                    ? OLLAMA_BASE_URL
                    : '/proxy/openjarvis'}
              className="w-full px-3 py-2 rounded-lg text-small font-mono-data outline-none"
              style={{ background: '#0A0A0A', border: '1px solid rgba(255,255,255,0.06)', color: 'var(--text-primary)' }} />
          </div>
        )}

        {/* Custom model (optional) */}
        <div>
          <label className="text-xs-custom block mb-1" style={{ color: 'var(--text-muted)' }}>Model <span style={{ opacity: 0.5 }}>(optional, uses default if empty)</span></label>
          <input value={model} onChange={e => setModel(e.target.value)} placeholder={cfg.defaultModel}
            className="w-full px-3 py-2 rounded-lg text-small font-mono-data outline-none"
            style={{ background: '#0A0A0A', border: '1px solid rgba(255,255,255,0.06)', color: 'var(--text-primary)' }} />
        </div>

        {/* Action buttons */}
        <div className="flex gap-2">
          <button onClick={handleSave} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs-custom font-medium transition-all"
            style={{ background: saved ? 'rgba(16,185,129,0.15)' : `${accent}20`, border: `1px solid ${saved ? 'rgba(16,185,129,0.4)' : `${accent}40`}`, color: saved ? 'var(--success)' : accent }}>
            {saved ? <><Check size={12} /> Saved!</> : <><Save size={12} /> Save</>}
          </button>
          <button onClick={handleTest} disabled={testing || (needsKey && !key.trim())}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs-custom font-medium transition-all"
            style={{ background: testResult === true ? 'rgba(16,185,129,0.1)' : testResult === false ? 'rgba(239,68,68,0.1)' : 'var(--bg-active)', border: `1px solid ${testResult === true ? 'rgba(16,185,129,0.3)' : testResult === false ? 'rgba(239,68,68,0.3)' : 'var(--border-active)'}`, color: testResult === true ? 'var(--success)' : testResult === false ? 'var(--error)' : 'var(--text-secondary)', opacity: (testing || (needsKey && !key.trim())) ? 0.5 : 1 }}>
            {testing ? <RefreshCw size={12} className="animate-spin" /> : testResult === true ? <Check size={12} /> : testResult === false ? <X size={12} /> : <Zap size={12} />}
            {testing ? 'Testing...' : testResult === true ? 'Working!' : testResult === false ? 'Failed' : 'Test'}
          </button>
          {slot && (
            <button onClick={onClear} className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs-custom"
              style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
              <X size={11} /> Clear
            </button>
          )}
        </div>

        {testResult === false && testError && (
          <p className="text-xs-custom" style={{ color: 'var(--error)' }}>{testError}</p>
        )}

        <p className="text-[9px]" style={{ color: 'var(--text-muted)' }}>Keys synced to Supabase · Encrypted · Alleen jij kan ze lezen</p>
      </div>
    </WidgetCard>
  );
}

/* ─── GitHub Repos Section ────────────────────────────────────────── */
export interface RepoConfig {
  id: string;       // 'axe-core' | 'axe-companion' | 'trading-os'
  label: string;
  owner: string;
  repo: string;
  branch: string;
  srcPrefix: string; // path inside repo where src/ lives
  token: string;     // GitHub PAT — stored locally, never sent to backend
}

const DEFAULT_REPOS: RepoConfig[] = [
  {
    id: 'axe-core',
    label: 'AXE CORE',
    owner: 'Ldezeeuw445',
    repo: 'AXE-CORE-',
    branch: 'orchestrator',
    srcPrefix: 'AXE-CORE-ORCHESTRATOR-content/AXE-CORE-HEADQUARTERS/src',
    token: '',
  },
  {
    id: 'axe-companion',
    label: 'AXE Companion OS',
    owner: 'Ldezeeuw445',
    repo: 'AXE-COMPANION-OS-',
    branch: 'main',
    srcPrefix: 'src',
    token: '',
  },
  {
    id: 'trading-os',
    label: 'Trading OS',
    owner: 'TRADING-AXE-OS-APPS',
    repo: 'TRADING-OS',
    branch: 'main',
    srcPrefix: 'src',
    token: '',
  },
];

export function loadRepoConfigs(): RepoConfig[] {
  try {
    const stored = JSON.parse(localStorage.getItem('axe_github_repos') ?? 'null');
    if (Array.isArray(stored) && stored.length > 0) return stored as RepoConfig[];
  } catch { /* */ }
  return DEFAULT_REPOS;
}

function saveRepoConfigs(repos: RepoConfig[]) {
  localStorage.setItem('axe_github_repos', JSON.stringify(repos));
  void saveSetting('axe_github_repos', repos);
}

function GitHubReposSection() {
  const [repos, setRepos] = useState<RepoConfig[]>(loadRepoConfigs);
  const [showToken, setShowToken] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let alive = true;
    const hydrate = async () => {
      const stored = await loadSetting<RepoConfig[]>('axe_github_repos', DEFAULT_REPOS);
      if (!alive) return;
      if (Array.isArray(stored) && stored.length > 0) {
        setRepos(stored);
      }
    };
    void hydrate();
    return () => { alive = false; };
  }, []);

  const update = (id: string, field: keyof RepoConfig, value: string) => {
    setRepos(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
  };

  const save = () => {
    saveRepoConfigs(repos);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const reset = (id: string) => {
    const def = DEFAULT_REPOS.find(r => r.id === id);
    if (def) setRepos(prev => prev.map(r => r.id === id ? { ...def, token: r.token } : r));
  };

  return (
    <div>
      <p className="text-xs-custom mb-3" style={{ color: 'var(--text-muted)' }}>
        Configureer de 3 repos waarop AXE CORE kan committen. Wanneer je zegt "verander X", kiest AXE CORE automatisch de juiste repo.
        Gebruik één <strong style={{ color: 'var(--text-secondary)' }}>GitHub PAT</strong> (met <code style={{ fontSize: 10 }}>repo</code>-scope) voor alle repos.
      </p>
      <div className="space-y-3">
        {repos.map(r => (
          <div key={r.id} className="rounded-xl p-3 space-y-2" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
            <div className="flex items-center gap-2">
              <Github size={13} style={{ color: 'var(--accent-cyan)', flexShrink: 0 }} />
              <span className="text-xs-custom font-semibold" style={{ color: 'var(--text-primary)' }}>{r.label}</span>
              <a href={`https://github.com/${r.owner}/${r.repo}`} target="_blank" rel="noreferrer"
                className="ml-auto flex items-center gap-0.5 text-[9px]" style={{ color: 'var(--text-muted)' }}>
                {r.owner}/{r.repo} <ExternalLink size={8} />
              </a>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <div>
                <label className="text-[9px] block mb-1" style={{ color: 'var(--text-muted)' }}>Owner</label>
                <input value={r.owner} onChange={e => update(r.id, 'owner', e.target.value)}
                  className="w-full px-2 py-1 rounded text-[10px] font-mono outline-none"
                  style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }} />
              </div>
              <div>
                <label className="text-[9px] block mb-1" style={{ color: 'var(--text-muted)' }}>Repo</label>
                <input value={r.repo} onChange={e => update(r.id, 'repo', e.target.value)}
                  className="w-full px-2 py-1 rounded text-[10px] font-mono outline-none"
                  style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }} />
              </div>
              <div>
                <label className="text-[9px] block mb-1" style={{ color: 'var(--text-muted)' }}>Branch</label>
                <input value={r.branch} onChange={e => update(r.id, 'branch', e.target.value)}
                  className="w-full px-2 py-1 rounded text-[10px] font-mono outline-none"
                  style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }} />
              </div>
            </div>
            <div>
              <label className="text-[9px] block mb-1" style={{ color: 'var(--text-muted)' }}>
                <GitBranch size={8} className="inline mr-0.5" />src prefix in repo
              </label>
              <input value={r.srcPrefix} onChange={e => update(r.id, 'srcPrefix', e.target.value)}
                className="w-full px-2 py-1 rounded text-[10px] font-mono outline-none"
                style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }} />
            </div>
            <div>
              <label className="text-[9px] block mb-1" style={{ color: 'var(--text-muted)' }}>GitHub Token (PAT) — gedeeld voor alle repos is OK</label>
              <div className="relative">
                <input
                  type={showToken[r.id] ? 'text' : 'password'}
                  value={r.token}
                  onChange={e => update(r.id, 'token', e.target.value)}
                  placeholder="ghp_... of github_pat_..."
                  className="w-full px-2 py-1 pr-7 rounded text-[10px] font-mono outline-none"
                  style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
                />
                <button className="absolute right-2 top-1/2 -translate-y-1/2"
                  onClick={() => setShowToken(s => ({ ...s, [r.id]: !s[r.id] }))} style={{ color: 'var(--text-muted)' }}>
                  {showToken[r.id] ? <EyeOff size={10} /> : <Eye size={10} />}
                </button>
              </div>
            </div>
            <button onClick={() => reset(r.id)} className="flex items-center gap-1 text-[9px]" style={{ color: 'var(--text-muted)' }}>
              <Trash2 size={8} /> reset naar default
            </button>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button onClick={save}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs-custom font-medium"
          style={{ background: saved ? 'rgba(16,185,129,0.15)' : 'rgba(34,211,238,0.1)', border: `1px solid ${saved ? 'rgba(16,185,129,0.4)' : 'rgba(34,211,238,0.3)'}`, color: saved ? 'var(--success)' : 'var(--accent-cyan)' }}>
          {saved ? <><Check size={12} /> Opgeslagen!</> : <><Save size={12} /> Opslaan</>}
        </button>
        <p className="text-[9px]" style={{ color: 'var(--text-muted)' }}>
          Tokens worden alleen lokaal opgeslagen (localStorage) — nooit verstuurd naar de server.
        </p>
      </div>
    </div>
  );
}

/* ─── Main Settings page ──────────────────────────────────────────── */
export default function SettingsPage() {
  const voice = useVoiceStore();
  const [micTest, setMicTest] = useState<'idle' | 'testing' | 'ok' | 'denied'>('idle');
  const [clapEnabled, setClapEnabled] = useState(false);

  useEffect(() => { voice.checkMicPermission(); }, []);
  useEffect(() => { loadSetting('axe_clap_activate_enabled', false).then(setClapEnabled); }, []);

  const toggleClap = () => {
    const next = !clapEnabled;
    setClapEnabled(next);
    void saveSetting('axe_clap_activate_enabled', next);
  };

  const testMic = async () => {
    setMicTest('testing');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(t => t.stop());
      setMicTest('ok');
    } catch { setMicTest('denied'); }
  };

  return (
    <motion.div className="p-5 h-full overflow-y-auto" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <h1 className="text-page-title font-semibold mb-5" style={{ color: 'var(--text-primary)' }}>Settings</h1>

      <div className="space-y-4">

         {/* ── Provider Keys (unified smart-router keys) ────────────── */}
         <ProviderKeysSection />

         {/* ── Ollama Models ─────────────────────────────────────────── */}
        <OllamaModelsSection />

        {/* ── Microphone ───────────────────────────────────────────── */}
        <WidgetCard title="MICROPHONE" headerAction={<Mic size={14} style={{ color: 'var(--text-muted)' }} />}>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-small" style={{ color: 'var(--text-primary)' }}>Browser microphone access</p>
                <p className="text-xs-custom" style={{ color: 'var(--text-muted)' }}>
                  Permission: <span style={{ color: voice.micPermission === 'granted' ? 'var(--success)' : voice.micPermission === 'denied' ? 'var(--error)' : 'var(--warning)' }}>{voice.micPermission}</span>
                  {' · '}Recognition supported: <span style={{ color: voice.recognitionSupported ? 'var(--success)' : 'var(--error)' }}>{voice.recognitionSupported ? 'yes' : 'no'}</span>
                </p>
              </div>
              <button onClick={testMic} className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs-custom"
                style={{ background: micTest === 'ok' ? 'rgba(16,185,129,0.1)' : micTest === 'denied' ? 'rgba(239,68,68,0.1)' : 'var(--bg-active)', border: `1px solid ${micTest === 'ok' ? 'rgba(16,185,129,0.3)' : micTest === 'denied' ? 'rgba(239,68,68,0.3)' : 'var(--border-active)'}`, color: micTest === 'ok' ? 'var(--success)' : micTest === 'denied' ? 'var(--error)' : 'var(--accent-cyan)' }}>
                {micTest === 'testing' ? <RefreshCw size={12} className="animate-spin" /> : <Mic size={12} />}
                {micTest === 'idle' ? 'Test Mic' : micTest === 'testing' ? 'Testing...' : micTest === 'ok' ? 'Mic Works!' : 'Permission Denied'}
              </button>
            </div>
            {voice.micPermission === 'denied' && (
              <div className="p-3 rounded-lg flex items-start gap-2" style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.2)' }}>
                <AlertTriangle size={13} style={{ color: 'var(--error)', flexShrink: 0, marginTop: 1 }} />
                <p className="text-xs-custom" style={{ color: 'var(--error)' }}>
                  Microphone blocked. Click the lock icon in the address bar → Site Settings → Microphone → Allow → Refresh page.
                </p>
              </div>
            )}
            {micTest === 'ok' && (
              <div className="p-3 rounded-lg flex items-start gap-2" style={{ background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.2)' }}>
                <Check size={13} style={{ color: 'var(--success)', flexShrink: 0, marginTop: 1 }} />
                <p className="text-xs-custom" style={{ color: 'var(--success)' }}>Microphone is working correctly. Use the circle button in the bottom bar to talk to AXE.</p>
              </div>
            )}

            <div className="flex items-center justify-between pt-2" style={{ borderTop: '1px solid var(--border-active)' }}>
              <div>
                <p className="text-small" style={{ color: 'var(--text-primary)' }}>Clap to activate</p>
                <p className="text-xs-custom" style={{ color: 'var(--text-muted)' }}>
                  Clap twice (or three times) to open AXE and start listening, from anywhere in the app. Keeps the mic on in the background while enabled.
                </p>
              </div>
              <button onClick={toggleClap} role="switch" aria-checked={clapEnabled}
                className="relative flex-shrink-0 rounded-full transition-colors"
                style={{ width: 38, height: 22, background: clapEnabled ? 'var(--accent-cyan)' : 'var(--bg-active)', border: '1px solid var(--border-active)' }}>
                <span className="absolute top-0.5 rounded-full bg-white transition-transform" style={{ width: 16, height: 16, transform: clapEnabled ? 'translateX(18px)' : 'translateX(2px)' }} />
              </button>
            </div>
          </div>
        </WidgetCard>

        {/* ── Capability Router ─────────────────────────────────── */}
        <WidgetCard title="⚡ CAPABILITY ROUTER">
          <CapabilityRouterSection />
        </WidgetCard>

        {/* ── Remote Terminal ───────────────────────────────────── */}
        <RemoteTerminalSection />

        {/* ── Live Services ──────────────────────────────────────── */}
        <ServiceHealthSection />

        {/* ── Developer: GitHub Repos ───────────────────────────────── */}
        <WidgetCard title="🔧 DEVELOPER — GITHUB REPOS">
          <GitHubReposSection />
        </WidgetCard>

        {/* ── General settings grid ─────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { title: 'Appearance', icon: '🎨', items: [{ k: 'Theme', v: 'Dark (AXE)' }, { k: 'Accent', v: 'Cyan' }, { k: 'Animations', v: 'Enabled' }] },
            { title: 'Keyboard',   icon: '⌨️', items: [{ k: 'Shortcuts', v: 'Enabled' }, { k: 'Command palette', v: '⌘K' }, { k: 'Voice toggle', v: '⌘⇧A' }] },
            { title: 'Security',   icon: '🔒', items: [{ k: '2FA', v: 'Enabled' }, { k: 'Session timeout', v: '30 min' }, { k: 'Keys stored', v: 'localStorage only' }] },
            { title: 'System',     icon: '⚙️', items: [{ k: 'Auto-update', v: 'Enabled' }, { k: 'Telemetry', v: 'Disabled' }, { k: 'Debug', v: 'Off' }] },
          ].map(group => (
            <WidgetCard key={group.title} title={`${group.icon} ${group.title}`}>
              <div className="space-y-2">
                {group.items.map(item => (
                  <div key={item.k} className="flex items-center justify-between py-0.5">
                    <span className="text-small" style={{ color: 'var(--text-secondary)' }}>{item.k}</span>
                    <span className="text-xs-custom font-mono-data" style={{ color: 'var(--text-primary)' }}>{item.v}</span>
                  </div>
                ))}
              </div>
            </WidgetCard>
          ))}
        </div>
      </div>
    </motion.div>
  );
}