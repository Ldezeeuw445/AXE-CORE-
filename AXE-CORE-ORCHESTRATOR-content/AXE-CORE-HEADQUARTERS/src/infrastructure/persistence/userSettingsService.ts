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
/**
 * How long the server copy may take before the caller is let go: 10 seconds.
 *
 * Long enough for a slow connection, far short of a cycle.
 */
export const SETTINGS_SYNC_DEADLINE_MS = 10_000;

/**
 * Never let a settings write hold its caller open indefinitely.
 *
 * This exact failure has stopped the trading loop twice. The comment in
 * agentAutopilot records the first: the cycle finished all six symbols, wrote
 * every decision, and then never returned, because the last statement was a
 * saveSetting whose Supabase call has no timeout — `cycleInFlight` stayed true
 * and every later tick returned early. From outside it looked like an idle app.
 *
 * That was answered with a Promise.race at that one call site, which left every
 * other caller unprotected. The cycle journal calls saveSetting through
 * saveCycleRecord after EVERY stage, four to six times per symbol. Measured
 * 2026-08-27 across 26 cycles: 25 of them stopped with `research, intel,
 * companion` recorded and `endedAt` still null — frozen at a stage boundary,
 * one symbol per cycle, roughly one cycle per watchdog interval.
 *
 * So the deadline belongs here, where every caller gets it, rather than at the
 * call sites that happen to remember. A timed-out sync is reported the same way
 * as any other unsynced write: the local and durable copies already happened,
 * and the caller carries on.
 */
async function withSyncDeadline(
  key: string,
  sync: () => Promise<SaveOutcome>,
): Promise<SaveOutcome> {
  const timedOut = Symbol('timeout');
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const outcome = await Promise.race([
      sync(),
      new Promise<typeof timedOut>(resolve => {
        timer = setTimeout(() => resolve(timedOut), SETTINGS_SYNC_DEADLINE_MS);
      }),
    ]);
    if (outcome === timedOut) {
      return notSynced(key, `The server did not answer within ${SETTINGS_SYNC_DEADLINE_MS / 1000}s — kept locally.`);
    }
    return outcome;
  } catch (e) {
    // A rejected sync is not worth taking the caller down for either.
    return notSynced(key, e instanceof Error ? e.message : 'The server write failed.');
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Write the local fast-path copy, and never let it take the durable write down.
 *
 * localStorage here is a cache: every value written through saveSetting also
 * goes to user_settings and to memory, and loadSetting falls back to the cloud
 * copy when the local one is absent. But setItem THROWS when WebKit's ~5 MB
 * store is full, and it was the first statement in saveSetting — so a full
 * cache aborted the function before the durable write, before recordEvent, and
 * before the Supabase sync.
 *
 * Measured 2026-08-27, the autopilot's own stored result:
 *   "status write failed (The quota has been exceeded.) — cycle DID finish 8
 *   symbol(s)"
 * The cycle worked. The record of it did not, and neither did any other setting
 * written while the store was full. That is a cache miss escalating into total
 * settings loss, and it is the wrong direction: losing speed is survivable,
 * losing the durable copy is not.
 *
 * Returns whether the local copy landed, so the caller can say so.
 */
function writeLocalCopy(key: string, json: string): boolean {
  try {
    localStorage.setItem(key, json);
    return true;
  } catch (e) {
    // The message reads like a provider refusing a request, and has been
    // mistaken for one before — this is WebKit's own store, and no amount of
    // retrying or topping up an account elsewhere changes it.
    console.warn(
      `[settings] local cache full — "${key}" kept only in the durable copy:`,
      e instanceof Error ? e.message : e,
    );
    return false;
  }
}

export async function saveSetting(key: string, value: unknown): Promise<SaveOutcome> {
  const json = JSON.stringify(value);
  const cached = writeLocalCopy(key, json);
  void cached;

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

  return withSyncDeadline(key, async (): Promise<SaveOutcome> => {
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

  // Clearing a setting means REMOVING the row, not writing null into it.
  // `user_settings.value` is NOT NULL, so an upsert with null is rejected with
  // 23502 — which is how "switch ★ Primary off" silently failed to persist
  // while the UI showed it as off. Absence is the honest representation of
  // "not set": loadSetting then returns its fallback, which is what every
  // caller already handles.
  if (value === null || value === undefined) {
    try { localStorage.removeItem(key); } catch { /* cache only — the delete below is what counts */ }
    const { error: delError } = await sb
      .from('user_settings')
      .delete()
      .eq('user_id', userId)
      .eq('key', key);
    if (delError) {
      return notSynced(key, `Could not clear it on the server: ${delError.message}`);
    }
    return { synced: true };
  }

  const { error } = await sb.from('user_settings').upsert(
    { user_id: userId, key, value: value as object, updated_at: new Date().toISOString() },
    { onConflict: 'user_id,key' }
  );
  if (error) {
    // Say what actually went wrong. This used to read "Could not reach
    // Supabase" for every failure, which sent Luka looking for a network
    // problem while the real answer was a NOT NULL constraint — and he spotted
    // the contradiction himself: if Supabase were unreachable he could not
    // have been signed in to see the message.
    return notSynced(key, `Supabase refused the write: ${error.message}`);
  }
  return { synced: true };
  });
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

/**
 * Persist the per-agent model choices, and mirror them locally.
 *
 * The mirror is not an optimisation: deskAgentModels reads this synchronously
 * from inside the cycle, once per lane, and an await there would put a network
 * round-trip between the desk and every thought it has.
 */
export async function saveAgentModelChoices(choices: unknown): Promise<void> {
  try { localStorage.setItem('axe_agent_models', JSON.stringify(choices)); } catch { /* cache only */ }
  await saveSetting('axe_agent_models', choices);
}

/** Read them back, preferring the durable copy so a second device agrees. */
export async function loadAgentModelChoicesDurable<T>(fallback: T): Promise<T> {
  return loadSetting<T>('axe_agent_models', fallback);
}
