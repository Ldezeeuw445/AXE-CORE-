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

import { getSupabase, SUPABASE_URL } from '@/lib/supabaseClient';

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

const N8N_URL = import.meta.env.VITE_N8N_URL ?? '/proxy/n8n';
const OPENHANDS_URL = import.meta.env.VITE_OPENHANDS_URL ?? '/proxy/openhands';
const OPENJARVIS_URL = import.meta.env.VITE_OPENJARVIS_URL ?? '/proxy/openjarvis';
const OPENCLAW_URL = import.meta.env.VITE_OPENCLAW_URL ?? '/proxy/openclaw';
const KILOCODE_URL = import.meta.env.VITE_KILOCODE_URL ?? '/proxy/kilocode';
const CREWAI_URL = import.meta.env.VITE_CREWAI_URL ?? '/proxy/crewai';
const HERMES_URL = import.meta.env.VITE_HERMES_URL ?? '/proxy/hermes';
const GROQ_URL = import.meta.env.VITE_GROQ_URL ?? 'https://api.groq.com/openai/v1';
const OLLAMA_URL = import.meta.env.VITE_OLLAMA_URL
  ?? (import.meta.env.DEV ? '/proxy/ollama' : 'https://ollama.axecompanion.com');
const TERMINAL_HEALTH_URL = import.meta.env.VITE_TERMINAL_HEALTH_URL ?? 'https://api.axecompanion.com/terminal-health';
const AXE_CORE_API_URL = import.meta.env.VITE_AXE_CORE_API_URL ?? '';
const AXE_CORE_API_KEY = import.meta.env.VITE_AXE_CORE_API_KEY ?? '';

