/**
 * companionToolsService — calls AXE Companion's local sidecar server
 * directly (both apps are packaged Tauri desktop builds on the same Mac).
 *
 * Companion's Tauri app spawns its Next.js server on a random free local
 * port every launch (its own src-tauri/src/lib.rs's free_port(), by
 * design). Its src/instrumentation.ts registers {port, pid, startedAt} in
 * global_memory under cfg:companion_sidecar on every boot — the same
 * durable, session-independent store this app's own durableConfigService.ts
 * uses for the equivalent MetaAPI-config cross-window problem. Deliberately
 * NOT read through durableConfigService.ts's loadDurableConfig(): that
 * helper scopes everything under THIS app's own AXE_USER_ID (which has an
 * "-axe-core" suffix — see chatPersistence.ts), but cfg:companion_sidecar
 * is Companion's own state, written by Companion under the bare shared
 * owner id, not namespaced to any one app.
 */
import { memList } from '@/infrastructure/gateways/axeCoreApiService';
import { loadSetting, saveSetting } from '@/infrastructure/persistence/userSettingsService';

const AXE_OWNER_USER_ID = 'acff7a12-1111-481d-a7a9-cc07583b8069';
const SIDECAR_KEY = 'cfg:companion_sidecar';

// If Companion hasn't rebooted in this long, treat the registration as
// stale rather than trusting a possibly-dead process (the app isn't
// necessarily kept open 24/7 the way this one's autopilot assumes).
const PORT_STALE_MS = 6 * 60 * 60 * 1000;
const PORT_CACHE_TTL_MS = 60_000;

interface CompanionSidecarInfo {
  port: number;
  pid: number;
  startedAt: string;
}

let cachedPort: { port: number; checkedAt: number } | null = null;

async function discoverCompanionPort(): Promise<number | null> {
  if (cachedPort && Date.now() - cachedPort.checkedAt < PORT_CACHE_TTL_MS) return cachedPort.port;
  try {
    const rows = await memList({ user_id: AXE_OWNER_USER_ID, key_prefix: SIDECAR_KEY, limit: 1 });
    const row = rows.find(r => r.key === SIDECAR_KEY);
    if (!row) return null;
    const info = JSON.parse(row.value) as CompanionSidecarInfo;
    if (!Number.isFinite(info.port) || Date.now() - Date.parse(info.startedAt) > PORT_STALE_MS) return null;
    cachedPort = { port: info.port, checkedAt: Date.now() };
    return info.port;
  } catch {
    return null;
  }
}

async function companionFetch(path: string, init?: RequestInit): Promise<Response> {
  const port = await discoverCompanionPort();
  if (port == null) throw new Error('AXE Companion not reachable — sidecar not registered or stale (is the app running?)');
  const secret = import.meta.env.VITE_AXE_COMPANION_TOOLS_SECRET as string | undefined;
  if (!secret) throw new Error('VITE_AXE_COMPANION_TOOLS_SECRET not configured on this build');
  return fetch(`http://127.0.0.1:${port}${path}`, {
    ...init,
    headers: { ...(init?.headers || {}), Authorization: `Bearer ${secret}` },
  });
}

export interface CompanionToolResult<T = unknown> {
  ok: boolean;
  tool: string;
  data: T | null;
  error: string | null;
}

/** Calls one of Companion's exposed read-only tools: get_smart_money_intel,
 *  get_economic_calendar, get_news_headlines — see its
 *  src/app/api/tools/call/route.ts for the full contract and why only
 *  these 3 (of Companion's 18 internal chat tools) are exposed here. */
export async function callCompanionTool<T = unknown>(
  tool: 'get_smart_money_intel' | 'get_economic_calendar' | 'get_news_headlines',
  args: Record<string, unknown> = {},
): Promise<CompanionToolResult<T>> {
  try {
    const res = await companionFetch('/api/tools/call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool, args }),
    });
    const body = (await res.json()) as { ok?: boolean; data?: T; error?: string };
    if (!res.ok || !body.ok) return { ok: false, tool, data: null, error: body.error || `HTTP ${res.status}` };
    return { ok: true, tool, data: body.data ?? null, error: null };
  } catch (e) {
    return { ok: false, tool, data: null, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Triggers Companion's cross-feed correlation analysis (the LLM pass over
 *  its 10 intel feeds) — Companion no longer runs on Vercel Cron, so this
 *  app drives the schedule instead, from its own 24/7-while-open loop. */
export async function triggerCompanionCorrelation(): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await companionFetch('/api/cron/intel-correlate');
    const body = (await res.json()) as { ok?: boolean; error?: string };
    if (!res.ok || body.ok === false) return { ok: false, error: body.error || `HTTP ${res.status}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function isCompanionReachable(): Promise<boolean> {
  return (await discoverCompanionPort()) != null;
}

const KEY_LAST_CORRELATION_TRIGGER = 'axe_companion_correlation_last_trigger';
const CORRELATION_INTERVAL_MS = 30 * 60 * 1000;

/** Interval-gate check, same idiom as agentAutopilot.ts's
 *  maybeRunTradingAutopilot — cheap to call every minute from
 *  axeBootstrap.ts, no-ops until 30 minutes have actually passed. Silent
 *  no-op (not an error) when Companion isn't running right now. */
export async function maybeTriggerCompanionCorrelation(): Promise<void> {
  const last = await loadSetting<string | null>(KEY_LAST_CORRELATION_TRIGGER, null);
  const dueAt = last ? Date.parse(last) + CORRELATION_INTERVAL_MS : 0;
  if (Date.now() < dueAt) return;
  if (!(await isCompanionReachable())) return;

  await saveSetting(KEY_LAST_CORRELATION_TRIGGER, new Date().toISOString());
  const result = await triggerCompanionCorrelation();
  if (!result.ok) console.warn('[companionTools] correlation trigger failed:', result.error);
}
