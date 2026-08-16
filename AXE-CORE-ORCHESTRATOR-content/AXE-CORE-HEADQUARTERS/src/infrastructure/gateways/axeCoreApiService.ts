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

import { axeCoreApiUrl, axeCoreApiExtraHeaders } from '@/infrastructure/config/apiUrl';

// axeCoreApiUrl() only rewrites this to a direct api.axecompanion.com call
// inside a PACKAGED Tauri app that was built with VITE_AXE_CORE_API_KEY set;
// otherwise (Vercel prod, `npm run dev` / `tauri:dev`) it's the same
// same-origin proxy path as before, which attaches the key server-side.
const BASE_URL = axeCoreApiUrl('/proxy/axecore', '/api/proxy/axecore').replace(/\/$/, '');

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
    headers: { 'Content-Type': 'application/json', ...axeCoreApiExtraHeaders() },
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
// DURABLE TASK KERNEL
// ══════════════════════════════════════════════════════════════════════════════

export type TaskRunStatus =
  | 'pending' | 'queued' | 'planning' | 'running' | 'in_progress'
  | 'blocked' | 'waiting_approval' | 'verifying' | 'retrying'
  | 'completed' | 'done' | 'failed' | 'cancelled' | 'rejected';

export interface DurableTaskRun {
  id: string;
  title: string;
  goal: string;
  status: TaskRunStatus;
  priority: 'low' | 'medium' | 'high' | 'critical';
  requested_by?: string;
  capability?: string;
  checkpoint: Record<string, unknown>;
  result?: Record<string, unknown> | null;
  error?: Record<string, unknown> | null;
  worker_id?: string | null;
  lease_token?: string | null;
  lease_expires_at?: string | null;
  attempt: number;
  max_attempts: number;
  revision: number;
  created_at: string;
  updated_at: string;
}

export interface DurableTaskStep {
  id: string;
  task_id: string;
  step_order: number;
  step_key?: string | null;
  title: string;
  status: string;
  kind: string;
  input: Record<string, unknown>;
  output?: Record<string, unknown> | null;
  error?: Record<string, unknown> | null;
  checkpoint: Record<string, unknown>;
}

export interface DurableTaskApproval {
  id: string;
  task_id: string;
  status: 'pending' | 'approved' | 'rejected' | 'expired' | 'cancelled';
  kind: string;
  title: string;
  detail: string;
  decided_by?: string | null;
  decision_reason?: string | null;
  created_at: string;
}

export interface DurableTaskEvent {
  sequence: number;
  task_id: string;
  step_id?: string | null;
  event_type: string;
  actor_type: 'user' | 'axe' | 'worker' | 'tool' | 'system';
  actor_id?: string | null;
  message?: string | null;
  data: Record<string, unknown>;
  created_at: string;
}

export interface DurableTaskSnapshot {
  task: DurableTaskRun;
  steps: DurableTaskStep[];
  approvals: DurableTaskApproval[];
  events: DurableTaskEvent[];
}

export async function createDurableTask(input: {
  title: string;
  goal: string;
  description?: string;
  priority?: DurableTaskRun['priority'];
  requested_by?: string;
  capability?: string;
  execution_mode?: 'read' | 'patch' | 'execute';
  idempotency_key?: string;
  parent_task_id?: string;
  payload?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}): Promise<{ task: DurableTaskRun; created: boolean }> {
  return call('POST', '/tasks', input);
}

export async function getDurableTask(
  taskId: string,
  afterSequence = 0,
): Promise<DurableTaskSnapshot> {
  const qs = afterSequence > 0 ? `?after_sequence=${afterSequence}` : '';
  return call('GET', `/tasks/${encodeURIComponent(taskId)}${qs}`);
}

export async function claimDurableTask(
  workerId: string,
  leaseSeconds = 60,
): Promise<{ task: DurableTaskRun | null }> {
  return call('POST', '/tasks/claim', { worker_id: workerId, lease_seconds: leaseSeconds });
}

export async function heartbeatDurableTask(
  taskId: string,
  lease: { workerId: string; leaseToken: string; leaseSeconds?: number },
  checkpoint?: Record<string, unknown>,
): Promise<{ task: DurableTaskRun }> {
  return call('POST', `/tasks/${encodeURIComponent(taskId)}/heartbeat`, {
    worker_id: lease.workerId,
    lease_token: lease.leaseToken,
    lease_seconds: lease.leaseSeconds ?? 60,
    checkpoint,
  });
}

