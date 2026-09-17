/**
 * roster.ts — every agent AXE actually runs, in the tiers Luka confirmed on
 * 17 Sep 2026 (docs/HANDOFF_AXE_AGENT_FORCE.md, "CONFIRMED ARCHITECTURE").
 *
 * The app grew three overlapping "agent" lists (AGENT_SEEDS, DEFAULT_AGENTS,
 * SPECIALISTS) with no clear answer to "who is in charge and who does what".
 * That is the mess. This is the one honest answer: AXE is the orchestrator,
 * on top of three tiers, each with its own rule for which engine it may run
 * on. No race within a tier that decides — each has one job, AXE runs the
 * show, and every hand-off is visible (that is what the War Room shows).
 *
 * **The three tiers, and what a tier controls in Settings' "Motoren per
 * agent" panel (the single source of truth for engine choice):**
 * - `tier1` — the manager team. Dropdown = ONLY subscriptions (the six CLIs:
 *   claude/claude2/claude3/codex/codex2/cursor). They run the crews and make
 *   real decisions.
 * - `tier2` — Agents-tab workers. Auto-route by default (a "race" between
 *   capable engines is fine here); an optional pin overrides it.
 * - `tier3` — cross-app assistants that live in Companion/Intel, driven
 *   through AXE CORE. Dropdown = ONLY paid API keys (OpenAI, Anthropic).
 * AXE itself sits above all three: dropdown = ONLY fast/smart chat models
 * (Gemini, Grok, OpenRouter, ...) — never a subscription, never Ollama.
 *
 * This roster is the DELEGATION layer. It sits above the nine CrewAI
 * specialists in catalogs/specialists.ts, which are the free-model crews the
 * Wingman drives — AXE delegates to the Wingman, the Wingman runs the crews.
 *
 * Not agents (kept out of this list on purpose, see catalog.ts's app/model/
 * framework entries): Trading OS (an app the Trading agent acts inside),
 * Ollama (a model), EVE (a persona framework), CrewAI Manager (redundant —
 * Wingman/NorthSea Desk Manager/Trading already run the crews they need).
 */

export type AxeAgentId =
  | 'axe'
  // tier 1 — managers (subscription-only dropdown)
  | 'wingman' | 'northsea' | 'trading' | 'developer' | 'thinktank'
  // tier 2 — workers (auto-route, optional pin)
  | 'browser' | 'memory' | 'task' | 'cron' | 'finance'
  // tier 3 — cross-app assistants (paid-API-only dropdown)
  | 'intel' | 'companion';

export type AgentTier = 'axe' | 'tier1' | 'tier2' | 'tier3';

/** What kind of engine picker this agent's row gets in Settings. */
export type DropdownScope =
  | 'fast-smart'   // AXE: fast/smart chat models only — never a subscription, never Ollama
  | 'subscription' // tier1: one of the six subscription CLIs, or API keys
  | 'auto-route'   // tier2: capable engines race by default; optional pin
  | 'paid-api';    // tier3: OpenAI/Anthropic paid keys only

export interface AxeAgent {
  id: AxeAgentId;
  name: string;
  role: string;
  /** One line: what work this agent owns. */
  handles: string;
  tier: AgentTier;
  /** Can this agent make real decisions before/for Luka (near-autonomous)? */
  canDecide: boolean;
  /** Which engine pool this agent's Settings row may pick from. */
  dropdownScope: DropdownScope;
  /** Human label for the engine/runtime it uses. */
  runtime: string;
  /** App route to open this agent's surface from the War Room ('' = no in-app tab). */
  route: string;
  /** War Room accent colour. */
  accent: string;
}

/**
 * AXE plus the twelve. Order is deliberate: AXE first (it runs the show),
 * then tier 1, tier 2, tier 3. Keep new capability inside one of these, or
 * make the case for a new row here explicitly — a thirteenth ad-hoc agent
 * outside this list is how the old mess started.
 */
