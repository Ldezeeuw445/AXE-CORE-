import { useEffect, useState, useRef } from 'react';
import { useSearchParams } from 'react-router';
import { motion } from 'framer-motion';
import { Plus, Pencil, Save, X, Cpu } from 'lucide-react';
import { PageHeader, StatPill } from '@/presentation/components/ui/AxeUI';
import { getSupabase } from '@/infrastructure/supabase/supabaseClient';
import type { CoreAgent } from '@/presentation/components/widgets/AgentCard';
import { AgentCard } from '@/presentation/components/widgets/AgentCard';
import { DEFAULT_AGENTS } from '@/domain/catalogs/defaultAgents';
import { LIST_GRID } from '@/presentation/components/surface/Page';
import { agentLoopHealth } from '@/infrastructure/persistence/agentFeedbackService';
import { loopAgentVoor } from '@/infrastructure/persistence/memoryFeedbackService';
import type { LoopHealth } from '@/domain/memory/agentLoop';
import { WarRoom } from '@/presentation/components/axe-core/WarRoom';
import { agentsByKind } from '@/domain/agents/catalog';

const STORAGE_KEY = 'axe_agent_center_overrides_v1';

const ROLE_ACCENT: Record<string, string> = {
  orchestrator: '#c084fc',
  assistant: 'var(--accent-cyan)',
  analyst: '#60a5fa',
  developer: '#4ade80',
  trader: 'var(--warning)',
  privacy: '#fb923c',
};

// Loop identity comes from the same canonical namespace/name resolver used by
// retrieval itself. The page must not maintain a second agent list: that is how
// real agents were previously shown as "not wired" while their code was live.
function loopAgentForRow(agent: CoreAgent): LoopHealth['agent'] | null {
  return loopAgentVoor(agent.memory_namespace || undefined)
    ?? loopAgentVoor(agent.name)
    ?? null;
}

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

