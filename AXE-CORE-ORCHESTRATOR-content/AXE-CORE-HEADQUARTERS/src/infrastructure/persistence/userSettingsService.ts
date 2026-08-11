import { getSupabase } from '@/infrastructure/supabase/supabaseClient';
import { recordEvent } from '@/infrastructure/persistence/memoryRecorder';

// getSession() reads the client's locally cached session — no network call
// unless the token is near expiry. getUser() always revalidates against
// GoTrue over the network, which is the right choice for security-sensitive
// checks but not for "which user am I writing this preference for" on every
// single settings write. Found live: the trading agent's background loops
// (autopilot every 60s, circuit breaker, learning stats, thinking traces —
// dozens of call sites) each fire saveSetting(), and every one of those hit
// auth.getUser() unconditionally. Running in both a browser tab and the
// packaged Tauri app at once, that flooded /auth/v1/user with hundreds of
// requests in minutes (confirmed via Supabase auth logs, several within the
// same second) and starved the actual /auth/v1/token sign-in request until
// it timed out — which is what made login suddenly stop working. RLS on
// user_settings still enforces authorization at the DB level regardless of
// which call we use here, so this loses no security.
async function currentUserId(sb: NonNullable<ReturnType<typeof getSupabase>>): Promise<string | null> {
  const { data: { session } } = await sb.auth.getSession();
  return session?.user?.id ?? null;
}

/** Save a setting key→value for the current user.
 *  Writes to localStorage immediately, and records the change durably. */
export async function saveSetting(key: string, value: unknown): Promise<void> {
  const json = JSON.stringify(value);
  localStorage.setItem(key, json);

  // Durable copy, independent of the Supabase session.
  //
  // The user_settings sync below only runs for a signed-in Supabase user. The
  // app does authenticate (AuthContext uses signInWithPassword), so that path
  // is not dead — but it is conditional, and a lapsed or not-yet-restored
  // session silently downgrades every write to localStorage-only with no
  // signal that it happened. Preferences are exactly what AXE should carry
  // across sessions and devices, so they also go into memory on the same
  // service-role path as everything else, which does not depend on a session.
  //
  // dedupeKey means a setting is one evolving fact, not an event log: the
  // current value overwrites the previous one.
  recordEvent({
    kind: 'preference',
    summary: `${key} = ${json.slice(0, 80)}`,
    details: { key, value },
    dedupeKey: key,
  });

  const sb = getSupabase();
  if (!sb) return;
  const userId = await currentUserId(sb);
  if (!userId) return;

  await sb.from('user_settings').upsert(
    { user_id: userId, key, value: value as object, updated_at: new Date().toISOString() },
    { onConflict: 'user_id,key' }
  );
}

/** Load a setting. Checks localStorage first (fast), then Supabase. */
export async function loadSetting<T>(key: string, fallback: T): Promise<T> {
  // Fast path: localStorage
  const local = localStorage.getItem(key);
  if (local !== null) {
    try { return JSON.parse(local) as T; } catch { /* ignore */ }
  }

  // Supabase sync
  const sb = getSupabase();
  if (!sb) return fallback;
  const userId = await currentUserId(sb);
  if (!userId) return fallback;

  const { data } = await sb
    .from('user_settings')
    .select('value')
    .eq('user_id', userId)
    .eq('key', key)
    .single();

  if (data?.value !== undefined) {
    localStorage.setItem(key, JSON.stringify(data.value));
    return data.value as T;
  }
  return fallback;
}

/** Load ALL settings for the current user from Supabase into localStorage.
 *  Call once on login to hydrate the local cache. */
export async function hydrateSettingsFromSupabase(): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const userId = await currentUserId(sb);
  if (!userId) return;

  const { data } = await sb
    .from('user_settings')
    .select('key, value')
    .eq('user_id', userId);

  if (!data) return;
  for (const row of data) {
    localStorage.setItem(row.key, JSON.stringify(row.value));
  }
}

/** Delete a setting from both localStorage and Supabase. */
export async function deleteSetting(key: string): Promise<void> {
  localStorage.removeItem(key);
  const sb = getSupabase();
  if (!sb) return;
  const userId = await currentUserId(sb);
  if (!userId) return;
  await sb.from('user_settings').delete().eq('user_id', userId).eq('key', key);
}
