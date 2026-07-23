/**
 * axeCoreApiService.ts
 * Frontend client for the AXE Core API (VPS micro-service).
 * Gives AXE CORE privileged access to Supabase, n8n, and GitHub.
 *
 * The browser never talks to api.axecompanion.com directly and never sees
 * the API key. Both dev (/proxy/axecore, Vite) and prod (/api/proxy/axecore,
 * this repo's Vercel function) are same-origin server-side proxies that
 * attach `Authorization: Bearer ${AXE_CORE_API_KEY}` themselves, from a
 * server-only env var. Configure on the server (Vercel project env vars /
 * .env for `vite dev`), never as a VITE_-prefixed variable:
 *   AXE_CORE_API_URL = https://api.axecompanion.com
 *   AXE_CORE_API_KEY = <your secret key>
 */

const BASE_URL = (import.meta.env.DEV ? '/proxy/axecore' : '/api/proxy/axecore').replace(/\/$/, '');

// The proxy path always exists in this app; whether the *server* actually
// has AXE_CORE_API_KEY configured is a runtime fact, not something the
// client can know statically. Call checkAxeApi() for a live answer.
export const isAxeApiConfigured = true;

async function call<T = unknown>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
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
  vercel: boolean;
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

export async function ghGetFile(repo: string, path: string, branch = 'orchestrator'): Promise<{ path: string; content: string; sha: string }> {
  return call('GET', `/github/file?repo=${encodeURIComponent(repo)}&path=${encodeURIComponent(path)}&branch=${branch}`);
}

export async function ghUpdateFile(repo: string, path: string, content: string, message: string, branch = 'orchestrator'): Promise<{ committed: boolean; sha: string }> {
  return call('PUT', '/github/file', { repo, path, content, message, branch });
}

export async function ghGetTree(repo: string, branch = 'orchestrator'): Promise<string[]> {
  return call('GET', `/github/tree?repo=${encodeURIComponent(repo)}&branch=${branch}`);
}

export async function ghCreatePr(repo: string, title: string, body: string, head: string, base = 'main'): Promise<{ pr_url: string; number: number }> {
  return call('POST', '/github/pr', { repo, title, body, head, base });
}

// ══════════════════════════════════════════════════════════════════════════════
// VERCEL
// ══════════════════════════════════════════════════════════════════════════════

export interface VercelDeployment {
  id: string;
  url: string;
  state: string;
  target: string | null;
  createdAt: number;
  commitMessage?: string;
  commitSha?: string;
}

export async function vercelListDeployments(limit = 10): Promise<VercelDeployment[]> {
  return call('GET', `/vercel/deployments?limit=${limit}`);
}

export async function vercelGetDeployment(id: string): Promise<VercelDeployment & { ready?: number; aliasError?: unknown }> {
  return call('GET', `/vercel/deployment/${id}`);
}

export async function vercelPromote(deploymentId: string): Promise<{ promoted: boolean; deployment_id: string }> {
  return call('POST', `/vercel/promote/${deploymentId}`);
}

// ══════════════════════════════════════════════════════════════════════════════
// Control Plane
// ══════════════════════════════════════════════════════════════════════════════

export interface ControlPlaneRoute {
  id: string;
  kind: 'public' | 'internal' | 'hook' | 'integration';
  method: string;
  path: string;
  display_name: string;
  description?: string | null;
  target?: string | null;
  execution_mode: 'read' | 'patch' | 'execute';
  auth_required: boolean;
  enabled: boolean;
  metadata?: Record<string, unknown>;
}

export interface ControlPlaneTaskStep {
  title: string;
  status?: string;
  notes?: string | null;
  tool_name?: string | null;
  metadata?: Record<string, unknown>;
}

export interface ControlPlaneTaskCreate {
  title: string;
  description?: string | null;
  priority?: 'low' | 'medium' | 'high' | 'critical';
  source_app?: string;
  requested_by?: string | null;
  assignee?: string | null;
  capability?: string | null;
  execution_mode?: 'read' | 'patch' | 'execute';
  route_path?: string | null;
  payload?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  steps?: ControlPlaneTaskStep[];
}

export interface ControlPlaneTaskAction {
  decided_by?: string | null;
  notes?: string | null;
  metadata?: Record<string, unknown>;
}

export interface ControlPlaneHookPayload {
  task_id?: string | null;
  event_type?: string;
  source?: string | null;
  message?: string | null;
  payload?: Record<string, unknown>;
}

