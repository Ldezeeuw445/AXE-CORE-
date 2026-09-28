/**
 * Canonical phone Home for AXE CORE.
 *
 * Desktop/Tauri keeps its own Home layout. This route owns the phone layout:
 * three Tauri world controls, six real AXE agents around the Core, one chat
 * timeline and the real AXE composer fixed at the bottom.
 */
import { BrainCircuit, Mountain, Network, Orbit } from 'lucide-react';
import { AxeCoreSphere } from '@/presentation/components/axe-core/sphere/AxeCoreSphere';
import NeuralBrain from '@/presentation/components/axe-core/NeuralBrain';
import { NeuralMemorySystem } from '@/presentation/components/axe-core/NeuralMemorySystem';
import { RuntimeWorkspace } from '@/presentation/components/axe-core/RuntimeCanvas';
import { ManagerAvatar } from '@/presentation/components/axe-core/ManagerAvatar';
import { MobileComposer } from '@/presentation/components/layout/MobileComposer';
import { MobileChat } from '@/presentation/components/layout/MobileChat';
import { AXE_AGENTS, agentById, type AxeAgent, type AxeAgentId } from '@/domain/agents/roster';
import { jobLoopt } from '@/domain/tierRouter/axeJobRegels';
import { managerVan, regelVan } from '@/domain/tierRouter/agentVenster';
import { useAxeJobStore } from '@/presentation/store/axeJobStore';
import { useCoreViewStore, type CoreView } from '@/presentation/store/coreViewStore';

const LEFT: readonly AxeAgentId[] = ['trading', 'developer', 'thinktank'];
// These are actual roster agents — no fake Analyst/Creative/Operator cards.
const RIGHT: readonly AxeAgentId[] = ['northsea', 'wingman', 'companion'];

const WORLDS: ReadonlyArray<{
  id: CoreView;
  label: string;
  icon: typeof BrainCircuit;
}> = [
  { id: 'axe', label: 'AXE Core sphere', icon: Orbit },
  { id: 'neural', label: 'Neural', icon: BrainCircuit },
  { id: 'terrain', label: 'Terrain', icon: Mountain },
  { id: 'runtime', label: 'Architecture', icon: Network },
];

function MobileWorldBar() {
  const coreView = useCoreViewStore(s => s.coreView);
  const setCoreView = useCoreViewStore(s => s.setCoreView);

  return (
    <div
      className="axe-mobile-worldbar mx-auto flex h-9 w-full items-center justify-center gap-1 rounded-[14px] px-1"
      style={{
        background: 'linear-gradient(180deg, rgba(20,20,24,.98), rgba(8,8,10,.99))',
        border: '1px solid rgba(255,255,255,.09)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,.05), 0 10px 24px rgba(0,0,0,.30)',
        maxWidth: 176,
      }}
      role="tablist"
      aria-label="AXE worlds"
    >
      {WORLDS.map(({ id, label, icon: Icon }) => {
        const active = coreView === id;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={active}
            title={label}
            onClick={() => setCoreView(active ? 'axe' : id)}
            className="flex size-9 flex-1 items-center justify-center rounded-[10px] transition-transform active:scale-95"
            style={{
              color: active ? 'var(--accent-cyan)' : 'var(--text-secondary)',
              background: active ? 'rgba(34,211,238,.09)' : 'rgba(255,255,255,.025)',
              border: active ? '1px solid rgba(34,211,238,.24)' : '1px solid transparent',
            }}
          >
            <Icon size={15} />
            <span className="sr-only">{label}</span>
          </button>
        );
      })}
    </div>
  );
}

function useAgentJob(agent: AxeAgent) {
  const jobs = useAxeJobStore(s => s.jobs);
  return [...jobs].reverse().find(job => {
    if (!jobLoopt(job.state)) return false;
    if (job.agent === agent.id) return true;
    return agent.tier === 'tier1' && managerVan(job.agent) === agent.id;
  }) ?? null;
}

function AgentTile({ id }: { id: AxeAgentId }) {
  const agent = agentById(id);
  const job = useAgentJob(agent);
  const state = job?.state === 'waiting'
    ? 'WAITING'
    : job
      ? 'WORKING'
      : 'IDLE';
  const detail = job ? regelVan(job) : agent.handles;
  const compactLabel = agent.id === 'companion' ? 'Companion' : (agent.kort ?? agent.name);

  return (
    <button
      type="button"
      className="flex min-h-0 w-full flex-col items-center justify-center overflow-hidden rounded-[11px] px-0.5 py-1 text-center active:scale-[.98]"
      style={{
        background: 'var(--axe-kaart-vlak)',
        border: '1px solid var(--axe-kaart-lijn)',
        borderTopColor: 'var(--axe-kaart-lijn-boven)',
        boxShadow: 'var(--axe-kaart-schaduw)',
      }}
      title={detail}
      aria-label={`${agent.name}: ${state}`}
    >
      <ManagerAvatar agent={agent} size={23} />
      <span
        className="mt-0.5 max-w-full truncate px-0.5 text-[7.5px] font-semibold uppercase tracking-[0.025em]"
        style={{ color: 'var(--text-primary)' }}
      >
        {compactLabel}
      </span>
    </button>
  );
}

