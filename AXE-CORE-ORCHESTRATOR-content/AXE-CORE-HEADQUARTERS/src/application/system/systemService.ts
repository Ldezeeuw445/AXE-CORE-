/**
 * systemService.ts
 * Health monitor for every service AXE CORE depends on.
 * Checks reachability, measures latency, writes to core_system_state.
 *
 * Usage:
 *   import { checkAllServices, getSystemState } from '@/application/system/systemService';
 *   await checkAllServices();                  // run health checks
 *   const state = await getSystemState();      // read from Supabase
 */

import { getSupabase, SUPABASE_URL } from '@/infrastructure/supabase/supabaseClient';
import { VPS_API_ORIGIN, axeCoreApiUrl, axeCoreApiExtraHeaders } from '@/infrastructure/config/apiUrl';

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
const GROQ_URL = import.meta.env.VITE_GROQ_URL ?? 'https://api.groq.com/openai/v1';
const OLLAMA_URL = import.meta.env.VITE_OLLAMA_URL
  ?? (import.meta.env.DEV ? '/proxy/ollama' : 'https://ollama.axecompanion.com');
const TERMINAL_HEALTH_URL = import.meta.env.VITE_TERMINAL_HEALTH_URL ?? 'https://api.axecompanion.com/terminal-health';
// Same-origin server-side proxy in dev/Vercel; a direct api.axecompanion.com
// call (with the bearer key attached client-side) inside a packaged Tauri
// app instead — see axeCoreApiService.ts for the full rationale.
const AXE_CORE_API_URL = axeCoreApiUrl('/proxy/axecore', '/api/proxy/axecore');

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
  axe_core_api: 'AXE Core API (VPS)',
};

// The VPS agent bridges (openhands/openjarvis/openclaw/kilocode/hermes) live
// on 127.0.0.1-only ports — the browser can never reach them directly, in
// dev, on Vercel, or packaged, there's no route/CORS story that makes that
// work. axe-core-api sits right next to all of them, so it does the actual
// reachability probe and this just reads the result — one shared open
// (no key) VPS endpoint instead of six broken direct fetches.
let _vpsAgentsCache: { at: number; data: Record<string, { configured: boolean; reachable: boolean; latency_ms?: number }> } | null = null;
async function fetchVpsAgentsStatus(): Promise<Record<string, { configured: boolean; reachable: boolean; latency_ms?: number }>> {
  if (_vpsAgentsCache && Date.now() - _vpsAgentsCache.at < 3000) return _vpsAgentsCache.data;
  const res = await fetch(`${VPS_API_ORIGIN}/status/vps-agents`, { signal: AbortSignal.timeout(6000) });
  const data = res.ok ? await res.json() : {};
  _vpsAgentsCache = { at: Date.now(), data };
  return data;
}
/**
 * Gemini's models-list endpoint and its generateContent endpoint draw from
 * different quota buckets — listing kept succeeding while the Home widget
 * showed FAIL and Settings' real chat-completion test showed OK, or vice
 * versa, for the exact same key. Same disagreement, opposite direction, is
 * just as confusing. This does the real thing (a 1-token generateContent
 * call — the actual capability that matters) so both surfaces read from one
 * shared truth, and caches the result for 5 minutes so the always-on Home
 * widget (which polls every 60s, across however many app instances are
 * open) doesn't itself become a source of quota pressure. Settings' manual
 * "Test" click forces past the cache — a deliberate click should always get
 * a fresh answer — and its result is cached too, so an immediate widget
 * refresh shows the same thing rather than a stale disagreement.
 */
let _geminiCache: { at: number; result: { ok: boolean; latency: number } } | null = null;
const GEMINI_CACHE_TTL_MS = 5 * 60_000;

