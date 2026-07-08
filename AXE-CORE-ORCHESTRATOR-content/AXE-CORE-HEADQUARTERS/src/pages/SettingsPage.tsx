import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { WidgetCard } from '@/components/widgets/WidgetCard';
import { StatusBadge } from '@/components/widgets/StatusBadge';
import { useVoiceStore, PROVIDERS, ROUTING_MODES, type ProviderId, type KeySlot, type RoutingMode } from '@/store/voiceStore';
import { CapabilityRouterSection } from '@/components/settings/CapabilityRouterSection';
import { saveSetting } from '@/services/userSettingsService';
import { getDefaultOllamaModelNames, OLLAMA_MODEL_CATALOG } from '@/services/ollamaModelCatalog';
import { getStoredLlmModelRegistry, registryEntriesFromNames, saveLlmModelRegistry } from '@/services/llmModelRegistryService';
import {
  Key, Check, X, Eye, EyeOff, Mic, Save, AlertTriangle,
  MessageSquare, RefreshCw, ChevronDown, Shield, Zap, Rocket,
  ExternalLink, Github, GitBranch, Trash2,
} from 'lucide-react';

/* ─── Per-provider key store ─────────────────────────────────────── */
const PROVIDER_KEY_CATALOGUE = [
  { id: 'openrouter',  name: 'OpenRouter',    emoji: '🔓', accent: '#F59E0B', placeholder: 'sk-or-v1-...',        defaultModel: 'meta-llama/llama-3.1-8b-instruct:free', docsUrl: 'https://openrouter.ai/keys',              free: true,  needsKey: true  },
  { id: 'google',      name: 'Gemini',         emoji: '✨', accent: '#3B82F6', placeholder: 'AIza...',             defaultModel: 'gemini-2.0-flash-lite',                 docsUrl: 'https://aistudio.google.com/app/apikey',  free: true,  needsKey: true  },
  { id: 'xai',         name: 'Grok',           emoji: '🚀', accent: '#F97316', placeholder: 'xai-...',              defaultModel: 'grok-4.3',                              docsUrl: 'https://docs.x.ai/developers/quickstart', free: false, needsKey: true  },
  { id: 'groq',        name: 'Groq',           emoji: '🚀', accent: '#EC4899', placeholder: 'gsk_...',             defaultModel: 'llama-3.3-70b-versatile',               docsUrl: 'https://console.groq.com/keys',           free: true,  needsKey: true  },
  { id: 'anthropic',   name: 'Anthropic',      emoji: '🤖', accent: '#A78BFA', placeholder: 'sk-ant-api03-...',    defaultModel: 'claude-3-5-sonnet-20241022',            docsUrl: 'https://console.anthropic.com/keys',      free: false, needsKey: true  },
  { id: 'openai',      name: 'OpenAI',         emoji: '⚡', accent: '#10B981', placeholder: 'sk-proj-...',         defaultModel: 'gpt-4o-mini',                           docsUrl: 'https://platform.openai.com/api-keys',    free: false, needsKey: true  },
  { id: 'ollama',      name: 'Ollama (VPS)',   emoji: '🦙', accent: '#10B981', placeholder: '(geen key nodig)',    defaultModel: 'llama3.1:8b',                           docsUrl: 'https://ollama.ai',                       free: true,  needsKey: false },
  { id: 'openhands',   name: 'OpenHands',      emoji: '🙌', accent: '#8B5CF6', placeholder: '(geen key nodig)',    defaultModel: 'claude-sonnet-4-5',                     docsUrl: 'https://github.com/All-Hands-AI/OpenHands', free: true, needsKey: false },
  { id: 'openjarvis',  name: 'OpenJarvis',     emoji: '🧭', accent: '#C084FC', placeholder: '(geen key nodig)',    defaultModel: 'gpt-4o-mini',                           docsUrl: 'https://github.com',                      free: true, needsKey: false },
  { id: 'openclaw',    name: 'OpenClaw',       emoji: '🦞', accent: '#F97316', placeholder: '(geen key nodig)',    defaultModel: 'gpt-4o-mini',                           docsUrl: 'https://github.com',                      free: true, needsKey: false },
  { id: 'kilocode',    name: 'Kilo Code',      emoji: '⌘', accent: '#14B8A6', placeholder: '(geen key nodig)',    defaultModel: 'gpt-4o-mini',                           docsUrl: 'https://github.com',                      free: true, needsKey: false },
  { id: 'crewai',      name: 'CrewAI',         emoji: '🧠', accent: '#84CC16', placeholder: '(geen key nodig)',    defaultModel: 'gpt-4o-mini',                           docsUrl: 'https://github.com',                      free: true, needsKey: false },
] as const;

