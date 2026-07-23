/**
 * Tool registry — binds every entry of the domain tool catalog to its real
 * executor. The voiceStore resolution loop iterates this registry generically:
 * detect the first matching+available tool, run it (through the approval gate
 * when the catalog says so), feed the honest result back to the model.
 *
 * Contract (same one documented on PendingExec in voiceStore — do not weaken
 * either half): gated tools ALWAYS pause on Luka's approve/deny card, no
 * trusted list that skips it; and once approved, the real call runs
 * immediately with nothing in between.
 */
import {
  TOOL_CATALOG,
  AXE_SELF_REPO,
  AXE_SELF_REPO_PROD_BRANCH,
  type ApprovalKind,
  type ToolCatalogEntry,
} from '@/domain/tools/toolCatalog';
import { tavilySearch, tavilyConfigured, formatTavilyResults } from '@/infrastructure/gateways/tavilyService';
import { browseFetch, formatBrowseResult } from '@/infrastructure/gateways/browserFetchService';
import {
  isAxeApiConfigured, execCommand, ghGetFile, ghUpdateFile,
  ghCreateBranch, ghCreatePr, ghGetPr, ghMergePr,
  sbGetRows, sbRunSql, vercelListDeployments, vercelPromote,
} from '@/infrastructure/gateways/axeCoreApiService';
import { logMessage } from '@/infrastructure/persistence/coreDB';

export interface ToolRunCtx {
  /** Pause and wait for Luka's approve/deny on the chat approval card. */
  requestApproval: (kind: ApprovalKind, title: string, detail: string) => Promise<boolean>;
}

export interface ToolRuntime extends ToolCatalogEntry {
  /** Whether this tool can run at all right now (config present). */
  available: () => boolean;
  /** Execute with the raw captured argument; returns the result block fed back to the model. */
  run: (raw: string, ctx: ToolRunCtx) => Promise<string>;
  /**
   * Formats a thrown error into a result block fed back to the model.
   * Omitted = a failure aborts the resolution round silently (historical
   * SEARCH/FETCH behavior).
   */
  onError?: (msg: string) => string;
}

interface GitReadArgs { repo: string; path: string; branch?: string; [key: string]: unknown }
interface GitWriteArgs { repo: string; path: string; content: string; message: string; branch?: string; [key: string]: unknown }
interface GitBranchArgs { repo: string; branch: string; from?: string; [key: string]: unknown }
interface GitPrArgs { repo: string; title: string; head: string; body?: string; base?: string; [key: string]: unknown }
interface DbReadArgs { table: string; limit?: number; [key: string]: unknown }
interface DbSqlArgs { query: string; [key: string]: unknown }
interface VercelPromoteArgs { deploymentId: string; [key: string]: unknown }

/** Parse a JSON tool-marker payload. Returns null on malformed JSON or
 *  missing required fields rather than throwing — a bad tool call should
 *  surface as "that didn't work", not crash the whole resolution loop. */
function parseJsonArgs<T extends Record<string, unknown>>(raw: string, required: (keyof T)[]): T | null {
  try {
    const parsed = JSON.parse(raw) as Partial<T>;
    if (required.every(k => typeof parsed[k] === 'string' && (parsed[k] as string).length > 0)) return parsed as T;
    return null;
  } catch { return null; }
}

const NOT_APPROVED = (what: string, verb: string) =>
  `${what} was NOT approved by Luka. Do not ${verb} it. Tell him plainly that you need his go-ahead first — never retry it without asking again.`;

/** Parse a JSON payload where repo (string) and number (number or numeric
 *  string) are both required — PR-referencing tools. */
function parsePrRef(raw: string): { repo: string; number: number; rest: Record<string, unknown> } | null {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const repo = parsed.repo;
    const num = typeof parsed.number === 'number' ? parsed.number : Number(parsed.number);
    if (typeof repo !== 'string' || repo.length === 0 || !Number.isInteger(num) || num <= 0) return null;
    return { repo, number: num, rest: parsed };
  } catch { return null; }
}

