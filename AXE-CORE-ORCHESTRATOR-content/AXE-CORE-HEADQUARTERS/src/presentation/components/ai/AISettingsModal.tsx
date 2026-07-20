import { useState } from 'react';
import { X, Key, Globe, Cpu, Sparkles, AlertCircle, Check, Server, Flame, Zap, Diamond, Rocket, CloudLightning, Star, Hexagon, Layers } from 'lucide-react';
import type { AIConfig } from '@/presentation/hooks/useAIConfig';
import { PROVIDER_PRESETS } from '@/application/agents/aiAgent';

interface AISettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: AIConfig;
  onUpdate: (updates: Partial<AIConfig>) => void;
  onClear: () => void;
}

const ICONS = [Sparkles, Globe, Zap, Flame, Cpu, Diamond, Star, Rocket, CloudLightning, Hexagon, Server, Layers];

export default function AISettingsModal({ isOpen, onClose, config, onUpdate, onClear }: AISettingsModalProps) {
  const [activePreset, setActivePreset] = useState(() => {
    const idx = PROVIDER_PRESETS.findIndex(p => p.endpoint === config.apiEndpoint && p.model === config.model);
    return idx >= 0 ? idx : 11;
  });
  const [localKey, setLocalKey] = useState(config.apiKey);
  const [localEndpoint, setLocalEndpoint] = useState(config.apiEndpoint);
  const [localModel, setLocalModel] = useState(config.model);
  const [showKey, setShowKey] = useState(false);
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');

  if (!isOpen) return null;

  const handlePresetSelect = (idx: number) => {
    setActivePreset(idx);
    const preset = PROVIDER_PRESETS[idx];
    if (preset.name !== 'Custom') {
      setLocalEndpoint(preset.endpoint);
      setLocalModel(preset.model);
    }
    setTestStatus('idle');
  };

  const handleSave = () => {
    onUpdate({
      apiKey: localKey,
      apiEndpoint: localEndpoint,
      model: localModel,
    });
    onClose();
  };

  const handleTest = async () => {
    setTestStatus('testing');
    try {
      const preset = PROVIDER_PRESETS[activePreset];
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localKey}`,
        ...(preset.headers || {}),
      };

      const response = await fetch(localEndpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: localModel,
          messages: [{ role: 'user', content: 'Hello' }],
          max_tokens: 10,
        }),
      });

      if (response.ok) {
        setTestStatus('success');
      } else {
        setTestStatus('error');
      }
    } catch {
      setTestStatus('error');
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-[480px] max-w-[90vw] bg-[#0a0a0c] border border-white/[0.08] rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-cyan-400" />
            <h2 className="text-sm font-bold text-white">AI Settings</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors">
            <X className="w-4 h-4 text-white/40" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4 max-h-[60vh] overflow-y-auto">
          <div className="grid grid-cols-4 gap-2">
            {PROVIDER_PRESETS.map((preset, idx) => {
              const Icon = ICONS[idx] || Server;
              return (
                <button
                  key={preset.name}
                  onClick={() => handlePresetSelect(idx)}
                  className={`flex flex-col items-center gap-1.5 p-2.5 rounded-xl border transition-all cursor-pointer
                    ${activePreset === idx
                      ? 'bg-cyan-400/10 border-cyan-400/30 text-cyan-400'
                      : 'bg-white/[0.02] border-white/[0.06] text-white/40 hover:text-white/60 hover:bg-white/5'
                    }`}
                >
                  <Icon className="w-4 h-4" />
                  <span className="text-[10px] font-medium">{preset.name}</span>
                </button>
              );
            })}
          </div>

          <div>
            <label className="text-[11px] font-medium text-white/40 uppercase tracking-wider mb-2 block">
              API Key
            </label>
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={localKey}
                onChange={(e) => { setLocalKey(e.target.value); setTestStatus('idle'); }}
                placeholder={activePreset === 10 ? 'ollama needs no key (optional)' : 'sk-...'}
                className="w-full h-10 px-3 pr-20 rounded-xl bg-white/[0.04] border border-white/[0.08]
                  text-[13px] text-white placeholder:text-white/20 outline-none font-mono
                  focus:border-cyan-400/40 transition-all"
              />
              <button
                onClick={() => setShowKey(!showKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-white/30 hover:text-white/60 transition-colors cursor-pointer"
              >
                {showKey ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          <div>
            <label className="text-[11px] font-medium text-white/40 uppercase tracking-wider mb-2 block">
              API Endpoint
            </label>
            <input
              type="text"
              value={localEndpoint}
              onChange={(e) => setLocalEndpoint(e.target.value)}
              placeholder="https://api..."
              className="w-full h-10 px-3 rounded-xl bg-white/[0.04] border border-white/[0.08]
                text-[13px] text-white placeholder:text-white/20 outline-none font-mono
                focus:border-cyan-400/40 transition-all"
            />
          </div>

          <div>
            <label className="text-[11px] font-medium text-white/40 uppercase tracking-wider mb-2 block">
              Model
            </label>
            <input
              type="text"
              value={localModel}
              onChange={(e) => setLocalModel(e.target.value)}
              placeholder="gpt-4o-mini"
              className="w-full h-10 px-3 rounded-xl bg-white/[0.04] border border-white/[0.08]
                text-[13px] text-white placeholder:text-white/20 outline-none font-mono
                focus:border-cyan-400/40 transition-all"
            />
          </div>

          {activePreset === 10 && (
            <div className="p-3 rounded-xl bg-cyan-400/5 border border-cyan-400/20">
              <div className="flex items-center gap-2 mb-1">
                <Server className="w-3.5 h-3.5 text-cyan-400" />
                <span className="text-[12px] font-medium text-cyan-400">Ollama Setup</span>
              </div>
              <p className="text-[11px] text-white/50">
                Make sure Ollama is running locally. API key is optional. Default endpoint: http://localhost:11434/api/chat
              </p>
            </div>
          )}

          {testStatus !== 'idle' && (
            <div className={`flex items-center gap-2 px-3 py-2.5 rounded-lg ${
              testStatus === 'success' ? 'bg-green-400/10 text-green-400' :
              testStatus === 'error' ? 'bg-red-400/10 text-red-400' :
              'bg-cyan-400/10 text-cyan-400'
            }`}>
              {testStatus === 'testing' && <Sparkles className="w-3.5 h-3.5 animate-spin" />}
              {testStatus === 'success' && <Check className="w-3.5 h-3.5" />}
              {testStatus === 'error' && <AlertCircle className="w-3.5 h-3.5" />}
              <span className="text-[12px]">
                {testStatus === 'testing' ? 'Testing connection...' :
                 testStatus === 'success' ? 'Connection successful! AXE AI is ready.' :
                 'Connection failed. Check: 1) API key, 2) Endpoint URL, 3) Model name, 4) CORS if local'}
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 px-5 py-4 border-t border-white/[0.06]">
          <button
            onClick={handleTest}
            disabled={testStatus === 'testing' || !localEndpoint}
            className="px-4 h-9 rounded-xl border border-white/[0.08] text-[12px] font-medium text-white/60
              hover:bg-white/5 disabled:opacity-30 transition-all cursor-pointer"
          >
            {testStatus === 'testing' ? 'Testing...' : 'Test Connection'}
          </button>
          <div className="flex-1" />
          <button
            onClick={onClear}
            className="px-4 h-9 rounded-xl text-[12px] font-medium text-white/40
              hover:text-white/60 transition-all cursor-pointer"
          >
            Reset
          </button>
          <button
            onClick={handleSave}
            disabled={!localEndpoint || !localModel}
            className="px-5 h-9 rounded-xl bg-cyan-400/20 border border-cyan-400/30 text-[12px] font-medium text-cyan-400
              hover:bg-cyan-400/30 disabled:opacity-30 transition-all cursor-pointer"
          >
            Save & Connect
          </button>
        </div>
      </div>
    </div>
  );
}
