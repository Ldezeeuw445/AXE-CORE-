/**
 * Routes browser start-page composer submissions to the right AI backend.
 * DeepSeek → chat API. Browser Use / Camofox → VPS browser automation agents.
 *
 * ## Why this doesn't use apiUrl() like the rest of this file's siblings did
 *
 * `/browser/ai/*` (deepseek, browser-use, camofox, health, task polling) is a
 * router mounted directly on axe-core-api's own FastAPI app (main.py:172,
 * `browser_ai_agents.py`'s `APIRouter(prefix="/browser/ai")`) — the same
 * backend as everything in axeCoreApiService.ts, behind the same AUTH
 * dependency. It was never a Vercel `/api/*` serverless function.
 *
 * This file used to call `apiUrl('/api/browser/ai/health')`, which — for the
 * one place this can be checked, a packaged Tauri app — resolves to
 * `https://www.axeheadquarters.com/api/browser/ai/health`: the wrong host,
 * the wrong path (an extra `/api` prefix the real route doesn't have), and
 * with no Authorization header, which this AUTH-gated router requires
 * regardless. Confirmed live: the real path 404s even hit directly against
 * the VPS backend with the `/api` prefix still on it. That is why every
 * provider card here showed "not ready" — the health check itself could
 * never reach a real answer, key or no key.
 *
 * The fix is to resolve through the exact same BASE_URL + auth headers as
 * axeCoreApiService.ts's own `call()` — same backend, same proxy, same
 * trust boundary — rather than apiUrl()'s Vercel-function assumption.
 */
import type { BrowserAIProviderId } from '@/domain/browser/browserAIProviders';
import { axeCoreApiUrl, axeCoreApiExtraHeaders, axeApiAuthHeaders } from '@/infrastructure/config/apiUrl';

export interface BrowserAIResponse {
  message: string;
  sessionId?: string;
  taskId?: string;
  screenshotUrl?: string;
  status: 'ok' | 'error' | 'agent_started' | 'running';
}

const BASE_URL = axeCoreApiUrl('/proxy/axecore', '/api/proxy/axecore').replace(/\/$/, '');

function authHeaders(url: string): Record<string, string> {
  return { ...axeCoreApiExtraHeaders(), ...axeApiAuthHeaders(url) };
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(url) },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error((err as { detail?: string }).detail ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

async function getJson<T>(path: string): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, { headers: authHeaders(url), signal: AbortSignal.timeout(30_000) });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error((err as { detail?: string }).detail ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

/** Poll a background task until it completes or times out. */
export async function pollBrowserAITask(
  taskId: string,
  opts: { intervalMs?: number; maxWaitMs?: number; onProgress?: (msg: string) => void } = {},
): Promise<BrowserAIResponse> {
  const interval = opts.intervalMs ?? 2000;
  const maxWait = opts.maxWaitMs ?? 180_000;
  const start = Date.now();

  while (Date.now() - start < maxWait) {
    const task = await getJson<{
      taskId: string;
      status: string;
      message: string;
      sessionId?: string;
    }>(`/browser/ai/task/${encodeURIComponent(taskId)}`);

    opts.onProgress?.(task.message);

    if (task.status === 'ok' || task.status === 'agent_started' || task.status === 'error') {
      return {
        message: task.message,
        sessionId: task.sessionId,
        taskId: task.taskId,
        status: task.status as BrowserAIResponse['status'],
      };
    }

    await new Promise((r) => setTimeout(r, interval));
  }

  return {
    message: 'Task is still running — check Browser Agent panel for progress.',
    taskId,
    status: 'running',
  };
}

/** Send a message to one of the three browser AI providers. */
export async function sendBrowserAIMessage(
  provider: BrowserAIProviderId,
  message: string,
  opts: { mode?: string; apiKey?: string; onProgress?: (msg: string) => void } = {},
): Promise<BrowserAIResponse> {
  if (import.meta.env.VITE_BROWSER_DEMO === 'true') {
    await new Promise((r) => setTimeout(r, 500));
    return {
      message: `[Demo · ${provider}] Received: "${message.slice(0, 100)}${message.length > 100 ? '…' : ''}" — in production this goes to the real API.`,
      status: 'ok',
    };
  }

  if (provider === 'deepseek') {
    return postJson<BrowserAIResponse>('/browser/ai/deepseek', {
      message,
      mode: opts.mode ?? 'chat',
      api_key: opts.apiKey,
    });
  }

  const endpoint = provider === 'browser-use' ? 'browser-use' : 'camofox';
  const initial = await postJson<BrowserAIResponse>(`/browser/ai/${endpoint}`, {
    task: message,
    mode: opts.mode ?? (provider === 'browser-use' ? 'automate' : 'stealth'),
  });

  if (initial.taskId && initial.status === 'running') {
    return pollBrowserAITask(initial.taskId, { onProgress: opts.onProgress });
  }

  return initial;
}

/** Check health of all browser AI backends. */
export async function getBrowserAIHealth(): Promise<Record<string, unknown>> {
  return getJson('/browser/ai/health');
}
