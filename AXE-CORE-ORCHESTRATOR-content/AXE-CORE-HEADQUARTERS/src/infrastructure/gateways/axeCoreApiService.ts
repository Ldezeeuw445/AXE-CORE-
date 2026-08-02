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

const BASE_URL = axeCoreApiUrl('/proxy/axecore', '/api/proxy/axecore').replace(/\/$/, '');

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

export async function checkAxeApi(): Promise<{
  status: string;
  supabase: boolean;
  n8n: boolean;
}> {
  return call('GET', '/health');
}

export async function crewRun(req: {
  task: string;
  context?: string;
  conversation?: Array<{ role: string; content: string }>;
  specialists?: string[];
  tool_env?: Record<string, string>;
}): Promise<{ status: string; result?: string; error?: string }> {
  return call('POST', '/crew/run', req);
}

export type CrewRunRequest = Parameters<typeof crewRun>[0];

export async function apiCreateTask(payload: Record<string, unknown>): Promise<unknown> {
  return call('POST', '/internal/tasks', payload);
}

export async function execCommand(command: string, timeout = 30): Promise<{
  command: string;
  exit_code: number | null;
  timed_out: boolean;
  stdout: string;
  stderr: string;
}> {
  return call('POST', '/internal/exec', { command, timeout });
}

export async function mcpCallTool(
  serverName: string,
  toolName: string,
  args: Record<string, unknown>,
): Promise<{ status: string; result?: unknown; error?: string }> {
  return call('POST', '/mcp/tools/call', { server_name: serverName, tool_name: toolName, arguments: args });
}

/** Re-export surface used across the app — extend as needed from full history if something is missing. */
export async function apiAgentsStatus(): Promise<Record<string, { configured: boolean }>> {
  return call('GET', '/internal/agents/status');
}

export type CronActionType = 'prompt' | 'exec' | 'webhook' | 'crew';

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
  return call('POST', `/smartthings/devices/${encodeURIComponent(deviceId)}/commands`, {
    capability,
    command,
    arguments: args,
    component,
  });
}
