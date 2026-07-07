import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { WidgetCard } from '@/components/widgets/WidgetCard';
import { StatusBadge } from '@/components/widgets/StatusBadge';
import { useVoiceStore, PROVIDERS, ROUTING_MODES, type ProviderId, type KeySlot, type RoutingMode } from '@/store/voiceStore';
import {
  Key, Check, X, Eye, EyeOff, Mic, Save, AlertTriangle,
  MessageSquare, RefreshCw, ChevronDown, Shield, Zap,
} from 'lucide-react';

/* ─── Quick-fill presets ──────────────────────────────────────────── */
const QUICK_PRESETS = [
  {
    label: 'OpenJarvis',
    sublabel: 'Local · auto-routes all LLMs',
    emoji: '🤖',
    accent: '#A78BFA',
    values: { provider: 'openai' as const, key: 'jarvis', baseUrl: 'http://localhost:2025', model: '' },
    tip: 'Run `jarvis serve` first. OpenJarvis routes between Ollama, Claude, GPT, etc. automatically.',
  },
  {
    label: 'Ollama',
    sublabel: 'Local · llama3.2',
    emoji: '🦙',
    accent: '#10B981',
    values: { provider: 'ollama' as const, key: '', baseUrl: 'http://localhost:11434', model: 'llama3.2' },
    tip: 'Install Ollama and run `ollama pull llama3.2` to use this preset.',
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
  const voice = useVoiceStore();

  const cfg = PROVIDERS.find(p => p.id === provider)!;
  const needsKey = provider !== 'ollama';
  const [activeTip, setActiveTip] = useState<string | null>(null);

  const applyPreset = (preset: typeof QUICK_PRESETS[0]) => {
    setProvider(preset.values.provider);
    setKey(preset.values.key);
    setBaseUrl(preset.values.baseUrl);
    setModel(preset.values.model);
    setTestResult(null);
    setActiveTip(preset.tip);
    setTimeout(() => setActiveTip(null), 5000);
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
    const s: KeySlot = { provider, key: key.trim(), model: model.trim() || undefined, baseUrl: baseUrl.trim() || undefined };
    const ok = await voice.testSlot(s);
    setTestResult(ok);
    setTesting(false);
  };

  return (
    <WidgetCard title={label} headerAction={
      <div className="flex items-center gap-1">
        {slot && <span className="rounded-full" style={{ width: 6, height: 6, background: 'var(--success)', display: 'inline-block', boxShadow: '0 0 4px var(--success)' }} />}
        {slot && <span className="text-[10px]" style={{ color: 'var(--success)' }}>{PROVIDERS.find(p => p.id === slot.provider)?.name} connected</span>}
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

        {/* Ollama base URL */}
        {provider === 'ollama' && (
          <div>
            <label className="text-xs-custom block mb-1" style={{ color: 'var(--text-muted)' }}>Base URL</label>
            <input value={baseUrl} onChange={e => setBaseUrl(e.target.value)} placeholder="http://localhost:11434"
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

        {testResult === false && voice.error && (
          <p className="text-xs-custom" style={{ color: 'var(--error)' }}>{voice.error}</p>
        )}

        <p className="text-[9px]" style={{ color: 'var(--text-muted)' }}>Keys stored locally in browser · Never sent to any server</p>
      </div>
    </WidgetCard>
  );
}

/* ─── Main Settings page ──────────────────────────────────────────── */
export default function SettingsPage() {
  const voice = useVoiceStore();
  const [micTest, setMicTest] = useState<'idle' | 'testing' | 'ok' | 'denied'>('idle');

  useEffect(() => { voice.checkMicPermission(); }, []);

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

      <div className="max-w-3xl space-y-4">

        {/* ── AI Configuration ──────────────────────────────────────── */}
        <div>
          <h2 className="text-body font-semibold mb-3 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <Key size={15} style={{ color: 'var(--accent-cyan)' }} /> AI Configuration
          </h2>
          <p className="text-xs-custom mb-3" style={{ color: 'var(--text-muted)' }}>
            AXE Core is provider-agnostic. Connect any LLM as primary engine with 2 automatic fallbacks.
            If primary fails (rate limit, error), fallback 1 kicks in, then fallback 2.
          </p>
          <div className="space-y-3">
            <SlotEditor label="PRIMARY ENGINE" slot={voice.primarySlot} accent="#22D3EE"
              onSave={s => voice.setPrimarySlot(s)} onClear={() => voice.setPrimarySlot(null)} />
            <SlotEditor label="FALLBACK 1" slot={voice.fallback1Slot} accent="#3B82F6"
              onSave={s => voice.setFallback1Slot(s)} onClear={() => voice.setFallback1Slot(null)} />
            <SlotEditor label="FALLBACK 2" slot={voice.fallback2Slot} accent="#8B5CF6"
              onSave={s => voice.setFallback2Slot(s)} onClear={() => voice.setFallback2Slot(null)} />
            <SlotEditor label="FALLBACK 3" slot={voice.fallback3Slot} accent="#EC4899"
              onSave={s => voice.setFallback3Slot(s)} onClear={() => voice.setFallback3Slot(null)} />
          </div>
        </div>

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
