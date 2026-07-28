/**
 * Canonical tool catalog — the single source of truth for every chat tool
 * marker AXE can use. Pure domain content: no code dependencies, importable
 * from any layer (prompts.ts derives the system prompt's "Real Tools"
 * section from this, and the application-layer toolRegistry binds each
 * entry to its real executor).
 *
 * Adding a tool = adding an entry here (marker, gate, prompt doc) + a
 * matching executor in src/application/tools/toolRegistry.ts. The system
 * prompt, the marker-strip pass, and the follow-up instruction all derive
 * from this catalog, so they can never drift out of sync with what is
 * actually executable.
 *
 * SmartThings tools are registered at runtime via registerSmartThingsCatalog().
 */

export type ToolGate = 'auto' | 'approval';

/** Kinds shown on the approval card. One per gated tool. */
export type ApprovalKind = 'exec' | 'git_write' | 'git_pr_merge' | 'db_sql' | 'vercel_promote' | 'agent' | 'smart_home';

/** The local agent bridges Axe can hand a task to (must match the axe_api
 *  /internal/{tool}/execute routes and the {TOOL}_URL env vars). Hermes is
 *  deliberately NOT here — it's a language model, wired as an Ollama model
 *  (see ollamaModelCatalog.ts), not an autonomous agent. */
export const AGENT_TOOLS = ['openhands', 'openjarvis', 'openclaw', 'kilocode'] as const;
export type AgentTool = typeof AGENT_TOOLS[number];

/** AXE's own repository — self-edits must go through the branch->PR->merge
 *  loop, never straight onto its production branch. */
export const AXE_SELF_REPO = 'Ldezeeuw445/AXE-CORE-';
export const AXE_SELF_REPO_PROD_BRANCH = 'orchestrator';

export interface ToolCatalogEntry {
  id: string;
  marker: string;
  shortForm: string;
  gate: ToolGate;
  approvalKind?: ApprovalKind;
  pattern: RegExp;
  stripPattern: RegExp;
  promptDoc: string;
}

/**
 * Order matters: when a response contains multiple markers, the FIRST entry
 * in this array that matches is executed in that resolution round.
 * SmartThings entries are appended by registerSmartThingsCatalog().
 */
