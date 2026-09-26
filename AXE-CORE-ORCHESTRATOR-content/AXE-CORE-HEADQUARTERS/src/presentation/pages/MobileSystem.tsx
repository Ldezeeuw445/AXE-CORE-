/**
 * Canonical phone Home for AXE CORE.
 *
 * Desktop/Tauri keeps its own Home layout. This route owns the phone layout:
 * three Tauri world controls, six real AXE agents around the Core, one chat
 * timeline and the real AXE composer fixed at the bottom.
 */
import { BrainCircuit, Mountain, Network } from 'lucide-react';
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
import { useVoiceStore } from '@/presentation/store/voiceStore';

const LEFT: readonly AxeAgentId[] = ['trading', 'developer', 'thinktank'];
// These are actual roster agents — no fake Analyst/Creative/Operator cards.
const RIGHT: readonly AxeAgentId[] = ['northsea', 'wingman', 'companion'];

const WORLDS: ReadonlyArray<{
  id: Exclude<CoreView, 'axe'>;
  label: string;
  icon: typeof BrainCircuit;
}> = [
  { id: 'neural', label: 'Neural', icon: BrainCircuit },
  { id: 'terrain', label: 'Terrain', icon: Mountain },
  { id: 'runtime', label: 'Architecture', icon: Network },
];

function MobileWorldBar() {
  const coreView = useCoreViewStore(s => s.coreView);
  const setCoreView = useCoreViewStore(s => s.setCoreView);

  return (
    <div
      className="mx-auto flex h-10 w-[min(76vw,320px)] items-center justify-center gap-1 rounded-[14px] px-1.5"
      style={{
        background: 'rgba(7,10,15,.70)',
        border: '1px solid rgba(255,255,255,.10)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,.05), 0 10px 24px rgba(0,0,0,.22)',
        backdropFilter: 'blur(18px)',
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
            className="flex h-7 flex-1 items-center justify-center gap-1 rounded-[9px] px-2 text-[10px] font-medium transition-transform active:scale-95"
            style={{
              color: active ? 'var(--accent-cyan)' : 'var(--text-secondary)',
              background: active ? 'rgba(34,211,238,.09)' : 'rgba(255,255,255,.025)',
              border: active ? '1px solid rgba(34,211,238,.24)' : '1px solid transparent',
            }}
          >
            <Icon size={12} />
            <span>{label}</span>
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

  return (
    <button
      type="button"
      className="flex min-h-0 w-full flex-col items-center justify-center rounded-[14px] px-1.5 py-1.5 text-center active:scale-[.98]"
      style={{
        background: 'rgba(7,9,13,.82)',
        border: `1px solid ${agent.accent}35`,
        boxShadow: `0 8px 18px rgba(0,0,0,.28), inset 0 1px 0 rgba(255,255,255,.035), 0 0 18px ${agent.accent}10`,
        backdropFilter: 'blur(14px)',
      }}
      title={detail}
      aria-label={`${agent.name}: ${state}`}
    >
      <ManagerAvatar agent={agent} size={30} />
      <span
        className="mt-0.5 max-w-full truncate text-[9px] font-semibold uppercase tracking-[0.04em]"
        style={{ color: 'var(--text-primary)' }}
      >
        {agent.kort ?? agent.name}
      </span>
      <span className="mt-0.5 flex items-center gap-1 text-[8px]" style={{ color: 'var(--text-muted)' }}>
        <span
          className="size-1.5 rounded-full"
          style={{
            background: job ? agent.accent : 'rgba(255,255,255,.28)',
            boxShadow: job ? `0 0 8px ${agent.accent}` : 'none',
          }}
        />
        {state}
      </span>
    </button>
  );
}

function CoreHome() {
  const voiceStatus = useVoiceStore(s => s.voiceStatus);
  const stateLabel =
    voiceStatus === 'listening' ? 'LISTENING'
      : voiceStatus === 'processing' ? 'THINKING'
        : voiceStatus === 'speaking' ? 'SPEAKING'
          : 'READY';

  return (
    <>
      <section
        className="grid flex-none grid-cols-[76px_minmax(0,1fr)_76px] gap-2"
        style={{ height: 'clamp(220px, 31dvh, 286px)' }}
        aria-label="AXE Core en agents"
      >
        <div className="grid min-h-0 grid-rows-3 gap-2 py-1">
          {LEFT.map(id => <AgentTile key={id} id={id} />)}
        </div>

        <button
          type="button"
          onClick={() => useCoreViewStore.getState().setCoreView('axe')}
          className="relative min-h-0 overflow-hidden rounded-[22px]"
          aria-label="AXE Core Home"
        >
          <div className="absolute inset-x-0 top-0 bottom-8">
            <AxeCoreSphere />
          </div>
          <div className="absolute inset-x-0 bottom-0 flex flex-col items-center">
            <span className="text-[14px] font-medium tracking-[0.16em]" style={{ color: 'var(--text-primary)' }}>
              AXE CORE
            </span>
            <span className="mt-0.5 flex items-center gap-1.5 text-[9px] tracking-[0.12em]" style={{ color: 'var(--text-secondary)' }}>
              <span
                className="size-2 rounded-full"
                style={{ background: '#34d399', boxShadow: '0 0 10px #34d399' }}
              />
              {stateLabel}
            </span>
          </div>
        </button>

        <div className="grid min-h-0 grid-rows-3 gap-2 py-1">
          {RIGHT.map(id => <AgentTile key={id} id={id} />)}
        </div>
      </section>

      <div
        className="my-1.5 flex min-h-0 flex-1 flex-col overflow-hidden rounded-[20px]"
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
  return (
    <div
      className="my-2 min-h-0 flex-1 overflow-hidden rounded-[20px]"
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
      className="relative z-[1] mx-auto flex h-full min-h-0 w-full max-w-md flex-col overflow-hidden px-3"
      style={{
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 10px)',
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 6px)',
      }}
    >
      {/* AppShell owns the hamburger + light/dark buttons. Keeping them there
          prevents the duplicate controls/composers that caused the two
          different mobile renders. */}
      <div className="mb-2 flex-none px-12">
        <MobileWorldBar />
      </div>

      {coreView === 'axe'
        ? <CoreHome />
        : <WorldSurface view={coreView} />}

      <div className="flex-none pt-1">
        <MobileComposer />
      </div>
    </div>
  );
}
