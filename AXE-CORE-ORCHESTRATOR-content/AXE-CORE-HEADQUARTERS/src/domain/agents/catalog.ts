/**
 * catalog.ts — the one place that enumerates every agent in the force, and the
 * memory namespace each one learns in.
 *
 * This is Stage 1 of turning a scattered set of agents into one working force:
 * a single source of truth built FROM the pieces that already exist (the six
 * top-level agents in roster.ts and the nine CrewAI specialists in
 * catalogs/specialists.ts) rather than a fourth hand-kept list. The War Room,
 * the Agents tab, the learning loop and EVE all read from here, so an agent is
 * defined once and shows up everywhere the same.
 *
 * `namespace` is the key that ties an agent to the memory it already has: the
 * `memory` table + `rag_memories` embeddings. By design an agent reads its own
 * namespace PLUS `global`, so every agent shares one global memory layer while
 * keeping its own. Stage 2 wires the learning loop to these namespaces; Stage 3
 * fills them. Reuse an existing namespace (axe_trader, axe_intel, …) where one
 * already holds an agent's memory; give a fresh `axe_*`/`crew_*` one otherwise.
 */
import { AXE_AGENTS } from './roster';
import { SPECIALISTS } from '@/domain/catalogs/specialists';

export type AgentKind = 'core' | 'crew' | 'app';

export interface AgentEntry {
  id: string;
  name: string;
  kind: AgentKind;
  /** Memory namespace (memory table + rag_memories). Read together with `global`. '' = an app, no agent memory. */
  namespace: string;
  /** Does this agent make real decisions before/for Luka (near-autonomous)? */
  canDecide: boolean;
  description: string;
}

/**
 * Where each top-level agent keeps its memory. Only entries that must reuse
 * an ALREADY-established namespace go here (axe's shared global layer, and
 * trading/developer whose namespaces predate this catalog and already hold
 * learning-loop history). Every other agent falls through to the `axe_<id>`
 * default below — that already matches the namespaces the leerlus-doc
 * lists (axe_northsea, axe_finance, axe_wingman, axe_intel, axe_companion),
 * so a fresh tier-2/tier-3 agent (browser, memory, task, cron, thinktank)
 * gets a consistent namespace for free.
 */
const CORE_NAMESPACE: Record<string, string> = {
  axe: 'global',           // the orchestrator lives in the shared global layer
  trading: 'axe_trader',   // existing namespace (see the learning-loop chain)
  developer: 'axe_code',   // existing namespace (was 'code' before the tier rewrite)
};

const coreEntries: AgentEntry[] = AXE_AGENTS.map((a) => ({
  id: a.id,
  name: a.name,
  kind: 'core' as const,
  namespace: CORE_NAMESPACE[a.id] ?? `axe_${a.id}`,
  canDecide: a.canDecide,
  description: a.handles,
}));

// The Wingman's CrewAI team. The 'axe_core' specialist is skipped — it IS AXE,
// already represented as the core orchestrator above.
const crewEntries: AgentEntry[] = SPECIALISTS.filter((s) => s.id !== 'axe_core').map((s) => ({
  id: s.id,
  name: s.name,
  kind: 'crew' as const,
  namespace: `crew_${s.id}`,
  canDecide: false,
  description: `${s.role} — ${s.focus}`,
}));

// Not agents: an application AXE acts inside, a model, and a persona
// framework. Kept in the catalog so the Agents tab can show them correctly
// labelled instead of pretending they're agents — see roster.ts's "Not
// agents" note (CONFIRMED ARCHITECTURE, 17 Sep 2026).
const appEntries: AgentEntry[] = [
  {
    id: 'trading-os',
    name: 'Trading OS',
    kind: 'app',
    namespace: '',
    canDecide: false,
    description: 'The trading application (not an agent). The Trading agent (AXE Algo) acts inside it.',
  },
  {
    id: 'ollama',
    name: 'Ollama',
    kind: 'app',
    namespace: '',
    canDecide: false,
    description: 'A local/VPS model, not an agent. Agents may run on it; it never appears as a row of its own.',
  },
  {
    id: 'eve',
    name: 'EVE',
    kind: 'app',
    namespace: '',
    canDecide: false,
    description: 'A persona framework (system-prompt supplements per slot), not an agent — see eveSkills.ts.',
  },
];

export const AGENT_CATALOG: readonly AgentEntry[] = [...coreEntries, ...crewEntries, ...appEntries];

/** The memory namespace an agent learns in ('global' for anything unknown). */
export function namespaceFor(id: string): string {
  return AGENT_CATALOG.find((a) => a.id === id)?.namespace || 'global';
}

export function agentsByKind(kind: AgentKind): AgentEntry[] {
  return AGENT_CATALOG.filter((a) => a.kind === kind);
}