export interface ControlPlaneDispatchPayload {
  task_id?: string | null;
  route_path?: string | null;
  payload?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

/** Direct agent execution payload — the shape the VPS agent endpoints consume
 *  when the LLM gateway dispatches a chat task (as opposed to a control-plane
 *  dispatch, which uses ControlPlaneDispatchPayload). */
export interface AgentExecutePayload {
  task: string;
  context?: string;
  conversation?: Array<{ role: string; content: string }>;
}

export async function apiListRoutes(kind?: ControlPlaneRoute['kind']): Promise<ControlPlaneRoute[]> {
  const qs = kind ? `?kind=${encodeURIComponent(kind)}` : '';
  return call('GET', `/api/routes${qs}`);
}

export async function apiListTasks(limit = 50, status?: string): Promise<unknown[]> {
  const qs = new URLSearchParams();
  qs.set('limit', String(limit));
  if (status) qs.set('status', status);
  return call('GET', `/api/tasks?${qs.toString()}`);
}

export async function apiCreateTask(payload: ControlPlaneTaskCreate): Promise<unknown> {
  return call('POST', '/api/tasks', payload);
}

export async function apiGetTask(id: string): Promise<unknown> {
  return call('GET', `/api/tasks/${id}`);
}

export async function apiApproveTask(id: string, payload: ControlPlaneTaskAction = {}): Promise<unknown> {
  return call('POST', `/api/tasks/${id}/approve`, payload);
}

export async function apiRejectTask(id: string, payload: ControlPlaneTaskAction = {}): Promise<unknown> {
  return call('POST', `/api/tasks/${id}/reject`, payload);
}

export async function apiGetPatch(id: string): Promise<unknown> {
  return call('GET', `/api/patches/${id}`);
}

export async function apiHookN8n(payload: ControlPlaneHookPayload): Promise<unknown> {
  return call('POST', '/api/hooks/n8n', payload);
}

export async function apiHookLangGraph(payload: ControlPlaneHookPayload): Promise<unknown> {
  return call('POST', '/api/hooks/langgraph', payload);
}

export async function apiRunLangGraph(payload: ControlPlaneDispatchPayload): Promise<unknown> {
  return call('POST', '/internal/langgraph/run', payload);
}

export async function apiExecuteOpenHands(payload: ControlPlaneDispatchPayload | AgentExecutePayload): Promise<unknown> {
  return call('POST', '/internal/openhands/execute', payload);
}

export async function apiExecuteOpenJarvis(payload: ControlPlaneDispatchPayload | AgentExecutePayload): Promise<unknown> {
  return call('POST', '/internal/openjarvis/execute', payload);
}

export async function apiExecuteOpenClaw(payload: ControlPlaneDispatchPayload | AgentExecutePayload): Promise<unknown> {
  return call('POST', '/internal/openclaw/execute', payload);
}

export async function apiExecuteKiloCode(payload: ControlPlaneDispatchPayload | AgentExecutePayload): Promise<unknown> {
  return call('POST', '/internal/kilocode/execute', payload);
}

export async function apiExecuteCrewAI(payload: ControlPlaneDispatchPayload): Promise<unknown> {
  return call('POST', '/internal/crewai/execute', payload);
}

export async function apiExecuteHermes(payload: ControlPlaneDispatchPayload | AgentExecutePayload): Promise<unknown> {
  return call('POST', '/internal/hermes/execute', payload);
}

export async function apiTriggerN8n(payload: ControlPlaneDispatchPayload): Promise<unknown> {
  return call('POST', '/internal/n8n/trigger', payload);
}

// ══════════════════════════════════════════════════════════════════════════════
// EXEC — arbitrary shell execution on the VPS (deliberately unrestricted —
// see backend/axe_api/main.py's /internal/exec docstring for the tradeoff)
// ══════════════════════════════════════════════════════════════════════════════

export interface ExecResult {
  command: string;
  exit_code: number | null;
  timed_out: boolean;
  stdout: string;
  stderr: string;
}

export async function execCommand(command: string, timeout = 30): Promise<ExecResult> {
  return call('POST', '/internal/exec', { command, timeout });
}

// ══════════════════════════════════════════════════════════════════════════════
// CREWAI — Branch A: run the 9 specialist agents on the VPS
// ══════════════════════════════════════════════════════════════════════════════

export interface CrewRunRequest {
  task: string;
  context?: string;
  conversation?: Array<{ role: string; content: string }>;
  specialists?: string[];
}

export async function crewRun(req: CrewRunRequest): Promise<{ status: string; result?: string; error?: string }> {
  return call('POST', '/crew/run', req);
}

// ══════════════════════════════════════════════════════════════════════════════
// TTS — VPS Piper (offline, free, local)
// ══════════════════════════════════════════════════════════════════════════════

export async function tts(text: string, voice?: string): Promise<Blob> {
  const res = await fetch(`${BASE_URL}/tts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, voice }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(`TTS ${res.status}: ${err.detail ?? res.statusText}`);
  }
  return res.blob();
}

// ══════════════════════════════════════════════════════════════════════════════
// MCP — Model Context Protocol
// ══════════════════════════════════════════════════════════════════════════════

export async function mcpListServers(): Promise<Array<Record<string, unknown>>> {
  return call('GET', '/mcp/servers');
}

export async function mcpSaveServers(servers: Array<Record<string, unknown>>): Promise<{ saved: boolean; count: number }> {
  return call('POST', '/mcp/servers', servers);
}

export async function mcpTestServer(serverId: string): Promise<{ status: string; latency: number | null; error?: string }> {
  return call('POST', `/mcp/servers/${encodeURIComponent(serverId)}/test`, {});
}

export async function mcpCallTool(serverName: string, toolName: string, args: Record<string, unknown>): Promise<{ status: string; result?: unknown; error?: string }> {
  return call('POST', '/mcp/tools/call', { server_name: serverName, tool_name: toolName, arguments: args });
}