const OPTIONAL_KEY_PROVIDERS = new Set(['ollama', 'openhands', 'openjarvis', 'openclaw', 'kilocode', 'crewai']);

type ProviderConn = { key?: string; model?: string; models?: string[]; baseUrl?: string };

// Outdated models that should be auto-migrated on load
const MODEL_MIGRATIONS: Record<string, Record<string, string>> = {
  google: {
    'gemini-1.5-flash': 'gemini-2.0-flash-lite',
    'gemini-1.5-pro':   'gemini-2.0-flash-lite',
    'gemini-1.0-pro':   'gemini-2.0-flash-lite',
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

function ProviderKeysSection() {
  const voice = useVoiceStore();
  const [keys, setKeys] = useState<Record<string, ProviderConn>>(loadProviderKeys);
  const [showKey, setShowKey] = useState<Record<string, boolean>>({});
  const [testing, setTesting] = useState<Record<string, 'idle'|'ok'|'fail'|'testing'>>({});
  const [testErrors, setTestErrors] = useState<Record<string, string>>({});
  const [syncingOllama, setSyncingOllama] = useState(false);

  const addOllamaModel = (model: string) => {
    const current: string[] = keys['ollama']?.models ?? getDefaultOllamaModelNames();
    if (current.includes(model)) return;
    const updated = { ...keys, ollama: { ...keys['ollama'], models: [...current, model] } };
    setKeys(updated); saveProviderKeys(updated);
  };
  const removeOllamaModel = (model: string) => {
    const current: string[] = keys['ollama']?.models ?? getDefaultOllamaModelNames();
    const updated = { ...keys, ollama: { ...keys['ollama'], models: current.filter(m => m !== model) } };
    setKeys(updated); saveProviderKeys(updated);
  };
  const syncOllamaModels = async () => {
    setSyncingOllama(true);
    try {
      const baseUrl = keys['ollama']?.baseUrl ?? 'https://ollama.axecompanion.com';
      const r = await fetch(`${baseUrl}/api/tags`);
      const d = await r.json();
      const models: string[] = (d.models ?? []).map((m: { name: string }) => m.name).filter(Boolean);
      const nextModels = models.length ? models : getDefaultOllamaModelNames();
      if (nextModels.length) {
        const updated = { ...keys, ollama: { ...keys['ollama'], models: nextModels } };
        setKeys(updated); saveProviderKeys(updated);
      }
      await saveLlmModelRegistry(registryEntriesFromNames(nextModels));
    } catch { /* ignore */ }
    setSyncingOllama(false);
  };

  const update = (id: string, field: keyof ProviderConn, val: string) => {
    setKeys(prev => {
      const next = { ...prev, [id]: { ...prev[id], [field]: val } };
      saveProviderKeys(next);
      return next;
    });
  };

  const testProvider = async (id: string) => {
    const conn = keys[id] ?? {};
    const cat = PROVIDER_KEY_CATALOGUE.find(p => p.id === id)!;
    // Only skip if this provider REQUIRES a key and none is set
    if (cat.needsKey && !conn.key) return;
    setTesting(t => ({ ...t, [id]: 'testing' }));
    const cfg = PROVIDERS.find(p => p.id === id);
    const slot: KeySlot = {
      provider: id as ProviderId,
      key: conn.key ?? '',
      model: cat.defaultModel,  // always test with catalogue default, ignore stale localStorage model
      baseUrl: conn.baseUrl || (id === 'ollama' ? 'https://ollama.axecompanion.com' : undefined) || cfg?.baseUrl,
    };
    const ok = await voice.testSlot(slot);
    setTesting(t => ({ ...t, [id]: ok ? 'ok' : 'fail' }));
    if (!ok) {
      const raw = useVoiceStore.getState().error ?? 'Test mislukt';
      // Extract retry-after for rate-limit errors
      const retryMatch = raw.match(/retry[^\d]*(\d+(?:\.\d+)?)\s*s/i);
      const msg = retryMatch
        ? `Rate limit — probeer opnieuw over ${Math.ceil(Number(retryMatch[1]))}s`
        : raw.replace(/\s*https?:\/\/\S+/g, '').trim().slice(0, 140);
      setTestErrors(e => ({ ...e, [id]: msg }));
    } else {
      setTestErrors(e => { const n = { ...e }; delete n[id]; return n; });
    }
    // Auto-configure primary slot on first successful test
    if (ok && !voice.primarySlot) voice.setPrimarySlot(slot);
  };

  return (
    <div>
      <h2 className="text-body font-semibold mb-1 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
        <Key size={15} style={{ color: 'var(--accent-cyan)' }} /> Provider Keys
      </h2>
      <p className="text-xs-custom mb-3" style={{ color: 'var(--text-muted)' }}>
        Vul hier je API keys in. De <strong style={{ color: 'var(--text-secondary)' }}>Smart Router</strong> gebruikt automatisch de juiste provider per taak — code → Anthropic/OpenRouter, snel → Gemini, privacy → Ollama.
      </p>
      <p className="text-[9px] mb-3" style={{ color: 'var(--text-muted)' }}>
        OpenHands, OpenJarvis, OpenClaw, Kilo Code en CrewAI werken alleen als hun backend een OpenAI-compatible endpoint levert op de ingestelde base URL.
      </p>
      <div className="space-y-2">
        {PROVIDER_KEY_CATALOGUE.map(cat => {
          const conn = keys[cat.id] ?? {};
          const configured = !cat.needsKey || !!conn.key;
          const ts = testing[cat.id] ?? 'idle';
          return (
            <div key={cat.id} className="rounded-xl p-3 flex items-center gap-3"
              style={{ background: 'var(--bg-surface)', border: `1px solid ${configured ? `${cat.accent}30` : 'var(--border-subtle)'}`, transition: 'border-color 0.2s' }}>
              <span className="text-base shrink-0">{cat.emoji}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-xs-custom font-medium" style={{ color: 'var(--text-primary)' }}>{cat.name}</span>
                  {cat.free && <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ background: `${cat.accent}18`, color: cat.accent }}>free</span>}
                  <a href={cat.docsUrl} target="_blank" rel="noreferrer" className="flex items-center gap-0.5 text-[9px]" style={{ color: 'var(--text-muted)' }}>
                    get key <ExternalLink size={8} />
                  </a>
                  {configured && <span className="ml-auto text-[9px]" style={{ color: 'var(--success)' }}>● configured</span>}
                </div>
                {testErrors[cat.id] && (
                  <p className="text-[10px] mt-1" style={{ color: 'var(--error)' }}>{testErrors[cat.id]}</p>
                )}
                {cat.needsKey ? (
                  <div className="relative">
                    <input
                      type={showKey[cat.id] ? 'text' : 'password'}
                      value={conn.key ?? ''}
                      onChange={e => update(cat.id, 'key', e.target.value)}
                      placeholder={cat.placeholder}
                      className="w-full px-2.5 py-1.5 pr-7 rounded-lg text-[11px] font-mono outline-none"
                      style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
                    />
                    <button className="absolute right-2 top-1/2 -translate-y-1/2" onClick={() => setShowKey(s => ({ ...s, [cat.id]: !s[cat.id] }))} style={{ color: 'var(--text-muted)' }}>
                      {showKey[cat.id] ? <EyeOff size={11} /> : <Eye size={11} />}
                    </button>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {(() => {
                      const defaultBaseUrl =
                        cat.id === 'openhands' ? 'http://localhost:3000'
                        : cat.id === 'openjarvis' ? 'http://localhost:2025'
                        : cat.id === 'openclaw' ? 'http://localhost:5001'
                        : cat.id === 'kilocode' ? 'http://localhost:5002'
                        : cat.id === 'crewai' ? 'http://localhost:5003'
                        : 'https://ollama.axecompanion.com';
                      return (
                        <input
                          type="text"
                          value={conn.baseUrl ?? defaultBaseUrl}
                          onChange={e => update(cat.id, 'baseUrl', e.target.value)}
                          placeholder={defaultBaseUrl}
                          className="w-full px-2.5 py-1.5 rounded-lg text-[11px] font-mono outline-none"
                          style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
                        />
                      );
                    })()}
                    {cat.id === 'ollama' && (
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>Modellen ({(conn.models ?? getDefaultOllamaModelNames()).length})</span>
                          <button onClick={syncOllamaModels} disabled={syncingOllama}
                            className="flex items-center gap-1 text-[9px]" style={{ color: 'var(--accent-cyan)' }}>
                            <RefreshCw size={8} className={syncingOllama ? 'animate-spin' : ''} />
                            sync van VPS
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-1 mb-1">
                          {(conn.models ?? getDefaultOllamaModelNames()).map(m => {
                            const meta = OLLAMA_MODEL_CATALOG.find(x => x.name === m);
                            return (
                            <span key={m} className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono"
                              style={{ background: 'var(--bg-active)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}>
                              <span title={meta?.description ?? m}>{meta?.displayName ?? m}</span>
                              <button onClick={() => removeOllamaModel(m)} style={{ color: 'var(--text-muted)', lineHeight: 1 }}>×</button>
                            </span>
                            );
                          })}
                        </div>
                        <div className="flex flex-wrap gap-1 mb-1.5">
                          {OLLAMA_MODEL_CATALOG.map(meta => (
                            <button
                              key={meta.name}
                              onClick={() => addOllamaModel(meta.name)}
                              className="px-1.5 py-0.5 rounded text-[9px] font-mono"
                              style={{ background: 'rgba(34,211,238,0.06)', border: '1px solid rgba(34,211,238,0.15)', color: 'var(--accent-cyan)' }}
                              title={meta.description}
                            >
                              + {meta.displayName}
                            </button>
                          ))}
                        </div>
                        <input type="text" placeholder="+ model toevoegen (druk Enter)"
                          className="w-full px-2 py-1 rounded text-[9px] font-mono outline-none"
                          style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              e.stopPropagation();
                              const val = (e.target as HTMLInputElement).value.trim();
                              if (val) { addOllamaModel(val); (e.target as HTMLInputElement).value = ''; }
                            }
                          }} />
                      </div>
                    )}
                  </div>
                )}
              </div>
              <button
                onClick={() => testProvider(cat.id)}
                disabled={ts === 'testing' || (cat.needsKey && !conn.key)}
                className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium"
                style={{
                  background: ts === 'ok' ? 'rgba(16,185,129,0.1)' : ts === 'fail' ? 'rgba(239,68,68,0.1)' : 'var(--bg-active)',
                  border: `1px solid ${ts === 'ok' ? 'rgba(16,185,129,0.3)' : ts === 'fail' ? 'rgba(239,68,68,0.3)' : 'var(--border-active)'}`,
                  color: ts === 'ok' ? 'var(--success)' : ts === 'fail' ? 'var(--error)' : 'var(--text-secondary)',
                  opacity: (ts === 'testing' || (cat.needsKey && !conn.key)) ? 0.5 : 1,
                }}>
                {ts === 'testing' ? <RefreshCw size={11} className="animate-spin" /> : ts === 'ok' ? <Check size={11} /> : ts === 'fail' ? <X size={11} /> : <Zap size={11} />}
                <span>{ts === 'testing' ? '…' : ts === 'ok' ? 'OK' : ts === 'fail' ? 'Fail' : 'Test'}</span>
              </button>
            </div>
          );
        })}
      </div>
      <p className="text-[9px] mt-2" style={{ color: 'var(--text-muted)' }}>
        Smart Router pikt automatisch de juiste key op per taak-type · Geen dubbel invullen nodig met de slots hieronder
      </p>
    </div>
  );
}