export const AXE_AGENTS: readonly AxeAgent[] = [
  {
    id: 'axe',
    name: 'AXE Core',
    role: 'Orchestrator',
    handles: 'Talks to you, understands intent, answers directly, or hands off to a manager.',
    tier: 'axe',
    canDecide: true,
    dropdownScope: 'fast-smart',
    runtime: 'your ★ Primary engine',
    route: '',
    accent: '#22D3EE',
  },

  // ── Tier 1 — manager team (subscription-only dropdown) ──────────────────
  {
    id: 'wingman',
    name: 'Wingman',
    role: "AXE's right hand · manager",
    handles: 'Runs the free CrewAI crew from the Crew tab on AXE\'s behalf, and helps anywhere.',
    tier: 'tier1',
    canDecide: false,
    dropdownScope: 'subscription',
    runtime: 'subscription CLI · VPS crews',
    route: 'crewai',
    accent: '#38BDF8',
  },
  {
    id: 'northsea',
    name: 'NorthSea Desk Manager',
    role: 'Commodity desk manager',
    handles: 'Runs the NorthSea crews and moves deals — decides before you where it safely can.',
    tier: 'tier1',
    canDecide: true,
    dropdownScope: 'subscription',
    runtime: 'subscription CLI · NorthSea MCP + crews',
    route: 'maps-3d',
    accent: '#EC4899',
  },
  {
    id: 'trading',
    name: 'Trading Agent',
    role: 'AXE Algo · trading desk',
    handles: 'Market analysis, positions, risk and the final trade decision; owns the trading research crew.',
    tier: 'tier1',
    canDecide: true,
    dropdownScope: 'subscription',
    runtime: 'subscription CLI · AXE Algo stack',
    route: 'trading',
    accent: '#F59E0B',
  },
  {
    id: 'developer',
    name: 'AXE Developer',
    role: 'Code manager',
    handles: 'Reads, writes, builds, ships and deploys the codebase. May hand simple/local work to the Code agent.',
    tier: 'tier1',
    canDecide: false,
    dropdownScope: 'subscription',
    runtime: 'subscription CLI ↔ OpenHands/Qwen for local work',
    route: 'code-editor',
    accent: '#34D399',
  },
  {
    id: 'thinktank',
    name: 'ThinkTank',
    role: 'Ideas manager',
    handles: 'Runs the ThinkTank tab: score/rank ideas → build plan → Build → library → integrate plan → Integrate into the app.',
    tier: 'tier1',
    canDecide: false,
    dropdownScope: 'subscription',
    runtime: 'subscription CLI',
    route: 'thinkthanks',
    accent: '#A78BFA',
  },

  // ── Tier 2 — Agents-tab workers (auto-route, optional pin) ──────────────
  {
    id: 'browser',
    name: 'Browser',
    role: 'Web agent',
    handles: 'Autonomous browser control — navigate, extract, and summarise pages.',
    tier: 'tier2',
    canDecide: false,
    dropdownScope: 'auto-route',
    runtime: 'auto-routed engine',
    route: 'browser',
    accent: '#FDBA74',
  },
  {
    id: 'memory',
    name: 'Memory',
    role: 'Memory manager',
    handles: 'Builds and maintains the durable memory itself — consolidation, decay, the Obsidian vault.',
    tier: 'tier2',
    canDecide: false,
    dropdownScope: 'auto-route',
    runtime: 'auto-routed engine',
    route: 'memory',
    accent: '#22D3EE',
  },
  {
    id: 'task',
    name: 'Task',
    role: 'Task manager',
    handles: 'Picks up tasks from the Tasks tab and tracks them through to close.',
    tier: 'tier2',
    canDecide: false,
    dropdownScope: 'auto-route',
    runtime: 'auto-routed engine',
    route: 'tasks',
    accent: '#4ADE80',
  },
  {
    id: 'cron',
    name: 'Cron Manager',
    role: 'Scheduler',
    handles: 'Self-hosted scheduler: runs due schedules (prompt/exec/webhook/crew/flow) with nobody watching.',
    tier: 'tier2',
    canDecide: false,
    dropdownScope: 'auto-route',
    runtime: 'auto-routed engine',
    route: 'cron-manager',
    accent: '#EAB308',
  },
  {
    id: 'finance',
    name: 'Finance',
    role: 'Money + credits manager',
    handles: 'Finance/P&L and every subscription: watches credits and routes to the cheapest capable engine.',
    tier: 'tier2',
    canDecide: false,
    dropdownScope: 'auto-route',
    runtime: 'cheapest capable engine',
    route: 'finance',
    accent: '#FBBF24',
  },

  // ── Tier 3 — cross-app assistants (paid-API-only dropdown) ──────────────
  {
    id: 'intel',
    name: 'AXE Intel',
    role: 'Cross-app assistant',
    handles: 'Market intelligence and signal detection, live in Trading OS, driven through AXE CORE.',
    tier: 'tier3',
    canDecide: false,
    dropdownScope: 'paid-api',
    runtime: 'paid API key (OpenAI/Anthropic)',
    route: 'organization',
    accent: '#3B82F6',
  },
  {
    id: 'companion',
    name: 'AXE Companion',
    role: 'Cross-app assistant',
    handles: 'Lives in the other apps, driven through AXE CORE, used in the Trading tab.',
    tier: 'tier3',
    canDecide: false,
    dropdownScope: 'paid-api',
    runtime: 'paid API key (OpenAI/Anthropic)',
    route: 'organization',
    accent: '#60A5FA',
  },
] as const;

