import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { TriangleLogo } from "../components/axe/TriangleLogo";
import { Spinner } from "../components/axe/Spinner";
import { Panel, Badge } from "../components/axe/Panel";
import { 
  ArrowLeft, Plus, Trash2, Play, Check, X, AlertCircle,
  Server, Brain, Settings as SettingsIcon,
  Cpu, Activity, ChevronDown, ChevronUp, Save
} from "lucide-react";
import { kimi } from "../lib/api";
import { useNotification } from "../contexts/NotificationContext";

const DEFAULT_MODELS = [
  { id: "gpt-4o", name: "GPT-4o", provider: "openai", type: "chat", status: "unknown", description: "Most capable multimodal model" },
  { id: "gpt-4o-mini", name: "GPT-4o Mini", provider: "openai", type: "chat", status: "unknown", description: "Fast and affordable" },
  { id: "claude-sonnet-4", name: "Claude Sonnet 4", provider: "anthropic", type: "chat", status: "unknown", description: "Balanced performance" },
  { id: "claude-opus-4", name: "Claude Opus 4", provider: "anthropic", type: "chat", status: "unknown", description: "Most powerful Claude" },
];

export default function Settings() {
  const { notify } = useNotification();
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState({});
  const [expanded, setExpanded] = useState({});
  const [showAdd, setShowAdd] = useState(false);
  const [newModel, setNewModel] = useState({ id: "", name: "", provider: "ollama", type: "chat", description: "" });
  const [ollamaModels, setOllamaModels] = useState([]);

  useEffect(() => { loadModels(); }, []);

  const loadModels = async () => {
    try {
      const res = await kimi.models();
      const loaded = res?.models || res?.variants || [];
      if (loaded.length > 0) {
        setModels(loaded.map(m => typeof m === "string" ? { id: m, name: m, provider: "kimi", type: "chat", status: "unknown" } : m));
      } else {
        setModels(DEFAULT_MODELS);
      }
      try {
        const ollamaRes = await fetch("http://89.167.78.6:8000/api/kimi/models");
        const ollamaData = await ollamaRes.json();
        if (ollamaData?.ollama_models) {
          setOllamaModels(ollamaData.ollama_models.map(m => ({
            id: m.name || m.model,
            name: m.name || m.model,
            provider: "ollama",
            type: "local",
            status: "unknown",
            description: `Ollama local model`,
          })));
        }
      } catch (e) {}
    } catch (e) {
      setModels(DEFAULT_MODELS);
    } finally {
      setLoading(false);
    }
  };

  const testModel = async (modelId) => {
    setTesting(prev => ({ ...prev, [modelId]: true }));
    try {
      const res = await kimi.chat("claw", "Say 'OK' and nothing else.", null, 0.1);
      const success = res?.status === "ok" || res?.response;
      setModels(prev => prev.map(m => m.id === modelId ? { ...m, status: success ? "ok" : "error", lastTest: new Date().toISOString() } : m));
      notify.success(`${modelId} test passed`);
    } catch (e) {
      setModels(prev => prev.map(m => m.id === modelId ? { ...m, status: "error", lastTest: new Date().toISOString() } : m));
      notify.error(`${modelId} test failed`);
    } finally {
      setTesting(prev => ({ ...prev, [modelId]: false }));
    }
  };

  const addModel = () => {
    if (!newModel.id.trim() || !newModel.name.trim()) {
      notify.error("ID and name are required");
      return;
    }
    const model = { ...newModel, status: "unknown" };
    setModels(prev => [...prev, model]);
    setShowAdd(false);
    setNewModel({ id: "", name: "", provider: "ollama", type: "chat", description: "" });
    notify.success(`Model "${model.name}" added`);
  };

  const removeModel = (modelId) => {
    setModels(prev => prev.filter(m => m.id !== modelId));
    notify.info(`Model "${modelId}" removed`);
  };

  const toggleExpand = (modelId) => {
    setExpanded(prev => ({ ...prev, [modelId]: !prev[modelId] }));
  };

  const allModels = [...models, ...ollamaModels.filter(o => !models.find(m => m.id === o.id))];

  return (
    <div className="min-h-screen bg-black text-[#EAF2F7]" data-testid="settings-page">
      <header className="axe-topbar px-4 py-3 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <Link to="/" className="text-[#6F8193] hover:text-[#66E6FF] inline-flex items-center gap-1 text-[11px] uppercase tracking-[0.10em]">
            <ArrowLeft size={14}/> TERMINAL
          </Link>
          <span className="text-[#6F8193]">/</span>
          <SettingsIcon size={14} className="text-[#66E6FF]" />
          <span className="text-[12px] font-semibold tracking-[0.16em]">SETTINGS</span>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-[#6F8193]">
          <Server size={12} /> {allModels.length} models
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto px-4 py-6 space-y-6">
        <section>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-[14px] font-semibold tracking-[0.10em] text-[#EAF2F7] flex items-center gap-2">
                <Brain size={16} className="text-[#00D4FF]" /> AI MODELS
              </h2>
              <p className="text-[11px] text-[#6F8193] mt-1">Test and manage all connected AI models.</p>
            </div>
            <button onClick={() => setShowAdd(!showAdd)}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-[#00D4FF]/20 border border-[#00D4FF]/30 text-[#00D4FF] text-[10px] font-semibold tracking-[0.06em] uppercase hover:bg-[#00D4FF]/30 transition-colors">
              <Plus size={12} /> Add Model
            </button>
          </div>

          {showAdd && (
            <Panel className="mb-4" title="Add New Model" right={<Badge tone="cyan">NEW</Badge>}>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="text-[10px] text-[#6F8193] uppercase tracking-wider">Model ID</label>
                  <input value={newModel.id} onChange={e => setNewModel(p => ({ ...p, id: e.target.value }))}
                    placeholder="e.g. llama3.1:70b" className="axe-input w-full mt-1" />
                </div>
                <div>
                  <label className="text-[10px] text-[#6F8193] uppercase tracking-wider">Display Name</label>
                  <input value={newModel.name} onChange={e => setNewModel(p => ({ ...p, name: e.target.value }))}
                    placeholder="e.g. Llama 3.1 70B" className="axe-input w-full mt-1" />
                </div>
                <div>
                  <label className="text-[10px] text-[#6F8193] uppercase tracking-wider">Provider</label>
                  <select value={newModel.provider} onChange={e => setNewModel(p => ({ ...p, provider: e.target.value }))}
                    className="axe-input w-full mt-1">
                    <option value="ollama">Ollama</option>
                    <option value="openai">OpenAI</option>
                    <option value="anthropic">Anthropic</option>
                    <option value="custom">Custom</option>
                  </select>
                </div>
              </div>
              <div className="mt-3">
                <label className="text-[10px] text-[#6F8193] uppercase tracking-wider">Description</label>
                <input value={newModel.description} onChange={e => setNewModel(p => ({ ...p, description: e.target.value }))}
                  placeholder="Brief description..." className="axe-input w-full mt-1" />
              </div>
              <div className="flex gap-2 mt-3">
                <button onClick={addModel}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-[#00D4FF] text-black text-[10px] font-semibold tracking-[0.06em] uppercase hover:bg-[#66E6FF] transition-colors">
                  <Save size={12} /> Save
                </button>
                <button onClick={() => setShowAdd(false)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-white/10 text-[#9FB0C0] text-[10px] tracking-[0.06em] uppercase hover:text-[#EAF2F7] transition-colors">
                  <X size={12} /> Cancel
                </button>
              </div>
            </Panel>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-12"><Spinner variant="braille" label="Loading..." /></div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {allModels.map((model) => (
                <ModelCard key={model.id} model={model} onTest={() => testModel(model.id)}
                  onRemove={() => removeModel(model.id)} testing={testing[model.id]}
                  expanded={expanded[model.id]} onToggleExpand={() => toggleExpand(model.id)} />
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="text-[14px] font-semibold tracking-[0.10em] text-[#EAF2F7] flex items-center gap-2 mb-4">
            <Server size={16} className="text-[#2EF2C2]" /> VPS CONNECTION
          </h2>
          <Panel title="Backend" right={<Badge tone="ok">ACTIVE</Badge>}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                { label: "Backend URL", value: "http://89.167.78.6:8000", ok: true },
                { label: "Ollama", value: "ollama.axecompanion.com", ok: true },
                { label: "n8n", value: "http://localhost:5678", ok: false },
              ].map(conn => (
                <div key={conn.label}>
                  <label className="text-[10px] text-[#6F8193] uppercase tracking-wider">{conn.label}</label>
                  <div className="flex items-center gap-2 mt-1">
                    <input value={conn.value} readOnly className="axe-input flex-1 text-[#9FB0C0]" />
                    {conn.ok ? <Check size={14} className="text-[#2EF2C2]" /> : <AlertCircle size={14} className="text-[#FFCC66]" />}
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </section>
      </main>
    </div>
  );
}

function ModelCard({ model, onTest, onRemove, testing, expanded, onToggleExpand }) {
  const providerColors = { openai: "#2EF2C2", anthropic: "#A78BFA", ollama: "#FF7A45", kimi: "#00D4FF", custom: "#FFCC66" };
  const color = providerColors[model.provider] || "#66E6FF";

  return (
    <div className="axe-panel" data-testid={`model-card-${model.id}`}>
      <div className="p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ background: color, boxShadow: `0 0 8px ${color}` }} />
            <span className="text-[11px] font-semibold text-[#EAF2F7]">{model.name}</span>
          </div>
          <div className="flex items-center gap-1">
            {model.status === "ok" ? <Check size={12} className="text-[#2EF2C2]" /> :
             model.status === "error" ? <AlertCircle size={12} className="text-[#FF4D6D]" /> :
             <Activity size={12} className="text-[#6F8193]" />}
            <button onClick={onRemove} className="text-[#6F8193] hover:text-[#FF4D6D] p-0.5 ml-1"><Trash2 size={12} /></button>
          </div>
        </div>
        <div className="flex items-center gap-2 mb-2">
          <Badge tone="cyan" className="text-[9px]">{model.provider}</Badge>
          {model.status === "ok" && <Badge tone="ok" className="text-[9px]">ONLINE</Badge>}
          {model.status === "error" && <Badge tone="error" className="text-[9px]">ERROR</Badge>}
          {model.status === "unknown" && <Badge tone="stale" className="text-[9px]">NOT TESTED</Badge>}
        </div>
        <p className="text-[10px] text-[#6F8193] mb-3">{model.description}</p>
        <div className="flex items-center gap-2">
          <button onClick={onTest} disabled={testing}
            className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded text-[10px] font-semibold tracking-[0.06em] uppercase transition-colors"
            style={{ background: `${color}15`, color, border: `1px solid ${color}30`, opacity: testing ? 0.5 : 1 }}>
            {testing ? <Spinner variant="dots" size={10} /> : <Play size={10} />}
            {testing ? "Testing..." : "Test"}
          </button>
          <button onClick={onToggleExpand} className="p-1.5 rounded text-[#6F8193] hover:text-[#EAF2F7] hover:bg-white/5 transition-colors">
            {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
        </div>
        {expanded && (
          <div className="mt-3 pt-3 border-t border-white/5 space-y-2">
            <div><label className="text-[9px] text-[#6F8193] uppercase tracking-wider">Model ID</label><div className="text-[10px] text-[#9FB0C0] font-mono">{model.id}</div></div>
            {model.lastTest && <div><label className="text-[9px] text-[#6F8193] uppercase tracking-wider">Last Tested</label><div className="text-[10px] text-[#9FB0C0]">{new Date(model.lastTest).toLocaleString()}</div></div>}
          </div>
        )}
      </div>
    </div>
  );
}