/* ─── Quick-fill presets ──────────────────────────────────────────── */
const QUICK_PRESETS = [
  {
    label: 'OpenJarvis',
    sublabel: 'localhost:2025 · auto-routes all LLMs',
    emoji: '🤖',
    accent: '#A78BFA',
    values: { provider: 'openjarvis' as const, key: '', baseUrl: 'http://localhost:2025', model: '' },
    tip: '⚠️ Local only: run `jarvis serve` on your machine first. Works when accessing this app from the same device. Not available on cloud/mobile.',
  },
  {
    label: 'Ollama',
    sublabel: 'axecompanion.com · llama3.2',
    emoji: '🦙',
    accent: '#10B981',
    values: { provider: 'ollama' as const, key: '', baseUrl: 'https://ollama.axecompanion.com', model: 'llama3.1:8b' },
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
                ? 'http://localhost:2025'
                : provider === 'openhands'
                  ? 'http://localhost:3000'
                  : provider === 'openclaw'
                    ? 'http://localhost:5001'
                    : provider === 'kilocode'
                      ? 'http://localhost:5002'
                      : provider === 'crewai'
                        ? 'http://localhost:5003'
                  : provider === 'ollama'
                    ? 'https://ollama.axecompanion.com'
                    : 'http://localhost:2025'}
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
}

