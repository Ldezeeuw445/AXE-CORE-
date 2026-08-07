import { useEffect, useState, useRef } from 'react';
import { useSearchParams } from 'react-router';
import { motion } from 'framer-motion';
import { Plus, Pencil, Save, X, Cpu } from 'lucide-react';
import { PageHeader, StatPill } from '@/presentation/components/ui/AxeUI';
import { getSupabase } from '@/infrastructure/supabase/supabaseClient';
import type { CoreAgent } from '@/presentation/components/widgets/AgentCard';
import { AgentCard } from '@/presentation/components/widgets/AgentCard';
import { DEFAULT_AGENTS } from '@/domain/catalogs/defaultAgents';

const STORAGE_KEY = 'axe_agent_center_overrides_v1';

const ROLE_ACCENT: Record<string, string> = {
  orchestrator: '#c084fc',
  assistant: '#22d3ee',
  analyst: '#60a5fa',
  developer: '#4ade80',
  trader: '#fbbf24',
  privacy: '#fb923c',
};

function loadOverrides(): Record<string, Partial<CoreAgent>> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, Partial<CoreAgent>>;
  } catch {
    return {};
  }
}

function saveOverrides(o: Record<string, Partial<CoreAgent>>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(o));
  } catch { /* */ }
}

const CUSTOM_AGENTS_KEY = 'axe_custom_agents_v1';

function loadCustomAgents(): CoreAgent[] {
  try {
    const raw = localStorage.getItem(CUSTOM_AGENTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as CoreAgent[]) : [];
  } catch {
    return [];
  }
}

function mergeAgents(remote: CoreAgent[]): CoreAgent[] {
  const byId = new Map<string, CoreAgent>();
  for (const a of DEFAULT_AGENTS) byId.set(a.id, { ...a });
  for (const a of remote) {
    const name = (a.name ?? '').toLowerCase();
    const role = (a.role ?? '').toLowerCase();
    if (name.includes('ollama') || role === 'privacy') continue;
    if (byId.has(a.id)) {
      byId.set(a.id, { ...byId.get(a.id)!, ...a, display_name: a.display_name || byId.get(a.id)!.display_name });
    } else {
      byId.set(a.id, a);
    }
  }
  // THINKTHANKS + "Add agent" customs — full records, not only patches
  for (const a of loadCustomAgents()) {
    if (a?.id) byId.set(a.id, { ...(byId.get(a.id) || a), ...a });
  }
  const overrides = loadOverrides();
  for (const [id, ov] of Object.entries(overrides)) {
    const base = byId.get(id);
    if (base) {
      byId.set(id, { ...base, ...ov });
    } else if (ov && (ov as CoreAgent).id) {
      // full agent stored in overrides (legacy custom add)
      byId.set(id, ov as CoreAgent);
    } else if (ov && (ov as Partial<CoreAgent>).display_name) {
      byId.set(id, {
        id,
        name: id,
        display_name: (ov as Partial<CoreAgent>).display_name || id,
        role: (ov as Partial<CoreAgent>).role || 'assistant',
        description: (ov as Partial<CoreAgent>).description || '',
        system_prompt: (ov as Partial<CoreAgent>).system_prompt ?? 'You are a custom AXE agent.',
        memory_namespace: (ov as Partial<CoreAgent>).memory_namespace || id,
        toolset: (ov as Partial<CoreAgent>).toolset || [],
        model_provider: (ov as Partial<CoreAgent>).model_provider || 'google',
        model_name: (ov as Partial<CoreAgent>).model_name || 'gemini-2.0-flash',
        status: (ov as Partial<CoreAgent>).status || 'active',
        version: (ov as Partial<CoreAgent>).version || '1.0',
        capabilities: (ov as Partial<CoreAgent>).capabilities || [],
        supabase_tables: (ov as Partial<CoreAgent>).supabase_tables || [],
        app_url: (ov as Partial<CoreAgent>).app_url ?? null,
        tags: (ov as Partial<CoreAgent>).tags || ['custom'],
      });
    }
  }
  return [...byId.values()];
}

