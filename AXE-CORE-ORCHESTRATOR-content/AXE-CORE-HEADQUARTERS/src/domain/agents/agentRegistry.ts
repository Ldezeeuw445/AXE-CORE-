/**
 * agentRegistry — the seed list for `public.agents`, and the single place
 * that says which agents AXE Core actually has.
 *
 * Before this, "agents" meant AGENTS_CFG in Memory.tsx: ~27 names, icons and
 * colours with no distinction between "this runs real code" and "this is an
 * idea for later". A memory tagged `agent:kimiwork` was as legitimate as one
 * tagged `agent:code_agent`, so per-agent memory could never mean anything —
 * there was no way to tell a working agent from a wish.
 *
 * This list is honest about that split. `status: 'active'` means real code
 * exists and is wired to tag its own memory with this id (verified while
 * building this file — see the audit note per entry). `status: 'statue'`
 * means the name exists and nothing behind it does yet; the Agents hub still
 * shows it — an empty hub with a clear label is more useful than hiding the
 * gap — but it will have zero memories until it is actually built.
 */

export type AgentStatus = 'active' | 'statue';

export interface AgentSeed {
  id: string;
  name: string;
  groupLabel: string;
  icon: string;
  color: string;
  status: AgentStatus;
  description: string;
}

export const AGENT_SEEDS: AgentSeed[] = [
  // ── AXE CORE — main ──────────────────────────────────────────────────
  {
    id: 'memory_agent', name: 'Memory Agent', groupLabel: 'AXE CORE', icon: '🧠', color: '#22D3EE',
    status: 'active',
    description: 'The Memory Manager — builds and maintains the memory itself. Already built (MemoryLibraryPanel "Run Memory Manager"), now also registered as an agent so its own activity gets its own hub.',
  },
  {
    id: 'code_agent', name: 'Code Agent', groupLabel: 'AXE CORE', icon: '🛠️', color: '#34D399',
    status: 'active',
    description: 'Leest en schrijft bestanden in de worktree, draait build/typecheck/tests. codeEditorAgent.ts.',
  },
  {
    id: 'browser_agent', name: 'Browser Agent', groupLabel: 'AXE CORE', icon: '🌍', color: '#FDBA74',
    status: 'active',
    description: 'Autonome browsersturing (CDP). browserAgentLoop.ts + BrowserAgentPanel.',
  },
  {
    id: 'thinktank_agent', name: 'ThinkTank Agent', groupLabel: 'AXE CORE', icon: '💡', color: '#A78BFA',
    status: 'active',
    description: 'Analyses drops (text/URL/image) with a real LLM call and builds an action plan. thinkThanksService.ts.',
  },
  {
    id: 'crewai_manager', name: 'CrewAI Manager', groupLabel: 'AXE CORE', icon: '👥', color: '#06B6D4',
    status: 'active',
    description: 'Beheert de CrewAI-crews (incl. de trading research crew) op de VPS.',
  },
  {
    id: 'eve', name: 'EVE', groupLabel: 'AXE CORE', icon: '🌸', color: '#F472B6',
    status: 'active',
    description: 'Persona-framework — injecteert system-prompt-aanvullingen per slot. eveSkills.ts + EveFramework.tsx.',
  },
  {
    // Corrected while wiring the tag-mapping below: the `[EXEC:]` and
    // Vercel tools already run real VPS/deploy actions through the same
    // tool loop everything else uses — there was no dedicated UI calling it
    // "Infrastructure Agent", but the actions themselves are real.
    id: 'infrastructure_agent', name: 'Infrastructure Agent', groupLabel: 'AXE CORE', icon: '🏗️', color: '#F97316',
    status: 'active',
    description: 'VPS commands (exec) and Vercel deploys — already working through the tool loop, now tagged as an agent too.',
  },
  {
    id: 'app_agent_manager', name: 'App/Agent Manager', groupLabel: 'AXE CORE', icon: '🗂️', color: '#818CF8',
    status: 'statue',
    description: 'Still to build: an overview plus on/off switching of every agent and app in one place.',
  },
  {
    // Corrected: cron was never a statue. core_schedules + the VPS crontab
    // tick already run real, unattended actions every 60 seconds, entirely
    // independent of anyone opening the CronManager UI — that IS the
    // automation Luka asked every remaining agent to actually have. All that
    // was missing was memory: cron_tick now tags each fired schedule with
    // agentId 'cron_manager' at the moment it actually runs.
    id: 'cron_manager', name: 'Cron Manager', groupLabel: 'AXE CORE', icon: '⏰', color: '#EAB308',
    status: 'active',
    description: 'Self-hosted scheduler: core_schedules plus a VPS crontab that ticks every minute and actually runs due schedules (prompt/exec/webhook/crew/flow), with nobody watching.',
  },
  {
    // Was a name with nothing behind it: Tasks.tsx wrote 'todo'/'in_progress'
    // straight into core_tasks.status, a value the schema's CHECK constraint
    // doesn't even accept, via the anon key — access the durable-kernel
    // migration then revoked outright, so the whole tab was silently broken.
    // Rewired end to end: Tasks.tsx now goes through axe-core-api's /tasks
    // REST layer (new list/update/delete routes), and axe-task-worker has a
    // real 'task_manage' handler that acknowledges each task and writes a
    // memory entry tagged agentId 'task_agent' — the same pattern
    // cron_manager and crewai_manager already use for their own hub.
    id: 'task_agent', name: 'Task Agent', groupLabel: 'AXE CORE', icon: '✅', color: '#4ADE80',
    status: 'active',
    description: 'Picks up tasks from the Tasks tab, tracks them through the durable task worker on the VPS, and leaves a memory trail.',
  },
  {
    id: 'finance_agent', name: 'Finance Agent', groupLabel: 'AXE CORE', icon: '💰', color: '#FBBF24',
    status: 'statue',
    description: 'Still to build: no financial analysis logic of its own found (apart from the trading agent).',
  },

  // ── Trading tab only — expliciet voor later ────────────────────────────
  {
    id: 'axe_companion', name: 'AXE Companion', groupLabel: 'Trading', icon: '📱', color: '#60A5FA',
    status: 'statue',
    description: 'Already exists as its own app, same Supabase project. Surfacing/linking it from the Trading tab was deliberately postponed.',
  },
  {
    id: 'axe_intel', name: 'AXE Intel', groupLabel: 'Trading', icon: '📡', color: '#3B82F6',
    status: 'statue',
    description: 'Already exists as its own app (TRADING-OS), same Supabase project, 16 intel_* tables. Linking was deliberately postponed.',
  },
  {
    id: 'axe_algo', name: 'AXE ALGO', groupLabel: 'Trading', icon: '📈', color: '#22C55E',
    status: 'active',
    description: 'De trading-agent in de Trading-tab (tradingAgentEngine.ts) — draait al, gebruikt sinds recent de echte MT5-balans.',
  },
];
