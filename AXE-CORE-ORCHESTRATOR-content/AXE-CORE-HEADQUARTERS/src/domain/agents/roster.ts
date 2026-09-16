/**
 * roster.ts — the six agents AXE actually runs, and how AXE decides who does what.
 *
 * The app grew three overlapping "agent" lists (AGENT_SEEDS, DEFAULT_AGENTS,
 * SPECIALISTS) with no clear answer to "who is in charge and who does what".
 * That is the mess. This is the one honest answer: AXE is the orchestrator, and
 * it delegates to five domain agents. No race — each has one job, AXE runs the
 * show, and every hand-off is visible (that is what the War Room shows).
 *
 * This roster is the DELEGATION layer (the six). It sits above the nine CrewAI
 * specialists in catalogs/specialists.ts, which are the free-model crews the
 * Wingman drives — AXE delegates to the Wingman, the Wingman runs the crews.
 */

export type AxeAgentId = 'axe' | 'trading' | 'northsea' | 'code' | 'finance' | 'wingman';

export interface AxeAgent {
  id: AxeAgentId;
  name: string;
  role: string;
  /** One line: what work this agent owns. */
  handles: string;
  /** Can this agent make real decisions before/for Luka (near-autonomous)? */
  canDecide: boolean;
  /** Human label for the engine/runtime it uses. */
  runtime: string;
  /** App route to open this agent's surface from the War Room. */
  route: string;
  /** War Room accent colour. */
  accent: string;
}

/**
 * The six. Order is deliberate: AXE first (it runs the show), then the domain
 * agents. Keep this list to six — new capability belongs inside one of these
 * agents, not as a seventh box, or the mess comes back.
 */
export const AXE_AGENTS: readonly AxeAgent[] = [
  {
    id: 'axe',
    name: 'AXE Core',
    role: 'Orchestrator',
    handles: 'Talks to you, answers directly on your chosen engine, and delegates the rest.',
    canDecide: true,
    runtime: 'your ★ Primary engine',
    route: '',
    accent: '#22D3EE',
  },
  {
    id: 'trading',
    name: 'Trading',
    role: 'Trading desk · AXE Algo',
    handles: 'Market analysis, positions, risk and the final trade decision.',
    canDecide: true,
    runtime: 'AXE Algo stack',
    route: 'trading',
    accent: '#F59E0B',
  },
  {
    id: 'northsea',
    name: 'NorthSea Desk',
    role: 'Commodity desk manager',
    handles: 'Runs the NorthSea crews and moves deals — decides before you where it safely can.',
    canDecide: true,
    runtime: 'NorthSea MCP + crews',
    route: 'maps-3d',
    accent: '#EC4899',
  },
  {
    id: 'code',
    name: 'Code',
    role: 'Code editor',
    handles: 'Reads and writes the codebase, builds and ships. Simple work local, hard work escalates.',
    canDecide: false,
    runtime: 'OpenHands/Qwen ↔ Cursor/Claude',
    route: 'code-editor',
    accent: '#34D399',
  },
  {
    id: 'finance',
    name: 'Finance & Subscriptions',
    role: 'Money + credits manager',
    handles: 'Finance/P&L and every subscription: watches credits and routes to the cheapest capable engine.',
    canDecide: false,
    runtime: 'cheapest capable engine',
    route: 'finance',
    accent: '#A78BFA',
  },
  {
    id: 'wingman',
    name: 'Wingman',
    role: "AXE's right hand",
    handles: 'Runs the free CrewAI crews on AXE\'s behalf, drives app-launch marketing, and helps anywhere.',
    canDecide: false,
    runtime: 'VPS · Ollama crews',
    route: 'crewai',
    accent: '#38BDF8',
  },
] as const;

const BY_ID: Record<AxeAgentId, AxeAgent> = Object.fromEntries(
  AXE_AGENTS.map((a) => [a.id, a]),
) as Record<AxeAgentId, AxeAgent>;

export function agentById(id: AxeAgentId): AxeAgent {
  return BY_ID[id] ?? BY_ID.axe;
}

/**
 * Domain signals that mark a message as one agent's work. These are hints, not
 * a race: AXE is always the default, and a signal only lights up a domain agent
 * when the intent is clear. Kept conservative on purpose — a false hand-off is
 * worse than AXE answering and offering to delegate.
 */
const DOMAIN_SIGNALS: { id: Exclude<AxeAgentId, 'axe'>; re: RegExp }[] = [
  { id: 'trading', re: /\b(trade|trading|position|portfolio|p&l|pnl|mt5|algo|ticker|long|short|stop[- ]?loss|market order|buy|sell|candle|risk)\b/i },
  { id: 'northsea', re: /\b(northsea|north sea|deal|buyer|supplier|commodity|rfq|cargo|shipment|procurement|offer|counterparty|rice|copper|aluminium|aluminum)\b/i },
  { id: 'finance', re: /\b(subscription|subscriptions|credits|usage|budget|spend|invoice|billing|quota|out of credits|api cost|monthly cost|finance|cash ?flow)\b/i },
  { id: 'wingman', re: /\b(crew|crews|crewai|marketing|campaign|launch|press release|brainstorm team|content plan|social post)\b/i },
  { id: 'code', re: /\b(code|bug|refactor|component|typescript|javascript|python|react|deploy|build|repo|commit|endpoint|sql|script|function)\b/i },
];

export interface Delegation {
  agent: AxeAgentId;
  /** Short reason, e.g. "trading terms" or "you're on AXE" — shown in the War Room. */
  reason: string;
}

/**
 * Which of the six is handling this turn. `capability` comes from the chat
 * router ('code' etc.); `text` is the user's message. Default is AXE itself —
 * a domain agent only wins on a clear, single domain signal.
 */
export function delegateFor(capability: string, text: string): Delegation {
  if (capability === 'code') return { agent: 'code', reason: 'code task' };

  const hits = DOMAIN_SIGNALS.filter((s) => s.re.test(text));
  // Exactly one domain in play → delegate to it. Zero or several → AXE keeps it
  // (ambiguous work is AXE's to hold and split, not to mis-route).
  if (hits.length === 1) return { agent: hits[0].id, reason: `${hits[0].id} signal` };

  return { agent: 'axe', reason: 'AXE handled it' };
}
