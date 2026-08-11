/**
 * durableConfigService — settings that must be identical in every window,
 * regardless of which one happens to be logged into Supabase.
 *
 * Found live: Luka runs the packaged Tauri desktop app for 24/7 autopilot,
 * separately from the browser he uses to configure things. MetaAPI's
 * credentials were saved via userSettingsService, which reads/writes
 * `user_settings` gated on `sb.auth.getUser()` — a session local to
 * whichever window made the call. The Tauri app's window was never signed
 * in, so its copy of `getMetaApiConfig()` always returned null; the trading
 * agent silently fell back to the internal paper book every single cycle
 * while the browser kept showing "connected", because the browser's window
 * *was* signed in and reading its own, different, correct config. Real
 * money was priced against a broker connection that, from the agent's own
 * point of view, never existed.
 *
 * `user_settings` can't fix this by itself: its `user_id` column is a `uuid`
 * with a hard foreign key into `auth.users`, so it can only ever hold rows
 * for a real signed-in account — the app-wide AXE_USER_ID constant used
 * everywhere else this session doesn't fit there, and isn't even valid UUID
 * shape. Rather than add a fourth table (and a fourth manual SQL step),
 * this reuses `global_memory`, which already has a TEXT user_id, an
 * upsert-by-key write path proven working all session (memUpsert/memList),
 * and needs no session at all — every window reads the same row through the
 * same service_role-backed API regardless of who is logged in where.
 */
import { memUpsert, memList } from '@/infrastructure/gateways/axeCoreApiService';
import { AXE_USER_ID } from '@/infrastructure/persistence/chatPersistence';

const KEY_PREFIX = 'cfg:';

export async function loadDurableConfig<T>(key: string, fallback: T): Promise<T> {
  try {
    const rows = await memList({ user_id: AXE_USER_ID, key_prefix: `${KEY_PREFIX}${key}`, limit: 5 });
    const row = rows.find(r => r.key === `${KEY_PREFIX}${key}`);
    if (!row) return fallback;
    return JSON.parse(row.value) as T;
  } catch (err) {
    console.error('[durableConfig] load failed, using fallback:', key, err);
    return fallback;
  }
}

export async function saveDurableConfig(key: string, value: unknown): Promise<void> {
  await memUpsert([{
    user_id: AXE_USER_ID,
    category: 'user_preference',
    key: `${KEY_PREFIX}${key}`,
    value: JSON.stringify(value),
    confidence: 1,
    metadata: { kind: 'config' },
  }]);
}
