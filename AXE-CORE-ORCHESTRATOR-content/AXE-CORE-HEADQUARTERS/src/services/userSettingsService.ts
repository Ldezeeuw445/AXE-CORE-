import { getSupabase } from '@/lib/supabaseClient';

/** Save a setting key→value for the current user.
 *  Writes to localStorage immediately, syncs to Supabase in background. */
export async function saveSetting(key: string, value: unknown): Promise<void> {
  const json = JSON.stringify(value);
  localStorage.setItem(key, json);

  const sb = getSupabase();
  if (!sb) return;
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return;

  await sb.from('user_settings').upsert(
    { user_id: user.id, key, value: value as object, updated_at: new Date().toISOString() },
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
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return fallback;

  const { data } = await sb
    .from('user_settings')
    .select('value')
    .eq('user_id', user.id)
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
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return;

  const { data } = await sb
    .from('user_settings')
    .select('key, value')
    .eq('user_id', user.id);

  if (!data) return;
  for (const row of data) {
    // Only hydrate if localStorage doesn't already have a newer value
    if (localStorage.getItem(row.key) === null) {
      localStorage.setItem(row.key, JSON.stringify(row.value));
    }
  }
}

/** Delete a setting from both localStorage and Supabase. */
export async function deleteSetting(key: string): Promise<void> {
  localStorage.removeItem(key);
  const sb = getSupabase();
  if (!sb) return;
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return;
  await sb.from('user_settings').delete().eq('user_id', user.id).eq('key', key);
}
