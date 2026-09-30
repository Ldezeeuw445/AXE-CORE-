import { useEffect, useMemo, useState, useRef } from 'react';
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
import { agentsByKind } from '@/domain/agents/catalog';
import { agentPulses, schedulePlans, queuesByAgent, type AgentFilter } from '@/domain/agents/activity';
import { ActivityPlansPanel, LiveIndicator } from '@/presentation/components/agents/ActivityPlansPanel';
import { AgentMemoryPanel } from '@/presentation/components/agents/AgentMemoryPanel';
import { useAgentActivity, useNow } from '@/presentation/components/agents/useAgentActivity';
import { TierRooster } from '@/presentation/components/agents/TierRooster';
import { AgentDetail, CrewDetail } from '@/presentation/components/agents/AgentDetail';
import {
  WEERGAVEN, aantalWerkend, type AgentsWeergave, type LadeTab,
} from '@/domain/agents/agentsTab';
import { AXE_AGENTS, type AxeAgentId } from '@/domain/agents/roster';
import { TabRail } from '@/presentation/components/layout/useTabRail';
import { SchuifBalk } from '@/presentation/components/layout/tabMaatstaf';

const STORAGE_KEY = 'axe_agent_center_overrides_v1';

// core_agents rows that are not agents at all and must never render as a
// card here. 'axe_trader'/"Trading OS" names AXE CORE's own in-process
// trading agent after a completely separate standalone application
// (see ECOSYSTEM.md) -- the real agent is DEFAULT_AGENTS' 'trading-agent'.
// 'axe_ollama'/"Ollama (Local)" is a model provider (providers.ts), not a
// reasoning agent -- no agent runs "as" Ollama, agents merely may use it.
// 'crewai_manager'/"CrewAI Manager" and 'eve'/"EVE" are both explicitly
// documented in roster.ts:28-31 as deliberately excluded from the real
// roster -- CrewAI Manager as "redundant, Wingman already runs the crews
// it needs", EVE as "a persona framework", not an agent of its own. Found
// live in this exact table on 23 sep 2026 (they'd survived the first pass
// of this filter, which only checked Trading OS/Ollama).
const NON_AGENT_ROW_NAMES = new Set(['axe_trader', 'axe_ollama', 'crewai_manager', 'eve']);

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
  // Activity & plans + geheugen: echte rijen, elke 15 s (zie useAgentActivity).
  const activity = useAgentActivity();
  const now = useNow();
  const [filter, setFilter] = useState<AgentFilter>('all');
  const [memoryId, setMemoryId] = useState<string>('axe');
  const pulses = useMemo(() => agentPulses(activity.items, now), [activity.items, now]);

  /* De vier weergaven. Ze stonden hiervoor alle vier onder elkaar op één
     pagina: War Room, Activity & plans, Memory, en dan nog de volle roster met
     instellingen. Dat is vier schermen scrollen voor je bij de instellingen
     bent, en op de telefoon tien. Nu kies je er één, en staan er steeds
     dezelfde agents onder. */
  const [weergave, setWeergave] = useState<AgentsWeergave>('roster');
  const [gekozenAgent, setGekozenAgent] = useState<AxeAgentId | null>(null);
  const [gekozenCrew, setGekozenCrew] = useState<string | null>(null);
  const [ladeTab, setLadeTab] = useState<LadeTab>('nu');

  /* Is er een ECHTE rechterrail om het detail in te hangen?
   *
   * Drie schermen, drie antwoorden, en ze volgen niet uit de breedte:
   * - Tauri (>1600): RightPanel rendert een <aside> met `#axe-rail-rechts`.
   * - iPad (768-1600, coarse): RightPanel neemt de Sheet-tak en die host geen
   *   railinhoud -- `#axe-rail-rechts` bestaat daar niet. Gemeten op 1024 en
   *   768: de lade kwam wel binnen maar stond op 0x0.
   * - Telefoon: geen rail, maar de plaatsloten schuiven wél in de zijlade.
   *
   * Dus: rail als er een rail is, en anders het detail gewoon IN de pagina,
   * boven de kolommen. Dat is ook wat de voorbeeld-HTML onder 900px deed.
   * Een DOM-test en geen breedtetest, want de breedte voorspelt het niet. */
  const [heeftRail, setHeeftRail] = useState(
    () => typeof document !== 'undefined' && !!document.getElementById('axe-rail-rechts'),
  );
  useEffect(() => {
    const kijk = () => setHeeftRail(!!document.getElementById('axe-rail-rechts'));
    const raf = requestAnimationFrame(kijk);
    const obs = new MutationObserver(kijk);
    obs.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', kijk);
    return () => {
      cancelAnimationFrame(raf);
      obs.disconnect();
      window.removeEventListener('resize', kijk);
    };
  }, []);

  /* Hoeveel de rechterlade over deze weergave heen valt, in pixels. undefined
     zolang er niets open staat, en alleen van toepassing als er een echte
     rail is: staat het detail inline in de pagina, dan valt er niets te
     ontwijken en zou dit alleen een lege strook naast de kaarten opleveren. */
  const ruimteRef = useRef<HTMLDivElement | null>(null);
  const [ladeOverlap, setLadeOverlap] = useState<number | undefined>(undefined);
  const ladeOpen = !!gekozenAgent || !!gekozenCrew;
  useEffect(() => {
    // Geen setState hier in de body: of de reservering meetelt, beslist de
    // render hieronder. Zo blijft dit effect puur "meten en melden".
    if (!ladeOpen || !heeftRail) return;
    const meet = () => {
      const vak = ruimteRef.current;
      const paneel = document.getElementById('axe-rail-rechts')?.getBoundingClientRect();
      if (!vak || !paneel || paneel.width === 0) return;
      // De huidige padding er weer bij optellen: de rechterrand die we meten is
      // al naar binnen geschoven door de vorige meting, dus zonder dit zakt de
      // waarde elke ronde verder terug naar nul.
      const nu = parseFloat(getComputedStyle(vak).paddingRight) || 0;
      const buitenrand = vak.getBoundingClientRect().right + nu;
      setLadeOverlap(Math.max(0, Math.round(buitenrand - paneel.left)));
    };
    // Eén frame later én na de schuifanimatie: de lade staat er niet meteen.
    const raf = requestAnimationFrame(meet);
    const t = window.setTimeout(meet, 280);
    window.addEventListener('resize', meet);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t);
      window.removeEventListener('resize', meet);
    };
  }, [ladeOpen, heeftRail]);

  // Schedules en wachtrij: dezelfde afleiding die ActivityPlansPanel doet, maar
  // de kaarten en de lade hebben ze ook nodig, dus hier één keer.
  const plans = useMemo(() => schedulePlans(activity.snapshot?.schedules ?? [], now), [activity.snapshot, now]);
  const queues = useMemo(() => queuesByAgent(activity.snapshot?.openTasks ?? []), [activity.snapshot]);
  const episodesPerAgent = useMemo(() => {
    const uit: Partial<Record<AxeAgentId, number>> = {};
    for (const [naam, h] of Object.entries(loopHealthByAgent)) {
      const agent = AXE_AGENTS.find(a => a.id === naam || a.name.toLowerCase() === naam.toLowerCase());
      if (agent && h.opened > 0) uit[agent.id] = h.opened;
    }
    return uit;
  }, [loopHealthByAgent]);

  const kiesAgent = (id: AxeAgentId) => {
    setGekozenCrew(null);
    setGekozenAgent(prev => (prev === id ? null : id));
    setLadeTab('nu');
  };
  const kiesCrew = (id: string) => {
    setGekozenAgent(null);
    setGekozenCrew(prev => (prev === id ? null : id));
  };
  const sluitLade = () => { setGekozenAgent(null); setGekozenCrew(null); };
  const gekozenAgentObj = gekozenAgent ? AXE_AGENTS.find(a => a.id === gekozenAgent) ?? null : null;
  const gekozenCrewObj = gekozenCrew ? agentsByKind('crew').find(c => c.id === gekozenCrew) ?? null : null;

  const detail = gekozenAgentObj ? (
    <AgentDetail
      agent={gekozenAgentObj}
      pulse={pulses[gekozenAgentObj.id]}
      items={activity.items}
      plans={plans}
      queues={queues}
      counts={activity.counts}
      loopHealth={loopHealthByAgent}
      now={now}
      tab={ladeTab}
      onTab={setLadeTab}
      sluit={sluitLade}
    />
  ) : gekozenCrewObj ? (
    <CrewDetail
      naam={gekozenCrewObj.name}
      rol={gekozenCrewObj.description}
      namespace={gekozenCrewObj.namespace}
      sluit={sluitLade}
    />
  ) : null;

  const chooseFilter = (f: AgentFilter) => {
    setFilter(f);
    // Wie je op de tijdlijn volgt, wil je ook in het geheugen zien.
    if (f !== 'all') setMemoryId(f);
  };

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
        const remote = ((data as CoreAgent[]) || []).filter(a => !NON_AGENT_ROW_NAMES.has(a.name));
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

  /* "Follow agent" zet de tijdlijn op die agent EN zet de weergave op
     Activity. Hiervoor scrolde dit naar een anker verderop de pagina; die
     ankers zijn weg nu je één weergave tegelijk ziet. */
  const volg = (f: AgentFilter) => { chooseFilter(f); setWeergave('activity'); };

  return (
    <>
    <TabRail kant="links">
      <SchuifBalk
        groepen={[
          {
            titel: 'View',
            items: WEERGAVEN.map((w) => ({
              id: w.id,
              label: w.label,
              actief: weergave === w.id,
              onKies: () => setWeergave(w.id),
            })),
          },
          {
            titel: 'Follow agent',
            items: [
              { id: 'all', label: 'All agents', actief: filter === 'all', onKies: () => volg('all') },
              ...AXE_AGENTS.map((a) => ({
                id: a.id,
                label: a.name,
                icoon: <span className="inline-block h-2 w-2 rounded-full" style={{ background: pulses[a.id]?.working ? a.accent : 'var(--text-muted)' }} />,
                actief: filter === a.id,
                onKies: () => volg(a.id),
              })),
            ],
          },
          {
            titel: 'Actions',
            items: [{ id: 'add', label: 'Add agent', icoon: <Plus size={13} />, onKies: addCustomAgent }],
          },
        ]}
      />
    </TabRail>
    {/* axe-tabruimte en geen eigen achtergrond: UI-MAATSTAF regel 1 en 2 --
        de pagina ligt op de plaat en deelt de breedte van het browservak. */}
    <motion.div
      className="axe-tabruimte h-full overflow-y-auto pt-4 pb-6 sm:pt-5"
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] }}
    >
      <PageHeader
        eyebrow="Workforce"
        title="Agents"
        description={loading
          ? 'Loading agents…'
          : 'AXE and the thirteen he delegates to, in the three tiers. Pick a view; click an agent for only his.'}
      />
      <div className="flex flex-wrap items-center gap-2 mt-3 mb-4">
        <StatPill label="Working" value={String(aantalWerkend(pulses))} tone="success" />
        <StatPill label="Agents" value={String(AXE_AGENTS.length)} tone="neutral" />
        <StatPill label="Source" value={usingFallback ? 'defaults (no db)' : 'core_agents'} tone="neutral" />
        <LiveIndicator
          lastOkAt={activity.lastOkAt}
          errors={activity.snapshot?.errors ?? []}
          loading={activity.loading}
          now={now}
        />
        <button
          type="button"
          onClick={addCustomAgent}
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-medium"
          style={{ background: 'var(--tint-line)', border: '1px solid var(--tint-line)', color: 'var(--accent-cyan)' }}
        >
          <Plus size={13} /> Add agent
        </button>
      </div>

      {/* Dezelfde tegels als de balk boven de plaat (PlaatViewSwitch): dat is de
          vorm die deze app al heeft voor "kies er één uit een rij". */}
      <div className="axe-viewctl axe-viewctl--inline mb-4" role="tablist" aria-label="Agents view">
        {WEERGAVEN.map((w) => (
          <button
            key={w.id}
            role="tab"
            aria-selected={weergave === w.id}
            className="axe-viewknop"
            data-aan={weergave === w.id ? 'ja' : undefined}
            onClick={() => setWeergave(w.id)}
          >
            <span>{w.label}</span>
          </button>
        ))}
      </div>

      {/* Ruimte maken voor de lade in plaats van eronder doorlopen.
          Gemeten op 1512px: de lade staat op 1153..1451 terwijl de tabruimte
          tot 1225 loopt -- 112px overlap, precies over de tier-3-kolom.

          Gemeten en niet geraden, want beide randen bewegen: het paneel hangt
          aan de vensterrand, de tabruimte is gecentreerd met een maximum. Een
          vaste 340px reserveren kostte de derde kolom (er bleef 598px over,
          genoeg voor twee) terwijl er maar 112 nodig was. En drie tiers naast
          elkaar is het hele punt van deze indeling. */}
      <div
        ref={ruimteRef}
        style={{
          transition: 'padding-right .2s ease',
          paddingRight: ladeOpen && heeftRail ? ladeOverlap : undefined,
        }}
      >
      {!heeftRail && detail && <div className="mb-4">{detail}</div>}
      {weergave === 'roster' && (
        <TierRooster
          pulses={pulses}
          plans={plans}
          queues={queues}
          counts={activity.counts}
          episodes={episodesPerAgent}
          now={now}
          gekozen={gekozenAgent}
          gekozenCrew={gekozenCrew}
          onKies={kiesAgent}
          onKiesCrew={kiesCrew}
        />
      )}

      {weergave === 'activity' && (
      <ActivityPlansPanel
        snapshot={activity.snapshot}
        items={activity.items}
        filter={filter}
        onFilter={chooseFilter}
        now={now}
        loading={activity.loading}
        live={
          <LiveIndicator
            lastOkAt={activity.lastOkAt}
            errors={activity.snapshot?.errors ?? []}
            loading={activity.loading}
            now={now}
          />
        }
      />
      )}

      {weergave === 'memory' && (
        <AgentMemoryPanel
          selectedId={memoryId}
          onSelect={setMemoryId}
          counts={activity.counts}
          loopHealth={loopHealthByAgent}
          stamp={activity.stamp}
          now={now}
        />
      )}

      {weergave === 'settings' && (
      <>
      <h2 className="text-small font-semibold tracking-wide mb-3" style={{ color: 'var(--text-primary)', letterSpacing: '0.08em' }}>
        FULL ROSTER &amp; SETTINGS
        <span className="ml-2 font-mono text-[10.5px] font-normal tracking-normal" style={{ color: 'var(--text-muted)' }}>
          {agents.length} rows{usingFallback ? ' · defaults' : ' · core_agents'}
        </span>
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
              className="axe-kaart overflow-hidden flex flex-col transition-all"
              style={{
                outline: highlightedId === agent.id ? '1px solid var(--tint-line)' : undefined,
                outlineOffset: -1,
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

      {/* De crew stond hier als tweede raster onder de roster. Hij staat nu in
          de Roster-weergave, onder de drie kolommen, waar ook meteen te zien is
          dat hij onder Wingman hangt en geen vierde tier is. Klikken opent zijn
          persona in dezelfde lade als de andere agents. */}
      </>
      )}
      </div>
    </motion.div>

    {/* Eén agent, in de rechterlade -- UI-MAATSTAF regel 5. `vast` houdt hem
        open zolang er een keuze staat; zonder dat zou de lade dichtvallen
        zodra je muis van de rand af is en lijkt klikken niets te doen. Op de
        telefoon adopteert ladeSloten dezelfde inhoud in de rechterlade van de
        plaat, dus dit werkt op alle drie de schermen zonder tweede versie. */}
    {heeftRail && (
      <TabRail kant="rechts" vast={!!detail}>{detail}</TabRail>
    )}
    </>
  );
}