export default function Agents() {
  const [agents, setAgents] = useState<CoreAgent[]>(DEFAULT_AGENTS);
  const [loading, setLoading] = useState(true);
  const [searchParams, setSearchParams] = useSearchParams();
  const openId = searchParams.get('open');
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<CoreAgent>>({});
  const agentRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    const load = () => {
      const sb = getSupabase();
      if (!sb) {
        setAgents(mergeAgents([]));
        setLoading(false);
        return;
      }
      sb.from('core_agents')
        .select('*')
        .order('role')
        .then(({ data }) => {
          setAgents(mergeAgents((data as CoreAgent[]) || []));
          setLoading(false);
        })
        .catch(() => {
          setAgents(mergeAgents([]));
          setLoading(false);
        });
    };
    load();
    const onChange = () => load();
    window.addEventListener('axe-agents-changed', onChange);
    window.addEventListener('storage', onChange);
    return () => {
      window.removeEventListener('axe-agents-changed', onChange);
      window.removeEventListener('storage', onChange);
    };
  }, []);

  useEffect(() => {
    if (!openId || loading) return;
    const agent = agents.find(a => a.id === openId);
    if (!agent) return;
    setHighlightedId(openId);
    requestAnimationFrame(() => {
      agentRefs.current[openId]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    const clearParams = new URLSearchParams(searchParams);
    clearParams.delete('open');
    setSearchParams(clearParams, { replace: true });
    const timer = setTimeout(() => setHighlightedId(null), 3000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId, loading, agents]);

  const active = agents.filter((a) => a.status === 'active').length;

  const startEdit = (a: CoreAgent) => {
    setEditingId(a.id);
    setDraft({
      system_prompt: a.system_prompt ?? '',
      model_provider: a.model_provider,
      model_name: a.model_name,
      description: a.description,
      capabilities: a.capabilities,
    });
  };

  const saveEdit = () => {
    if (!editingId) return;
    const ov = loadOverrides();
    ov[editingId] = { ...(ov[editingId] || {}), ...draft };
    saveOverrides(ov);
    setAgents(prev => prev.map(a => (a.id === editingId ? { ...a, ...draft } : a)));
    setEditingId(null);
    setDraft({});
  };

  const addCustomAgent = () => {
    const id = `custom-${Date.now().toString(36)}`;
    const neu: CoreAgent = {
      id,
      name: id,
      display_name: 'New Agent',
      role: 'assistant',
      description: 'Custom agent — edit prompt, tools, and model.',
      system_prompt: 'You are a custom AXE agent.',
      memory_namespace: id,
      toolset: [],
      model_provider: 'google',
      model_name: 'gemini-3.5-flash',
      status: 'active',
      version: '1.0',
      capabilities: [],
      supabase_tables: [],
      app_url: null,
      tags: ['custom'],
    };
    setAgents(prev => [...prev, neu]);
    const ov = loadOverrides();
    ov[id] = neu;
    saveOverrides(ov);
    try {
      const raw = localStorage.getItem(CUSTOM_AGENTS_KEY);
      const list: CoreAgent[] = raw ? JSON.parse(raw) : [];
      const next = Array.isArray(list) ? list.filter(a => a.id !== id) : [];
      next.unshift(neu);
      localStorage.setItem(CUSTOM_AGENTS_KEY, JSON.stringify(next.slice(0, 80)));
    } catch { /* */ }
    setEditingId(id);
    setDraft(neu);
  };

  const tabTag = (a: CoreAgent) =>
    a.tags?.find(t => t.startsWith('tab:'))?.replace('tab:', '') ||
    (a.role === 'orchestrator' ? 'home' : a.role);

  return (
    <motion.div
      className="p-5 h-full overflow-y-auto"
      style={{ background: 'var(--bg-base)' }}
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] }}
    >
      <PageHeader
        eyebrow="Workforce"
        title="Agent Center"
        description={loading ? 'Loading agents…' : 'Full roster — status, skills, tools, models, and target tabs. Edit any card; add your own.'}
      />
      <div className="flex flex-wrap gap-2 mt-3 mb-5">
        <StatPill label="Active" value={String(active)} tone="success" />
        <StatPill label="Total" value={String(agents.length)} tone="neutral" />
        <StatPill label="Source" value="defaults + core_agents" tone="neutral" />
        <button
          type="button"
          onClick={addCustomAgent}
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-medium"
          style={{ background: 'rgba(34,211,238,0.12)', border: '1px solid rgba(34,211,238,0.35)', color: '#22D3EE' }}
        >
          <Plus size={13} /> Add agent
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {agents.map(agent => {
          const editing = editingId === agent.id;
          const accent = ROLE_ACCENT[agent.role] ?? ROLE_ACCENT.assistant;
          return (
            <div
              key={agent.id}
              ref={el => { agentRefs.current[agent.id] = el; }}
              className="rounded-xl overflow-hidden flex flex-col transition-all"
              style={{
                background: 'var(--bg-surface)',
                border: highlightedId === agent.id ? '1px solid rgba(34,211,238,0.55)' : '1px solid rgba(255,255,255,0.08)',
                borderLeft: `3px solid ${accent}`,
                boxShadow: highlightedId === agent.id ? '0 0 0 2px rgba(34,211,238,0.2)' : undefined,
              }}
            >
              <AgentCard agent={agent} highlighted={highlightedId === agent.id} />
              <div
                className="px-4 pb-3 pt-2 space-y-2"
                style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}
              >
                <div className="flex items-center gap-2 text-[10px]" style={{ color: 'var(--text-muted)' }}>
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.04)' }}>
                    <Cpu size={10} /> {agent.model_provider}/{agent.model_name?.split('/').pop()}
                  </span>
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.04)' }}>
                    Tab · {tabTag(agent)}
                  </span>
                </div>
                {!editing ? (
                  <button type="button" onClick={() => startEdit(agent)} className="inline-flex items-center gap-1 text-[10px] font-medium" style={{ color: '#22D3EE' }}>
                    <Pencil size={11} /> Edit prompt · tools · model
                  </button>
                ) : (
                  <div className="space-y-2 pt-1" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    <label className="block text-[9px] font-mono uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.35)' }}>System prompt</label>
                    <textarea
                      value={String(draft.system_prompt ?? '')}
                      onChange={e => setDraft(d => ({ ...d, system_prompt: e.target.value }))}
                      rows={4}
                      className="w-full rounded-lg px-2.5 py-2 text-[11px] outline-none resize-y"
                      style={{ background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.1)', color: '#F5F0E6' }}
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[9px] font-mono uppercase mb-1" style={{ color: 'rgba(255,255,255,0.35)' }}>Provider</label>
                        <input value={String(draft.model_provider ?? '')} onChange={e => setDraft(d => ({ ...d, model_provider: e.target.value }))}
                          className="w-full rounded-lg px-2 py-1.5 text-[11px] outline-none" style={{ background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.1)', color: '#F5F0E6' }} />
                      </div>
                      <div>
                        <label className="block text-[9px] font-mono uppercase mb-1" style={{ color: 'rgba(255,255,255,0.35)' }}>Model</label>
                        <input value={String(draft.model_name ?? '')} onChange={e => setDraft(d => ({ ...d, model_name: e.target.value }))}
                          className="w-full rounded-lg px-2 py-1.5 text-[11px] outline-none" style={{ background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.1)', color: '#F5F0E6' }} />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[9px] font-mono uppercase mb-1" style={{ color: 'rgba(255,255,255,0.35)' }}>Description</label>
                      <input value={String(draft.description ?? '')} onChange={e => setDraft(d => ({ ...d, description: e.target.value }))}
                        className="w-full rounded-lg px-2 py-1.5 text-[11px] outline-none" style={{ background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.1)', color: '#F5F0E6' }} />
                    </div>
                    <div className="flex gap-2 pt-1">
                      <button type="button" onClick={saveEdit} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[10px] font-semibold" style={{ background: 'rgba(34,211,238,0.15)', border: '1px solid rgba(34,211,238,0.35)', color: '#22D3EE' }}>
                        <Save size={11} /> Save
                      </button>
                      <button type="button" onClick={() => { setEditingId(null); setDraft({}); }} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[10px]" style={{ color: 'var(--text-muted)' }}>
                        <X size={11} /> Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}
