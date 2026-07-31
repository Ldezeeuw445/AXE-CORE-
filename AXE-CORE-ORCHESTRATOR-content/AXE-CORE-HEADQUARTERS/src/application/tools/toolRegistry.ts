/**
 * Tool registry — binds every entry of the domain tool catalog to its real executor.
 */
import {
  TOOL_CATALOG,
  AXE_SELF_REPO,
  AXE_SELF_REPO_PROD_BRANCH,
  AGENT_TOOLS,
  type AgentTool,
  type ApprovalKind,
  type ToolCatalogEntry,
} from '@/domain/tools/toolCatalog';
import '@/domain/tools/registerSmartThingsCatalog';
import '@/domain/tools/registerIncomeCatalog';
import '@/domain/tools/registerRingCatalog';
import '@/domain/tools/registerHabitCatalog';
import '@/domain/tools/registerBrowserAgentCatalog';
import { tavilySearch, tavilyConfigured, formatTavilyResults } from '@/infrastructure/gateways/tavilyService';
import { browseFetch, formatBrowseResult } from '@/infrastructure/gateways/browserFetchService';
import {
  isAxeApiConfigured, execCommand, ghGetFile, ghUpdateFile,
  ghCreateBranch, ghCreatePr, ghGetPr, ghMergePr,
  sbGetRows, sbRunSql, vercelListDeployments, vercelPromote,
  osintAll, osintLayer, crewRun,
  apiExecuteOpenHands, apiExecuteOpenJarvis, apiExecuteOpenClaw, apiExecuteKiloCode,
} from '@/infrastructure/gateways/axeCoreApiService';
import { buildGlobalMemoryContext } from '@/infrastructure/persistence/globalMemoryService';
import { writeReflection } from '@/infrastructure/persistence/reflectionService';
import { AXE_USER_ID } from '@/infrastructure/persistence/chatPersistence';
import { ECOSYSTEM_CONTEXT } from '@/domain/prompts';

const AGENT_EXECUTORS: Record<AgentTool, (p: { task: string; context?: string }) => Promise<unknown>> = {
  openhands: apiExecuteOpenHands,
  openjarvis: apiExecuteOpenJarvis,
  openclaw: apiExecuteOpenClaw,
  kilocode: apiExecuteKiloCode,
};
import { multiMonitorAvailable, openPageOnMonitor, OPENABLE_PAGES } from '@/infrastructure/gateways/windowManagerService';
import { OBSIDIAN_TOOL_RUNTIMES } from '@/application/tools/toolRegistry.obsidian';
import { SMARTTHINGS_TOOL_RUNTIMES } from '@/application/tools/toolRegistry.smartthings';
import { INCOME_TOOL_RUNTIMES } from '@/application/tools/toolRegistry.income';
import { RING_TOOL_RUNTIMES } from '@/application/tools/toolRegistry.ring';
import { HABIT_TOOL_RUNTIMES } from '@/application/tools/toolRegistry.habit';
import { BROWSER_AGENT_TOOL_RUNTIMES } from '@/application/tools/toolRegistry.browser';

export interface ToolRunCtx {
  requestApproval: (kind: ApprovalKind, title: string, detail: string) => Promise<boolean>;
}

export interface ToolRuntime extends ToolCatalogEntry {
  available: () => boolean;
  run: (raw: string, ctx: ToolRunCtx) => Promise<string>;
  onError?: (msg: string) => string;
}

interface GitReadArgs { repo: string; path: string; branch?: string; [key: string]: unknown }
interface GitWriteArgs { repo: string; path: string; content: string; message: string; branch?: string; [key: string]: unknown }
interface GitBranchArgs { repo: string; branch: string; from?: string; [key: string]: unknown }
interface GitPrArgs { repo: string; title: string; head: string; body?: string; base?: string; [key: string]: unknown }
interface DbReadArgs { table: string; limit?: number; [key: string]: unknown }
interface DbSqlArgs { query: string; [key: string]: unknown }
interface VercelPromoteArgs { deploymentId: string; [key: string]: unknown }

function parseJsonArgs<T extends Record<string, unknown>>(raw: string, required: (keyof T)[]): T | null {
  try {
    const parsed = JSON.parse(raw) as Partial<T>;
    if (required.every(k => typeof parsed[k] === 'string' && (parsed[k] as string).length > 0)) return parsed as T;
    return null;
  } catch { return null; }
}

