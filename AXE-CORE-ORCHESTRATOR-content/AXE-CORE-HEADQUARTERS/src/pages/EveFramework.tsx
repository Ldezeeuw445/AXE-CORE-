/**
 * EveFramework.tsx
 * ------------------------------------------------------------------
 * EVE = Extensible Virtual Environment
 * Per-provider skill management. Each connected LLM gets its own
 * skill card. Add, edit, remove skills and prompts per provider.
 * Inspired by Vercel's AI SDK EVE pattern.
 */

import { useState, useCallback, useEffect } from 'react';
import { motion, Reorder, AnimatePresence } from 'framer-motion';
import {
  Sparkles, Plus, X, Check, Save, Trash2, GripVertical,
  ChevronRight, Zap, Brain, Code2, Search, Globe,
  MessageSquare, FileText, Wrench, Play, Settings,
  Lock, Unlock, Copy,
} from 'lucide-react';

/* ─── Types ─────────────────────────────────────────────────────────────── */
interface EveSkill {
  id: string;
  name: string;
  description: string;
  prompt: string;
  icon: string;
  active: boolean;
}

interface EveProvider {
  id: string;
  name: string;
  model: string;
  accent: string;
  connected: boolean;
  skills: EveSkill[];
  expanded: boolean;
}

/* ─── Default skills per provider type ─────────────────────────────────── */
const DEFAULT_SKILLS: Record<string, EveSkill[]> = {
  anthropic: [
    { id: 's1', name: 'Code Review', description: 'Review code for bugs and improvements', prompt: 'Review this code for bugs, performance issues, and suggest improvements:', icon: 'code', active: true },
    { id: 's2', name: 'Analysis', description: 'Deep analysis of complex topics', prompt: 'Provide a thorough analysis of:', icon: 'brain', active: true },
  ],
  openai: [
    { id: 's1', name: 'Creative Writing', description: 'Generate creative content', prompt: 'Write creative content about:', icon: 'file', active: true },
    { id: 's2', name: 'Data Parsing', description: 'Parse and structure data', prompt: 'Parse and structure this data:', icon: 'code', active: true },
  ],
  groq: [
    { id: 's1', name: 'Quick Chat', description: 'Fast responses for quick questions', prompt: 'Answer concisely:', icon: 'message', active: true },
    { id: 's2', name: 'Code Gen', description: 'Generate code snippets quickly', prompt: 'Generate code for:', icon: 'code', active: true },
  ],
  google: [
    { id: 's1', name: 'Research', description: 'Deep research with citations', prompt: 'Research this topic thoroughly with sources:', icon: 'search', active: true },
    { id: 's2', name: 'Summarize', description: 'Summarize long documents', prompt: 'Summarize this text:', icon: 'file', active: true },
  ],
  default: [
    { id: 's1', name: 'Chat', description: 'General conversation', prompt: 'Respond to:', icon: 'message', active: true },
    { id: 's2', name: 'Code', description: 'Code assistance', prompt: 'Help with this code:', icon: 'code', active: true },
    { id: 's3', name: 'Search', description: 'Web search and browse', prompt: 'Search for:', icon: 'globe', active: true },
  ],
};

/* ─── Accent colors ────────────────────────────────────────────────────── */
const ACCENTS: Record<string, string> = {
  anthropic: '#D4A574', openai: '#10A37F', google: '#4285F4',
  xai: '#1DA1F2', groq: '#F55036', openrouter: '#8B5CF6',
  ollama: '#FF6B35', openhands: '#00D4AA', openjarvis: '#6C5CE7',
  openclaw: '#E17055', kilocode: '#00B894', crewai: '#FDCB6E',
  hermes: '#A29BFE',
};

