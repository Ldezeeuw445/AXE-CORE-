/**
 * Canonical skill catalog — domain expertise packs agents can be assigned.
 * Skills inject methodology/instructions into prompts (CrewAI-style "skills"),
 * complementary to executable tool markers in toolCatalog.ts.
 *
 * Custom skills live in skillRegistryService (user_settings + optional Obsidian).
 */

export type SkillCategory =
  | 'research'
  | 'web'
  | 'code'
  | 'data'
  | 'ops'
  | 'trading'
  | 'memory'
  | 'product'
  | 'communication'
  | 'security'
  | 'creative'
  | 'custom';

export interface SkillDefinition {
  id: string;
  name: string;
  category: SkillCategory;
  description: string;
  /** Short instruction block injected when this skill is active on an agent. */
  instruction: string;
  /** Suggested tools/markers this skill pairs with. */
  relatedTools?: string[];
  /** Built-in vs user-created. */
  source: 'builtin' | 'custom';
}

export const SKILL_CATEGORIES: Array<{ id: SkillCategory; label: string }> = [
  { id: 'research', label: 'Research' },
  { id: 'web', label: 'Web & Scraping' },
  { id: 'code', label: 'Code & Engineering' },
  { id: 'data', label: 'Data & Databases' },
  { id: 'ops', label: 'Ops & Infra' },
  { id: 'trading', label: 'Trading & Finance' },
  { id: 'memory', label: 'Memory & Knowledge' },
  { id: 'product', label: 'Product & Strategy' },
  { id: 'communication', label: 'Communication' },
  { id: 'security', label: 'Security' },
  { id: 'creative', label: 'Creative' },
  { id: 'custom', label: 'Custom' },
];