const NOT_APPROVED = (what: string, verb: string) =>
  `${what} was NOT approved by Luka. Do not ${verb} it. Tell him plainly that you need his go-ahead first — never retry it without asking again.`;

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

/** Prefetch up to 3 URLs found in a task string for research crews. */
async function prefetchUrlsForIntel(task: string): Promise<string> {
  const urls = Array.from(new Set(task.match(/https?:\/\/[^\s)"'<>]+/gi) ?? [])).slice(0, 3);
  if (!urls.length) return '';
  const blocks: string[] = ['## Prefetched page intel (real fetch — do not invent APIs beyond these findings)'];
  for (const url of urls) {
    try {
      const result = await browseFetch(url);
      blocks.push(formatBrowseResult(result, url));
    } catch (e) {
      blocks.push(`## Failed fetch: ${url}\n${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return blocks.join('\n\n');
}

export const TOOL_RUNTIMES: ToolRuntime[] = [
  {
    ...catalogEntry('search'),
    available: () => tavilyConfigured(),
    run: async (raw) => {
      const query = raw.trim();
      const results = await tavilySearch(query, { maxResults: 5, depth: 'advanced' });
      return results.length > 0 ? formatTavilyResults(results, query) : `No search results found for "${query}".`;
    },
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
      const approved = await ctx.requestApproval('exec', 'AXE wants to run this on the VPS', command);
      if (!approved) return NOT_APPROVED(`EXEC "${command}"`, 'run');
      const r = await execCommand(command);
      return `EXEC "${r.command}" -> exit ${r.exit_code}${r.timed_out ? ' (timed out)' : ''}\nstdout:\n${r.stdout || '(empty)'}\nstderr:\n${r.stderr || '(empty)'}`;
    },
    onError: (msg) => `EXEC failed to reach the VPS: ${msg}`,
  },
  {
    ...catalogEntry('git_read'),
    available: () => isAxeApiConfigured,
    run: async (raw) => {
      const args = parseJsonArgs<GitReadArgs>(raw, ['repo', 'path']);
      if (!args) return 'GIT_READ failed: malformed arguments.';
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
      if (!args) return 'GIT_WRITE failed: malformed arguments.';
      const branch = args.branch || 'orchestrator';
      if (args.repo === AXE_SELF_REPO && branch === AXE_SELF_REPO_PROD_BRANCH) {
        return `GIT_WRITE rejected: use a branch + PR, not ${AXE_SELF_REPO_PROD_BRANCH}.`;
      }
      const approved = await ctx.requestApproval('git_write', `AXE wants to commit to ${args.repo}`, `${args.path}\n${args.message}`);
      if (!approved) return NOT_APPROVED(`GIT_WRITE to "${args.path}"`, 'commit');
      const r = await ghUpdateFile(args.repo, args.path, args.content, args.message, branch);
      return `GIT_WRITE committed -> ${args.repo}/${args.path} (${r.sha.slice(0, 7)}) on ${branch}`;
    },
    onError: (msg) => `GitHub call failed: ${msg}`,
  },
  {
    ...catalogEntry('git_branch'),
    available: () => isAxeApiConfigured,
    run: async (raw) => {
      const args = parseJsonArgs<GitBranchArgs>(raw, ['repo', 'branch']);
      if (!args) return 'GIT_BRANCH failed.';
      const r = await ghCreateBranch(args.repo, args.branch, args.from || 'orchestrator');
      return `GIT_BRANCH created -> ${args.repo}@${r.branch}`;
    },
    onError: (msg) => `GitHub call failed: ${msg}`,
  },
  {
    ...catalogEntry('git_pr'),
    available: () => isAxeApiConfigured,
    run: async (raw) => {
      const args = parseJsonArgs<GitPrArgs>(raw, ['repo', 'title', 'head']);
      if (!args) return 'GIT_PR failed.';
      const r = await ghCreatePr(args.repo, args.title, args.body || '', args.head, args.base || 'orchestrator');
      return `GIT_PR opened -> #${r.number} ${r.pr_url}`;
    },
    onError: (msg) => `GitHub call failed: ${msg}`,
  },
  {
    ...catalogEntry('git_pr_status'),
    available: () => isAxeApiConfigured,
    run: async (raw) => {
      const ref = parsePrRef(raw);
      if (!ref) return 'GIT_PR_STATUS failed.';
      const pr = await ghGetPr(ref.repo, ref.number);
      return `GIT_PR_STATUS #${pr.number} state:${pr.state} merged:${pr.merged}`;
    },
    onError: (msg) => `GitHub call failed: ${msg}`,
  },
  {
    ...catalogEntry('git_pr_merge'),
    available: () => isAxeApiConfigured,
    run: async (raw, ctx) => {
      const ref = parsePrRef(raw);
      if (!ref) return 'GIT_PR_MERGE failed.';
      const method = 'merge' as const;
      const approved = await ctx.requestApproval('git_pr_merge', `Merge PR #${ref.number}`, ref.repo);
      if (!approved) return NOT_APPROVED(`GIT_PR_MERGE of #${ref.number}`, 'merge');
      const r = await ghMergePr(ref.repo, ref.number, method);
      return r.merged ? `GIT_PR_MERGE succeeded` : `GIT_PR_MERGE did not merge`;
    },
    onError: (msg) => `GitHub call failed: ${msg}`,
  },
  {
    ...catalogEntry('osint'),
    available: () => isAxeApiConfigured,
    run: async (raw) => {
      const layer = raw.trim();
      if (layer) {
        const r = await osintLayer(layer);
        return `OSINT ${layer}: ${r.status}, ${r.count} items`;
      }
      const all = await osintAll();
      return `OSINT all:\n${Object.entries(all).map(([n, r]) => `- ${n}: ${r.status}`).join('\n')}`;
    },
    onError: (msg) => `OSINT call failed: ${msg}`,
  },
  {
    ...catalogEntry('agent'),
    available: () => isAxeApiConfigured,
    run: async (raw, ctx) => {
      let tool = ''; let task = '';
      try {
        const parsed = JSON.parse(raw) as { tool?: string; task?: string };
        tool = (parsed.tool || '').toLowerCase();
        task = (parsed.task || '').trim();
      } catch { /* */ }
      if (!task || !(AGENT_TOOLS as readonly string[]).includes(tool)) {
        return `AGENT failed: need tool one of ${AGENT_TOOLS.join('|')}`;
      }
      const approved = await ctx.requestApproval('agent', `Hand to ${tool}`, task);
      if (!approved) return NOT_APPROVED(`AGENT ${tool}`, 'run');
      const memoryContext = await buildGlobalMemoryContext(AXE_USER_ID, task, 800).catch(() => '');
      const pageIntel = await prefetchUrlsForIntel(task).catch(() => '');
      const result = await AGENT_EXECUTORS[tool as AgentTool]({
        task,
        context: `${ECOSYSTEM_CONTEXT}${memoryContext ? `\n\n${memoryContext}` : ''}${pageIntel ? `\n\n${pageIntel}` : ''}`,
      });
      void writeReflection({ title: `AGENT ${tool}: ${task.slice(0, 60)}`, whatHappened: JSON.stringify(result).slice(0, 500), outcome: 'completed', category: `agent_${tool}` });
      return `AGENT ${tool} ->\n${JSON.stringify(result).slice(0, 6000)}`;
    },
    onError: (msg) => `Agent call failed: ${msg}`,
  },
  {
    ...catalogEntry('crew'),
    available: () => isAxeApiConfigured,
    run: async (raw) => {
      let task = '';
      try {
        const parsed = JSON.parse(raw) as { task?: string };
        task = parsed.task || '';
      } catch { /* */ }
      if (!task) return 'CREW failed: need task';
      const memoryContext = await buildGlobalMemoryContext(AXE_USER_ID, task, 800).catch(() => '');
      // Research boost: scrape any URLs in the task + extract APIs/scripts before the crew runs
      const pageIntel = await prefetchUrlsForIntel(task).catch(() => '');
      const researchHint =
        '\n\n## Research directives\n' +
        '- Prefer real evidence from prefetched pages and search.\n' +
        '- Report detected API endpoints, script CDNs, and data sources explicitly.\n' +
        '- If a site\'s data source is unclear, say so — never invent endpoints.\n' +
        '- Structure intel: product, pricing signals, tech stack, APIs, competitors, risks.';
      const res = await crewRun({
        task,
        context: `${ECOSYSTEM_CONTEXT}${memoryContext ? `\n\n${memoryContext}` : ''}${pageIntel ? `\n\n${pageIntel}` : ''}${researchHint}`,
      });
      void writeReflection({
        title: `CREW: ${task.slice(0, 60)}`,
        whatHappened: res.result?.slice(0, 500) ?? `Failed: ${res.error}`,
        outcome: res.result ? 'completed' : 'failed',
        category: 'crew',
      });
      return res.result ? `CREW:\n${res.result.slice(0, 6000)}` : `CREW failed: ${res.error}`;
    },
    onError: (msg) => `CREW call failed: ${msg}`,
  },
  {
    ...catalogEntry('db_read'),
    available: () => isAxeApiConfigured,
    run: async (raw) => {
      const args = parseJsonArgs<DbReadArgs>(raw, ['table']);
      if (!args) return 'DB_READ failed.';
      const rows = await sbGetRows(args.table, { limit: args.limit || 50 });
      return `DB_READ ${args.table}:\n${JSON.stringify(rows).slice(0, 4000)}`;
    },
    onError: (msg) => `Supabase call failed: ${msg}`,
  },
  {
    ...catalogEntry('db_sql'),
    available: () => isAxeApiConfigured,
    run: async (raw, ctx) => {
      const args = parseJsonArgs<DbSqlArgs>(raw, ['query']);
      if (!args) return 'DB_SQL failed.';
      const approved = await ctx.requestApproval('db_sql', 'Run SQL', args.query);
      if (!approved) return NOT_APPROVED('DB_SQL', 'run');
      const rows = await sbRunSql(args.query);
      return `DB_SQL:\n${JSON.stringify(rows).slice(0, 4000)}`;
    },
    onError: (msg) => `Supabase call failed: ${msg}`,
  },
  {
    ...catalogEntry('vercel_status'),
    available: () => isAxeApiConfigured,
    run: async () => {
      const deployments = await vercelListDeployments(10);
      return `VERCEL_STATUS:\n${deployments.map(d => `- ${d.state} ${d.url}`).join('\n')}`;
    },
    onError: (msg) => `Vercel call failed: ${msg}`,
  },
  {
    ...catalogEntry('vercel_promote'),
    available: () => isAxeApiConfigured,
    run: async (raw, ctx) => {
      const args = parseJsonArgs<VercelPromoteArgs>(raw, ['deploymentId']);
      if (!args) return 'VERCEL_PROMOTE failed.';
      const approved = await ctx.requestApproval('vercel_promote', 'Promote deployment', args.deploymentId);
      if (!approved) return NOT_APPROVED('VERCEL_PROMOTE', 'promote');
      const r = await vercelPromote(args.deploymentId);
      return `VERCEL_PROMOTE ${r.promoted ? 'ok' : 'failed'}`;
    },
    onError: (msg) => `Vercel call failed: ${msg}`,
  },
  {
    ...catalogEntry('open_window'),
    available: () => multiMonitorAvailable(),
    run: async (raw) => {
      const parsed = JSON.parse(raw) as { page?: string; monitor?: number };
      const page = parsed.page;
      const monitor = Number(parsed.monitor ?? 0);
      if (!page) return `OPEN_WINDOW failed. Valid: ${OPENABLE_PAGES.join(', ')}`;
      const { monitor: m } = await openPageOnMonitor(page, monitor);
      return `OPEN_WINDOW opened "${page}" on ${m.name}`;
    },
    onError: (msg) => `OPEN_WINDOW failed: ${msg}`,
  },
  ...OBSIDIAN_TOOL_RUNTIMES as ToolRuntime[],
  ...SMARTTHINGS_TOOL_RUNTIMES as ToolRuntime[],
  ...INCOME_TOOL_RUNTIMES as ToolRuntime[],
  ...RING_TOOL_RUNTIMES as ToolRuntime[],
  ...HABIT_TOOL_RUNTIMES as ToolRuntime[],
  ...BROWSER_AGENT_TOOL_RUNTIMES as ToolRuntime[],
];
