import { createClient, SupabaseClient } from '@supabase/supabase-js';

let _client: SupabaseClient | null = null;
let _lastUrl = '';
let _lastKey = '';

// Env vars baked in at build time (Vercel) — localStorage overrides for local dev
const ENV_URL = import.meta.env.VITE_SUPABASE_URL ?? '';
const ENV_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

/**
 * Returns a lazy Supabase client.
 * Priority: localStorage (dev override) → VITE env vars (production)
 */
/**
 * The user id for the current session, without a network round-trip.
 *
 * `sb.auth.getUser()` always revalidates the JWT against GoTrue over the
 * network; `getSession()` reads the client's local cache. Found live on
 * 2026-08-11: userSettingsService's four call sites all used getUser()
 * unconditionally, and with dozens of background loops (trading autopilot
 * every 60s, circuit breaker, learning stats) calling saveSetting() from both
 * a browser tab and the packaged Tauri app at once, that flooded
 * /auth/v1/user with hundreds of requests in minutes and starved the actual
 * sign-in request until it timed out — Luka was locked out by the app's own
 * background traffic, not a real outage. RLS still enforces authorization at
 * the DB level regardless of which call resolves the id, so this loses no
 * security; it only removes a network round-trip nothing here needed.
 *
 * Every read of "which user is this for" outside an explicit login/logout
 * flow should go through this, not sb.auth.getUser() directly — especially
 * anything called from a poll or an interval.
 */
export async function currentUserId(sb: SupabaseClient): Promise<string | null> {
  const { data: { session } } = await sb.auth.getSession();
  return session?.user?.id ?? null;
}

/**
 * `?? ENV_URL` only falls back on `null`/`undefined` — an empty string
 * survives it untouched. localStorage.getItem() returns `null` when a key is
 * absent, but the literal `""` when a key exists and was set to nothing (e.g.
 * a settings field that was once cleared rather than removed). That `""`
 * then permanently shadows a correctly baked-in env var on that one install,
 * with no further signal — confirmed live 2026-08-11: this exact mechanism
 * produced a standing "Supabase not configured" that had nothing to do with
 * Supabase's own health, the build, or the .env file, all of which were
 * fine. Trimming and treating blank as absent closes the whole failure class.
 */
function readOverride(key: string): string | null {
  if (typeof localStorage === 'undefined') return null;
  const v = localStorage.getItem(key);
  return v && v.trim() ? v : null;
}

export function getSupabase(): SupabaseClient | null {
  const url = readOverride('axe_supa_url') ?? ENV_URL;
  const key = readOverride('axe_supa_key') ?? ENV_KEY;
  if (!url || !key) return null;
  if (_client && url === _lastUrl && key === _lastKey) return _client;
  _client = createClient(url, key);
  _lastUrl = url;
  _lastKey = key;
  return _client;
}

/** Get a Supabase client guaranteed to work (throws if not configured) */
export function requireSupabase(): SupabaseClient {
  const c = getSupabase();
  if (!c) throw new Error('Supabase not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
  return c;
}

export function resetSupabaseClient(): void {
  _client = null;
  _lastUrl = '';
  _lastKey = '';
}

export const SUPABASE_URL = ENV_URL || 'https://pqnngpcgbdwxavbatbia.supabase.co';