export async function checkGeminiReal(opts?: { force?: boolean; key?: string }): Promise<{ ok: boolean; latency: number }> {
  if (!opts?.force && _geminiCache && Date.now() - _geminiCache.at < GEMINI_CACHE_TTL_MS) {
    return _geminiCache.result;
  }
  const key = opts?.key
    ?? (typeof localStorage !== 'undefined'
        ? (() => { try { return (JSON.parse(localStorage.getItem('axe_llm_connections') ?? '{}') as Record<string, { key?: string } | undefined>).google?.key; } catch { return undefined; } })()
        : undefined)
    ?? import.meta.env.VITE_GEMINI_API_KEY ?? '';
  if (!key) {
    const result = { ok: false, latency: 0 };
    _geminiCache = { at: Date.now(), result };
    return result;
  }
  const t = Date.now();
  let result: { ok: boolean; latency: number };
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent`,
      {
        method: 'POST',
        headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'hi' }] }], generationConfig: { maxOutputTokens: 1 } }),
        signal: AbortSignal.timeout(8000),
      },
    );
    result = { ok: res.ok, latency: Date.now() - t };
  } catch {
    result = { ok: false, latency: Date.now() - t };
  }
  _geminiCache = { at: Date.now(), result };
  return result;
}

/**
 * Reachability probe for the VPS-hosted agent bridges (openhands/openjarvis/
 * openclaw/kilocode/crewai/hermes) — the one already used by ModelStatusWidget
 * and the Home "Models & Tests" panel, so it's exported here for Settings'
 * provider-key cards to reuse instead of testing these bridges with a
 * generic OpenAI chat-completion probe they were never built to answer.
 */
export async function vpsAgentStatus(key: string): Promise<{ ok: boolean; latency: number; meta?: Record<string, unknown> }> {
  const t = Date.now();
  try {
    const all = await fetchVpsAgentsStatus();
    const entry = all[key];
    if (!entry) return { ok: false, latency: Date.now() - t, meta: { configured: false } };
    return { ok: entry.reachable, latency: entry.latency_ms ?? Date.now() - t, meta: entry as unknown as Record<string, unknown> };
  } catch {
    return { ok: false, latency: Date.now() - t };
  }
}

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
    key: 'axe_core_api',
    check: async () => {
      const t = Date.now();
      try {
        const res = await fetch(`${AXE_CORE_API_URL.replace(/\/$/, '')}/health`, {
          signal: AbortSignal.timeout(6000),
        });
        const data = res.ok ? await res.json().catch(() => ({})) : null;
        return { ok: res.ok, latency: Date.now() - t, meta: data ?? {} };
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
    check: async () => checkGeminiReal(),
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
    check: async () => vpsAgentStatus('openhands'),
  },
  {
    key: 'openjarvis',
    check: async () => vpsAgentStatus('openjarvis'),
  },
  {
    key: 'openclaw',
    check: async () => vpsAgentStatus('openclaw'),
  },
  {
    key: 'kilocode',
    check: async () => vpsAgentStatus('kilocode'),
  },
  {
    key: 'crewai',
    check: async () => vpsAgentStatus('crewai'),
  },
  {
    key: 'hermes',
    check: async () => vpsAgentStatus('hermes'),
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
        try {
          const res = await fetch(`${AXE_CORE_API_URL.replace(/\/$/, '')}/internal/langgraph/run`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...axeCoreApiExtraHeaders() },
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
          if (res.ok && dispatched) {
            return {
              ok: true,
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
          // VPS reachable but didn't dispatch (e.g. AXE_CORE_API_KEY not yet
          // configured server-side) — fall through to the local self-test below.
        } catch {
          // VPS proxy unreachable — fall through to the local self-test below.
        }

        const { orchestrate } = await import('@/application/agents/langGraphOrchestrator');
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
        // The column is last_sync_at. Asking for created_at threw
        // "column intel_sync_log.created_at does not exist" on every health
        // check — caught by the catch below, so the dashboard simply showed
        // AXE Intel as offline and never said why. Eight of these in a
        // twenty-minute window on 2026-08-19, against a database that was
        // already struggling.
        //
        // getIntelFeedHealth() in companionToolsService.ts reads the same table
        // with the right name, which is how the mismatch was visible at all.
        const { data } = await sb.from('intel_sync_log').select('last_sync_at').order('last_sync_at', { ascending: false }).limit(1).maybeSingle();
        if (!data?.last_sync_at) return { ok: false, latency: Date.now() - t };
        const age = Date.now() - new Date(data.last_sync_at).getTime();
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
        const { error } = await sb.from('core_system_state')
          .upsert({
            service: key,
            display: SERVICE_DISPLAY_NAMES[key] ?? key,
            enabled: true,
            ...update,
          }, { onConflict: 'service' });
        if (error) console.error(`[system] Failed to write health check for "${key}":`, error.message);
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
