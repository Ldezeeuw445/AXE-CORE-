/**
 * systemService.ts
 * Health monitor for every service AXE CORE depends on.
 * Checks reachability, measures latency, writes to core_system_state.
 *
 * Usage:
 *   import { checkAllServices, getSystemState } from '@/services/systemService';
 *   await checkAllServices();                  // run health checks
 *   const state = await getSystemState();      // read from Supabase
 */

import { getSupabase } from '@/lib/supabaseClient';

// ── Types ─────────────────────────────────────────────────────────────────

export type ServiceStatus = 'online' | 'degraded' | 'offline' | 'unknown';

export interface ServiceState {
  id: string;
  service: string;
  display: string;
  status: ServiceStatus;
  health: Record<string, unknown>;
  version: string | null;
  last_seen: string | null;
  latency_ms: number | null;
  enabled: boolean;
}

// ── Service definitions ────────────────────────────────────────────────────

const SERVICES: Array<{
  key: string;
  check: () => Promise<{ ok: boolean; latency: number; meta?: Record<string, unknown> }>;
}> = [
  {
    key: 'supabase',
    check: async () => {
      const t = Date.now();
      const sb = getSupabase();
      if (!sb) return { ok: false, latency: 0 };
      const { error } = await sb.from('core_system_state').select('service').limit(1);
      return { ok: !error, latency: Date.now() - t };
    },
  },
  {
    key: 'livekit',
    check: async () => {
      const url = import.meta.env.VITE_LIVEKIT_TOKEN_URL ?? '';
      if (!url) return { ok: false, latency: 0 };
      const t = Date.now();
      try {
        // HEAD request to the token endpoint — just check reachability
        const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
        return { ok: res.status < 500, latency: Date.now() - t };
      } catch {
        return { ok: false, latency: Date.now() - t };
      }
    },
  },
  {
    key: 'n8n',
    check: async () => {
      const url  = import.meta.env.VITE_N8N_URL    ?? '';
      const key  = import.meta.env.VITE_N8N_API_KEY ?? '';
      if (!url || !key) return { ok: false, latency: 0 };
      const t = Date.now();
      try {
        const res = await fetch(`${url}/api/v1/workflows?limit=1`, {
          headers: { 'X-N8N-API-KEY': key },
          signal: AbortSignal.timeout(8000),
        });
        return { ok: res.ok, latency: Date.now() - t };
      } catch {
        return { ok: false, latency: Date.now() - t };
      }
    },
  },
  {
    key: 'github',
    check: async () => {
      const t = Date.now();
      try {
        const res = await fetch('https://api.github.com/zen', {
          signal: AbortSignal.timeout(5000),
        });
        return { ok: res.ok, latency: Date.now() - t };
      } catch {
        return { ok: false, latency: Date.now() - t };
      }
    },
  },
  {
    key: 'ollama',
    check: async () => {
      // Default to the Cloudflare-tunneled HTTPS endpoint (direct HTTP IP is blocked from HTTPS browsers)
      const url = import.meta.env.VITE_OLLAMA_URL ?? 'https://ollama.axecompanion.com';
      const t = Date.now();
      try {
        const res = await fetch(`${url}/api/tags`, { signal: AbortSignal.timeout(5000) });
        const data = res.ok ? await res.json() : null;
        return {
          ok: res.ok,
          latency: Date.now() - t,
          meta: data ? { models: (data.models ?? []).map((m: { name: string }) => m.name) } : {},
        };
      } catch {
        return { ok: false, latency: Date.now() - t };
      }
    },
  },
  {
    key: 'openrouter',
    check: async () => {
      const t = Date.now();
      try {
        const res = await fetch('https://openrouter.ai/api/v1/models?limit=1', {
          signal: AbortSignal.timeout(5000),
        });
        return { ok: res.ok, latency: Date.now() - t };
      } catch {
        return { ok: false, latency: Date.now() - t };
      }
    },
  },
  {
    key: 'gemini',
    check: async () => {
      const key = import.meta.env.VITE_GEMINI_API_KEY ?? '';
      if (!key) return { ok: false, latency: 0 };
      const t = Date.now();
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models?key=${key}&pageSize=1`,
          { signal: AbortSignal.timeout(5000) },
        );
        return { ok: res.ok, latency: Date.now() - t };
      } catch {
        return { ok: false, latency: Date.now() - t };
      }
    },
  },
  {
    key: 'xai',
    check: async () => {
      const key = import.meta.env.VITE_XAI_API_KEY ?? '';
      if (!key) return { ok: false, latency: 0 };
      const t = Date.now();
      try {
        const res = await fetch('https://api.x.ai/v1/models', {
          headers: { Authorization: `Bearer ${key}` },
          signal: AbortSignal.timeout(5000),
        });
        return { ok: res.ok, latency: Date.now() - t };
      } catch {
        return { ok: false, latency: Date.now() - t };
      }
    },
  },
  {
    key: 'openhands',
    check: async () => {
      const t = Date.now();
      try {
        const res = await fetch('http://localhost:3000/v1/models', {
          signal: AbortSignal.timeout(5000),
        });
        return { ok: res.ok, latency: Date.now() - t };
      } catch {
        return { ok: false, latency: Date.now() - t };
      }
    },
  },
  {
    key: 'openjarvis',
    check: async () => {
      const t = Date.now();
      try {
        const res = await fetch('http://localhost:2025/v1/models', {
          signal: AbortSignal.timeout(5000),
        });
        return { ok: res.ok, latency: Date.now() - t };
      } catch {
        return { ok: false, latency: Date.now() - t };
      }
    },
  },
  {
    key: 'openclaw',
    check: async () => {
      const t = Date.now();
      try {
        const res = await fetch('http://localhost:5001/v1/models', {
          signal: AbortSignal.timeout(5000),
        });
        return { ok: res.ok, latency: Date.now() - t };
      } catch {
        return { ok: false, latency: Date.now() - t };
      }
    },
  },
  {
    key: 'kilocode',
    check: async () => {
      const t = Date.now();
      try {
        const res = await fetch('http://localhost:5002/v1/models', {
          signal: AbortSignal.timeout(5000),
        });
        return { ok: res.ok, latency: Date.now() - t };
      } catch {
        return { ok: false, latency: Date.now() - t };
      }
    },
  },
  {
    key: 'crewai',
    check: async () => {
      const t = Date.now();
      try {
        const res = await fetch('http://localhost:5003/v1/models', {
          signal: AbortSignal.timeout(5000),
        });
        return { ok: res.ok, latency: Date.now() - t };
      } catch {
        return { ok: false, latency: Date.now() - t };
      }
    },
  },
  {
    key: 'metaapi',
    check: async () => {
      const t = Date.now();
      try {
        const res = await fetch('https://mt-client-api-v1.agiliumtrade.agiliumtrade.ai/health', {
          signal: AbortSignal.timeout(5000),
        });
        return { ok: res.ok || res.status === 401, latency: Date.now() - t }; // 401 = API is up, key needed
      } catch {
        return { ok: false, latency: Date.now() - t };
      }
    },
  },
  {
    key: 'axe_companion',
    check: async () => {
      const t = Date.now();
      try {
        const res = await fetch('https://axecompanion.com', { signal: AbortSignal.timeout(6000), mode: 'no-cors' });
        return { ok: true, latency: Date.now() - t }; // no-cors = site is up if no network error
      } catch {
        return { ok: false, latency: Date.now() - t };
      }
    },
  },
  {
    key: 'axe_intel',
    check: async () => {
      // AXE Intel is a backend scraper — check via Supabase table freshness
      const t = Date.now();
      try {
        const sb = getSupabase();
        if (!sb) return { ok: false, latency: 0 };
        const { data } = await sb.from('intel_sync_log').select('created_at').order('created_at', { ascending: false }).limit(1).single();
        if (!data) return { ok: false, latency: Date.now() - t };
        const age = Date.now() - new Date(data.created_at).getTime();
        return { ok: age < 6 * 60 * 60 * 1000, latency: Date.now() - t }; // ok if synced within 6h
      } catch {
        return { ok: false, latency: Date.now() - t };
      }
    },
  },
];

// Seed rows for optional providers that the dashboard should surface even if currently offline.
// Existing rows are left untouched via ON CONFLICT DO NOTHING in the migration.

// ── Core check runner ─────────────────────────────────────────────────────

/**
 * Run health checks for all configured services and write results to Supabase.
 * Also returns results immediately (no need to re-fetch from DB).
 */
export async function checkAllServices(): Promise<ServiceState[]> {
  const sb = getSupabase();
  const results: ServiceState[] = [];

  await Promise.allSettled(
    SERVICES.map(async ({ key, check }) => {
      const { ok, latency, meta } = await check();

      const update = {
        status: ok ? ('online' as ServiceStatus) : ('offline' as ServiceStatus),
        latency_ms: latency,
        last_seen: ok ? new Date().toISOString() : undefined,
        health: meta ?? {},
        updated_at: new Date().toISOString(),
      };

      if (sb) {
        await sb.from('core_system_state')
          .update(update)
          .eq('service', key);
      }

      results.push({
        id: '',
        service: key,
        display: key,
        ...update,
        version: null,
        enabled: true,
        last_seen: update.last_seen ?? null,
      });
    }),
  );

  return results;
}

/**
 * Read all service states from Supabase (no live checks).
 * Fast — just a DB read.
 */
export async function getSystemState(): Promise<ServiceState[]> {
  const sb = getSupabase();
  if (!sb) return [];

  const { data, error } = await sb
    .from('core_system_state')
    .select('*')
    .eq('enabled', true)
    .order('display');

  if (error) {
    console.error('[system] Failed to load state:', error.message);
    return [];
  }

  return (data ?? []) as ServiceState[];
}

/**
 * Get a single service state.
 */
export async function getServiceState(service: string): Promise<ServiceState | null> {
  const sb = getSupabase();
  if (!sb) return null;

  const { data } = await sb
    .from('core_system_state')
    .select('*')
    .eq('service', service)
    .single();

  return data as ServiceState | null;
}

/**
 * Quick summary string for CORE chat context.
 * e.g. "LiveKit: online (42ms), n8n: offline, GitHub: online (120ms)"
 */
export async function getSystemSummary(): Promise<string> {
  const state = await getSystemState();
  if (!state.length) return 'System state not available.';

  return state
    .map(s => {
      const latency = s.latency_ms ? ` (${s.latency_ms}ms)` : '';
      return `${s.display}: ${s.status}${latency}`;
    })
    .join(' | ');
}