export const BUILTIN_SKILLS: SkillDefinition[] = [
  // ── Research ───────────────────────────────────────────────────────────
  {
    id: 'web-research',
    name: 'Web Research',
    category: 'research',
    description: 'Structured multi-source research with citations.',
    instruction: 'When researching: search first, fetch primary sources, cross-check claims, cite URLs. Prefer primary docs over summaries. Flag uncertainty.',
    relatedTools: ['SEARCH', 'FETCH', 'CREW'],
    source: 'builtin',
  },
  {
    id: 'competitive-intel',
    name: 'Competitive Intelligence',
    category: 'research',
    description: 'Map competitors, positioning, pricing, and moats.',
    instruction: 'For competitor analysis: identify players, product surface, pricing signals, distribution, strengths/weaknesses, and implications for AXE. Use SEARCH/FETCH on real sites.',
    relatedTools: ['SEARCH', 'FETCH'],
    source: 'builtin',
  },
  {
    id: 'osint-scan',
    name: 'OSINT Scan',
    category: 'research',
    description: 'Open-source intelligence using map/live layers.',
    instruction: 'Use [OSINT] layers when questions involve vessels, air, space, news heat, quakes, CVEs. Report counts and timestamps; never invent live coordinates.',
    relatedTools: ['OSINT'],
    source: 'builtin',
  },
  {
    id: 'deep-brief',
    name: 'Deep Brief',
    category: 'research',
    description: 'Long-form structured briefings for Luka.',
    instruction: 'Produce briefs as: Context → Key findings → Evidence → Risks → Recommended actions. Keep sections scannable. Offer a 3-bullet TL;DR at top when long.',
    relatedTools: ['SEARCH', 'FETCH', 'CREW'],
    source: 'builtin',
  },

  // ── Web ────────────────────────────────────────────────────────────────
  {
    id: 'scrape-page',
    name: 'Page Scrape & API Detect',
    category: 'web',
    description: 'Extract page content and detect APIs/scripts/data sources.',
    instruction: 'When analyzing a site: FETCH the URL, extract main content, list API endpoints/script hosts/JSON-LD, and infer how the page gets its data. Prefer evidence over guesses.',
    relatedTools: ['FETCH', 'SEARCH'],
    source: 'builtin',
  },
  {
    id: 'browser-agent',
    name: 'Browser Agent',
    category: 'web',
    description: 'Navigate and interact via Playwright browser agent.',
    instruction: 'For multi-step site tasks, prefer the browser agent path when available. Report URL/title after actions. Never claim clicks you did not perform.',
    relatedTools: ['FETCH'],
    source: 'builtin',
  },
  {
    id: 'serper-search',
    name: 'Web Search Specialist',
    category: 'web',
    description: 'Precise search queries and result triage.',
    instruction: 'Craft tight [SEARCH:] queries (include year/product when relevant). Triage results; FETCH only the best 1–3 sources. Avoid search loops.',
    relatedTools: ['SEARCH', 'FETCH'],
    source: 'builtin',
  },

  // ── Code ───────────────────────────────────────────────────────────────
  {
    id: 'code-review',
    name: 'Code Review',
    category: 'code',
    description: 'Security, correctness, and style review of diffs/files.',
    instruction: 'Review for bugs, edge cases, security, and readability. Prefer concrete line-level notes. Suggest minimal patches. Never invent file contents — GIT_READ first.',
    relatedTools: ['GIT_READ', 'GIT_WRITE', 'AGENT'],
    source: 'builtin',
  },
  {
    id: 'fullstack-ts',
    name: 'Full-Stack TypeScript',
    category: 'code',
    description: 'React, Vite, Tauri, Node patterns used in AXE.',
    instruction: 'Follow existing AXE patterns: domain/application/infrastructure/presentation layers, Tailwind + cyan accent, no drive-by refactors. Prefer small PRs via the change loop.',
    relatedTools: ['GIT_READ', 'GIT_WRITE', 'GIT_BRANCH', 'GIT_PR'],
    source: 'builtin',
  },
  {
    id: 'python-backend',
    name: 'Python Backend',
    category: 'code',
    description: 'FastAPI / axe_api / scripts on the VPS.',
    instruction: 'For Python/VPS API work: prefer reading real files via GIT_READ or EXEC. Keep endpoints honest; never claim services exist without health checks.',
    relatedTools: ['EXEC', 'GIT_READ', 'GIT_WRITE'],
    source: 'builtin',
  },
  {
    id: 'debug-root-cause',
    name: 'Root-Cause Debugging',
    category: 'code',
    description: 'Systematic failure analysis.',
    instruction: 'Hypothesis → evidence (logs/status/code) → isolate → fix. Prefer EXEC/logs and GIT_READ over speculation. One root cause at a time.',
    relatedTools: ['EXEC', 'GIT_READ', 'VERCEL_STATUS'],
    source: 'builtin',
  },
  {
    id: 'pr-change-loop',
    name: 'PR Change Loop',
    category: 'code',
    description: 'Branch → commit → PR → preview → merge discipline.',
    instruction: 'For AXE-CORE- never write straight to orchestrator. Always: GIT_BRANCH axe/<slug> → GIT_WRITE → GIT_PR → share preview → GIT_PR_MERGE only with approval.',
    relatedTools: ['GIT_BRANCH', 'GIT_WRITE', 'GIT_PR', 'GIT_PR_MERGE', 'VERCEL_STATUS'],
    source: 'builtin',
  },

  // ── Data ───────────────────────────────────────────────────────────────
  {
    id: 'sql-analyst',
    name: 'SQL Analyst',
    category: 'data',
    description: 'Safe, precise Supabase/SQL work.',
    instruction: 'DB_READ first to learn schema. Filter multi-tenant tables. DB_SQL is always approval-gated — write clear, minimal queries. Never invent row counts.',
    relatedTools: ['DB_READ', 'DB_SQL'],
    source: 'builtin',
  },
  {
    id: 'rag-memory',
    name: 'RAG & Memory',
    category: 'data',
    description: 'Use global memory and Obsidian notes correctly.',
    instruction: 'Memory is past context, not live state. Prefer OBSIDIAN_SEARCH before guessing past decisions. Write durable facts via OBSIDIAN_WRITE / REFLECT.',
    relatedTools: ['OBSIDIAN_SEARCH', 'OBSIDIAN_WRITE', 'REFLECT', 'DB_READ'],
    source: 'builtin',
  },
  {
    id: 'data-pipeline',
    name: 'Data Pipeline Design',
    category: 'data',
    description: 'ETL/cron/schedule thinking for AXE data flows.',
    instruction: 'Design pipelines as: source → transform → store → consumer. Prefer existing cron/core_schedules and honest failure modes.',
    relatedTools: ['DB_READ', 'EXEC', 'CREW'],
    source: 'builtin',
  },

  // ── Ops ────────────────────────────────────────────────────────────────
  {
    id: 'vps-ops',
    name: 'VPS Operations',
    category: 'ops',
    description: 'systemd, Docker, nginx, Ollama on Strato VPS.',
    instruction: 'Use [EXEC:] for live status. Never claim a service is up without a fresh check. Prefer systemctl/journalctl and report exit codes honestly.',
    relatedTools: ['EXEC'],
    source: 'builtin',
  },
  {
    id: 'deploy-vercel',
    name: 'Vercel Deploy Ops',
    category: 'ops',
    description: 'Deployment status and promote discipline.',
    instruction: 'Check [VERCEL_STATUS] before claiming live. Promote only existing deployments with approval. Merges to orchestrator trigger production builds.',
    relatedTools: ['VERCEL_STATUS', 'VERCEL_PROMOTE', 'GIT_PR_MERGE'],
    source: 'builtin',
  },
  {
    id: 'observability',
    name: 'Observability',
    category: 'ops',
    description: 'Logs, latency, health rollups.',
    instruction: 'Prefer concrete metrics: status, latency, error strings. Roll up health honestly. Suggest the smallest probe that proves the claim.',
    relatedTools: ['EXEC', 'VERCEL_STATUS', 'OSINT'],
    source: 'builtin',
  },
  {
    id: 'crew-orchestration',
    name: 'Crew Orchestration',
    category: 'ops',
    description: 'Launch multi-specialist CrewAI runs well.',
    instruction: 'Only [CREW:] when Luka wants a deep multi-agent pass. Put the full brief in task. Warn it can take minutes. Report honest VPS errors; never fake crew output.',
    relatedTools: ['CREW'],
    source: 'builtin',
  },

  // ── Trading ────────────────────────────────────────────────────────────
  {
    id: 'market-analyst',
    name: 'Market Analyst',
    category: 'trading',
    description: 'Markets, risk, and Trading OS context.',
    instruction: 'Use intel_* and Trading OS tables via DB_READ when relevant. Separate fact vs opinion. Never invent positions or fills.',
    relatedTools: ['DB_READ', 'SEARCH'],
    source: 'builtin',
  },
  {
    id: 'risk-manager',
    name: 'Risk Manager',
    category: 'trading',
    description: 'Position sizing, drawdown, and rule checks.',
    instruction: 'Frame risk in terms of exposure, max loss, and rule violations. Prefer user_trading rules/playbooks from DB when available.',
    relatedTools: ['DB_READ'],
    source: 'builtin',
  },

  // ── Memory ─────────────────────────────────────────────────────────────
  {
    id: 'knowledge-curator',
    name: 'Knowledge Curator',
    category: 'memory',
    description: 'Keep Obsidian and memory clean and linked.',
    instruction: 'Write short, linkable notes ([[wikilinks]]). Prefer one concept per note. Tag decisions, preferences, lessons. Search before writing duplicates.',
    relatedTools: ['OBSIDIAN_WRITE', 'OBSIDIAN_SEARCH', 'REFLECT'],
    source: 'builtin',
  },
  {
    id: 'preference-tracker',
    name: 'Preference Tracker',
    category: 'memory',
    description: 'Capture Luka preferences permanently.',
    instruction: 'When Luka states a lasting preference, record it (OBSIDIAN_WRITE / REFLECT). Reuse it later without re-asking.',
    relatedTools: ['OBSIDIAN_WRITE', 'REFLECT'],
    source: 'builtin',
  },

  // ── Product ────────────────────────────────────────────────────────────
  {
    id: 'product-strategy',
    name: 'Product Strategy',
    category: 'product',
    description: 'Positioning, roadmap, prioritization.',
    instruction: 'Prioritize by user impact × leverage × risk. Speak in concrete next ships, not abstract vision decks unless asked.',
    relatedTools: ['SEARCH', 'CREW'],
    source: 'builtin',
  },
  {
    id: 'ux-critique',
    name: 'UX Critique',
    category: 'product',
    description: 'Premium UI/UX feedback for AXE surfaces.',
    instruction: 'Judge hierarchy, spacing, contrast, motion, and cognitive load. Prefer specific component-level notes matching AXE black+cyan language.',
    relatedTools: [],
    source: 'builtin',
  },

  // ── Communication ──────────────────────────────────────────────────────
  {
    id: 'executive-summary',
    name: 'Executive Summary',
    category: 'communication',
    description: 'Short, decisive updates for Luka.',
    instruction: 'Default 1–3 sentences. Lead with the answer. Offer depth only if asked. No filler openers.',
    relatedTools: [],
    source: 'builtin',
  },
  {
    id: 'technical-writing',
    name: 'Technical Writing',
    category: 'communication',
    description: 'Clear docs, runbooks, and ADRs.',
    instruction: 'Write runbooks as numbered steps with expected outcomes. Prefer copy-pasteable commands. State assumptions.',
    relatedTools: ['OBSIDIAN_WRITE'],
    source: 'builtin',
  },

  // ── Security ───────────────────────────────────────────────────────────
  {
    id: 'security-review',
    name: 'Security Review',
    category: 'security',
    description: 'Auth, secrets, and attack-surface checks.',
    instruction: 'Never expose secrets. Flag auth gaps, over-broad SQL, shell injection risks. Prefer least privilege. Do not provide exploit how-tos.',
    relatedTools: ['GIT_READ', 'EXEC'],
    source: 'builtin',
  },
  {
    id: 'approval-discipline',
    name: 'Approval Discipline',
    category: 'security',
    description: 'Respect gated tools and real approval cards.',
    instruction: 'Never treat chat "ja/ok" as approval for EXEC/GIT_WRITE/DB_SQL/etc. Emit the marker; the UI card is the only real gate.',
    relatedTools: ['EXEC', 'GIT_WRITE', 'DB_SQL', 'VERCEL_PROMOTE', 'AGENT'],
    source: 'builtin',
  },

  // ── Creative ───────────────────────────────────────────────────────────
  {
    id: 'naming-brand',
    name: 'Naming & Brand',
    category: 'creative',
    description: 'Product names, copy, and tone.',
    instruction: 'Keep AXE voice: sharp, confident, minimal. Avoid corporate sludge. Offer 3 options max with a recommendation.',
    relatedTools: [],
    source: 'builtin',
  },
  {
    id: 'prompt-engineering',
    name: 'Prompt Engineering',
    category: 'creative',
    description: 'Design strong system/user prompts for agents.',
    instruction: 'Write prompts with role, constraints, output format, and failure modes. Prefer testable acceptance criteria.',
    relatedTools: [],
    source: 'builtin',
  },

  // ── AXE-specific power skills ──────────────────────────────────────────
  {
    id: 'axe-ecosystem',
    name: 'AXE Ecosystem Navigator',
    category: 'ops',
    description: 'Know Companion, Intel, Trading OS, VPS, Supabase boundaries.',
    instruction: 'Know which app owns which surface. Read across shared Supabase carefully (user_id filters). Never claim Companion/Trading OS actions without real tools.',
    relatedTools: ['DB_READ', 'EXEC'],
    source: 'builtin',
  },
  {
    id: 'self-improvement',
    name: 'Self-Improvement Loop',
    category: 'code',
    description: 'Improve AXE itself via honest PRs.',
    instruction: 'When improving AXE: smallest useful change, real branch/PR, no fake success. Reflect lessons after meaningful work.',
    relatedTools: ['GIT_BRANCH', 'GIT_WRITE', 'GIT_PR', 'REFLECT'],
    source: 'builtin',
  },
  {
    id: 'file-brief-executor',
    name: 'File Brief Executor',
    category: 'ops',
    description: 'Execute attached PDF/text briefs literally via Crew or tools.',
    instruction: 'When a document is attached with launch/crew instructions: treat the document as the task spec. Prefer CREW with full brief text. Do not summarize-and-stop.',
    relatedTools: ['CREW', 'SEARCH', 'FETCH'],
    source: 'builtin',
  },
];

