import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, ChevronDown, ChevronUp, Save, X, Zap, Check, RefreshCw, Eye, EyeOff } from 'lucide-react';
import { requireSupabase } from '@/lib/supabaseClient';
import { saveSetting } from '@/services/userSettingsService';

/* ─── Types ─────────────────────────────────────────────────────────── */
interface ExtraProvider { id: string; provider: string; model: string; base_url?: string; api_key_ref?: string; label?: string; enabled: boolean; }
interface Capability {
  id: string; capability: string; display_name: string; description: string;
  preferred_provider: string; preferred_model: string;
  fallback_provider: string; fallback_model: string;
  extra_providers: ExtraProvider[];
  keyword_patterns: string[];
  execution_mode?: 'read' | 'patch' | 'execute';
  enabled: boolean;
}

/* ─── Provider options ───────────────────────────────────────────── */
const PROVIDER_OPTIONS = [
  { id: 'openrouter', name: 'OpenRouter', free: true,  placeholder: 'sk-or-...',          defaultModel: 'meta-llama/llama-3.1-8b-instruct:free' },
  { id: 'google',     name: 'Gemini',     free: true,  placeholder: 'AIza...',             defaultModel: 'gemini-2.0-flash' },
  { id: 'xai',        name: 'Grok',       free: false, placeholder: 'xai-...',             defaultModel: 'grok-4.3' },
  { id: 'ollama',     name: 'Ollama',     free: true,  placeholder: '(no key needed)',     defaultModel: 'llama3.2' },
  { id: 'anthropic',  name: 'Anthropic',  free: false, placeholder: 'sk-ant-...',          defaultModel: 'claude-3-5-sonnet-20241022' },
  { id: 'openai',     name: 'OpenAI',     free: false, placeholder: 'sk-...',              defaultModel: 'gpt-4o' },
  { id: 'groq',       name: 'Groq',       free: false, placeholder: 'gsk_...',             defaultModel: 'llama-3.3-70b-versatile' },
  { id: 'deepseek',   name: 'DeepSeek',   free: false, placeholder: 'sk-...',              defaultModel: 'deepseek-chat' },
  { id: 'mistral',    name: 'Mistral',    free: false, placeholder: 'api key...',          defaultModel: 'mistral-large' },
  { id: 'openhands',  name: 'OpenHands',  free: true,  placeholder: '(no key needed)',     defaultModel: 'claude-sonnet-4-5' },
  { id: 'openjarvis', name: 'OpenJarvis', free: true,  placeholder: '(no key needed)',     defaultModel: 'gpt-4o-mini' },
  { id: 'openclaw',   name: 'OpenClaw',   free: true,  placeholder: '(no key needed)',     defaultModel: 'gpt-4o-mini' },
  { id: 'kilocode',   name: 'Kilo Code',   free: true,  placeholder: '(no key needed)',     defaultModel: 'gpt-4o-mini' },
  { id: 'crewai',     name: 'CrewAI',      free: true,  placeholder: '(no key needed)',     defaultModel: 'gpt-4o-mini' },
];

const OPTIONAL_KEY_PROVIDERS = new Set(['ollama', 'openhands', 'openjarvis', 'openclaw', 'kilocode', 'crewai']);

const CAP_COLORS: Record<string, string> = {
  fast: '#10B981', code: '#22D3EE', analysis: '#3B82F6',
  reasoning: '#8B5CF6', privacy: '#F59E0B', creative: '#EC4899',
};

