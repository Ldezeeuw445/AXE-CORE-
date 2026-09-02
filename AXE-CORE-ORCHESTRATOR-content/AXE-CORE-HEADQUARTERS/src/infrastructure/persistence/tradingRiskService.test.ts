/**
 * Risk is per account, and these prove the selection actually is.
 *
 * The storage supported per-account keys for weeks while the engine called
 * getRiskProfile() with no argument, so every account read the desk default.
 * Storage that CAN separate accounts and a caller that never asks it to look
 * identical from the outside — which is why the interesting assertion is that
 * two accounts get DIFFERENT answers, not that one account gets an answer.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const store = new Map<string, unknown>();
const loadSetting = vi.fn(async (k: string, fb: unknown) => (store.has(k) ? store.get(k) : fb));
const saveSetting = vi.fn(async (k: string, v: unknown) => { store.set(k, v); });

vi.mock('@/infrastructure/persistence/userSettingsService', () => ({ loadSetting, saveSetting }));

// The service writes through to localStorage as a fast path; node has none.
// Backed by the same map so the two layers cannot disagree in the test the way
// they cannot disagree in the browser.
const local = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => local.get(k) ?? null,
  setItem: (k: string, v: string) => { local.set(k, v); },
  removeItem: (k: string) => { local.delete(k); },
  clear: () => local.clear(),
});

const { getRiskProfile, saveRiskProfile } = await import('./tradingRiskService');

const PROP = 'acct-prop';
const DEMO = 'acct-demo';

beforeEach(() => { store.clear(); local.clear(); loadSetting.mockClear(); });

describe('getRiskProfile', () => {
  it('gives two accounts their own settings, not one shared answer', async () => {
    await saveRiskProfile({ mode: 'funded', riskPerTradePct: 0.005, maxDrawdownPct: 0.06 } as never, PROP);
    await saveRiskProfile({ mode: 'personal', riskPerTradePct: 0.02, maxDrawdownPct: 0.25 } as never, DEMO);

    const prop = await getRiskProfile(PROP);
    const demo = await getRiskProfile(DEMO);

    expect(prop.riskPerTradePct).toBe(0.005);
    expect(demo.riskPerTradePct).toBe(0.02);
    // The one that costs money if it leaks: a 6% prop drawdown must not be
    // measured with a personal demo's 25%.
    expect(prop.maxDrawdownPct).toBe(0.06);
    expect(demo.maxDrawdownPct).toBe(0.25);
  });

  it('does not let one account read another account key', async () => {
    await saveRiskProfile({ mode: 'funded', riskPerTradePct: 0.005 } as never, PROP);
    const other = await getRiskProfile(DEMO);
    expect(other.riskPerTradePct).not.toBe(0.005);
  });

  it('an account with no profile of its own inherits the desk default', async () => {
    await saveRiskProfile({ mode: 'funded', riskPerTradePct: 0.007 } as never, null);
    const inherited = await getRiskProfile('acct-new');
    expect(inherited.riskPerTradePct).toBe(0.007);
  });

  it('falls back to the built-in profile when nothing is stored at all', async () => {
    const p = await getRiskProfile('acct-unknown');
    expect(p.mode).toBeTruthy();
    expect(p.riskPerTradePct).toBeGreaterThan(0);
  });

  it('reads the account-suffixed key, which is what the engine now asks for', async () => {
    await getRiskProfile(PROP);
    const keysAsked = loadSetting.mock.calls.map(c => c[0]);
    expect(keysAsked).toContain(`axe_trading_risk_profile:${PROP}`);
  });
});
