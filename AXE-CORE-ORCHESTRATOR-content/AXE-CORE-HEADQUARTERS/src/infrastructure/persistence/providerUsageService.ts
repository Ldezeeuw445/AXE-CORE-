/**
 * Provider usage telemetry shown in Settings.
 *
 * Three facts are deliberately kept separate:
 * - balance: purchased/provider credits (only where the provider exposes it)
 * - quota: rate-limit headroom from a real request
 * - usage: token/cost counters returned by that request
 *
 * Never derive a fake "credits remaining" percentage from token rate limits.
 */
import {
  axeCoreApiExtraHeaders,
  axeCoreApiUrl,
  axeApiAuthHeaders,
} from '@/infrastructure/config/apiUrl';

const STORAGE_KEY = 'axe_provider_usage_v1';

export interface ProviderBalance {
  provider: string;
  configured?: boolean;
  supported?: boolean;
  kind?: 'balance' | 'rate_limit';
  unit?: string;
  usage?: number | null;
  usage_daily?: number | null;
  usage_weekly?: number | null;
  usage_monthly?: number | null;
  limit?: number | null;
  limit_remaining?: number | null;
  limit_reset?: string | null;
  is_free_tier?: boolean | null;
  rate_limit?: unknown;
  is_available?: boolean | null;
  balances?: Array<{
    currency?: string;
    total_balance?: string;
    granted_balance?: string;
    topped_up_balance?: string;
  }>;
  tier?: string | null;
  status?: string | null;
  used?: number | null;
  remaining?: number | null;
  reset_unix?: number | null;
  billing_period?: string | null;
  current_overage?: unknown;
  reason?: string;
  error?: string;
}

export interface ProviderUsageSnapshot {
  provider: string;
  updatedAt: string;
  quota?: Record<string, string>;
  usage?: Record<string, unknown>;
  balance?: ProviderBalance;
}

type Store = Record<string, ProviderUsageSnapshot>;

function readStore(): Store {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? parsed as Store : {};
  } catch {
    return {};
  }
}

function writeStore(store: Store): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(store)); } catch { /* private/full storage */ }
  try { window.dispatchEvent(new CustomEvent('axe:provider-usage')); } catch { /* non-DOM tests */ }
}

export function readProviderUsage(provider: string): ProviderUsageSnapshot | null {
  return readStore()[provider] ?? null;
}

export function readAllProviderUsage(): Store {
  return readStore();
}

/** Store telemetry from a real provider response. */
export function recordProviderUsage(
  provider: string,
  patch: { quota?: Record<string, string>; usage?: Record<string, unknown>; balance?: ProviderBalance },
): ProviderUsageSnapshot {
  const store = readStore();
  const previous = store[provider];
  const next: ProviderUsageSnapshot = {
    provider,
    updatedAt: new Date().toISOString(),
    quota: patch.quota ?? previous?.quota,
    usage: patch.usage ?? previous?.usage,
    balance: patch.balance ?? previous?.balance,
  };
  store[provider] = next;
  writeStore(store);
  return next;
}

/** Keep only rate-limit headers. Auth/cookie/request headers never enter storage. */
export function quotaFromHeaders(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((value, key) => {
    const k = key.toLowerCase();
    if (k.includes('ratelimit') || k === 'retry-after') out[k] = value.slice(0, 120);
  });
  return out;
}

/**
 * Ask the AXE backend for an exact provider balance where one exists.
 * The key may be omitted for a server-managed credential. Unsupported
 * providers return supported=false rather than a guessed value.
 */
export async function refreshProviderBalance(provider: string, key?: string): Promise<ProviderUsageSnapshot> {
  // Same privileged path as axeCoreApiService:
  // - web/dev -> same-origin /api|/proxy/axecore, which adds the server secret
  // - packaged Tauri/Android -> direct VPS only when the shell has the key
  // This avoids the desktop build accidentally calling a web-only route.
  const base = axeCoreApiUrl('/proxy/axecore', '/api/proxy/axecore').replace(/\/$/, '');
  const url = `${base}/proxy/ai/usage`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...axeCoreApiExtraHeaders(),
      ...axeApiAuthHeaders(url),
    },
    body: JSON.stringify({ provider, ...(key ? { key } : {}) }),
  });
  if (!res.ok) throw new Error(`usage probe HTTP ${res.status}`);
  const balance = await res.json() as ProviderBalance;
  return recordProviderUsage(provider, { balance });
}