export const TOOL_CATALOG: ToolCatalogEntry[] = [
  {
    id: 'search',
    marker: 'SEARCH',
    shortForm: '[SEARCH:]',
    gate: 'auto',
    pattern: /\[SEARCH:\s*"?([^"\]\n]{5,250})"?\]/,
    stripPattern: /\[SEARCH:\s*"?[^"\]\n]*"?\]/g,
    promptDoc: `🔍 **Web Search** — include this marker anywhere in your response:\n\`[SEARCH: "your search query"]\``,
  },
  {
    id: 'fetch',
    marker: 'FETCH',
    shortForm: '[FETCH:]',
    gate: 'auto',
    pattern: /\[FETCH:\s*"?(https?:\/\/[^"\]\n]{5,500})"?\]/,
    stripPattern: /\[FETCH:\s*"?[^"\]\n]*"?\]/g,
    promptDoc: `🌐 **URL Fetch**:\n\`[FETCH: "https://example.com"]\``,
  },
  {
    id: 'exec',
    marker: 'EXEC',
    shortForm: '[EXEC:]',
    gate: 'approval',
    approvalKind: 'exec',
    pattern: /\[EXEC:\s*"?([^"\]\n]{1,2000})"?\]/,
    stripPattern: /\[EXEC:\s*"?[^"\]\n]*"?\]/g,
    promptDoc: `💻 **VPS Shell Exec** (approval required):\n\`[EXEC: "command"]\``,
  },
  {
    id: 'git_read',
    marker: 'GIT_READ',
    shortForm: '[GIT_READ:]',
    gate: 'auto',
    pattern: /\[GIT_READ:\s*(\{[^\]]{1,1000}\})\s*\]/,
    stripPattern: /\[GIT_READ:\s*\{[^\]]*\}\s*\]/g,
    promptDoc: `📖 **GitHub read**:\n\`[GIT_READ: {"repo":"owner/name","path":"..."}]\``,
  },
  {
    id: 'git_write',
    marker: 'GIT_WRITE',
    shortForm: '[GIT_WRITE:]',
    gate: 'approval',
    approvalKind: 'git_write',
    pattern: /\[GIT_WRITE:\s*(\{[^\]]{1,20000}\})\s*\]/,
    stripPattern: /\[GIT_WRITE:\s*\{[^\]]*\}\s*\]/g,
    promptDoc: `✍️ **GitHub write** (approval):\n\`[GIT_WRITE: {"repo","path","content","message","branch"}]\``,
  },
  {
    id: 'git_branch',
    marker: 'GIT_BRANCH',
    shortForm: '[GIT_BRANCH:]',
    gate: 'auto',
    pattern: /\[GIT_BRANCH:\s*(\{[^\]]{1,500}\})\s*\]/,
    stripPattern: /\[GIT_BRANCH:\s*\{[^\]]*\}\s*\]/g,
    promptDoc: `🌿 **GitHub branch**:\n\`[GIT_BRANCH: {"repo","branch"}]\``,
  },
  {
    id: 'git_pr',
    marker: 'GIT_PR',
    shortForm: '[GIT_PR:]',
    gate: 'auto',
    pattern: /\[GIT_PR:\s*(\{[^\]]{1,4000}\})\s*\]/,
    stripPattern: /\[GIT_PR:\s*\{[^\]]*\}\s*\]/g,
    promptDoc: `🔀 **GitHub PR**:\n\`[GIT_PR: {"repo","title","head"}]\``,
  },
  {
    id: 'git_pr_status',
    marker: 'GIT_PR_STATUS',
    shortForm: '[GIT_PR_STATUS:]',
    gate: 'auto',
    pattern: /\[GIT_PR_STATUS:\s*(\{[^\]]{1,300}\})\s*\]/,
    stripPattern: /\[GIT_PR_STATUS:\s*\{[^\]]*\}\s*\]/g,
    promptDoc: `🔎 **PR status**:\n\`[GIT_PR_STATUS: {"repo","number"}]\``,
  },
  {
    id: 'git_pr_merge',
    marker: 'GIT_PR_MERGE',
    shortForm: '[GIT_PR_MERGE:]',
    gate: 'approval',
    approvalKind: 'git_pr_merge',
    pattern: /\[GIT_PR_MERGE:\s*(\{[^\]]{1,300}\})\s*\]/,
    stripPattern: /\[GIT_PR_MERGE:\s*\{[^\]]*\}\s*\]/g,
    promptDoc: `✅ **Merge PR** (approval):\n\`[GIT_PR_MERGE: {"repo","number"}]\``,
  },
  {
    id: 'db_read',
    marker: 'DB_READ',
    shortForm: '[DB_READ:]',
    gate: 'auto',
    pattern: /\[DB_READ:\s*(\{[^\]]{1,500}\})\s*\]/,
    stripPattern: /\[DB_READ:\s*\{[^\]]*\}\s*\]/g,
    promptDoc: `📊 **DB read**:\n\`[DB_READ: {"table":"core_memory"}]\``,
  },
  {
    id: 'db_sql',
    marker: 'DB_SQL',
    shortForm: '[DB_SQL:]',
    gate: 'approval',
    approvalKind: 'db_sql',
    pattern: /\[DB_SQL:\s*(\{[^\]]{1,5000}\})\s*\]/,
    stripPattern: /\[DB_SQL:\s*\{[^\]]*\}\s*\]/g,
    promptDoc: `🗄️ **SQL** (approval):\n\`[DB_SQL: {"query":"..."}]\``,
  },
  {
    id: 'vercel_status',
    marker: 'VERCEL_STATUS',
    shortForm: '[VERCEL_STATUS]',
    gate: 'auto',
    pattern: /\[VERCEL_STATUS:?\s*\]/,
    stripPattern: /\[VERCEL_STATUS:?\s*\]/g,
    promptDoc: `🚀 **Vercel status**:\n\`[VERCEL_STATUS]\``,
  },
  {
    id: 'vercel_promote',
    marker: 'VERCEL_PROMOTE',
    shortForm: '[VERCEL_PROMOTE:]',
    gate: 'approval',
    approvalKind: 'vercel_promote',
    pattern: /\[VERCEL_PROMOTE:\s*(\{[^\]]{1,300}\})\s*\]/,
    stripPattern: /\[VERCEL_PROMOTE:\s*\{[^\]]*\}\s*\]/g,
    promptDoc: `🚀 **Vercel promote** (approval):\n\`[VERCEL_PROMOTE: {"deploymentId":"..."}]\``,
  },
  {
    id: 'osint',
    marker: 'OSINT',
    shortForm: '[OSINT:]',
    gate: 'auto',
    pattern: /\[OSINT(?::\s*"?([a-z]{2,20})"?)?\s*\]/,
    stripPattern: /\[OSINT(?::\s*"?[a-z]*"?)?\s*\]/g,
    promptDoc: `🌍 **OSINT**:\n\`[OSINT]\` or \`[OSINT: "vessel"]\``,
  },
  {
    id: 'agent',
    marker: 'AGENT',
    shortForm: '[AGENT:]',
    gate: 'approval',
    approvalKind: 'agent',
    pattern: /\[AGENT:\s*(\{[^\]]{1,4000}\})\s*\]/,
    stripPattern: /\[AGENT:\s*\{[^\]]*\}\s*\]/g,
    promptDoc: `🤖 **Agent** (approval):\n\`[AGENT: {"tool":"openhands","task":"..."}]\``,
  },
  {
    id: 'crew',
    marker: 'CREW',
    shortForm: '[CREW:]',
    gate: 'auto',
    pattern: /\[CREW:\s*(\{[^\]]{1,4000}\})\s*\]/,
    stripPattern: /\[CREW:\s*\{[^\]]*\}\s*\]/g,
    promptDoc: `👥 **Crew**:\n\`[CREW: {"task":"..."}]\``,
  },
  {
    id: 'open_window',
    marker: 'OPEN_WINDOW',
    shortForm: '[OPEN_WINDOW:]',
    gate: 'auto',
    pattern: /\[OPEN_WINDOW:\s*(\{[^\]]{1,200}\})\s*\]/,
    stripPattern: /\[OPEN_WINDOW:\s*\{[^\]]*\}\s*\]/g,
    promptDoc: `🖥️ **Open window**:\n\`[OPEN_WINDOW: {"page":"trading","monitor":1}]\``,
  },
  {
    id: 'obsidian_write',
    marker: 'OBSIDIAN_WRITE',
    shortForm: '[OBSIDIAN_WRITE:]',
    gate: 'auto',
    pattern: /\[OBSIDIAN_WRITE:\s*(\{[^\]]{1,12000}\})\s*\]/,
    stripPattern: /\[OBSIDIAN_WRITE:\s*\{[^\]]*\}\s*\]/g,
    promptDoc: `📝 **Obsidian write**:\n\`[OBSIDIAN_WRITE: {"title","content"}]\``,
  },
  {
    id: 'obsidian_search',
    marker: 'OBSIDIAN_SEARCH',
    shortForm: '[OBSIDIAN_SEARCH:]',
    gate: 'auto',
    pattern: /\[OBSIDIAN_SEARCH:\s*"?([^"\]\n]{2,200})"?\]/,
    stripPattern: /\[OBSIDIAN_SEARCH:\s*"?[^"\]\n]*"?\]/g,
    promptDoc: `🔎 **Obsidian search**:\n\`[OBSIDIAN_SEARCH: "query"]\``,
  },
  {
    id: 'reflect',
    marker: 'REFLECT',
    shortForm: '[REFLECT:]',
    gate: 'auto',
    pattern: /\[REFLECT:\s*(\{[^\]]{1,4000}\})\s*\]/,
    stripPattern: /\[REFLECT:\s*\{[^\]]*\}\s*\]/g,
    promptDoc: `🪞 **Reflect**:\n\`[REFLECT: {"title","whatHappened"}]\``,
  },
];

export const TOOL_MARKER_NAMES = TOOL_CATALOG.map(t => t.marker).join(', ');
export const TOOL_SHORT_FORMS = TOOL_CATALOG.map(t => t.shortForm).join('/');
export const GATED_TOOL_SHORT_FORMS = TOOL_CATALOG.filter(t => t.gate === 'approval').map(t => t.shortForm).join(', ');
export const TOOL_FOLLOWUP_FORMS = TOOL_CATALOG.map(t =>
  t.marker === 'VERCEL_STATUS' || t.marker === 'ST_LIST' ? `[${t.marker}]` : `[${t.marker}:...]`,
).join(', ');

export function stripToolMarkers(text: string): string {
  let out = text;
  for (const t of TOOL_CATALOG) out = out.replace(t.stripPattern, '');
  return out;
}
