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
 */

export type ToolGate = 'auto' | 'approval';

/** Kinds shown on the approval card. One per gated tool. */
export type ApprovalKind = 'exec' | 'git_write' | 'git_pr_merge' | 'db_sql' | 'vercel_promote';

/** AXE's own repository — self-edits must go through the branch->PR->merge
 *  loop, never straight onto its production branch. */
export const AXE_SELF_REPO = 'Ldezeeuw445/AXE-CORE-';
export const AXE_SELF_REPO_PROD_BRANCH = 'orchestrator';

export interface ToolCatalogEntry {
  /** Stable identifier, e.g. 'search'. */
  id: string;
  /** Marker name as written inside [MARKER: ...]. */
  marker: string;
  /** Short display form used in rule text, e.g. '[SEARCH:]' or '[VERCEL_STATUS]'. */
  shortForm: string;
  /**
   * auto  = runs immediately (read-only, or produces only a reviewable artifact)
   * approval = pauses on Luka's approve/deny card before the backend ever sees it
   */
  gate: ToolGate;
  /** For gated tools: the kind shown on the approval card. */
  approvalKind?: ApprovalKind;
  /** Detects a call; group 1 (when present) captures the raw argument. */
  pattern: RegExp;
  /** Strips leftover markers from a final reply (global). */
  stripPattern: RegExp;
  /** Block injected verbatim into the system prompt's "Real Tools" section. */
  promptDoc: string;
}

/**
 * Order matters: when a response contains multiple markers, the FIRST entry
 * in this array that matches is executed in that resolution round (this
 * preserves the historical priority search > fetch > exec > git > db > vercel).
 */