export async function transitionDurableTask(
  taskId: string,
  status: TaskRunStatus,
  input: {
    workerId?: string;
    leaseToken?: string;
    checkpoint?: Record<string, unknown>;
    result?: Record<string, unknown>;
    error?: Record<string, unknown>;
  } = {},
): Promise<{ task: DurableTaskRun }> {
  return call('POST', `/tasks/${encodeURIComponent(taskId)}/transition`, {
    status,
    worker_id: input.workerId,
    lease_token: input.leaseToken,
    checkpoint: input.checkpoint,
    result: input.result,
    error: input.error,
  });
}

export async function requestDurableTaskApproval(
  taskId: string,
  input: {
    kind: string;
    title: string;
    detail: string;
    target_type?: string;
    target_id?: string;
    expires_at?: string;
    metadata?: Record<string, unknown>;
  },
): Promise<{ approval: DurableTaskApproval }> {
  return call('POST', `/tasks/${encodeURIComponent(taskId)}/approvals`, input);
}

export async function decideDurableTaskApproval(
  taskId: string,
  approvalId: string,
  approved: boolean,
  reason?: string,
): Promise<{ approval: DurableTaskApproval }> {
  return call(
    'POST',
    `/tasks/${encodeURIComponent(taskId)}/approvals/${encodeURIComponent(approvalId)}/decision`,
    { approved, decided_by: 'luka', reason },
  );
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

// ══════════════════════════════════════════════════════════════════════════════
// MEMORY
// ══════════════════════════════════════════════════════════════════════════════
// Dedicated endpoints rather than sbRunSql: the `exec_sql` RPC behind
// /supabase/sql is read-only (an INSERT comes back as `syntax error at or near
// "into"`), so every memory write through it failed. These go through
// PostgREST with the service_role key instead, and take values as JSON so
// nothing has to be escaped into a SQL string.

export interface MemoryRow extends Record<string, unknown> {
  id?: string;
  user_id: string;
  category: string;
  key: string;
  value: string;
  confidence: number;
  metadata?: Record<string, unknown> | null;
  created_at?: string;
  updated_at?: string;
}

export async function memUpsert(entries: Array<{
  user_id: string;
  category: string;
  key: string;
  value: string;
  confidence?: number;
  metadata?: Record<string, unknown>;
}>): Promise<MemoryRow[]> {
  if (!entries.length) return [];
  return call('POST', '/memory/upsert', entries);
}

export async function memList(params: {
  user_id: string;
  category?: string;
  key_prefix?: string;
  limit?: number;
}): Promise<MemoryRow[]> {
  const qs = new URLSearchParams({ user_id: params.user_id });
  if (params.category) qs.set('category', params.category);
  if (params.key_prefix) qs.set('key_prefix', params.key_prefix);
  if (params.limit != null) qs.set('limit', String(params.limit));
  return call('GET', `/memory?${qs.toString()}`);
}

export async function memStats(userId: string): Promise<{
  total: number;
  by_category: Record<string, number>;
  last_updated: string | null;
}> {
  return call('GET', `/memory/stats?user_id=${encodeURIComponent(userId)}`);
}

export async function sbRunSql(sql: string): Promise<unknown[]> {
  return call('POST', '/supabase/sql', { sql });
}

export async function sbGetRows<T = TableRow>(
  table: string,
  opts: { limit?: number; offset?: number; orderBy?: string; orderDir?: 'asc' | 'desc'; filterCol?: string; filterVal?: string } = {},
): Promise<T[]> {
  const params = new URLSearchParams();
  if (opts.limit)     params.set('limit', String(opts.limit));
  if (opts.offset)    params.set('offset', String(opts.offset));
  if (opts.orderBy)   params.set('order_by', opts.orderBy);
  if (opts.orderDir)  params.set('order_dir', opts.orderDir);
  if (opts.filterCol) params.set('filter_col', opts.filterCol);
  if (opts.filterVal) params.set('filter_val', opts.filterVal);
  const qs = params.toString();
  return call<T[]>('GET', `/supabase/table/${table}${qs ? `?${qs}` : ''}`);
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
// SELF-HOSTED SCHEDULER (core_schedules) — replaces n8n for cron. AXE owns the
// whole loop: schedules in Postgres, a CRON_KEY-secured tick on the VPS runs them.
// ══════════════════════════════════════════════════════════════════════════════
export type CronActionType = 'prompt' | 'exec' | 'webhook' | 'crew' | 'flow';

export interface CronSchedule {
  id: string;
  name: string;
  cron_expr: string;
  timezone: string;
  action_type: CronActionType;
  action_payload: Record<string, unknown>;
  enabled: boolean;
  next_run_at: string | null;
  last_run_at: string | null;
  last_status: 'ok' | 'fail' | null;
  last_result: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface CronScheduleInput {
  name: string;
  cron_expr: string;
  timezone?: string;
  action_type: CronActionType;
  action_payload: Record<string, unknown>;
  enabled?: boolean;
  metadata?: Record<string, unknown>;
}

export async function cronListSchedules(): Promise<CronSchedule[]> {
  const { schedules } = await call<{ schedules: CronSchedule[] }>('GET', '/cron/schedules');
  return schedules ?? [];
}

export async function cronCreateSchedule(input: CronScheduleInput): Promise<CronSchedule> {
  const { schedule } = await call<{ schedule: CronSchedule }>('POST', '/cron/schedules', input);
  return schedule;
}

export async function cronUpdateSchedule(id: string, patch: Partial<CronScheduleInput>): Promise<CronSchedule> {
  const { schedule } = await call<{ schedule: CronSchedule }>('PUT', `/cron/schedules/${id}`, patch);
  return schedule;
}

export async function cronDeleteSchedule(id: string): Promise<void> {
  await call('DELETE', `/cron/schedules/${id}`);
}

export async function cronRunNow(id: string): Promise<{ result: { status: string; output: string } }> {
  return call('POST', `/cron/schedules/${id}/run`);
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

export async function ghCreateBranch(repo: string, branch: string, fromBranch = 'orchestrator'): Promise<{ created: boolean; branch: string; from: string; sha: string }> {
  return call('POST', '/github/branch', { repo, branch, from_branch: fromBranch });
}

export interface PrStatus {
  number: number; state: string; merged: boolean;
  mergeable: boolean | null; mergeable_state: string | null;
  title: string; head: string; base: string; html_url: string;
}

export async function ghGetPr(repo: string, number: number): Promise<PrStatus> {
  return call('GET', `/github/pr/${number}?repo=${encodeURIComponent(repo)}`);
}

export async function ghMergePr(repo: string, number: number, mergeMethod: 'merge' | 'squash' | 'rebase' = 'merge'): Promise<{ merged: boolean; sha: string | null; message: string | null }> {
  return call('POST', `/github/pr/${number}/merge`, { repo, merge_method: mergeMethod });
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

export async function vercelListDeployments(limit = 10, projectId?: string): Promise<VercelDeployment[]> {
  return call('GET', `/vercel/deployments?limit=${limit}${projectId ? `&project_id=${encodeURIComponent(projectId)}` : ''}`);
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

/** Which local agent bridges (OpenHands/OpenJarvis/OpenClaw/KiloCode/Hermes)
 *  are actually wired on the VPS — i.e. have their {TOOL}_URL env var set.
 *  Honest status for the UI, no fabrication. */
export async function apiAgentsStatus(): Promise<Record<string, { configured: boolean }>> {
  return call('GET', '/internal/agents/status');
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
  /** Extra env vars (Exa/Firecrawl/E2B/Qdrant keys, ...) injected into the
   *  crew's isolated venv subprocess for this run — see runCrewWithTools.ts. */
  tool_env?: Record<string, string>;
}

export async function crewRun(req: CrewRunRequest): Promise<{ status: string; result?: string; error?: string }> {
  return call('POST', '/crew/run', req);
}

// ══════════════════════════════════════════════════════════════════════════════
// CREWAI FLOWS — declarative crewai.flow/v1 pipelines (see flow_runner.py's
// FLOWS registry on the VPS for what's deployed, e.g. "trading_intelligence").
// Can run long (many sequential agent/crew stages) — no client-side timeout.
// ══════════════════════════════════════════════════════════════════════════════

export async function flowRun(
  flow: string,
  inputs: Record<string, unknown>,
): Promise<{ status: string; result?: string; state?: Record<string, unknown>; error?: string }> {
  return call('POST', '/flow/run', { flow, inputs });
}

// ══════════════════════════════════════════════════════════════════════════════
// SMARTTHINGS — server-side token (SMARTTHINGS_TOKEN on the VPS). See
// smartThingsService.ts, which prefers this path and falls back to a
// browser-stored token (direct-to-api.smartthings.com) when the VPS
// hasn't been configured yet.
// ══════════════════════════════════════════════════════════════════════════════

export async function stListDevicesVps(): Promise<{ items?: Array<{ deviceId: string; name: string; label?: string }> }> {
  return call('GET', '/smartthings/devices');
}

export async function stDeviceStatusVps(deviceId: string): Promise<unknown> {
  return call('GET', `/smartthings/devices/${encodeURIComponent(deviceId)}/status`);
}

export async function stDeviceCommandVps(
  deviceId: string,
  capability: string,
  command: string,
  args: unknown[] = [],
  component = 'main',
): Promise<unknown> {
  return call('POST', `/smartthings/devices/${encodeURIComponent(deviceId)}/commands`, { capability, command, arguments: args, component });
}

// ══════════════════════════════════════════════════════════════════════════════
// OSINT — real map data (axe_api /osint/*, adapters ported from the
// Intelligence Terminal prototype)
// ══════════════════════════════════════════════════════════════════════════════

export interface OsintLayerResult {
  status: 'ok' | 'error' | 'stale';
  fetched_at: string;
  count: number;
  items: Array<Record<string, unknown>>;
  error?: string;
  [key: string]: unknown;
}

export async function osintAll(): Promise<Record<string, OsintLayerResult>> {
  return call('GET', '/osint/all');
}

export async function osintLayer(name: string): Promise<OsintLayerResult> {
  return call('GET', `/osint/${encodeURIComponent(name)}`);
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

// ══════════════════════════════════════════════════════════════════════════════
// LIVE PREVIEW — a real dev-server process on the VPS for the Code Editor's
// Preview tab, proxied at /preview by nginx (backend/axe_api/nginx_api.conf).
// ══════════════════════════════════════════════════════════════════════════════

export interface PreviewStatus {
  running: boolean;
  command: string;
  port: number;
  url: string | null;
  log: string[];
  configured: boolean;
}

export async function previewStart(command?: string): Promise<{ started: boolean; command: string; port: number; url: string | null }> {
  return call('POST', '/preview/start', command ? { command } : {});
}

export async function previewStop(): Promise<{ stopped: boolean; was_running: boolean }> {
  return call('POST', '/preview/stop');
}

export async function previewStatus(): Promise<PreviewStatus> {
  return call('GET', '/preview/status');
}

// ══════════════════════════════════════════════════════════════════════════════
// BROWSER AGENT — real Playwright-driven navigate/click/type/read/screenshot.
// Backed by backend/axe_api/browser_agent.py; returns an honest 503 if
// Playwright/Chromium isn't installed on the VPS yet.
// ══════════════════════════════════════════════════════════════════════════════

export interface BrowserAgentPageState {
  url: string;
  title: string;
}

export async function browserAgentStart(): Promise<{ session_id: string }> {
  return call('POST', '/browser/agent/session');
}

export async function browserAgentNavigate(sessionId: string, url: string): Promise<BrowserAgentPageState> {
  return call('POST', `/browser/agent/${encodeURIComponent(sessionId)}/navigate`, { url });
}

export async function browserAgentClick(sessionId: string, selector: string): Promise<BrowserAgentPageState> {
  return call('POST', `/browser/agent/${encodeURIComponent(sessionId)}/click`, { selector });
}

export async function browserAgentType(sessionId: string, selector: string, text: string, submit = false): Promise<BrowserAgentPageState> {
  return call('POST', `/browser/agent/${encodeURIComponent(sessionId)}/type`, { selector, text, submit });
}

export async function browserAgentRead(sessionId: string): Promise<BrowserAgentPageState & { text: string }> {
  return call('GET', `/browser/agent/${encodeURIComponent(sessionId)}/read`);
}

export async function browserAgentScreenshot(sessionId: string): Promise<Blob> {
  const res = await fetch(`${BASE_URL}/browser/agent/${encodeURIComponent(sessionId)}/screenshot`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(`Browser agent screenshot ${res.status}: ${err.detail ?? res.statusText}`);
  }
  return res.blob();
}

export async function browserAgentClose(sessionId: string): Promise<{ closed: boolean }> {
  return call('POST', `/browser/agent/${encodeURIComponent(sessionId)}/close`);
}

// ── Trading data plane ──────────────────────────────────────────────────────
// One shared implementation on the VPS, called by the crew, this app, and the
// trading agent. Keys live only on the server — never shipped to the client.

export interface MarketTool {
  name: string;
  args: Record<string, string>;
  description: string;
  /** false = the provider's API key isn't set on the VPS yet. */
  configured: boolean;
}

export interface MarketToolResult<T = unknown> {
  tool: string;
  ok: boolean;
  source: string;
  data: T | null;
  error: string | null;
}

export async function marketToolCatalog(): Promise<{
  tools: MarketTool[];
  configured_count: number;
  total: number;
}> {
  return call('GET', '/marketdata/tools');
}

export async function marketToolCall<T = unknown>(
  tool: string,
  args: Record<string, unknown> = {},
): Promise<MarketToolResult<T>> {
  return call('POST', '/marketdata/call', { tool, args });
}

export interface MacroBrief {
  symbol: string;
  as_of: string;
  macro: Record<string, MarketToolResult>;
  calendar: MarketToolResult;
  news: MarketToolResult;
  crowd_bias: MarketToolResult;
}

/** Standing decision context: macro → calendar → news → crowd bias. */
export async function marketBrief(symbol: string): Promise<MacroBrief> {
  return call('GET', `/marketdata/brief/${encodeURIComponent(symbol)}`);
}