/* ─── Icon map ─────────────────────────────────────────────────────────── */
function SkillIcon({ name, size = 10 }: { name: string; size?: number }) {
  const icons: Record<string, React.ReactNode> = {
    code: <Code2 size={size} />, brain: <Brain size={size} />, file: <FileText size={size} />,
    message: <MessageSquare size={size} />, search: <Search size={size} />, globe: <Globe size={size} />,
    zap: <Zap size={size} />, wrench: <Wrench size={size} />,
  };
  return <span style={{ color: 'inherit' }}>{icons[name] || <Sparkles size={size} />}</span>;
}

/* ─── Status dot ───────────────────────────────────────────────────────── */
function StatusDot({ active, accent }: { active: boolean; accent: string }) {
  return (
    <span
      className="rounded-full flex-shrink-0"
      style={{
        width: 6, height: 6,
        background: active ? accent : '#374151',
        boxShadow: active ? `0 0 6px ${accent}60` : 'none',
      }}
    />
  );
}

/* ─── Skill Card ───────────────────────────────────────────────────────── */
function SkillCard({
  skill, accent, onToggle, onDelete, onUpdate,
}: {
  skill: EveSkill;
  accent: string;
  onToggle: () => void;
  onDelete: () => void;
  onUpdate: (s: EveSkill) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(skill.name);
  const [editDesc, setEditDesc] = useState(skill.description);
  const [editPrompt, setEditPrompt] = useState(skill.prompt);

  const save = () => {
    onUpdate({ ...skill, name: editName, description: editDesc, prompt: editPrompt });
    setEditing(false);
  };

  return (
    <motion.div
      layout
      className="rounded-lg overflow-hidden"
      style={{
        background: skill.active ? `${accent}08` : 'rgba(255,255,255,0.02)',
        border: `1px solid ${skill.active ? `${accent}20` : 'rgba(255,255,255,0.05)'}`,
      }}
    >
      <div className="flex items-center gap-2 px-3 py-2">
        <StatusDot active={skill.active} accent={accent} />
        <SkillIcon name={skill.icon} />
        <div className="flex-1 min-w-0">
          <span className="text-[10px] font-medium block truncate" style={{ color: skill.active ? accent : 'rgba(255,255,255,0.4)' }}>{skill.name}</span>
          <span className="text-[8px] block truncate" style={{ color: 'rgba(255,255,255,0.3)' }}>{skill.description}</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setEditing(v => !v)} className="p-0.5" style={{ color: 'rgba(255,255,255,0.25)' }}><Settings size={9} /></button>
          <button onClick={onToggle} className="p-0.5" style={{ color: skill.active ? accent : 'rgba(255,255,255,0.25)' }}>
            {skill.active ? <Unlock size={9} /> : <Lock size={9} />}
          </button>
          <button onClick={onDelete} className="p-0.5" style={{ color: 'rgba(255,255,255,0.15)' }}><Trash2 size={8} /></button>
        </div>
      </div>

      <AnimatePresence>
        {editing && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-2 space-y-1.5">
              <input
                value={editName}
                onChange={e => setEditName(e.target.value)}
                className="w-full text-[9px] px-2 py-1 rounded outline-none"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.7)' }}
              />
              <input
                value={editDesc}
                onChange={e => setEditDesc(e.target.value)}
                className="w-full text-[9px] px-2 py-1 rounded outline-none"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.7)' }}
              />
              <textarea
                value={editPrompt}
                onChange={e => setEditPrompt(e.target.value)}
                rows={2}
                className="w-full text-[9px] px-2 py-1 rounded outline-none resize-none font-mono-data"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.7)' }}
              />
              <div className="flex gap-1">
                <button onClick={save} className="flex-1 text-[8px] py-0.5 rounded flex items-center justify-center gap-1" style={{ background: accent, color: '#000' }}><Save size={8} /> Save</button>
                <button onClick={() => setEditing(false)} className="px-2 py-0.5 rounded text-[8px]" style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.4)' }}>Cancel</button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ─── Provider Card ────────────────────────────────────────────────────── */
