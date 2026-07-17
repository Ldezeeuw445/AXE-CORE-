/**
 * Client for the real project file-system API served by api-server
 * (artifacts/api-server/src/routes/files.ts). Backs the Code Editor's file
 * tree, so it reads and writes actual files in this repo instead of an
 * in-memory scratch list.
 */
import { getSupabase } from '@/lib/supabaseClient';

export interface WorkspaceTreeNode {
  path: string;
  name: string;
  type: 'file' | 'folder';
}

async function authHeaders(): Promise<HeadersInit> {
  const sb = getSupabase();
  const token = (await sb?.auth.getSession())?.data.session?.access_token;
  if (!token) throw new Error('Not signed in');
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api/files${path}`, {
    method,
    headers: await authHeaders(),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
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