const SERVICE_DISPLAY_NAMES: Record<string, string> = {
  supabase: 'Supabase',
  livekit: 'LiveKit',
  n8n: 'n8n',
  github: 'GitHub',
  ollama: 'Ollama',
  openrouter: 'OpenRouter',
  gemini: 'Gemini',
  xai: 'Grok',
  groq: 'Groq',
  openhands: 'OpenHands',
  openjarvis: 'OpenJarvis',
  openclaw: 'OpenClaw',
  kilocode: 'Kilo Code',
  crewai: 'CrewAI',
  hermes: 'Hermes Agent',
  terminal: 'AXE Terminal',
  langgraph: 'LangGraph Orchestrator',
  google_maps: 'Google Maps',
  smartthings: 'SmartThings',
  metaapi: 'MetaAPI',
  axe_companion: 'AXE Companion',
  axe_intel: 'AXE Intel',
};

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
      const url = import.meta.env.VITE_LIVEKIT_TOKEN_URL ?? `${SUPABASE_URL}/functions/v1/livekit-token`;
      if (!url) return { ok: false, latency: 0 };
      const t = Date.now();
      try {
        // OPTIONS is accepted by the edge function and proves the route is alive.
        const res = await fetch(url, { method: 'OPTIONS', signal: AbortSignal.timeout(5000) });
        return { ok: res.ok, latency: Date.now() - t };
      } catch {
        return { ok: false, latency: Date.now() - t };
      }
    },
  },
  {
    key: 'n8n',
    check: async () => {
      const url  = N8N_URL;
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
      const url = OLLAMA_URL;
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
    key: 'groq',
    check: async () => {
      const key = import.meta.env.VITE_GROQ_API_KEY ?? '';
      if (!key) return { ok: false, latency: 0 };
      const t = Date.now();
      try {
        const res = await fetch(`${GROQ_URL}/models`, {
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
        const res = await fetch(`${OPENHANDS_URL}/v1/models`, {
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
        const res = await fetch(`${OPENJARVIS_URL}/v1/models`, {
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
        const res = await fetch(`${OPENCLAW_URL}/v1/models`, {
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
        const res = await fetch(`${KILOCODE_URL}/v1/models`, {
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
        const res = await fetch(`${CREWAI_URL}/v1/models`, {
          signal: AbortSignal.timeout(5000),
        });
        return { ok: res.ok, latency: Date.now() - t };
      } catch {
        return { ok: false, latency: Date.now() - t };
      }
    },
  },
  {
    key: 'hermes',
    check: async () => {
      const t = Date.now();
      try {
        const res = await fetch(`${HERMES_URL}/health`, { signal: AbortSignal.timeout(5000) });
        return { ok: res.ok, latency: Date.now() - t };
      } catch {
        return { ok: false, latency: Date.now() - t };
      }
    },
  },
  {
    key: 'terminal',
    check: async () => {
      const t = Date.now();
      try {
        const res = await fetch(TERMINAL_HEALTH_URL, { signal: AbortSignal.timeout(5000) });
        const data = res.ok ? await res.json().catch(() => ({})) : null;
        return {
          ok: res.ok,
          latency: Date.now() - t,
          meta: data ? { endpoint: TERMINAL_HEALTH_URL, mode: 'remote_terminal' } : { endpoint: TERMINAL_HEALTH_URL },
          version: res.ok ? 'wss-proxy' : null,
        };
      } catch {
        return { ok: false, latency: Date.now() - t, version: null, meta: { endpoint: TERMINAL_HEALTH_URL } };
      }
    },
  },
  {
    key: 'langgraph',
    check: async () => {
      const t = Date.now();
      try {
        if (AXE_CORE_API_URL && AXE_CORE_API_KEY) {
          const res = await fetch(`${AXE_CORE_API_URL.replace(/\/$/, '')}/internal/langgraph/run`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${AXE_CORE_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              route_path: '/health/langgraph',
              payload: {
                type: 'healthcheck',
                message: 'ping',
                capability: 'orchestrator',
              },
              metadata: {
                source: 'systemService',
                mode: 'vps',
              },
            }),
            signal: AbortSignal.timeout(8000),
          });
          const data = await res.json().catch(() => ({}));
          const dispatched = Boolean(data?.dispatched);
          return {
            ok: res.ok && dispatched,
            latency: Date.now() - t,
            meta: {
              engine: 'langgraph',
              mode: 'vps',
              dispatched,
              body: data?.body ?? null,
              status_code: data?.status_code ?? null,
            },
            version: 'vps-dispatch',
          };
        }

        const { orchestrate } = await import('@/services/langGraphOrchestrator');
        const result = await orchestrate(
          [{ role: 'user', content: 'ping' }],
          [{ provider: 'test', key: '', model: 'test', baseUrl: '/health' }],
          async (_slot, messages) => (messages[messages.length - 1]?.content === 'ping' ? 'pong' : 'unexpected'),
        );
        return {
          ok: result?.response === 'pong',
          latency: Date.now() - t,
          meta: { engine: 'langgraph', mode: 'local', compiled: true, response: result?.response ?? null },
          version: 'stategraph-local',
        };
      } catch {
        return { ok: false, latency: Date.now() - t, version: null, meta: { engine: 'langgraph' } };
      }
    },
  },
  {
    key: 'google_maps',
    check: async () => {
      const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? '';
      if (!key) return { ok: false, latency: 0 };
      return { ok: true, latency: 0, meta: { mode: 'free_view', keyConfigured: true } };
    },
  },
  {
    key: 'smartthings',
    check: async () => {
      const token = import.meta.env.VITE_SMARTHINGS_PAT ?? '';
      if (!token) return { ok: false, latency: 0 };
      return { ok: true, latency: 0, meta: { mode: 'device_control', keyConfigured: true } };
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
        version: meta && typeof meta === 'object' && 'version' in meta ? String((meta as Record<string, unknown>).version ?? '') || null : undefined,
      };

      if (sb) {
        await sb.from('core_system_state')
          .upsert({
            service: key,
            display: SERVICE_DISPLAY_NAMES[key] ?? key,
            enabled: true,
            ...update,
          }, { onConflict: 'service' });
      }

      results.push({
        id: '',
        service: key,
        display: SERVICE_DISPLAY_NAMES[key] ?? key,
        ...update,
        version: update.version ?? null,
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