function catalogEntry(id: string): ToolCatalogEntry {
  const entry = TOOL_CATALOG.find(t => t.id === id);
  if (!entry) throw new Error(`toolRegistry: no catalog entry for '${id}'`);
  return entry;
}

export const TOOL_RUNTIMES: ToolRuntime[] = [
  {
    ...catalogEntry('search'),
    available: () => tavilyConfigured(),
    run: async (raw) => {
      const query = raw.trim();
      const results = await tavilySearch(query, { maxResults: 4, depth: 'basic' });
      return results.length > 0 ? formatTavilyResults(results, query) : `No search results found for "${query}".`;
    },
    // No onError: a failed search aborts the round, matching historical behavior.
  },
  {
    ...catalogEntry('fetch'),
    available: () => true,
    run: async (raw) => {
      const url = raw.trim();
      const result = await browseFetch(url);
      return formatBrowseResult(result, url);
    },
  },
  {
    ...catalogEntry('exec'),
    available: () => isAxeApiConfigured,
    run: async (raw, ctx) => {
      const command = raw.trim();
      logMessage('info', 'exec-debug', `awaiting approval: ${command}`, {}).catch(() => {});
      const approved = await ctx.requestApproval('exec', 'AXE wants to run this on the VPS', command);
      logMessage('info', 'exec-debug', `approval resolved: ${approved}`, { command }).catch(() => {});
      if (!approved) return NOT_APPROVED(`EXEC "${command}"`, 'run');
      logMessage('info', 'exec-debug', 'calling execCommand now', { command }).catch(() => {});
      const r = await execCommand(command);
      logMessage('info', 'exec-debug', 'execCommand returned', { command, exit_code: r.exit_code, timed_out: r.timed_out }).catch(() => {});
      return `EXEC "${r.command}" -> exit ${r.exit_code}${r.timed_out ? ' (timed out)' : ''}\nstdout:\n${r.stdout || '(empty)'}\nstderr:\n${r.stderr || '(empty)'}`;
    },
    onError: (msg) => `EXEC failed to reach the VPS: ${msg}`,
  },
  {
    ...catalogEntry('git_read'),
    available: () => isAxeApiConfigured,
    // Reading a file isn't destructive — no approval gate, same as SEARCH/FETCH.
    run: async (raw) => {
      const args = parseJsonArgs<GitReadArgs>(raw, ['repo', 'path']);
      if (!args) return 'GIT_READ failed: malformed arguments — need {"repo":"owner/name","path":"..."}.';
      const file = await ghGetFile(args.repo, args.path, args.branch || 'orchestrator');
      return `GIT_READ ${args.repo}/${args.path}:\n${file.content}`;
    },
    onError: (msg) => `GitHub call failed: ${msg}`,
  },
  {
    ...catalogEntry('git_write'),
    available: () => isAxeApiConfigured,
    run: async (raw, ctx) => {
      const args = parseJsonArgs<GitWriteArgs>(raw, ['repo', 'path', 'content', 'message']);
      if (!args) return 'GIT_WRITE failed: malformed arguments — need {"repo","path","content","message"}.';
      const branch = args.branch || 'orchestrator';
      // Self-repo production guard: AXE never commits straight to its own
      // production branch — that path is branch -> PR -> Luka-approved merge.
      // Enforced here (not just in the prompt) so a misworded tool call can't
      // slip a direct production commit past the loop.
      if (args.repo === AXE_SELF_REPO && branch === AXE_SELF_REPO_PROD_BRANCH) {
        return `GIT_WRITE rejected: "${AXE_SELF_REPO_PROD_BRANCH}" is the production branch of your own repo (${AXE_SELF_REPO}). Use the change loop instead: [GIT_BRANCH:] a branch named axe/<slug>, commit there with [GIT_WRITE:], then open a [GIT_PR:] for Luka to review and approve merging.`;
      }
      const title = `AXE wants to commit to ${args.repo}`;
      const detail = `${args.path}  (${branch})\n"${args.message}"\n\n${args.content}`;
      const approved = await ctx.requestApproval('git_write', title, detail);
      if (!approved) return NOT_APPROVED(`GIT_WRITE to "${args.path}"`, 'commit');
      const r = await ghUpdateFile(args.repo, args.path, args.content, args.message, branch);
      return `GIT_WRITE committed -> ${args.repo}/${args.path} (${r.sha.slice(0, 7)}) on ${branch}`;
    },
    onError: (msg) => `GitHub call failed: ${msg}`,
  },
  {
    ...catalogEntry('git_branch'),
    available: () => isAxeApiConfigured,
    // Creating a branch is harmless until something merges — no gate.
    run: async (raw) => {
      const args = parseJsonArgs<GitBranchArgs>(raw, ['repo', 'branch']);
      if (!args) return 'GIT_BRANCH failed: malformed arguments — need {"repo":"owner/name","branch":"axe/slug"}.';
      const r = await ghCreateBranch(args.repo, args.branch, args.from || 'orchestrator');
      return `GIT_BRANCH created -> ${args.repo}@${r.branch} (from ${r.from} @ ${r.sha.slice(0, 7)})`;
    },
    onError: (msg) => `GitHub call failed: ${msg}`,
  },
  {
    ...catalogEntry('git_pr'),
    available: () => isAxeApiConfigured,
    // The PR is the reviewable artifact — nothing lands until it's merged,
    // so opening one is not gated.
    run: async (raw) => {
      const args = parseJsonArgs<GitPrArgs>(raw, ['repo', 'title', 'head']);
      if (!args) return 'GIT_PR failed: malformed arguments — need {"repo","title","head"} (body/base optional).';
      const r = await ghCreatePr(args.repo, args.title, args.body || '', args.head, args.base || 'orchestrator');
      return `GIT_PR opened -> #${r.number} ${r.pr_url}\nGive Luka this URL. Vercel will build a preview for it — check [VERCEL_STATUS] to find the preview deployment.`;
    },
    onError: (msg) => `GitHub call failed: ${msg}`,
  },
  {
    ...catalogEntry('git_pr_status'),
    available: () => isAxeApiConfigured,
    run: async (raw) => {
      const ref = parsePrRef(raw);
      if (!ref) return 'GIT_PR_STATUS failed: malformed arguments — need {"repo":"owner/name","number":123}.';
      const pr = await ghGetPr(ref.repo, ref.number);
      return `GIT_PR_STATUS #${pr.number} "${pr.title}" -> state:${pr.state} merged:${pr.merged} mergeable:${pr.mergeable ?? 'unknown'} (${pr.mergeable_state ?? '?'})\n${pr.head} -> ${pr.base}\n${pr.html_url}`;
    },
    onError: (msg) => `GitHub call failed: ${msg}`,
  },
  {
    ...catalogEntry('git_pr_merge'),
    available: () => isAxeApiConfigured,
    // Merging makes a change real (and deploys production on the self repo) —
    // gated exactly like EXEC/GIT_WRITE.
    run: async (raw, ctx) => {
      const ref = parsePrRef(raw);
      if (!ref) return 'GIT_PR_MERGE failed: malformed arguments — need {"repo":"owner/name","number":123}.';
      const method = (typeof ref.rest.method === 'string' && ['merge', 'squash', 'rebase'].includes(ref.rest.method) ? ref.rest.method : 'merge') as 'merge' | 'squash' | 'rebase';
      const approved = await ctx.requestApproval('git_pr_merge', `AXE wants to merge PR #${ref.number} in ${ref.repo}`, `Merge method: ${method}\nThis makes the change real${ref.repo === AXE_SELF_REPO ? ' and deploys production' : ''}.`);
      if (!approved) return NOT_APPROVED(`GIT_PR_MERGE of #${ref.number}`, 'merge');
      const r = await ghMergePr(ref.repo, ref.number, method);
      return r.merged
        ? `GIT_PR_MERGE succeeded -> #${ref.number} merged (${(r.sha ?? '').slice(0, 7)}).`
        : `GIT_PR_MERGE did NOT merge -> ${r.message ?? 'no reason given by GitHub'}. Check [GIT_PR_STATUS:] and say so plainly.`;
    },
    onError: (msg) => `GitHub call failed: ${msg}`,
  },
  {
    ...catalogEntry('db_read'),
    available: () => isAxeApiConfigured,
    // Structured read via the REST route — no arbitrary SQL, no approval
    // gate, same tier as GIT_READ/SEARCH/FETCH.
    run: async (raw) => {
      const args = parseJsonArgs<DbReadArgs>(raw, ['table']);
      if (!args) return 'DB_READ failed: malformed arguments — need {"table":"...","limit":50}.';
      const rows = await sbGetRows(args.table, { limit: args.limit || 50 });
      return `DB_READ ${args.table} (${rows.length} rows):\n${JSON.stringify(rows, null, 2).slice(0, 4000)}`;
    },
    onError: (msg) => `Supabase call failed: ${msg}`,
  },
  {
    ...catalogEntry('db_sql'),
    available: () => isAxeApiConfigured,
    // Arbitrary SQL can mutate — always gated, no exceptions, even for
    // what looks like a plain SELECT. Same contract as EXEC/GIT_WRITE.
    run: async (raw, ctx) => {
      const args = parseJsonArgs<DbSqlArgs>(raw, ['query']);
      if (!args) return 'DB_SQL failed: malformed arguments — need {"query":"select ..."}.';
      const approved = await ctx.requestApproval('db_sql', 'AXE wants to run this SQL on Supabase', args.query);
      if (!approved) return NOT_APPROVED('DB_SQL', 'run');
      const rows = await sbRunSql(args.query);
      return `DB_SQL result (${Array.isArray(rows) ? rows.length : '?'} rows):\n${JSON.stringify(rows, null, 2).slice(0, 4000)}`;
    },
    onError: (msg) => `Supabase call failed: ${msg}`,
  },
  {
    ...catalogEntry('vercel_status'),
    available: () => isAxeApiConfigured,
    // Read-only, no gate — same tier as GIT_READ/DB_READ.
    run: async () => {
      const deployments = await vercelListDeployments(10);
      return deployments.length === 0
        ? 'VERCEL_STATUS: no deployments returned (check VERCEL_TOKEN/VERCEL_PROJECT_ID are configured on the VPS).'
        : `VERCEL_STATUS (${deployments.length} most recent):\n${deployments.map(d => `- ${d.state} · ${d.target || 'preview'} · ${d.commitSha || '?'} · "${d.commitMessage || ''}" · ${d.url}`).join('\n')}`;
    },
    onError: (msg) => `Vercel call failed: ${msg}`,
  },
  {
    ...catalogEntry('vercel_promote'),
    available: () => isAxeApiConfigured,
    // Re-points production traffic — gated exactly like EXEC/GIT_WRITE,
    // even though it doesn't trigger a new build.
    run: async (raw, ctx) => {
      const args = parseJsonArgs<VercelPromoteArgs>(raw, ['deploymentId']);
      if (!args) return 'VERCEL_PROMOTE failed: malformed arguments — need {"deploymentId":"..."}.';
      const approved = await ctx.requestApproval('vercel_promote', 'AXE wants to promote this deployment to production', args.deploymentId);
      if (!approved) return NOT_APPROVED('VERCEL_PROMOTE', 'promote');
      const r = await vercelPromote(args.deploymentId);
      return `VERCEL_PROMOTE ${r.promoted ? 'succeeded' : 'failed'} -> ${r.deployment_id} is now production.`;
    },
    onError: (msg) => `Vercel call failed: ${msg}`,
  },
];