/* ─── Add Provider Form ────────────────────────────────────────────── */
function AddProviderForm({ onAdd, onCancel }: { onAdd: (p: ExtraProvider) => void; onCancel: () => void }) {
  const [provider, setProvider] = useState('openrouter');
  const [model, setModel] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [label, setLabel] = useState('');
  const [showKey, setShowKey] = useState(false);

  const prov = PROVIDER_OPTIONS.find(p => p.id === provider)!;
  const needsKey = !OPTIONAL_KEY_PROVIDERS.has(provider);
  const needsBaseUrl = provider === 'ollama' || provider === 'openai' || provider === 'xai' || OPTIONAL_KEY_PROVIDERS.has(provider);

  const handleAdd = () => {
    if (needsKey && !apiKey.trim()) return;
    // Save API key to localStorage/Supabase via saveSetting
    const keyRef = `axe_cap_key_${provider}_${Date.now()}`;
    if (apiKey.trim()) saveSetting(keyRef, apiKey.trim());

    onAdd({
      id: crypto.randomUUID(),
      provider, label: label || prov.name,
      model: model || prov.defaultModel,
      base_url: baseUrl || undefined,
      api_key_ref: apiKey ? keyRef : undefined,
      enabled: true,
    });
  };

  return (
    <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
      className="rounded-xl p-4 mt-2 space-y-3"
      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
      <p className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Add API provider</p>

      {/* Provider select */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] mb-1 block" style={{ color: 'var(--text-muted)' }}>Provider</label>
          <select value={provider} onChange={e => { setProvider(e.target.value); setModel(''); setApiKey(''); }}
            className="w-full px-2.5 py-1.5 rounded-lg text-xs outline-none"
            style={{ background: 'var(--bg-base)', border: '1px solid var(--border-active)', color: 'var(--text-primary)' }}>
            {PROVIDER_OPTIONS.map(p => (
              <option key={p.id} value={p.id}>{p.name} {p.free ? '(free)' : '(paid)'}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-[10px] mb-1 block" style={{ color: 'var(--text-muted)' }}>Label (optional)</label>
          <input value={label} onChange={e => setLabel(e.target.value)} placeholder={prov.name}
            className="w-full px-2.5 py-1.5 rounded-lg text-xs outline-none"
            style={{ background: 'var(--bg-base)', border: '1px solid var(--border-active)', color: 'var(--text-primary)' }} />
        </div>
      </div>

      {/* Model */}
      <div>
        <label className="text-[10px] mb-1 block" style={{ color: 'var(--text-muted)' }}>Model</label>
        <input value={model} onChange={e => setModel(e.target.value)} placeholder={prov.defaultModel}
          className="w-full px-2.5 py-1.5 rounded-lg text-xs font-mono outline-none"
          style={{ background: 'var(--bg-base)', border: '1px solid var(--border-active)', color: 'var(--text-primary)' }} />
      </div>

      {/* API Key */}
      {needsKey && (
        <div>
          <label className="text-[10px] mb-1 block" style={{ color: 'var(--text-muted)' }}>API Key</label>
          <div className="relative">
            <input type={showKey ? 'text' : 'password'} value={apiKey} onChange={e => setApiKey(e.target.value)}
              placeholder={prov.placeholder}
              className="w-full px-2.5 py-1.5 pr-8 rounded-lg text-xs font-mono outline-none"
              style={{ background: 'var(--bg-base)', border: '1px solid var(--border-active)', color: 'var(--text-primary)' }} />
            <button className="absolute right-2 top-1/2 -translate-y-1/2" onClick={() => setShowKey(v => !v)} style={{ color: 'var(--text-muted)' }}>
              {showKey ? <EyeOff size={11} /> : <Eye size={11} />}
            </button>
          </div>
          <p className="text-[9px] mt-0.5" style={{ color: 'var(--text-muted)' }}>Key is encrypted and stored in your Supabase account</p>
        </div>
      )}

      {/* Base URL for Ollama */}
      {needsBaseUrl && (
        <div>
          <label className="text-[10px] mb-1 block" style={{ color: 'var(--text-muted)' }}>Base URL</label>
          <input value={baseUrl} onChange={e => setBaseUrl(e.target.value)}
            placeholder={provider === 'ollama'
              ? 'https://ollama.axecompanion.com'
              : provider === 'xai'
                ? 'https://api.x.ai'
                : 'http://localhost:2025'}
            className="w-full px-2.5 py-1.5 rounded-lg text-xs font-mono outline-none"
            style={{ background: 'var(--bg-base)', border: '1px solid var(--border-active)', color: 'var(--text-primary)' }} />
        </div>
      )}

      <div className="flex gap-2">
        <button onClick={handleAdd} disabled={needsKey && !apiKey.trim()}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
          style={{ background: 'rgba(34,211,238,0.1)', border: '1px solid rgba(34,211,238,0.3)', color: '#22D3EE', opacity: needsKey && !apiKey.trim() ? 0.4 : 1 }}>
          <Check size={11} /> Add Provider
        </button>
        <button onClick={onCancel} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
          <X size={11} /> Cancel
        </button>
      </div>
    </motion.div>
  );
}

/* ─── Single Capability Card ─────────────────────────────────────── */
function CapabilityCard({ cap, onUpdate }: { cap: Capability; onUpdate: (updated: Capability) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const color = CAP_COLORS[cap.capability] ?? '#6B7280';
  const executionMode = cap.execution_mode ?? 'read';

  const saveToSupabase = async (updated: Capability) => {
    setSaving(true);
    try {
      const sb = requireSupabase();
      await sb.from('core_capabilities').update({
        preferred_provider: updated.preferred_provider,
        preferred_model: updated.preferred_model,
        fallback_provider: updated.fallback_provider,
        fallback_model: updated.fallback_model,
        extra_providers: updated.extra_providers,
        execution_mode: updated.execution_mode ?? 'read',
        enabled: updated.enabled,
        updated_at: new Date().toISOString(),
      }).eq('id', updated.id);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  const addProvider = (p: ExtraProvider) => {
    const updated = { ...cap, extra_providers: [...cap.extra_providers, p] };
    onUpdate(updated);
    saveToSupabase(updated);
    setShowAddForm(false);
  };

  const removeProvider = (id: string) => {
    const updated = { ...cap, extra_providers: cap.extra_providers.filter(p => p.id !== id) };
    onUpdate(updated);
    saveToSupabase(updated);
  };

  const toggleProvider = (id: string) => {
    const updated = { ...cap, extra_providers: cap.extra_providers.map(p => p.id === id ? { ...p, enabled: !p.enabled } : p) };
    onUpdate(updated);
    saveToSupabase(updated);
  };

  const allProviders = [
    { id: 'primary', label: 'Primary', provider: cap.preferred_provider, model: cap.preferred_model, free: true, enabled: true },
    { id: 'fallback', label: 'Fallback', provider: cap.fallback_provider, model: cap.fallback_model, free: true, enabled: true },
    ...cap.extra_providers.map(p => ({ ...p, label: p.label ?? p.provider, free: ['openrouter', 'google', 'ollama', 'openhands', 'openjarvis', 'openclaw', 'kilocode', 'crewai'].includes(p.provider) })),
  ];

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${color}25`, background: `${color}08` }}>
      {/* Header */}
      <button className="w-full flex items-center justify-between px-4 py-3" onClick={() => setExpanded(v => !v)}>
        <div className="flex items-center gap-3">
          <span className="rounded-full" style={{ width: 8, height: 8, background: cap.enabled ? color : '#6B7280', boxShadow: cap.enabled ? `0 0 8px ${color}` : 'none', flexShrink: 0 }} />
          <div className="text-left">
            <span className="text-sm font-medium" style={{ color }}>{cap.display_name}</span>
            <span className="text-[10px] ml-2" style={{ color: 'var(--text-muted)' }}>{cap.description}</span>
          </div>
          <span
            className="text-[9px] px-1.5 py-0.5 rounded uppercase font-mono"
            style={{
              background: executionMode === 'execute'
                ? 'rgba(245,158,11,0.15)'
                : executionMode === 'patch'
                  ? 'rgba(34,211,238,0.15)'
                  : 'rgba(148,163,184,0.15)',
              color: executionMode === 'execute'
                ? '#F59E0B'
                : executionMode === 'patch'
                  ? '#22D3EE'
                  : '#94A3B8',
            }}
          >
            {executionMode}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>{allProviders.length} provider{allProviders.length !== 1 ? 's' : ''}</span>
          {saved && <Check size={12} style={{ color: '#10B981' }} />}
          {saving && <RefreshCw size={12} className="animate-spin" style={{ color: 'var(--text-muted)' }} />}
          {expanded ? <ChevronUp size={14} style={{ color: 'var(--text-muted)' }} /> : <ChevronDown size={14} style={{ color: 'var(--text-muted)' }} />}
        </div>
      </button>

      {/* Expanded content */}
      <AnimatePresence>
        {expanded && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }}>
            <div className="px-4 pb-4 space-y-2" style={{ borderTop: `1px solid ${color}15` }}>
              <div className="pt-3 space-y-1.5">
                {allProviders.map(p => (
                  <div key={p.id} className="flex items-center justify-between px-3 py-2 rounded-lg"
                    style={{ background: p.enabled ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.01)', opacity: p.enabled ? 1 : 0.5, border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] px-1.5 py-0.5 rounded font-mono uppercase" style={{ background: `${color}20`, color }}>
                        {p.label}
                      </span>
                      <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{p.provider}</span>
                      <span className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>{p.model}</span>
                      <span className="text-[9px] px-1 py-0.5 rounded" style={{ background: p.free ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)', color: p.free ? '#10B981' : '#F59E0B' }}>
                        {p.free ? 'free' : 'paid'}
                      </span>
                    </div>
                    {p.id !== 'primary' && p.id !== 'fallback' && (
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => toggleProvider(p.id)} className="text-[10px] px-2 py-0.5 rounded"
                          style={{ background: 'var(--bg-base)', color: 'var(--text-muted)', border: '1px solid var(--border-subtle)' }}>
                          {p.enabled ? 'disable' : 'enable'}
                        </button>
                        <button onClick={() => removeProvider(p.id)} style={{ color: '#EF4444' }}>
                          <X size={11} />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Keyword patterns */}
              {cap.keyword_patterns.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {cap.keyword_patterns.map((kw, i) => (
                    <span key={i} className="text-[9px] px-1.5 py-0.5 rounded font-mono" style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--text-muted)' }}>
                      {kw}
                    </span>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <label className="text-[10px]">
                  <span className="block mb-1" style={{ color: 'var(--text-muted)' }}>Execution mode</span>
                  <select
                    value={executionMode}
                    onChange={e => {
                      const updated = { ...cap, execution_mode: e.target.value as Capability['execution_mode'] };
                      onUpdate(updated);
                      saveToSupabase(updated);
                    }}
                    className="w-full px-2.5 py-1.5 rounded-lg text-xs outline-none"
                    style={{ background: 'var(--bg-base)', border: '1px solid var(--border-active)', color: 'var(--text-primary)' }}
                  >
                    <option value="read">Read</option>
                    <option value="patch">Patch</option>
                    <option value="execute">Execute</option>
                  </select>
                </label>
              </div>

              {/* Add provider button */}
              <AnimatePresence>
                {showAddForm ? (
                  <AddProviderForm onAdd={addProvider} onCancel={() => setShowAddForm(false)} />
                ) : (
                  <motion.button initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={() => setShowAddForm(true)}
                    className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg w-full justify-center mt-1 transition-all"
                    style={{ background: 'rgba(255,255,255,0.03)', border: `1px dashed ${color}40`, color }}>
                    <Plus size={12} /> Add provider (free or paid)
                  </motion.button>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─── Main section ───────────────────────────────────────────────── */
export function CapabilityRouterSection() {
  const [capabilities, setCapabilities] = useState<Capability[]>([]);
  const [loading, setLoading] = useState(true);

  const loadCapabilities = useCallback(async () => {
    setLoading(true);
    try {
      const sb = requireSupabase();
      const { data } = await sb.from('core_capabilities').select('*').order('display_name');
      if (data) setCapabilities(data.map(c => ({ ...c, extra_providers: c.extra_providers ?? [] })));
    } catch (e) { console.warn('capabilities load failed', e); }
    setLoading(false);
  }, []);

  useEffect(() => { loadCapabilities(); }, [loadCapabilities]);

  const updateCap = (updated: Capability) => {
    setCapabilities(prev => prev.map(c => c.id === updated.id ? updated : c));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Capability Router</h3>
          <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
            Elke chat-bericht wordt automatisch geclassificeerd en naar de juiste provider gestuurd. Voeg per capability meerdere APIs toe.
          </p>
        </div>
        <button onClick={loadCapabilities} style={{ color: 'var(--text-muted)' }}><RefreshCw size={13} /></button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-4" style={{ color: 'var(--text-muted)' }}>
          <RefreshCw size={13} className="animate-spin" /><span className="text-xs">Loading from Supabase…</span>
        </div>
      ) : capabilities.length === 0 ? (
        <div className="text-xs py-4 text-center" style={{ color: 'var(--text-muted)' }}>No capabilities found in Supabase</div>
      ) : (
        <div className="space-y-2">
          {capabilities.map(cap => (
            <CapabilityCard key={cap.id} cap={cap} onUpdate={updateCap} />
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: 'rgba(34,211,238,0.05)', border: '1px solid rgba(34,211,238,0.1)' }}>
        <Zap size={12} style={{ color: '#22D3EE', flexShrink: 0 }} />
        <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
          Als meerdere providers geconfigureerd zijn, worden ze in prioriteitsvolgorde gebruikt. Betaald + gratis werken samen.
          Capability-routing slaat altijd voort op Supabase zodat AXE CORE het ook kan gebruiken.
        </p>
      </div>
    </div>
  );
}