function ProviderCard({
  provider, onToggle, onAddSkill, onUpdateSkill, onDeleteSkill, onToggleSkill,
}: {
  provider: EveProvider;
  onToggle: () => void;
  onAddSkill: (pId: string) => void;
  onUpdateSkill: (pId: string, skill: EveSkill) => void;
  onDeleteSkill: (pId: string, sId: string) => void;
  onToggleSkill: (pId: string, sId: string) => void;
}) {
  return (
    <motion.div
      layout
      className="rounded-xl overflow-hidden"
      style={{
        background: '#0a0a0a',
        border: `1px solid ${provider.connected ? `${provider.accent}20` : 'rgba(255,255,255,0.06)'}`,
      }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-2.5 cursor-pointer"
        style={{ borderBottom: provider.expanded ? '1px solid rgba(255,255,255,0.06)' : 'none' }}
        onClick={onToggle}
      >
        <GripVertical size={12} style={{ color: 'rgba(255,255,255,0.1)', cursor: 'grab' }} />
        <StatusDot active={provider.connected} accent={provider.accent} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-semibold truncate" style={{ color: provider.connected ? provider.accent : 'rgba(255,255,255,0.3)' }}>{provider.name}</span>
            {provider.connected && (
              <span className="text-[7px] px-1 rounded-full" style={{ background: `${provider.accent}18`, color: provider.accent, border: `1px solid ${provider.accent}30` }}>LIVE</span>
            )}
          </div>
          <span className="text-[9px] block truncate" style={{ color: 'rgba(255,255,255,0.3)' }}>{provider.model} &middot; {provider.skills.length} skills</span>
        </div>
        <ChevronRight
          size={12}
          style={{
            color: 'rgba(255,255,255,0.2)',
            transform: provider.expanded ? 'rotate(90deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s',
          }}
        />
      </div>

      {/* Skills */}
      <AnimatePresence>
        {provider.expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-3 py-2 space-y-1.5">
              {provider.skills.map(skill => (
                <SkillCard
                  key={skill.id}
                  skill={skill}
                  accent={provider.accent}
                  onToggle={() => onToggleSkill(provider.id, skill.id)}
                  onDelete={() => onDeleteSkill(provider.id, skill.id)}
                  onUpdate={(s) => onUpdateSkill(provider.id, s)}
                />
              ))}
              <button
                onClick={() => onAddSkill(provider.id)}
                className="w-full flex items-center justify-center gap-1 text-[9px] py-1.5 rounded"
                style={{ border: '1px dashed rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.25)' }}
              >
                <Plus size={9} /> Add skill
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   EVE FRAMEWORK PAGE
   ══════════════════════════════════════════════════════════════════════════ */
export default function EveFramework() {
  const [providers, setProviders] = useState<EveProvider[]>(() => loadProviders());

  // Persist providers
  useEffect(() => {
    localStorage.setItem('axe_eve_providers', JSON.stringify(providers));
  }, [providers]);

  const toggleProvider = useCallback((id: string) => {
    setProviders(prev => prev.map(p => p.id === id ? { ...p, expanded: !p.expanded } : p));
  }, []);

  const addSkill = useCallback((pId: string) => {
    const name = prompt('Skill name:');
    if (!name) return;
    const newSkill: EveSkill = {
      id: `s_${Date.now()}`,
      name,
      description: 'Custom skill',
      prompt: `${name}: `,
      icon: 'zap',
      active: true,
    };
    setProviders(prev => prev.map(p =>
      p.id === pId ? { ...p, skills: [...p.skills, newSkill] } : p
    ));
  }, []);

  const updateSkill = useCallback((pId: string, skill: EveSkill) => {
    setProviders(prev => prev.map(p =>
      p.id === pId ? { ...p, skills: p.skills.map(s => s.id === skill.id ? skill : s) } : p
    ));
  }, []);

  const deleteSkill = useCallback((pId: string, sId: string) => {
    setProviders(prev => prev.map(p =>
      p.id === pId ? { ...p, skills: p.skills.filter(s => s.id !== sId) } : p
    ));
  }, []);

  const toggleSkill = useCallback((pId: string, sId: string) => {
    setProviders(prev => prev.map(p =>
      p.id === pId ? { ...p, skills: p.skills.map(s => s.id === sId ? { ...s, active: !s.active } : s) } : p
    ));
  }, []);

  const activeSkills = providers.reduce((sum, p) => sum + p.skills.filter(s => s.active).length, 0);
  const connectedCount = providers.filter(p => p.connected).length;

  return (
    <motion.div
      className="h-full overflow-y-auto p-4"
      style={{ background: '#000' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Sparkles size={14} style={{ color: 'var(--accent-cyan)' }} />
            <span className="text-sm font-semibold tracking-wide" style={{ color: 'var(--text-primary)' }}>EVE FRAMEWORK</span>
          </div>
          <span className="text-[9px] px-2 py-0.5 rounded-full" style={{ background: 'rgba(34,211,238,0.1)', color: 'var(--accent-cyan)', border: '1px solid rgba(34,211,238,0.2)' }}>
            Extensible Virtual Environment
          </span>
        </div>
        <div className="flex items-center gap-3 text-[10px]" style={{ color: 'var(--text-muted)' }}>
          <span>{connectedCount} providers</span>
          <span>{activeSkills} active skills</span>
        </div>
      </div>

      {/* Providers grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {providers.map(provider => (
          <ProviderCard
            key={provider.id}
            provider={provider}
            onToggle={() => toggleProvider(provider.id)}
            onAddSkill={addSkill}
            onUpdateSkill={updateSkill}
            onDeleteSkill={deleteSkill}
            onToggleSkill={toggleSkill}
          />
        ))}
      </div>
    </motion.div>
  );
}

/* ─── Load providers from storage + LLM config ─────────────────────────── */
function loadProviders(): EveProvider[] {
  // Load LLM connections
  let conns: Record<string, { key?: string; baseUrl?: string }> = {};
  try {
    conns = JSON.parse(localStorage.getItem('axe_llm_connections') ?? '{}');
  } catch { /* */ }

  const CATALOGUE = [
    { id: 'anthropic', name: 'Anthropic', model: 'Claude' },
    { id: 'openai', name: 'OpenAI', model: 'GPT-4o' },
    { id: 'google', name: 'Google', model: 'Gemini' },
    { id: 'xai', name: 'Grok', model: 'Grok' },
    { id: 'groq', name: 'Groq', model: 'Qwen 3 32B' },
    { id: 'openrouter', name: 'OpenRouter', model: 'Multi' },
    { id: 'ollama', name: 'Ollama', model: 'Local' },
    { id: 'openhands', name: 'OpenHands', model: 'Local' },
    { id: 'openjarvis', name: 'OpenJarvis', model: 'Local' },
    { id: 'openclaw', name: 'OpenClaw', model: 'Local' },
    { id: 'kilocode', name: 'Kilo Code', model: 'Local' },
    { id: 'crewai', name: 'CrewAI', model: 'Local' },
    { id: 'hermes', name: 'Hermes Agent', model: 'Local' },
  ];

  // Check for saved EVE providers
  let saved: EveProvider[] | null = null;
  try {
    const raw = localStorage.getItem('axe_eve_providers');
    if (raw) saved = JSON.parse(raw) as EveProvider[];
  } catch { /* */ }

  return CATALOGUE.map(cat => {
    const connected = !!conns[cat.id];
    const accent = ACCENTS[cat.id] || '#22D3EE';

    // Merge with saved data if exists
    const savedProvider = saved?.find(s => s.id === cat.id);

    return {
      id: cat.id,
      name: cat.name,
      model: cat.model,
      accent,
      connected,
      expanded: savedProvider?.expanded ?? false,
      skills: savedProvider?.skills ?? (DEFAULT_SKILLS[cat.id] || DEFAULT_SKILLS.default).map(s => ({
        ...s,
        prompt: s.prompt,
      })),
    };
  });
}
