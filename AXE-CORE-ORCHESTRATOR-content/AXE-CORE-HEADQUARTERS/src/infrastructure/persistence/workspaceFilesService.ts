/**
 * Client for the real workspace file API on the VPS (axe_api /files/*), backing
 * the Code Editor's file tree — it reads and writes actual files under the
 * VPS WORKSPACE_DIR. Calls go through the axecore proxy, which injects the
 * server-side bearer key (no Supabase token needed, no CORS). This replaced
 * the old /api/files target that was never deployed, so the editor 404'd.
 */
import { axeCoreApiUrl, axeCoreApiExtraHeaders } from '@/infrastructure/config/apiUrl';
import { execCommand } from '@/infrastructure/gateways/axeCoreApiService';
import { agentBasis } from '@/infrastructure/config/agentHost';

export interface WorkspaceTreeNode {
  path: string;
  name: string;
  type: 'file' | 'folder';
}

// axeCoreApiUrl() only rewrites this to a direct api.axecompanion.com call
// inside a PACKAGED Tauri app (see axeCoreApiService.ts for the full
// rationale) — a bare relative '/api/proxy/axecore' had no server behind it
// in that build, so every file-tree load silently 404'd into the SPA's own
// index.html fallback, which then failed to parse as JSON and crashed the
// tree with "undefined is not an object" the moment something tried to
// .map() over the (nonexistent) node list.
const BASE = axeCoreApiUrl('/proxy/axecore', '/api/proxy/axecore').replace(/\/$/, '');

/**
 * Dezelfde machine als de code-agent.
 *
 * De bestanden stonden vast op de VPS (`/opt/axe-workspace`) terwijl de agent
 * via agentBasis op deze Mac in de echte checkout bewerkte: je keek naar de ene
 * boom en de agent veranderde de andere. Nu volgen ze allebei dezelfde keuze
 * (auto / deze Mac / VPS in de Code Editor). Zie config/agentHost.ts.
 */
export async function editorBasis(): Promise<string> {
  return agentBasis(BASE).catch(() => BASE);
}

/**
 * In welke repo de editor werkt. Leeg = de werkmap van de host.
 *
 * Een NAAM uit AGENT_REPOS, geen pad: de host zoekt het pad op in dezelfde
 * whitelist als de code-agents (zie _werkmap in backend/axe_api/main.py). Zo
 * kijk je in de boom altijd naar de checkout waar de agent ook in schrijft.
 */
let editorRepo = '';
export function zetEditorRepo(naam: string): void { editorRepo = naam.trim(); }

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${await editorBasis()}/files${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...axeCoreApiExtraHeaders(),
      ...(editorRepo ? { 'X-AXE-Repo': editorRepo } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const j = json as { error?: string; detail?: string };
    throw new Error(j.error ?? j.detail ?? `Request failed (${res.status})`);
  }
  return json as T;
}

export async function listWorkspaceDirectory(path: string): Promise<WorkspaceTreeNode[]> {
  const { nodes } = await call<{ nodes: WorkspaceTreeNode[] }>('GET', `/tree?path=${encodeURIComponent(path)}`);
  return nodes;
}

export async function readWorkspaceFile(path: string): Promise<string> {
  const { content } = await call<{ content: string }>('GET', `/read?path=${encodeURIComponent(path)}`);
  return content;
}

export async function writeWorkspaceFile(path: string, content: string): Promise<void> {
  await call('PUT', '/write', { path, content });
}

export async function createWorkspaceEntry(path: string, type: 'file' | 'folder'): Promise<void> {
  await call('POST', '/create', { path, type });
}

export async function deleteWorkspaceEntry(path: string): Promise<void> {
  await call('DELETE', `/delete?path=${encodeURIComponent(path)}`);
}

/**
 * Move / rename a file or folder inside the workspace.
 * Tries POST /files/move first; falls back to VPS shell `mv` via execCommand.
 */
export async function moveWorkspaceEntry(from: string, to: string): Promise<void> {
  if (!from || !to || from === to) return;
  // Prevent dropping a folder into itself
  if (to === from || to.startsWith(from + '/')) {
    throw new Error('Cannot move a folder into itself');
  }
  try {
    // from_path/to_path is wat de API leest (FileMove). Dit stuurde {from, to},
    // dus /move faalde altijd en elke verplaatsing liep via `mv` op de VPS --
    // ook als je op deze Mac werkte.
    await call('POST', '/move', { from_path: from, to_path: to });
    return;
  } catch (e) {
    // In een gekozen repo nooit terugvallen op een shell elders: die kent die
    // repo niet, en dan verplaats je iets in een andere boom.
    if (editorRepo) throw e;
  }
  const q = (p: string) => `'${p.replace(/'/g, `'"'"'`)}'`;
  const result = await execCommand(`mv -- ${q(from)} ${q(to)}`, 15);
  if (result.exit_code !== 0) {
    throw new Error(result.stderr || result.stdout || `mv failed (exit ${result.exit_code})`);
  }
}

/* ─── Workspace search (ripgrep via api-server) ─────────────────────────── */
export interface SearchResult {
  file: string;   // repo-relative path
  line: number;
  col: number;
  text: string;   // matching line content
}

export async function searchWorkspace(
  query: string,
  opts: { glob?: string; maxResults?: number; caseSensitive?: boolean } = {},
): Promise<SearchResult[]> {
  const { results } = await call<{ results: SearchResult[] }>('POST', '/search', {
    query,
    glob:          opts.glob,
    maxResults:    opts.maxResults ?? 100,
    caseSensitive: opts.caseSensitive ?? false,
  });
  return results;
}
