/**
 * Client for the real workspace file API on the VPS (axe_api /files/*), backing
 * the Code Editor's file tree — it reads and writes actual files under the
 * VPS WORKSPACE_DIR. Calls go through the axecore proxy, which injects the
 * server-side bearer key (no Supabase token needed, no CORS). This replaced
 * the old /api/files target that was never deployed, so the editor 404'd.
 */
import { axeCoreApiUrl, axeCoreApiExtraHeaders } from '@/infrastructure/config/apiUrl';

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

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}/files${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...axeCoreApiExtraHeaders() },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { error?: string }).error ?? `Request failed (${res.status})`);
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
