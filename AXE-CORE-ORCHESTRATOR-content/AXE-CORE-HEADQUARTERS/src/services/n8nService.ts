/**
 * n8nService.ts
 * Complete n8n API wrapper for AXE CORE.
 * CORE can discover, create, execute, monitor and manage all n8n workflows.
 * Requires: VITE_N8N_URL, VITE_N8N_API_KEY
 */

import { getSupabase } from '@/lib/supabaseClient';

// ── Config ────────────────────────────────────────────────────────────────
const N8N_BASE_URL = import.meta.env.VITE_N8N_URL     ?? '';
const N8N_API_KEY  = import.meta.env.VITE_N8N_API_KEY ?? '';

export const isN8nConfigured = (): boolean => !!N8N_BASE_URL && !!N8N_API_KEY;

// ── Types ─────────────────────────────────────────────────────────────────
export interface N8nWorkflow {
  id: string;
  name: string;
  active: boolean;
  tags: Array<{ id: string; name: string }>;
  createdAt: string;
  updatedAt: string;
  nodes?: unknown[];
}

export interface N8nExecution {
  id: string;
  finished: boolean;
  mode: string;
  startedAt: string;
  stoppedAt?: string;
  workflowId: string;
  status: 'success' | 'error' | 'running' | 'waiting';
  data?: unknown;
}

// ── API Helper ────────────────────────────────────────────────────────────
async function n8nFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T | null> {
  if (!isN8nConfigured()) {
    console.warn('[n8n] Not configured. Set VITE_N8N_URL and VITE_N8N_API_KEY.');
    return null;
  }

  try {
    const res = await fetch(`${N8N_BASE_URL}/api/v1${path}`, {
      ...options,
      headers: {
        'X-N8N-API-KEY': N8N_API_KEY,
        'Content-Type': 'application/json',
        ...options.headers,
      },
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      console.error(`[n8n] ${options.method ?? 'GET'} ${path} → ${res.status}`);
      return null;
    }

    return await res.json() as T;
  } catch (e) {
    console.error('[n8n] Request failed:', e);
    return null;
  }
}

// ── Workflow Management ────────────────────────────────────────────────────

/** List all workflows */
export async function listWorkflows(): Promise<N8nWorkflow[]> {
  const data = await n8nFetch<{ data: N8nWorkflow[] }>('/workflows');
  return data?.data ?? [];
}

/** Get a single workflow by ID */
export async function getWorkflow(id: string): Promise<N8nWorkflow | null> {
  return await n8nFetch<N8nWorkflow>(`/workflows/${id}`);
}

/** Create a new workflow */
export async function createWorkflow(
  name: string,
  nodes: unknown[] = [],
  active = false,
): Promise<N8nWorkflow | null> {
  return await n8nFetch<N8nWorkflow>('/workflows', {
    method: 'POST',
    body: JSON.stringify({ name, nodes, active, settings: { executionOrder: 'v1' } }),
  });
}

/** Activate or deactivate a workflow */
export async function setWorkflowActive(id: string, active: boolean): Promise<boolean> {
  const res = await n8nFetch<N8nWorkflow>(`/workflows/${id}/${active ? 'activate' : 'deactivate'}`, {
    method: 'POST',
  });
  return res !== null;
}

/** Delete a workflow */
export async function deleteWorkflow(id: string): Promise<boolean> {
  const res = await n8nFetch<N8nWorkflow>(`/workflows/${id}`, { method: 'DELETE' });
  return res !== null;
}

// ── Execution ─────────────────────────────────────────────────────────────

/**
 * Execute a workflow by ID with optional input data.
 * Logs the execution in Supabase audit_trail.
 */
export async function executeWorkflow(
  id: string,
  payload: Record<string, unknown> = {},
  triggeredBy = 'manual',
): Promise<N8nExecution | null> {
  const result = await n8nFetch<N8nExecution>(`/workflows/${id}/execute`, {
    method: 'POST',
    body: JSON.stringify({ workflowData: payload }),
  });

  // Log to Supabase audit trail
  const sb = getSupabase();
  if (sb) {
    void sb.from('audit_trail').insert({
      actor: `agent:axe_core`,
      action: 'workflow.execute',
      resource_type: 'workflow',
      resource_id: id,
      details: { payload, triggered_by: triggeredBy, success: result !== null },
      success: result !== null,
    }); // Non-blocking fire-and-forget
  }

  return result;
}

/**
 * Trigger a workflow via its webhook URL.
 * Used for webhooks configured in n8n.
 */
export async function triggerWebhook(
  webhookPath: string,
  payload: Record<string, unknown> = {},
): Promise<unknown> {
  try {
    const res = await fetch(`${N8N_BASE_URL}/webhook/${webhookPath}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    console.error('[n8n] Webhook trigger failed:', e);
    return null;
  }
}

// ── Execution Monitoring ──────────────────────────────────────────────────

/** Get recent executions (all workflows or specific) */
export async function getExecutions(workflowId?: string, limit = 20): Promise<N8nExecution[]> {
  const path = workflowId
    ? `/executions?workflowId=${workflowId}&limit=${limit}`
    : `/executions?limit=${limit}`;
  const data = await n8nFetch<{ data: N8nExecution[] }>(path);
  return data?.data ?? [];
}

/** Get a single execution by ID */
export async function getExecution(id: string): Promise<N8nExecution | null> {
  return await n8nFetch<N8nExecution>(`/executions/${id}`);
}

/** Retry a failed execution */
export async function retryExecution(id: string): Promise<boolean> {
  const res = await n8nFetch<unknown>(`/executions/${id}/retry`, { method: 'POST' });
  return res !== null;
}

/** Delete an execution */
export async function deleteExecution(id: string): Promise<boolean> {
  const res = await n8nFetch<unknown>(`/executions/${id}`, { method: 'DELETE' });
  return res !== null;
}

// ── Registry Sync ─────────────────────────────────────────────────────────

/**
 * Sync all n8n workflows into Supabase core_workflows registry.
 * Call this after adding/changing workflows in n8n.
 */
export async function syncWorkflowsToRegistry(): Promise<number> {
  const sb = getSupabase();
  if (!sb) return 0;

  const workflows = await listWorkflows();
  if (!workflows.length) return 0;

  let synced = 0;
  for (const wf of workflows) {
    const { error } = await sb.from('core_workflows').upsert({
      external_id: wf.id,
      name: wf.name,
      platform: 'n8n',
      status: wf.active ? 'active' : 'paused',
      metadata: { n8n_tags: wf.tags?.map(t => t.name) ?? [] },
      updated_at: new Date().toISOString(),
    }, { onConflict: 'external_id' });

    if (!error) synced++;
  }

  return synced;
}

/**
 * Auto-register a new workflow from an app.
 * Any AXE app can call this to register its workflows with CORE.
 */
export async function registerWorkflow(opts: {
  name: string;
  description: string;
  appName: string;
  webhookUrl?: string;
  triggerType?: string;
  tags?: string[];
}): Promise<string | null> {
  const sb = getSupabase();
  if (!sb) return null;

  const { data, error } = await sb.from('automation_registry').upsert({
    name: opts.name.toLowerCase().replace(/\s+/g, '_'),
    display_name: opts.name,
    description: opts.description,
    app_name: opts.appName,
    status: 'active',
    is_template: false,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'name' }).select('id').single();

  if (error) {
    console.error('[n8n] Failed to register workflow:', error.message);
    return null;
  }

  return data?.id ?? null;
}

export { N8N_BASE_URL };