export const TOOL_CATALOG: ToolCatalogEntry[] = [
  {
    id: 'search',
    marker: 'SEARCH',
    shortForm: '[SEARCH:]',
    gate: 'auto',
    pattern: /\[SEARCH:\s*"?([^"\]\n]{5,250})"?\]/,
    stripPattern: /\[SEARCH:\s*"?[^"\]\n]*"?\]/g,
    promptDoc: `🔍 **Web Search** — include this marker anywhere in your response:
\`[SEARCH: "your search query"]\`
Use for: current events, prices, stock prices, news, weather, documentation, people, recent releases, anything time-sensitive or that may have changed since your training.
Example: "Laat me even checken. [SEARCH: "bitcoin koers vandaag 2025"]"`,
  },
  {
    id: 'fetch',
    marker: 'FETCH',
    shortForm: '[FETCH:]',
    gate: 'auto',
    pattern: /\[FETCH:\s*"?(https?:\/\/[^"\]\n]{5,500})"?\]/,
    stripPattern: /\[FETCH:\s*"?[^"\]\n]*"?\]/g,
    promptDoc: `🌐 **URL Fetch** — fetch and read the full content of any webpage:
\`[FETCH: "https://example.com"]\`
Use for: reading articles, documentation, GitHub files, news pages, any specific URL Luka sends you or that you want to read.
Example: "Even lezen. [FETCH: "https://docs.anthropic.com/claude/docs"]"`,
  },
  {
    id: 'exec',
    marker: 'EXEC',
    shortForm: '[EXEC:]',
    gate: 'approval',
    approvalKind: 'exec',
    pattern: /\[EXEC:\s*"?([^"\]\n]{1,2000})"?\]/,
    stripPattern: /\[EXEC:\s*"?[^"\]\n]*"?\]/g,
    promptDoc: `💻 **VPS Shell Exec** — run a real shell command on the AXE VPS and get the
actual stdout/stderr/exit code back:
\`[EXEC: "your shell command"]\`
No allowlist limits WHAT command this can be — but it never runs
automatically. Every single [EXEC:] call pauses and shows Luka the exact
command in the chat UI; it only actually executes on the VPS after he clicks
approve. If he denies it, you get told it was denied — accept that, tell him
plainly, and do not silently retry the same or a rephrased command without
him explicitly asking again. This approval step is not something you can
skip, word around, or claim already happened.
Example: "Even checken. [EXEC: "systemctl status axe-core-api"]"
The result you get back (or the denial) is the ONLY truth about what
happened — if EXEC fails, times out, or gets denied, say that plainly. Never
describe output you didn't actually receive from a real [EXEC:] call.
Never ask "shall I check?" / "geef je akkoord voor de check?" in plain chat
text and wait for a conversational reply before running it — that invents a
fake approval step that never actually calls anything, since the system
only shows Luka a real approve/deny prompt once the [EXEC:] marker itself is
in your message. If a check is warranted, put the marker in that same
response immediately; the real approval card is the only permission ritual
that exists — a "ja/akkoord" typed in chat is not it and runs nothing.`,
  },
  {
    id: 'git_read',
    marker: 'GIT_READ',
    shortForm: '[GIT_READ:]',
    gate: 'auto',
    pattern: /\[GIT_READ:\s*(\{[^\]]{1,1000}\})\s*\]/,
    stripPattern: /\[GIT_READ:\s*\{[^\]]*\}\s*\]/g,
    promptDoc: `📖 **GitHub — Read a file**, no approval needed (reading isn't destructive):
\`[GIT_READ: {"repo":"owner/name","path":"path/to/file.ts","branch":"orchestrator"}]\`
\`branch\` is optional, defaults to \`orchestrator\` — that's already this repo's real working branch, so you only need to pass it explicitly for a different branch.
Example: "Even kijken wat daar staat. [GIT_READ: {"repo":"Ldezeeuw445/AXE-CORE-","path":"src/domain/prompts.ts","branch":"orchestrator"}]"`,
  },
  {
    id: 'git_write',
    marker: 'GIT_WRITE',
    shortForm: '[GIT_WRITE:]',
    gate: 'approval',
    approvalKind: 'git_write',
    pattern: /\[GIT_WRITE:\s*(\{[^\]]{1,20000}\})\s*\]/,
    stripPattern: /\[GIT_WRITE:\s*\{[^\]]*\}\s*\]/g,
    promptDoc: `✍️ **GitHub — Commit a file**, same mandatory-approval contract as [EXEC:]:
\`[GIT_WRITE: {"repo":"owner/name","path":"...","content":"the full new file content","message":"commit message","branch":"axe/my-change"}]\`
This commits directly to the named branch. Always send the FULL file
content, not a diff/patch — read the file with [GIT_READ:] first if you
need to see the current content before editing it. Denied means denied,
exactly like [EXEC:]: tell him plainly, never silently retry.
GUARD (enforced, not optional): committing to \`orchestrator\` of AXE's own
repo (Ldezeeuw445/AXE-CORE-) is rejected — that branch is production. For
your own repo, always follow the change loop below: [GIT_BRANCH:] first,
commit there, then [GIT_PR:].
Example: "Ik pas dit aan zodra je akkoord geeft. [GIT_WRITE: {"repo":"Ldezeeuw445/AXE-CORE-","path":"src/domain/prompts.ts","content":"...","message":"Fix typo","branch":"axe/fix-typo"}]"`,
  },
  {
    id: 'git_branch',
    marker: 'GIT_BRANCH',
    shortForm: '[GIT_BRANCH:]',
    gate: 'auto',
    pattern: /\[GIT_BRANCH:\s*(\{[^\]]{1,500}\})\s*\]/,
    stripPattern: /\[GIT_BRANCH:\s*\{[^\]]*\}\s*\]/g,
    promptDoc: `🌿 **GitHub — Create a branch**, no approval needed (a branch is harmless until something merges):
\`[GIT_BRANCH: {"repo":"owner/name","branch":"axe/short-slug","from":"orchestrator"}]\`
\`from\` is optional, defaults to \`orchestrator\`. Name your branches \`axe/<short-slug>\`. This is step 1 of the change loop below.
Example: "Ik maak een branch voor deze fix. [GIT_BRANCH: {"repo":"Ldezeeuw445/AXE-CORE-","branch":"axe/fix-readme-typo"}]"`,
  },
  {
    id: 'git_pr',
    marker: 'GIT_PR',
    shortForm: '[GIT_PR:]',
    gate: 'auto',
    pattern: /\[GIT_PR:\s*(\{[^\]]{1,4000}\})\s*\]/,
    stripPattern: /\[GIT_PR:\s*\{[^\]]*\}\s*\]/g,
    promptDoc: `🔀 **GitHub — Open a pull request**, no approval needed (the PR itself IS the reviewable artifact — nothing changes until it's merged):
\`[GIT_PR: {"repo":"owner/name","title":"...","body":"what & why","head":"axe/short-slug","base":"orchestrator"}]\`
\`base\` is optional, defaults to \`orchestrator\`. You get the PR URL and number back — always give Luka the URL. Vercel builds a preview deployment for the PR automatically; check [VERCEL_STATUS] to find it and share the preview link.
Example: "PR staat klaar. [GIT_PR: {"repo":"Ldezeeuw445/AXE-CORE-","title":"Fix readme typo","body":"Fixes the typo Luka spotted.","head":"axe/fix-readme-typo"}]"`,
  },
  {
    id: 'git_pr_status',
    marker: 'GIT_PR_STATUS',
    shortForm: '[GIT_PR_STATUS:]',
    gate: 'auto',
    pattern: /\[GIT_PR_STATUS:\s*(\{[^\]]{1,300}\})\s*\]/,
    stripPattern: /\[GIT_PR_STATUS:\s*\{[^\]]*\}\s*\]/g,
    promptDoc: `🔎 **GitHub — PR status**, no approval needed (reading isn't destructive):
\`[GIT_PR_STATUS: {"repo":"owner/name","number":123}]\`
Returns open/merged/mergeable state, head/base branches, and the URL. Check this before ever proposing a merge — and never claim a PR merged without seeing merged:true from this call.
Example: "Even de PR checken. [GIT_PR_STATUS: {"repo":"Ldezeeuw445/AXE-CORE-","number":42}]"`,
  },
  {
    id: 'git_pr_merge',
    marker: 'GIT_PR_MERGE',
    shortForm: '[GIT_PR_MERGE:]',
    gate: 'approval',
    approvalKind: 'git_pr_merge',
    pattern: /\[GIT_PR_MERGE:\s*(\{[^\]]{1,300}\})\s*\]/,
    stripPattern: /\[GIT_PR_MERGE:\s*\{[^\]]*\}\s*\]/g,
    promptDoc: `✅ **GitHub — Merge a pull request**, same mandatory-approval contract as [EXEC:]:
\`[GIT_PR_MERGE: {"repo":"owner/name","number":123,"method":"merge"}]\`
\`method\` is optional (\`merge\`/\`squash\`/\`rebase\`, default \`merge\`). This is the moment a change becomes real — for AXE's own repo it means production deploys. Gated exactly like EXEC, no exceptions. Denied means denied: tell him plainly, never silently retry.
Example: "Ik merge 'm zodra je akkoord geeft. [GIT_PR_MERGE: {"repo":"Ldezeeuw445/AXE-CORE-","number":42}]"`,
  },
  {
    id: 'db_read',
    marker: 'DB_READ',
    shortForm: '[DB_READ:]',
    gate: 'auto',
    pattern: /\[DB_READ:\s*(\{[^\]]{1,500}\})\s*\]/,
    stripPattern: /\[DB_READ:\s*\{[^\]]*\}\s*\]/g,
    promptDoc: `📊 **Supabase — Structured read**, no approval needed (reading isn't destructive):
\`[DB_READ: {"table":"core_memory","limit":50}]\`
\`limit\` is optional, defaults to 50. This is the SAME Supabase project other
AXE-ecosystem apps use (AXE Companion, Trading OS, AXE Intel) — you can read
any table in it, not just AXE CORE's own, since Luka explicitly wants you
able to see across the whole ecosystem. Seeing their data is fine; changing
it is not casual — see DB_SQL below.
Example: "Even kijken wat daar in staat. [DB_READ: {"table":"core_memory","limit":20}]"`,
  },
  {
    id: 'db_sql',
    marker: 'DB_SQL',
    shortForm: '[DB_SQL:]',
    gate: 'approval',
    approvalKind: 'db_sql',
    pattern: /\[DB_SQL:\s*(\{[^\]]{1,5000}\})\s*\]/,
    stripPattern: /\[DB_SQL:\s*\{[^\]]*\}\s*\]/g,
    promptDoc: `🗄️ **Supabase — Run SQL**, same mandatory-approval contract as [EXEC:]:
\`[DB_SQL: {"query":"select ... / insert ... / update ... / delete ..."}]\`
ALWAYS gated, even for what looks like a harmless SELECT — no exception for
"this one's just a read." If it touches a table that isn't AXE CORE's own
(watchlists, broker accounts, trading data — anything belonging to AXE
Companion or Trading OS), say so plainly in the message shown alongside the
approval, since Luka owns that call, not you. Denied means denied, exactly
like [EXEC:]: tell him plainly, never silently retry.
Example: "Ik check dit zodra je akkoord geeft. [DB_SQL: {"query":"select count(*) from core_memory"}]"`,
  },
  {
    id: 'vercel_status',
    marker: 'VERCEL_STATUS',
    shortForm: '[VERCEL_STATUS]',
    gate: 'auto',
    pattern: /\[VERCEL_STATUS:?\s*\]/,
    stripPattern: /\[VERCEL_STATUS:?\s*\]/g,
    promptDoc: `🚀 **Vercel — Deployment status**, no approval needed (reading isn't destructive):
\`[VERCEL_STATUS]\`
Returns the 10 most recent deployments for the AXE CORE project: state,
target (production/preview), commit, URL. Use this instead of guessing
whether a merge actually went live — Vercel does NOT reliably auto-promote
every merge to production for this project, which has bitten Luka
repeatedly. Never assume a deploy succeeded; check.
Example: "Even kijken of dat al live staat. [VERCEL_STATUS]"`,
  },
  {
    id: 'vercel_promote',
    marker: 'VERCEL_PROMOTE',
    shortForm: '[VERCEL_PROMOTE:]',
    gate: 'approval',
    approvalKind: 'vercel_promote',
    pattern: /\[VERCEL_PROMOTE:\s*(\{[^\]]{1,300}\})\s*\]/,
    stripPattern: /\[VERCEL_PROMOTE:\s*\{[^\]]*\}\s*\]/g,
    promptDoc: `🚀 **Vercel — Promote to production**, same mandatory-approval contract as [EXEC:]:
\`[VERCEL_PROMOTE: {"deploymentId":"..."}]\`
Re-points production traffic at an existing, already-built deployment (get
the id from [VERCEL_STATUS] first) — does NOT trigger a new build. This is
real production traffic Luka's users hit, so it's gated exactly like EXEC,
no exception for "it's just a promote, not a delete." Denied means denied:
tell him plainly, never silently retry.
Example: "Ik promoot 'm zodra je akkoord geeft. [VERCEL_PROMOTE: {"deploymentId":"dpl_abc123"}]"`,
  },
];

/** All marker names, e.g. "SEARCH, FETCH, EXEC, ...". */
export const TOOL_MARKER_NAMES = TOOL_CATALOG.map(t => t.marker).join(', ');

/** All short display forms joined with '/', e.g. "[SEARCH:]/[FETCH:]/...". */
export const TOOL_SHORT_FORMS = TOOL_CATALOG.map(t => t.shortForm).join('/');

/** Short display forms of gated (approval-required) tools, comma-joined. */
export const GATED_TOOL_SHORT_FORMS = TOOL_CATALOG.filter(t => t.gate === 'approval')
  .map(t => t.shortForm)
  .join(', ');

/** The follow-up instruction's marker enumeration, e.g. "[SEARCH:...], [FETCH:...], ... [VERCEL_STATUS]". */
export const TOOL_FOLLOWUP_FORMS = TOOL_CATALOG.map(t =>
  t.marker === 'VERCEL_STATUS' ? '[VERCEL_STATUS]' : `[${t.marker}:...]`,
).join(', ');

/** Strip every known tool marker from a final reply. */
export function stripToolMarkers(text: string): string {
  let out = text;
  for (const t of TOOL_CATALOG) out = out.replace(t.stripPattern, '');
  return out;
}
