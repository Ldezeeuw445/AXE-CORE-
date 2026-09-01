/**
 * Routes browser start-page composer submissions to the right AI backend.
 * DeepSeek → chat API. Browser Use / Camofox → VPS browser automation agents.
 */
import type { BrowserAIProviderId } from '@/domain/browser/browserAIProviders';
import { apiUrl } from '@/infrastructure/config/apiUrl';

export interface BrowserAIResponse {
  message: string;
  sessionId?: string;
  screenshotUrl?: string;
  status: 'ok' | 'error' | 'agent_started';
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

/** Send a message to one of the three browser AI providers. */
export async function sendBrowserAIMessage(
  provider: BrowserAIProviderId,
  message: string,
  opts: { mode?: string; apiKey?: string } = {},
): Promise<BrowserAIResponse> {
  if (provider === 'deepseek') {
    return postJson<BrowserAIResponse>('/api/browser/ai/deepseek', {
      message,
      mode: opts.mode ?? 'chat',
      api_key: opts.apiKey,
    });
  }
  if (provider === 'browser-use') {
    return postJson<BrowserAIResponse>('/api/browser/ai/browser-use', {
      task: message,
      mode: opts.mode ?? 'automate',
    });
  }
  return postJson<BrowserAIResponse>('/api/browser/ai/camofox', {
    task: message,
    mode: opts.mode ?? 'stealth',
  });
}
