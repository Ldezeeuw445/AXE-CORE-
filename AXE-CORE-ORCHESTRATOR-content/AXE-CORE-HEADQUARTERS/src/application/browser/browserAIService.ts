/**
 * Routes browser start-page composer submissions to the right AI backend.
 * DeepSeek → chat API. Browser Use / Camofox → VPS browser automation agents.
 */
import type { BrowserAIProviderId } from '@/domain/browser/browserAIProviders';
import { apiUrl } from '@/infrastructure/config/apiUrl';

export interface BrowserAIResponse {
  message: string;
  sessionId?: string;
  taskId?: string;
  screenshotUrl?: string;
  status: 'ok' | 'error' | 'agent_started' | 'running';
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(apiUrl(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
  const res = await fetch(apiUrl(path), { signal: AbortSignal.timeout(30_000) });
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
    }>(`/api/browser/ai/task/${encodeURIComponent(taskId)}`);

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
    return postJson<BrowserAIResponse>('/api/browser/ai/deepseek', {
      message,
      mode: opts.mode ?? 'chat',
      api_key: opts.apiKey,
    });
  }

  const endpoint = provider === 'browser-use' ? 'browser-use' : 'camofox';
  const initial = await postJson<BrowserAIResponse>(`/api/browser/ai/${endpoint}`, {
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
  return getJson('/api/browser/ai/health');
}