function GitHubReposSection() {
  const [repos, setRepos] = useState<RepoConfig[]>(loadRepoConfigs);
  const [showToken, setShowToken] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState(false);

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
  const [setupDone, setSetupDone] = useState(false);

  useEffect(() => { voice.checkMicPermission(); }, []);

  const testMic = async () => {
    setMicTest('testing');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(t => t.stop());
      setMicTest('ok');
    } catch { setMicTest('denied'); }
  };

  /** One-click: setup all 4 slots with the 4 free presets + enable round-robin */
  const setupFreeConfig = () => {
    voice.setPrimarySlot(   { provider: 'openai',     key: 'jarvis',   baseUrl: 'http://localhost:2025',               model: undefined });
    voice.setFallback1Slot( { provider: 'ollama',     key: '',         baseUrl: 'https://ollama.axecompanion.com', model: 'llama3.2' });
    voice.setFallback2Slot( { provider: 'openrouter', key: '',         model: 'meta-llama/llama-3.1-8b-instruct:free' });
    voice.setFallback3Slot( { provider: 'google',     key: '',         model: 'gemini-2.0-flash' });
    voice.setRoutingMode('roundrobin');
    setSetupDone(true);
    setTimeout(() => setSetupDone(false), 4000);
  };

  return (
    <motion.div className="p-5 h-full overflow-y-auto" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <h1 className="text-page-title font-semibold mb-5" style={{ color: 'var(--text-primary)' }}>Settings</h1>

      <div className="max-w-3xl space-y-4">

        {/* ── Provider Keys (unified smart-router keys) ────────────── */}
        <ProviderKeysSection />

        {/* ── Routing Mode ───────────────────────────────────────────── */}
        <div>
          <h2 className="text-body font-semibold mb-3 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <Zap size={15} style={{ color: 'var(--accent-cyan)' }} /> Routing Mode
          </h2>
          <WidgetCard title="HOW AXE CORE PICKS A SLOT">
            <div className="space-y-2">
              <div className="flex gap-2">
                {ROUTING_MODES.map(m => (
                  <button
                    key={m.id}
                    onClick={() => voice.setRoutingMode(m.id as RoutingMode)}
                    className="flex-1 px-3 py-2 rounded-lg text-xs-custom font-medium transition-all"
                    style={{
                      background: voice.routingMode === m.id ? 'rgba(34,211,238,0.12)' : 'var(--bg-surface)',
                      border: `1px solid ${voice.routingMode === m.id ? 'rgba(34,211,238,0.4)' : 'var(--border-subtle)'}`,
                      color: voice.routingMode === m.id ? 'var(--accent-cyan)' : 'var(--text-secondary)',
                    }}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
              <p className="text-xs-custom" style={{ color: 'var(--text-muted)' }}>
                {ROUTING_MODES.find(m => m.id === voice.routingMode)?.desc}
              </p>
              <div className="p-2.5 rounded-lg space-y-1" style={{ background: 'rgba(34,211,238,0.04)', border: '1px solid rgba(34,211,238,0.08)' }}>
                <p className="text-[10px] font-medium" style={{ color: 'var(--accent-cyan)' }}>Tip: meerdere gratis keys combineren</p>
                <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                  Stel 2–4 OpenRouter Free + Gemini Flash slots in en zet routing op <strong style={{color:'var(--text-secondary)'}}>Round-Robin</strong>.
                  AXE Core verdeelt het verkeer automatisch — zo bereik je nooit de rate limit van één key.
                </p>
              </div>
            </div>
          </WidgetCard>
        </div>

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
          </div>
        </WidgetCard>

        {/* ── Recent Conversation ───────────────────────────────────── */}
        {voice.conversation.length > 0 && (
          <WidgetCard title="RECENT CONVERSATION" headerAction={
            <button onClick={() => voice.clearConversation()} className="text-xs-custom" style={{ color: 'var(--text-muted)' }}>Clear</button>
          }>
            <div className="space-y-1.5 max-h-48 overflow-y-auto rounded-lg p-2" style={{ background: '#0A0A0A' }}>
              {voice.conversation.slice(-10).map((msg, i) => (
                <div key={i} className="text-xs-custom">
                  <span style={{ color: msg.role === 'user' ? 'var(--accent-cyan)' : 'var(--accent-blue)', fontWeight: 600 }}>
                    {msg.role === 'user' ? 'You' : 'AXE'}:
                  </span>{' '}
                  <span style={{ color: 'var(--text-secondary)' }}>{msg.text}</span>
                </div>
              ))}
            </div>
          </WidgetCard>
        )}

        {/* ── Capability Router ─────────────────────────────────── */}
        <WidgetCard title="⚡ CAPABILITY ROUTER">
          <CapabilityRouterSection />
        </WidgetCard>

        {/* ── Developer: GitHub Repos ───────────────────────────────── */}
        <WidgetCard title="🔧 DEVELOPER — GITHUB REPOS">
          <GitHubReposSection />
        </WidgetCard>

        {/* ── General settings ─────────────────────────────────────── */}
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
    </motion.div>
  );
}
