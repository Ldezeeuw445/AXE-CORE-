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
export type ApprovalKind = 'exec' | 'git_write' | 'git_pr_merge' | 'db_sql' | 'vercel_promote' | 'agent' | 'smart_home' | 'local_write' | 'local_run' | 'phone';

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
  // ── Local machine ────────────────────────────────────────────────────────
  // The only tools that reach the worktree the running app is served from.
  // git_write commits to GitHub and exec runs on the VPS; neither changes
  // what Luka sees, which is why asking AXE to alter the app used to be
  // impossible rather than merely unreliable.
  {
    id: 'local_read',
    marker: 'LOCAL_READ',
    shortForm: '[LOCAL_READ:]',
    gate: 'auto',
    pattern: /\[LOCAL_READ:\s*(\{[^\]]{1,4000}\})\s*\]/,
    stripPattern: /\[LOCAL_READ:\s*\{[^\]]*\}\s*\]/g,
    promptDoc: `📖 **Local — Read a file from Luka's machine**:
\`[LOCAL_READ: {"path":"/Volumes/EagetSSD/AXE-CORE-/.../SomeFile.tsx"}]\`
Reads the real file on the SSD, in the worktree the app runs from. Use this
before any [LOCAL_WRITE:] so you edit what is actually there rather than what
you remember. Paths outside the allowed roots are refused by the bridge.`,
  },
  {
    id: 'local_write',
    marker: 'LOCAL_WRITE',
    shortForm: '[LOCAL_WRITE:]',
    gate: 'approval',
    approvalKind: 'local_write',
    pattern: /\[LOCAL_WRITE:\s*(\{[^\]]{1,60000}\})\s*\]/,
    stripPattern: /\[LOCAL_WRITE:\s*\{[^\]]*\}\s*\]/g,
    promptDoc: `✏️ **Local — Write a file on Luka's machine** (needs approval):
\`[LOCAL_WRITE: {"path":"/Volumes/.../SomeFile.tsx","content":"the FULL new file"}]\`
This changes the app Luka is looking at — with the dev server running, the
change appears immediately. Always send the FULL file content, never a diff,
and read the file first. Denied means denied: say so plainly, never retry
silently.`,
  },
  {
    id: 'local_run',
    marker: 'LOCAL_RUN',
    shortForm: '[LOCAL_RUN:]',
    gate: 'approval',
    approvalKind: 'local_run',
    pattern: /\[LOCAL_RUN:\s*(\{[^\]]{1,2000}\})\s*\]/,
    stripPattern: /\[LOCAL_RUN:\s*\{[^\]]*\}\s*\]/g,
    promptDoc: `🔧 **Local — Run a build or git command** (needs approval):
\`[LOCAL_RUN: {"command":"typecheck","cwd":"/Volumes/.../AXE-CORE-HEADQUARTERS"}]\`
Allowed commands only: build, typecheck, test, git.status, git.pull, git.diff,
tauri.build. Anything else is refused by the bridge — do not try to smuggle a
shell string in. Use \`typecheck\` after a [LOCAL_WRITE:] to prove the edit
compiles before claiming it worked.`,
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
  {
    id: 'osint',
    marker: 'OSINT',
    shortForm: '[OSINT:]',
    gate: 'auto',
    pattern: /\[OSINT(?::\s*"?([a-z]{2,20})"?)?\s*\]/,
    stripPattern: /\[OSINT(?::\s*"?[a-z]*"?)?\s*\]/g,
    promptDoc: `🌍 **OSINT map data**, no approval needed (reading isn't destructive):
\`[OSINT]\` for a summary of every layer, or \`[OSINT: "vessel"]\` for one layer.
Layers: air (live aircraft), vessel (AIS ships), space (ISS/satellites), heatmap (thermal hotspots), news (GDELT), crypto, macro, intel (USGS quakes + CISA CVEs). This is the same live data the 3D map plots — use it for "what ships are near Rotterdam" / "recent earthquakes" style questions instead of guessing.
Example: "Even live kijken. [OSINT: "intel"]"`,
  },
  {
    id: 'agent',
    marker: 'AGENT',
    shortForm: '[AGENT:]',
    gate: 'approval',
    approvalKind: 'agent',
    pattern: /\[AGENT:\s*(\{[^\]]{1,4000}\})\s*\]/,
    stripPattern: /\[AGENT:\s*\{[^\]]*\}\s*\]/g,
    promptDoc: `🤖 **Hand a task to a specialist VPS agent**, same mandatory-approval contract as [EXEC:]:
\`[AGENT: {"tool":"openhands","task":"what it should do"}]\`
These are real autonomous agents running on the VPS — YOU pick the right one for the task:
- **openhands** — autonomous multi-file coding: build a feature, refactor across files, fix a bug end-to-end in a repo checkout on the VPS.
- **kilocode** — focused IDE-style code edits / quick coding tasks.
- **openclaw** — NOT YET WIRED (its VPS deployment is a messaging-channel gateway, not a browsing agent — do not offer or claim this one until it's fixed).
- **openjarvis** — general local assistant actions on the VPS.
(For private local reasoning kept off the cloud, you don't need an agent — just answer using the local Hermes/Ollama model, which the router already reaches for privacy/reasoning tasks.)
Gated exactly like EXEC because these agents act on the VPS on their own. If the chosen tool isn't wired yet you get a clear "not configured — set {TOOL}_URL" back — report that honestly, never fake a result. Denied means denied.
Example: "Ik zet OpenHands hierop zodra je akkoord geeft. [AGENT: {"tool":"openhands","task":"add a dark-mode toggle to the settings page and open a PR"}]"`,
  },
  {
    id: 'crew',
    marker: 'CREW',
    shortForm: '[CREW:]',
    gate: 'auto',
    pattern: /\[CREW:\s*(\{[^\]]{1,4000}\})\s*\]/,
    stripPattern: /\[CREW:\s*\{[^\]]*\}\s*\]/g,
    promptDoc: `👥 **CrewAI background crew**, no approval needed (advisory output only — it changes nothing):
\`[CREW: {"task":"...","specialists":["wags","nova"]}]\`
Runs the real multi-specialist crew on VPS Ollama (ids: wags, dollar_bill, intel, sentinel, forge, pulse, atlas, nova, axe_core). SLOW — sequential local models, can take minutes — so only use it when Luka explicitly wants a deep multi-specialist brainstorm/report, never for a normal question you can answer directly. Tell him it's running in the background before you call it. If the crew runtime isn't deployed on the VPS you get its honest error back — report that, never a fake crew result.
Example: "Ik zet de crew erop, dit duurt even. [CREW: {"task":"Launchplan Trading OS","specialists":["nova","dollar_bill"]}]"`,
  },
  {
    id: 'project',
    marker: 'PROJECT',
    shortForm: '[PROJECT:]',
    gate: 'auto',
    pattern: /\[PROJECT:\s*(\{[\s\S]*?\})\s*\]/,
    stripPattern: /\[PROJECT:\s*\{[\s\S]*?\}\s*\]/g,
    promptDoc: `🌐 **Project something onto the Home sphere portal** (desktop app, no approval needed — it only displays, never touches data):
\`[PROJECT: {"mode":"map"|"document"|"code"|"image"|"chart","title":"...","text":"...","data":{...}}]\`
This is what actually shows something in-place on Home — a map, a document, a code snippet, a chart. For "mode":"map", set "data":{"lat":..,"lng":..,"label":"..."} with the real coordinates of the place (you may not know exact coordinates — a well-known city/landmark name in "label" is fine, the resolver geocodes it). You do NOT need this marker for most map/document requests — just answering naturally ("Ik laat je nu New York zien!") already gets picked up and projected automatically. Only reach for the explicit marker when you have real data to hand it (e.g. exact coordinates from a tool result, or code/text content you already have) that the automatic detection wouldn't otherwise have.
Never use [OPEN_WINDOW:] for this — that opens a whole separate native window, which is not what "show me X" means.
Example: "Ik laat New York zien. [PROJECT: {"mode":"map","title":"New York City","data":{"lat":40.7128,"lng":-74.006,"label":"New York City"}}]"`,
  },
  {
    id: 'open_window',
    marker: 'OPEN_WINDOW',
    shortForm: '[OPEN_WINDOW:]',
    gate: 'auto',
    pattern: /\[OPEN_WINDOW:\s*(\{[^\]]{1,200}\})\s*\]/,
    stripPattern: /\[OPEN_WINDOW:\s*\{[^\]]*\}\s*\]/g,
    promptDoc: `🖥️ **Open a page in its own window on a specific screen** (desktop app only), no approval needed (it only opens a window, never touches data):
\`[OPEN_WINDOW: {"page":"trading","monitor":1}]\`
Desktop-app-only (Tauri) — if Luka is on the web version this tool isn't available and you should say so instead of calling it. "page" must be one of the app's real routes (home, trading, memory, cron-manager, code-editor, browser, terminal, settings, maps-3d, etc. — match what he asks to the closest real page). "monitor" is 0-indexed, left-to-right (0 = leftmost/primary if he doesn't specify one — just use 0 unless he names a screen). Use this ONLY when he explicitly asks to put something on another screen, in its own window, or side-by-side — that's the whole point of this tool existing (see AXE's own principle: anything the app can do, he should be able to just ask for).
Do NOT use this for a plain "show me New York" / "laat de Eiffeltoren zien" / "show me this document" — those already project straight onto the Home sphere just by you naturally confirming it in your reply (no tool call needed for that at all). Calling OPEN_WINDOW for a request like that opens an entire separate native window on top of Home instead of the intended in-place sphere projection — a real regression, not a nicer answer.
Example: "Zet 'm op het tweede scherm. [OPEN_WINDOW: {"page":"trading","monitor":1}]"`,
  },
  {
    id: 'obsidian_write',
    marker: 'OBSIDIAN_WRITE',
    shortForm: '[OBSIDIAN_WRITE:]',
    gate: 'auto',
    pattern: /\[OBSIDIAN_WRITE:\s*(\{[^\]]{1,12000}\})\s*\]/,
    stripPattern: /\[OBSIDIAN_WRITE:\s*\{[^\]]*\}\s*\]/g,
    promptDoc: `📝 **Obsidian / durable note write**, no approval needed (writes into AXE's own note store, not Luka's live vault files yet):
\`[OBSIDIAN_WRITE: {"title":"Decision about X","content":"markdown body with [[wikilinks]]","tags":["decision"],"path":"AXE/Decisions/x.md"}]\`
\`path\` is optional — if omitted a path is derived from the title under AXE/. Use this for decisions, facts about Luka, project context, lessons, and anything that should survive across sessions and later appear in his Obsidian vault via the Core→vault sync. Prefer short, linkable notes over dumping entire chats.
Example: "Ik leg dit vast. [OBSIDIAN_WRITE: {"title":"Luka prefers Dutch for casual chat","content":"Preference noted 2026-07-27.\n[[Preferences]]","tags":["preference"]}]"`,
  },
  {
    id: 'obsidian_search',
    marker: 'OBSIDIAN_SEARCH',
    shortForm: '[OBSIDIAN_SEARCH:]',
    gate: 'auto',
    pattern: /\[OBSIDIAN_SEARCH:\s*"?([^"\]\n]{2,200})"?\]/,
    stripPattern: /\[OBSIDIAN_SEARCH:\s*"?[^"\]\n]*"?\]/g,
    promptDoc: `🔎 **Obsidian / durable note search**, no approval needed:
\`[OBSIDIAN_SEARCH: "trading os launch"]\`
Searches title, body, and tags in core_obsidian_notes — the same store every session shares. Use before answering questions about past decisions, preferences, or project context instead of guessing from chat memory alone.
Example: "Even in het geheugen kijken. [OBSIDIAN_SEARCH: "co-founder"]"`,
  },
  {
    id: 'reflect',
    marker: 'REFLECT',
    shortForm: '[REFLECT:]',
    gate: 'auto',
    pattern: /\[REFLECT:\s*(\{[^\]]{1,4000}\})\s*\]/,
    stripPattern: /\[REFLECT:\s*\{[^\]]*\}\s*\]/g,
    promptDoc: `🪞 **Write a reflection** (learning loop), no approval needed:
\`[REFLECT: {"title":"short title","whatHappened":"...","correction":"optional","lesson":"optional","outcome":"completed"}]\`
Stores a reflection in both global memory and Obsidian (AXE/Reflections/). Use after a meaningful completed task, a correction from Luka, or a failed approach you should not repeat. outcome one of: approved, denied, auto_run, completed, failed.
Example: "Lesson locked in. [REFLECT: {"title":"Don't retry denied EXEC","whatHappened":"Luka denied systemctl restart","lesson":"Ask explicitly before retrying","outcome":"denied"}]"`,
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
  t.marker === 'VERCEL_STATUS' || t.marker === 'ST_LIST' ? `[${t.marker}]` : `[${t.marker}:...]`,
).join(', ');

/** Strip every known tool marker from a final reply. */
export function stripToolMarkers(text: string): string {
  let out = text;
  for (const t of TOOL_CATALOG) out = out.replace(t.stripPattern, '');
  return out;
}
