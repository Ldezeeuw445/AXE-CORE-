/**
 * axeCoreApiService.ts
 * Frontend client for the AXE Core API (VPS micro-service).
 * Gives AXE CORE privileged access to Supabase, n8n, and GitHub.
 *
 * Configure via Vercel env vars:
 *   VITE_AXE_CORE_API_URL = https://api.axecompanion.com
 *   VITE_AXE_CORE_API_KEY = <your secret key>
 */

const BASE_URL = (import.meta.env.VITE_AXE_CORE_API_URL ?? '').replace(/\/$/, '');
const API_KEY  = import.meta.env.VITE_AXE_CORE_API_KEY ?? '';

export const isAxeApiConfigured = !!BASE_URL && !!API_KEY;

async function call<T = unknown>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  if (!isAxeApiConfigured) {
    throw new Error('AXE Core API not configured. Set VITE_AXE_CORE_API_URL and VITE_AXE_CORE_API_KEY in Vercel.');
  }
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(`AXE API ${res.status}: ${err.detail ?? res.statusText}`);
  }
  return res.json();
}

// ── Health ────────────────────────────────────────────────────────────────────
export async function checkAxeApi(): Promise<{
  status: string;
  supabase: boolean;
  n8n: boolean;
  github: boolean;
}> {
  return call('GET', '/health');
}

// ══════════════════════════════════════════════════════════════════════════════
// SUPABASE
// ══════════════════════════════════════════════════════════════════════════════

export interface TableRow extends Record<string, unknown> {
  id?: string;
}

export async function sbListTables(): Promise<Array<{ table_name: string; row_count: number }>> {
  return call('GET', '/supabase/tables');
}

export async function sbRunSql(sql: string): Promise<unknown[]> {
  return call('POST', '/supabase/sql', { sql });
}

export async function sbGetRows(
  table: string,
  opts: { limit?: number; offset?: number; orderBy?: string; orderDir?: 'asc' | 'desc'; filterCol?: string; filterVal?: string } = {},
): Promise<TableRow[]> {
  const params = new URLSearchParams();
  if (opts.limit)     params.set('limit', String(opts.limit));
  if (opts.offset)    params.set('offset', String(opts.offset));
  if (opts.orderBy)   params.set('order_by', opts.orderBy);
  if (opts.orderDir)  params.set('order_dir', opts.orderDir);
  if (opts.filterCol) params.set('filter_col', opts.filterCol);
  if (opts.filterVal) params.set('filter_val', opts.filterVal);
  const qs = params.toString();
  return call('GET', `/supabase/table/${table}${qs ? `?${qs}` : ''}`);
}

export async function sbInsertRow(table: string, data: Record<string, unknown>): Promise<TableRow[]> {
  return call('POST', `/supabase/table/${table}`, { data });
}

export async function sbUpdateRow(table: string, id: string, data: Record<string, unknown>): Promise<TableRow[]> {
  return call('PATCH', `/supabase/table/${table}/${id}`, { data });
}

export async function sbDeleteRow(table: string, id: string): Promise<{ deleted: boolean }> {
  return call('DELETE', `/supabase/table/${table}/${id}`);
}

// ══════════════════════════════════════════════════════════════════════════════
// N8N
// ══════════════════════════════════════════════════════════════════════════════

export interface N8nWorkflow {
  id: string;
  name: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  nodes?: unknown[];
  tags?: Array<{ id: string; name: string }>;
}

export async function n8nListWorkflows(): Promise<N8nWorkflow[]> {
  return call('GET', '/n8n/workflows');
}

export async function n8nGetWorkflow(id: string): Promise<N8nWorkflow> {
  return call('GET', `/n8n/workflows/${id}`);
}

export async function n8nUpdateWorkflow(id: string, payload: Partial<N8nWorkflow>): Promise<N8nWorkflow> {
  return call('PUT', `/n8n/workflows/${id}`, payload);
}

export async function n8nActivate(id: string): Promise<unknown> {
  return call('POST', `/n8n/workflows/${id}/activate`);
}

export async function n8nDeactivate(id: string): Promise<unknown> {
  return call('POST', `/n8n/workflows/${id}/deactivate`);
}

export async function n8nExecute(id: string): Promise<unknown> {
  return call('POST', `/n8n/workflows/${id}/execute`);
}

export async function n8nListExecutions(wfId?: string): Promise<unknown[]> {
  const qs = wfId ? `?wf_id=${wfId}` : '';
  return call('GET', `/n8n/executions${qs}`);
}

// ══════════════════════════════════════════════════════════════════════════════
// GITHUB
// ══════════════════════════════════════════════════════════════════════════════

export async function ghListRepos(): Promise<Array<{ name: string; full_name: string; default_branch: string; updated_at: string }>> {
  return call('GET', '/github/repos');
}

export async function ghGetFile(repo: string, path: string, branch = 'main'): Promise<{ path: string; content: string; sha: string }> {
  return call('GET', `/github/file?repo=${encodeURIComponent(repo)}&path=${encodeURIComponent(path)}&branch=${branch}`);
}

export async function ghUpdateFile(repo: string, path: string, content: string, message: string, branch = 'main'): Promise<{ committed: boolean; sha: string }> {
  return call('PUT', '/github/file', { repo, path, content, message, branch });
}

export async function ghGetTree(repo: string, branch = 'main'): Promise<string[]> {
  return call('GET', `/github/tree?repo=${encodeURIComponent(repo)}&branch=${branch}`);
}

export async function ghCreatePr(repo: string, title: string, body: string, head: string, base = 'main'): Promise<{ pr_url: string; number: number }> {
  return call('POST', '/github/pr', { repo, title, body, head, base });
}

// ══════════════════════════════════════════════════════════════════════════════
// CREWAI — Branch A: run the 9 specialist agents on the VPS
// ══════════════════════════════════════════════════════════════════════════════

export interface CrewRunRequest {
  task: string;
  context?: string;
  conversation?: Array<{ role: string; content: string }>;
}

export async function crewRun(req: CrewRunRequest): Promise<{ status: string; result?: string; error?: string }> {
  return call('POST', '/crew/run', req);
}