function CoreHome() {
  return (
    <>
      <section
        className="axe-mobile-edge grid w-full flex-none gap-2"
        style={{
          height: 'clamp(188px, 26dvh, 238px)',
          gridTemplateColumns: 'clamp(52px, 15.2vw, 58px) minmax(0, 1fr) clamp(52px, 15.2vw, 58px)',
        }}
        aria-label="AXE Core en agents"
      >
        <div className="grid min-h-0 grid-rows-3 justify-items-start gap-2 py-1">
          {LEFT.map(id => <AgentTile key={id} id={id} />)}
        </div>

        <button
          type="button"
          onClick={() => useCoreViewStore.getState().setCoreView('axe')}
          className="relative min-h-0 overflow-hidden rounded-[22px]"
          aria-label="AXE Core Home"
        >
          <div className="absolute inset-x-0 top-0 bottom-8">
            <AxeCoreSphere telefoon />
          </div>
          {/* Eén regel: bolletje + AXE CORE, op de plek en in de maat waar
              READY stond. De grote AXE CORE-kop eronder is weg (Luka, 27 sep). */}
          <div className="absolute inset-x-0 bottom-0 flex flex-col items-center">
            <span className="flex items-center gap-1.5 text-[9px] tracking-[0.12em]" style={{ color: 'var(--text-secondary)' }}>
              <span
                className="size-2 rounded-full"
                style={{ background: '#34d399', boxShadow: '0 0 10px #34d399' }}
              />
              AXE CORE
            </span>
          </div>
        </button>

        <div className="grid min-h-0 grid-rows-3 justify-items-end gap-2 py-1">
          {RIGHT.map(id => <AgentTile key={id} id={id} />)}
        </div>
      </section>

      <div
        className="axe-mobile-edge my-1.5 flex w-full min-h-0 flex-1 flex-col overflow-hidden rounded-[20px]"
        style={{
          background: 'rgba(5,8,13,.30)',
          border: '1px solid rgba(255,255,255,.045)',
          backdropFilter: 'blur(8px)',
        }}
      >
        <MobileChat />
      </div>
    </>
  );
}

function WorldSurface({ view }: { view: Exclude<CoreView, 'axe'> }) {
  // `relative isolate` is geen opmaak maar de rand van het vak. Terrain
  // (.axe-neural-embed) staat absolute; zonder positionering hier rekte hij
  // zich uit tot de hele .axe-mobile-home en lag zijn canvas over de
  // wereldknoppen. Na één keer Terrain kwam elke tik op dat canvas terecht en
  // kon je niet meer terug (Luka, 28 sep; nagebootst: 13..787 over de balk).
  return (
    <div
      className="relative isolate my-2 min-h-0 flex-1 overflow-hidden rounded-[20px]"
      style={{ border: '1px solid rgba(255,255,255,.07)', background: 'rgba(0,0,0,.18)' }}
    >
      {view === 'neural' && <NeuralBrain />}
      {view === 'terrain' && <NeuralMemorySystem />}
      {view === 'runtime' && <RuntimeWorkspace />}
    </div>
  );
}

export default function MobileSystem() {
  const coreView = useCoreViewStore(s => s.coreView);

  // Keep this explicit so a roster edit cannot silently turn the six phone
  // tiles into made-up placeholders.
  const missing = [...LEFT, ...RIGHT].filter(id => !AXE_AGENTS.some(a => a.id === id));
  if (missing.length) {
    console.warn('[AXE mobile] missing roster agents:', missing);
  }

  return (
    <div
      className="axe-mobile-home relative z-[1] mx-auto flex h-full min-h-0 w-full max-w-md flex-col overflow-hidden pb-[2px]"
      style={{
        paddingTop: 0,
        paddingBottom: 0,
        touchAction: 'manipulation',
      }}
    >
      {/* AppShell owns the hamburger + light/dark buttons. Keeping them there
          prevents the duplicate controls/composers that caused the two
          different mobile renders. */}
      {/* Boven elke wereld: de weg terug mag nooit onder een canvas liggen. */}
      <div
        className="relative z-[5] mb-2 grid w-full flex-none items-center"
        style={{ gridTemplateColumns: '58px minmax(0, 1fr) 58px' }}
      >
        <span aria-hidden="true" />
        <MobileWorldBar />
        <span aria-hidden="true" />
      </div>

      {coreView === 'axe'
        ? <CoreHome />
        : <WorldSurface view={coreView} />}

      <div className="axe-mobile-edge mt-auto w-full flex-none">
        <MobileComposer />
      </div>
    </div>
  );
}
