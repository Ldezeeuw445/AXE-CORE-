import { getSupabase, currentUserId } from '@/infrastructure/supabase/supabaseClient';
import { recordEvent } from '@/infrastructure/persistence/memoryRecorder';

// currentUserId() reads the client's locally cached session instead of
// revalidating against GoTrue on every call — see its doc comment in
// supabaseClient.ts for why: this is where the auth-lockout bug that
// prompted it was actually found (dozens of saveSetting() call sites in
// the trading agent's background loops, all previously calling
// sb.auth.getUser() unconditionally).

/** What actually happened to a save, so a caller can tell the difference
 *  between "stored everywhere" and "stored only on this device".
 *
 *  This exists because the silent downgrade described below was found doing
 *  real damage: a Google API key pasted into Settings landed in localStorage,
 *  the UI showed it as saved, and the row in `user_settings` stayed two days
 *  old — so every background job kept using the dead key while the screen
 *  showed the new one. Nothing was broken enough to notice, which is exactly
 *  what made it cost an evening. */
export interface SaveOutcome {
  /** True only when the value reached `user_settings`, i.e. other devices and
   *  the server-side agents will see it. */
  synced: boolean;
  /** Why it did not sync — safe to show to the user. */
  reason?: string;
}

/** Save a setting key→value for the current user.
 *  Writes to localStorage immediately, and records the change durably.
 *
 *  Never throws: a failed sync must not lose the local write. Callers that
 *  care whether the value left the device should check the returned
 *  {@link SaveOutcome} — settings the agents read are exactly that case. */
export async function saveSetting(key: string, value: unknown): Promise<SaveOutcome> {
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
  if (!sb) {
    return notSynced(key, 'Supabase is not configured in this build.');
  }
  const userId = await currentUserId(sb);
  if (!userId) {
    return notSynced(
      key,
      'Not signed in — saved on this device only. Sign in and save again so ' +
        'AXE and your other devices pick it up.',
    );
  }

  const { error } = await sb.from('user_settings').upsert(
    { user_id: userId, key, value: value as object, updated_at: new Date().toISOString() },
    { onConflict: 'user_id,key' }
  );
  if (error) {
    return notSynced(key, `Could not reach Supabase: ${error.message}`);
  }
  return { synced: true };
}

/** Fired whenever a setting stayed on this device. Settings screens listen for
 *  it so the warning reaches the person who just pressed save — most callers
 *  are `void saveSetting(...)` inside state updaters and cannot await a result,
 *  and a console line nobody opens is not a signal. */
export const SETTING_UNSYNCED_EVENT = 'axe:setting-unsynced';

function notSynced(key: string, reason: string): SaveOutcome {
  // Loud in the console even when the caller ignores the result, because the
  // failure mode this replaces was total silence.
  console.warn(`[settings] "${key}" was NOT synced — ${reason}`);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent(SETTING_UNSYNCED_EVENT, { detail: { key, reason } }),
    );
  }
  return { synced: false, reason };
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
