/**
 * MetaAPI's 429 says "too many unexisting or undeployed trading accounts". It
 * is not a volume limit — it counts requests to accounts that are not running,
 * and the autopilot was generating them every cycle against accounts nothing
 * on screen said were down.
 *
 * Measured 2026-08-26: after six accounts were registered, all eight went
 * UNDEPLOYED, including two that had been trading for days.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { accountIsDeployed, __forgetDeployment, type MetaApiConfig } from './metaApiService';

const CFG: MetaApiConfig = {
  token: 't', accountId: 'acc-1', region: 'london', enabled: true, updatedAt: '2026-08-26T00:00:00Z',
};

function respond(body: unknown, status = 200) {
  vi.stubGlobal('fetch', () => Promise.resolve(new Response(JSON.stringify(body), { status })));
}

beforeEach(() => __forgetDeployment(CFG.accountId));
afterEach(() => vi.restoreAllMocks());

describe('accountIsDeployed', () => {
  it('lets a live account through', async () => {
    respond({ state: 'DEPLOYED', connectionStatus: 'CONNECTED' });
    const r = await accountIsDeployed(CFG);
    expect(r.tradeable).toBe(true);
  });

  it('refuses an undeployed account and says where to fix it', async () => {
    // The exact state all eight accounts were in.
    respond({ state: 'UNDEPLOYED', connectionStatus: 'DISCONNECTED' });
    const r = await accountIsDeployed(CFG);
    expect(r.tradeable).toBe(false);
    expect(r.reason).toContain('UNDEPLOYED');
    expect(r.reason).toContain('MetaAPI');
  });

  it('holds back an account that is still deploying, without calling it broken', async () => {
    respond({ state: 'DEPLOYING', connectionStatus: 'DISCONNECTED' });
    const r = await accountIsDeployed(CFG);
    expect(r.tradeable).toBe(false);
    expect(r.reason).toContain('not ready yet');
  });

  it('refuses a deployed account that lost its broker connection', async () => {
    respond({ state: 'DEPLOYED', connectionStatus: 'DISCONNECTED' });
    const r = await accountIsDeployed(CFG);
    expect(r.tradeable).toBe(false);
    expect(r.reason).toContain('DISCONNECTED');
  });

  it('refuses an account MetaAPI has never heard of', async () => {
    // A 404 is the most definite no there is, and it is the exact request the
    // 429 counts. Deleting an account at MetaAPI while its row stays in the
    // desk config is a normal thing to do — it left three such rows behind on
    // 2026-08-27 — and each one would otherwise keep generating calls that
    // earn the throttle for the accounts that are working.
    respond({}, 404);
    const r = await accountIsDeployed(CFG);
    expect(r.tradeable).toBe(false);
    expect(r.reason).toContain('no such account');
  });

  it('treats an unreadable state as unknown, not as a refusal', async () => {
    // One bad network moment must not stop a desk that is working. The broker
    // remains the real gate.
    respond({}, 503);
    const r = await accountIsDeployed(CFG);
    expect(r.tradeable).toBe(true);
    expect(r.reason).toContain('unreadable');
  });

  it('treats a thrown request as unknown too', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new Error('offline')));
    const r = await accountIsDeployed(CFG);
    expect(r.tradeable).toBe(true);
  });

  it('caches an answer instead of asking before every order', async () => {
    let calls = 0;
    vi.stubGlobal('fetch', () => {
      calls += 1;
      return Promise.resolve(new Response(JSON.stringify({ state: 'DEPLOYED', connectionStatus: 'CONNECTED' }), { status: 200 }));
    });
    await accountIsDeployed(CFG);
    await accountIsDeployed(CFG);
    await accountIsDeployed(CFG);
    expect(calls).toBe(1);
  });

  it('does not cache an unknown, so a blip is retried rather than remembered', async () => {
    let calls = 0;
    vi.stubGlobal('fetch', () => {
      calls += 1;
      return Promise.resolve(new Response('{}', { status: 503 }));
    });
    await accountIsDeployed(CFG);
    await accountIsDeployed(CFG);
    expect(calls).toBe(2);
  });
});
