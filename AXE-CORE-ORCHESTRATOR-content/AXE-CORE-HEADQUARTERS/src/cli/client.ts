/**
 * HTTP-client naar de AXE-API. Sleutel alleen in de header, nooit in logs.
 */

import type { AxeConfig } from './config';

export class AxeHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = 'AxeHttpError';
  }
}

export interface AxeHttp {
  get(path: string, query?: Record<string, string>): Promise<unknown>;
  post(path: string, body?: unknown): Promise<unknown>;
  patch(path: string, body?: unknown): Promise<unknown>;
}

export function createHttp(cfg: AxeConfig, fetchImpl: typeof fetch = fetch): AxeHttp {
  const call = async (method: string, path: string, body?: unknown, query?: Record<string, string>): Promise<unknown> => {
    const url = new URL(path.replace(/^\//, ''), `${cfg.apiUrl}/`);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== '') url.searchParams.set(k, v);
      }
    }
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (cfg.apiKey) headers.Authorization = `Bearer ${cfg.apiKey}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), cfg.timeoutSec * 1000);
    try {
      const res = await fetchImpl(url.toString(), {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: ctrl.signal,
      });
      const text = await res.text();
      let parsed: unknown = text;
      if (text) {
        try { parsed = JSON.parse(text); } catch { parsed = { raw: text.slice(0, 400) }; }
      }
      if (!res.ok) {
        const msg = typeof parsed === 'object' && parsed && 'detail' in parsed
          ? String((parsed as { detail: unknown }).detail)
          : `HTTP ${res.status}`;
        throw new AxeHttpError(msg, res.status, parsed);
      }
      return parsed === '' ? {} : parsed;
    } finally {
      clearTimeout(t);
    }
  };

  return {
    get: (path, query) => call('GET', path, undefined, query),
    post: (path, body) => call('POST', path, body ?? {}),
    patch: (path, body) => call('PATCH', path, body ?? {}),
  };
}