// De database is de waarheid; DEFAULT_AGENTS is alleen een noodgreep voor
// als er geen verbinding is (of de tabel leeg is). Voorheen werden de twaalf
// hardgecodeerde defaults ALTIJD als basis genomen en kreeg elke rij uit
// core_agents die erbij gemerged werd zijn eigen plek in de map -- omdat de
// defaults met een slug als id werken ('axe-core') en de database met een
// UUID, kon `byId.has(a.id)` nooit iets dedupen. Resultaat: 18 rijen in de
// database + 12 defaults - 1 gefilterde (ollama) = 29 op het scherm, en
// "AXE Core", "AXE Intel" en "AXE Companion" allebei twee keer (één keer als
// default, één keer als database-rij). Nu: zodra de database rijen teruggeeft
// zijn de defaults alleen nog geschiedenis.
function mergeAgents(remote: CoreAgent[]): CoreAgent[] {
  const base: CoreAgent[] = remote.length > 0 ? remote : DEFAULT_AGENTS;
  const byId = new Map<string, CoreAgent>();
  for (const a of base) byId.set(a.id, { ...a });

  // THINKTHANKS + "Add agent" customs — full records, not only patches
  for (const a of loadCustomAgents()) {
    if (a?.id) byId.set(a.id, { ...(byId.get(a.id) || a), ...a });
  }
  const overrides = loadOverrides();
  for (const [id, ov] of Object.entries(overrides)) {
    const base2 = byId.get(id);
    if (base2) {
      byId.set(id, { ...base2, ...ov });
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

// AGENTS.md: Nederlands in commits en commentaar, Engels in de UI — dus deze
// teksten (die op de kaart verschijnen) zijn Engels, ook al is de rest van
// dit bestand in het Nederlands becommentarieerd.
function statusNote(status: string): string | null {
  switch (status) {
    case 'active':
      return null;
    case 'paused':
      return 'Not built yet — the name exists, no code runs behind it.';
    case 'deprecated':
      return 'Deprecated.';
    default:
      // Vangt ook een teruggekeerde 'statue' op (was geen geldige waarde
      // voor deze tabel — zie WERKVERDELING.md) zodat het zichtbaar blijft
      // in plaats van stil weg te vallen achter een generieke badge.
      return `Unknown status: ${status}`;
  }
}

export default function Agents() {
  const [agents, setAgents] = useState<CoreAgent[]>(DEFAULT_AGENTS);
  const [loading, setLoading] = useState(true);
  const [usingFallback, setUsingFallback] = useState(false);
  const [loopHealthByAgent, setLoopHealthByAgent] = useState<Record<string, LoopHealth>>({});
  const [searchParams, setSearchParams] = useSearchParams();
  const openId = searchParams.get('open');
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<CoreAgent>>({});
  const agentRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    // Was `.then(({ data }) => ...).catch(...)`, which had two faults. The
    // Postgrest builder is a PromiseLike, so `.catch` is not part of its type
    // -- and more importantly the `error` field was never read, so a rejected
    // query arrived as `data: null` and rendered as "no agents" rather than as
    // a failure. Same shape as the five other silent failures in this app.
    const load = async () => {
      const sb = getSupabase();
      if (!sb) {
        setUsingFallback(true);
        setAgents(mergeAgents([]));
        setLoading(false);
        return;
      }
      try {
        const [{ data, error }, health] = await Promise.all([
          sb.from('core_agents').select('*').order('role'),
          agentLoopHealth().catch(() => [] as LoopHealth[]),
        ]);
        if (error) throw new Error(error.message);
        const remote = (data as CoreAgent[]) || [];
        setLoopHealthByAgent(Object.fromEntries(health.map(h => [h.agent, h])));
        setUsingFallback(remote.length === 0);
        setAgents(mergeAgents(remote));
      } catch (err) {
        console.error('[Agents] could not load core_agents:', err);
        setUsingFallback(true);
        setAgents(mergeAgents([]));
      } finally {
        setLoading(false);
      }
    };
    void load();
    const onChange = () => void load();
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
        title="War Room"
        description={loading ? 'Loading agents…' : 'The six agents AXE runs — see who is doing what. The full roster and settings are below.'}
      />
      <div className="flex flex-wrap gap-2 mt-3 mb-5">
        <StatPill label="Active" value={String(active)} tone="success" />
        <StatPill label="Total" value={String(agents.length)} tone="neutral" />
        <StatPill label="Source" value={usingFallback ? 'defaults (no db)' : 'core_agents'} tone="neutral" />
        <button
          type="button"
          onClick={addCustomAgent}
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-medium"
          style={{ background: 'var(--tint-line)', border: '1px solid var(--tint-line)', color: 'var(--accent-cyan)' }}
        >
          <Plus size={13} /> Add agent
        </button>
      </div>

      <WarRoom />

      <h2 className="text-small font-semibold tracking-wide mb-3" style={{ color: 'var(--text-primary)', letterSpacing: '0.08em' }}>
        FULL ROSTER &amp; SETTINGS
      </h2>

      <div className={LIST_GRID}>
        {agents.map(agent => {
          const editing = editingId === agent.id;
          const accent = ROLE_ACCENT[agent.role] ?? ROLE_ACCENT.assistant;
          const note = statusNote(agent.status);
          const skills = Array.isArray(agent.capabilities) ? agent.capabilities : [];
          const tools = Array.isArray(agent.toolset) ? agent.toolset : [];
          const loopName = loopAgentForRow(agent);
          const health = loopName ? loopHealthByAgent[loopName] : undefined;
          return (
            <div
              key={agent.id}
              ref={el => { agentRefs.current[agent.id] = el; }}
              className="rounded-xl overflow-hidden flex flex-col transition-all"
              style={{
                background: 'var(--bg-surface)',
                border: highlightedId === agent.id ? '1px solid var(--tint-line)' : '1px solid rgba(255,255,255,0.08)',
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

                {note && (
                  <div className="text-[10px]" style={{ color: 'var(--warning)' }}>
                    {note}
                  </div>
                )}

                {(skills.length > 0 || tools.length > 0) ? (
                  <div className="flex flex-wrap gap-1">
                    {skills.map((s, i) => (
                      <span
                        key={`skill-${i}`}
                        className="text-[9px] px-1.5 py-0.5 rounded"
                        style={{ background: 'rgba(96,165,250,0.12)', color: '#60a5fa' }}
                      >
                        {String(s)}
                      </span>
                    ))}
                    {tools.map((t, i) => (
                      <span
                        key={`tool-${i}`}
                        className="text-[9px] px-1.5 py-0.5 rounded"
                        style={{ background: 'rgba(74,222,128,0.12)', color: '#4ade80' }}
                      >
                        🔧 {String(t)}
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                    No skills or tools registered yet.
                  </div>
                )}

                <div className="text-[10px]" style={{ color: health && health.opened > 0 ? 'var(--accent-cyan)' : 'var(--text-muted)' }}>
                  {!loopName
                    ? 'Learning loop (agent_learning_episodes): not wired yet.'
                    : !health || health.opened === 0
                      ? 'Learning loop (agent_learning_episodes): 0 episodes.'
                      : `Learning loop: ${health.opened} episodes · ${Math.round(health.closeRate * 100)}% outcomes · ${health.applied}/${health.reinforceable} learned`}
                </div>

                {!editing ? (
                  <button type="button" onClick={() => startEdit(agent)} className="inline-flex items-center gap-1 text-[10px] font-medium" style={{ color: 'var(--accent-cyan)' }}>
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
                      style={{ background: 'var(--bg-surface)', border: '1px solid rgba(255,255,255,0.1)', color: '#F5F0E6' }}
                    />
                    <div className={LIST_GRID}>
                      <div>
                        <label className="block text-[9px] font-mono uppercase mb-1" style={{ color: 'rgba(255,255,255,0.35)' }}>Provider</label>
                        <input value={String(draft.model_provider ?? '')} onChange={e => setDraft(d => ({ ...d, model_provider: e.target.value }))}
                          className="w-full rounded-lg px-2 py-1.5 text-[11px] outline-none" style={{ background: 'var(--bg-surface)', border: '1px solid rgba(255,255,255,0.1)', color: '#F5F0E6' }} />
                      </div>
                      <div>
                        <label className="block text-[9px] font-mono uppercase mb-1" style={{ color: 'rgba(255,255,255,0.35)' }}>Model</label>
                        <input value={String(draft.model_name ?? '')} onChange={e => setDraft(d => ({ ...d, model_name: e.target.value }))}
                          className="w-full rounded-lg px-2 py-1.5 text-[11px] outline-none" style={{ background: 'var(--bg-surface)', border: '1px solid rgba(255,255,255,0.1)', color: '#F5F0E6' }} />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[9px] font-mono uppercase mb-1" style={{ color: 'rgba(255,255,255,0.35)' }}>Description</label>
                      <input value={String(draft.description ?? '')} onChange={e => setDraft(d => ({ ...d, description: e.target.value }))}
                        className="w-full rounded-lg px-2 py-1.5 text-[11px] outline-none" style={{ background: 'var(--bg-surface)', border: '1px solid rgba(255,255,255,0.1)', color: '#F5F0E6' }} />
                    </div>
                    <div className="flex gap-2 pt-1">
                      <button type="button" onClick={saveEdit} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[10px] font-semibold" style={{ background: 'var(--tint-line)', border: '1px solid var(--tint-line)', color: 'var(--accent-cyan)' }}>
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

      {/* The Wingman's CrewAI specialists — the free-model crews AXE delegates
          to. Shown here so every agent in the force is visible in one place,
          each with the memory namespace it learns in. */}
      <h2 className="text-small font-semibold tracking-wide mt-6 mb-3" style={{ color: 'var(--text-primary)', letterSpacing: '0.08em' }}>
        CREW — THE WINGMAN&apos;S SPECIALISTS
      </h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
        {agentsByKind('crew').map((a) => (
          <div key={a.id} className="rounded-xl p-3" style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)' }}>
            <div className="flex items-center gap-2 mb-1">
              <span className="flex-shrink-0 rounded-full" style={{ width: 8, height: 8, background: '#38BDF8' }} />
              <span className="text-small font-medium truncate" style={{ color: 'var(--text-primary)' }}>{a.name}</span>
            </div>
            <p className="text-xs-custom" style={{ color: 'var(--text-muted)', lineHeight: 1.35 }}>{a.description}</p>
            <div className="mt-2 pt-2 flex items-center justify-between gap-2" style={{ borderTop: '1px solid var(--border-subtle)' }}>
              <span className="text-xs-custom truncate" style={{ color: 'var(--text-muted)' }}>memory · {a.namespace}</span>
              <span className="text-xs-custom flex-shrink-0" style={{ color: 'var(--text-muted)' }}>via Wingman</span>
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
