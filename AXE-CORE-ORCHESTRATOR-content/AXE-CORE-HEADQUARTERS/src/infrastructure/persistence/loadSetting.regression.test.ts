import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Pins down the exact failure that surfaced as a recurring, undismissable
 * error toast on the Personal Computer Use overlay window, and corrects the
 * earlier, imprecise diagnosis of it ("null causes a rejection" conflates
 * two separate mechanisms).
 *
 * What actually happened, reproduced here rather than asserted in a
 * comment:
 *   1. `localStorage` evaluated to the literal value `null` in that
 *      window's WKWebView (not `undefined`, not a thrown SecurityError from
 *      the accessor — confirmed by the exact error text it produced: "null
 *      is not an object (evaluating 'localStorage.getItem')", WebKit's
 *      phrasing specifically for a null base value).
 *   2. Reading `.getItem` off that `null` is an ordinary property access on
 *      null, which throws a TypeError synchronously. `null` itself causes
 *      nothing on its own — this is the throw, and it is unrelated to
 *      promises.
 *   3. loadSetting() being an `async function` is the separate, second fact
 *      that converts a synchronous throw inside it into a REJECTED PROMISE
 *      for whoever calls it. The same throw inside a plain (non-async)
 *      function would have been an ordinary uncaught exception instead.
 *   4. Several callers (e.g. voorkeurMachine(), polled every 5s by
 *      ComputerUseOverlay.tsx) never attached their own .catch() to that
 *      rejection, so it reached the page-wide `unhandledrejection` listener
 *      in ErrorBoundary.tsx, which shows it as a toast — recurring every
 *      poll cycle because the underlying read never stopped failing.
 *
 * These tests stub `globalThis.localStorage = null` (reproducing step 1
 * directly, rather than trusting the theory) and assert that loadSetting
 * survives it: no throw, no rejection, falls through past the local cache
 * exactly like a cache miss would.
 */

vi.mock('@/infrastructure/supabase/supabaseClient', () => ({
  getSupabase: () => null,
  currentUserId: async () => null,
}));

const { loadSetting } = await import('@/infrastructure/persistence/userSettingsService');

let realLocalStorage: Storage;

beforeEach(() => {
  realLocalStorage = globalThis.localStorage;
});

afterEach(() => {
  Object.defineProperty(globalThis, 'localStorage', { value: realLocalStorage, configurable: true, writable: true });
});

describe('loadSetting with a null localStorage (the Personal Computer Use window symptom)', () => {
  it('confirms the exact failure mode this pins down: localStorage.getItem on a null localStorage throws synchronously', () => {
    // This is the reproduction step, not the assertion under test — it
    // exists so the "why" above is proven, not just asserted.
    Object.defineProperty(globalThis, 'localStorage', { value: null, configurable: true, writable: true });
    expect(() => (globalThis.localStorage as unknown as Storage).getItem('x')).toThrow(TypeError);
  });

  it('does not reject when localStorage is null — falls through as a cache miss instead', async () => {
    Object.defineProperty(globalThis, 'localStorage', { value: null, configurable: true, writable: true });

    // getSupabase() is mocked to return null above, so this exercises
    // exactly the path a real "no client yet" or "storage unavailable"
    // window takes: past the (would-be-throwing) local read, then straight
    // to the fallback, with nothing thrown or rejected along the way.
    await expect(loadSetting('axe_computer_voorkeur_machine', null)).resolves.toBeNull();
  });

  it('same for a non-null fallback value, to rule out a null-specific coincidence', async () => {
    Object.defineProperty(globalThis, 'localStorage', { value: null, configurable: true, writable: true });
    await expect(loadSetting('some_key', 'default-value')).resolves.toBe('default-value');
  });
});
