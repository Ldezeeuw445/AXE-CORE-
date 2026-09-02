/**
 * A full local cache must cost speed, not the durable write.
 *
 * setItem throws when WebKit's ~5 MB store is full, and it was the first
 * statement in saveSetting — so a full cache aborted the function before the
 * durable copy, before recordEvent, and before the Supabase sync. The autopilot
 * recorded it as "status write failed (The quota has been exceeded.) — cycle
 * DID finish 8 symbol(s)": the work happened, the record of it did not.
 *
 * The assertion that matters is that the code AFTER the local write still runs.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const recordEvent = vi.fn();
let supabaseImpl: unknown = null;
const getSupabase = vi.fn(() => supabaseImpl);
// The real one awaits sb.auth.getSession(); a client whose session never
// resolves is exactly the hang this deadline exists for.
const currentUserId = vi.fn(async (sb: { auth: { getSession: () => Promise<unknown> } }) => {
  await sb.auth.getSession();
  return 'u1';
});

vi.mock('@/infrastructure/persistence/memoryRecorder', () => ({ recordEvent }));
vi.mock('@/infrastructure/supabase/supabaseClient', () => ({ getSupabase, currentUserId }));

let throwOnSet = false;
const local = new Map<string, string>();
vi.stubGlobal('localStorage', {
  get length() { return local.size; },
  key: (i: number) => [...local.keys()][i] ?? null,
  getItem: (k: string) => local.get(k) ?? null,
  setItem: (k: string, v: string) => {
    if (throwOnSet) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    local.set(k, v);
  },
  removeItem: (k: string) => { local.delete(k); },
  clear: () => local.clear(),
});

const { saveSetting, SETTINGS_SYNC_DEADLINE_MS } = await import('./userSettingsService');

beforeEach(() => { throwOnSet = false; supabaseImpl = null; local.clear(); recordEvent.mockClear(); });

describe('saveSetting with a full local cache', () => {
  it('still records the value durably', async () => {
    throwOnSet = true;
    await saveSetting('axe_trading_autopilot_last_result', 'cycle finished 8 symbols');
    // This is the line that never ran before: the durable record.
    expect(recordEvent).toHaveBeenCalledTimes(1);
    expect(recordEvent.mock.calls[0][0]).toMatchObject({
      kind: 'preference', dedupeKey: 'axe_trading_autopilot_last_result',
    });
  });

  it('resolves instead of throwing at the caller', async () => {
    throwOnSet = true;
    await expect(saveSetting('k', { a: 1 })).resolves.toBeTruthy();
  });

  it('reports that it did not sync, rather than claiming success', async () => {
    throwOnSet = true;
    const outcome = await saveSetting('k', 1);
    expect(outcome.synced).toBe(false);
    expect(outcome.reason).toBeTruthy();
  });

  it('still uses the cache when there is room', async () => {
    await saveSetting('k', { a: 1 });
    expect(local.get('k')).toBe(JSON.stringify({ a: 1 }));
    expect(recordEvent).toHaveBeenCalledTimes(1);
  });
});

describe('saveSetting when the server never answers', () => {
  it('lets the caller go instead of hanging forever', async () => {
    // The failure this replaces: the cycle finished every symbol, wrote every
    // decision, and never returned — because a settings write was still open.
    // cycleInFlight stayed true and every later tick returned early, which from
    // outside looks exactly like an idle app.
    vi.useFakeTimers();
    supabaseImpl = { auth: { getSession: () => new Promise(() => { /* never resolves */ }) } };

    const pending = saveSetting('axe_trading_cycle_journal', [{ a: 1 }]);
    let settled = false;
    void pending.then(() => { settled = true; });

    await vi.advanceTimersByTimeAsync(SETTINGS_SYNC_DEADLINE_MS - 1);
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(2);
    const outcome = await pending;
    expect(outcome.synced).toBe(false);
    expect(outcome.reason).toContain('did not answer');
    vi.useRealTimers();
  });

  it('still wrote the local and durable copies before giving up on the server', async () => {
    vi.useFakeTimers();
    supabaseImpl = { auth: { getSession: () => new Promise(() => {}) } };
    const pending = saveSetting('k', { a: 1 });
    await vi.advanceTimersByTimeAsync(SETTINGS_SYNC_DEADLINE_MS + 1);
    await pending;
    expect(local.get('k')).toBe(JSON.stringify({ a: 1 }));
    expect(recordEvent).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