const BY_ID: Record<AxeAgentId, AxeAgent> = Object.fromEntries(
  AXE_AGENTS.map((a) => [a.id, a]),
) as Record<AxeAgentId, AxeAgent>;

export function agentById(id: AxeAgentId): AxeAgent {
  return BY_ID[id] ?? BY_ID.axe;
}

export function agentsByTier(tier: AgentTier): AxeAgent[] {
  return AXE_AGENTS.filter((a) => a.tier === tier);
}

/**
 * Domain signals that mark a message as one agent's work. These are hints,
 * not a race: AXE is always the default, and a signal only lights up a
 * domain agent when the intent is clear. Kept conservative on purpose — a
 * false hand-off is worse than AXE answering and offering to delegate.
 */
const DOMAIN_SIGNALS: { id: Exclude<AxeAgentId, 'axe'>; re: RegExp }[] = [
  { id: 'trading', re: /\b(trade|trading|position|portfolio|p&l|pnl|mt5|algo|ticker|long|short|stop[- ]?loss|market order|buy|sell|candle|risk)\b/i },
  { id: 'northsea', re: /\b(northsea|north sea|deal|buyer|supplier|commodity|rfq|cargo|shipment|procurement|offer|counterparty|rice|copper|aluminium|aluminum)\b/i },
  { id: 'finance', re: /\b(subscription|subscriptions|credits|usage|budget|spend|invoice|billing|quota|out of credits|api cost|monthly cost|finance|cash ?flow)\b/i },
  { id: 'wingman', re: /\b(crew|crews|crewai|marketing|campaign|launch|press release|brainstorm team|content plan|social post)\b/i },
  { id: 'developer', re: /\b(code|bug|refactor|component|typescript|javascript|python|react|deploy|build|repo|commit|endpoint|sql|script|function)\b/i },
  { id: 'thinktank', re: /\b(thinktank|think[- ]tank|idea score|score.*idea|growth engine|build blueprint|integrate plan)\b/i },
  { id: 'browser', re: /\b(browse|browsing|scrape|scraping|open (the )?url|navigate to|screenshot the (page|site|browser))\b/i },
  { id: 'memory', re: /\b(memory manager|memory agent|obsidian vault|rag memor(?:y|ies)|consolidate memory|memory decay)\b/i },
  { id: 'task', re: /\b(task list|to-?do|task manager|mission control|assign (a )?task|task queue)\b/i },
  { id: 'cron', re: /\b(cron\b|cron manager|crontab|scheduled job|schedule a (job|task)|recurring job)\b/i },
  { id: 'intel', re: /\b(axe intel|market intel|signal detection|intel table)\b/i },
  { id: 'companion', re: /\b(axe companion|companion app)\b/i },
];

export interface Delegation {
  agent: AxeAgentId;
  /** Short reason, e.g. "trading terms" or "you're on AXE" — shown in the War Room. */
  reason: string;
}

/**
 * Which of the twelve is handling this turn. `capability` comes from the
 * chat router ('code' etc.); `text` is the user's message. Default is AXE
 * itself — a domain agent only wins on a clear, single domain signal.
 */
export function delegateFor(capability: string, text: string): Delegation {
  if (capability === 'code') return { agent: 'developer', reason: 'code task' };

  const hits = DOMAIN_SIGNALS.filter((s) => s.re.test(text));
  // Exactly one domain in play → delegate to it. Zero or several → AXE keeps it
  // (ambiguous work is AXE's to hold and split, not to mis-route).
  if (hits.length === 1) return { agent: hits[0].id, reason: `${hits[0].id} signal` };

  return { agent: 'axe', reason: 'AXE handled it' };
}