export function getBuiltinSkill(id: string): SkillDefinition | undefined {
  return BUILTIN_SKILLS.find(s => s.id === id);
}

export function skillsByCategory(category: SkillCategory): SkillDefinition[] {
  return BUILTIN_SKILLS.filter(s => s.category === category);
}

/** Default skill IDs assigned to AXE CORE out of the box. */
export const AXE_CORE_DEFAULT_SKILLS: string[] = [
  'web-research',
  'scrape-page',
  'serper-search',
  'code-review',
  'fullstack-ts',
  'debug-root-cause',
  'pr-change-loop',
  'sql-analyst',
  'rag-memory',
  'vps-ops',
  'deploy-vercel',
  'crew-orchestration',
  'knowledge-curator',
  'preference-tracker',
  'executive-summary',
  'security-review',
  'approval-discipline',
  'axe-ecosystem',
  'self-improvement',
  'file-brief-executor',
  'product-strategy',
  'deep-brief',
];

/** Sensible defaults per specialist id. */
export const SPECIALIST_DEFAULT_SKILLS: Record<string, string[]> = {
  wags: ['code-review', 'fullstack-ts', 'python-backend', 'debug-root-cause', 'pr-change-loop', 'self-improvement'],
  'dollar-bill': ['market-analyst', 'risk-manager', 'sql-analyst', 'deep-brief'],
  intel: ['web-research', 'competitive-intel', 'osint-scan', 'scrape-page', 'serper-search', 'deep-brief'],
  sentinel: ['observability', 'vps-ops', 'security-review', 'approval-discipline'],
  forge: ['vps-ops', 'deploy-vercel', 'python-backend', 'observability', 'pr-change-loop'],
  pulse: ['observability', 'vps-ops', 'osint-scan'],
  atlas: ['rag-memory', 'knowledge-curator', 'preference-tracker', 'sql-analyst'],
  nova: ['product-strategy', 'competitive-intel', 'ux-critique', 'naming-brand', 'deep-brief'],
};

/** Build prompt supplement from skill ids (builtin + custom defs). */
export function buildSkillsPromptSection(
  skillIds: string[],
  custom: SkillDefinition[] = [],
): string {
  if (!skillIds.length) return '';
  const all = [...BUILTIN_SKILLS, ...custom];
  const lines: string[] = ['## Active Skills (assigned methodology — use with Real Tools when acting)'];
  for (const id of skillIds) {
    const s = all.find(x => x.id === id);
    if (!s) {
      lines.push(`- **${id}**: (custom label only — no instruction body)`);
      continue;
    }
    lines.push(`- **${s.name}** (${s.id}): ${s.instruction}`);
  }
  return lines.join('\n');
}
