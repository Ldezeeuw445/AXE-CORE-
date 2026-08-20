/**
 * This module now sits in front of every order AXE places, so the properties
 * that matter are the ones that would be invisible if they broke: a duplicated
 * order, or a read that silently keeps hammering a limit that is refusing.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { budgetedFetch, metaApiBudgetState, ttlFor, isQuotaRefusal, __resetBudget } from './metaApiBudget';

const ACC = 'acct-test';

function ok(body: unknown): () => Promise<Response> {
  return () => Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
}

function quota(): () => Promise<Response> {
  return () => Promise.resolve(
    new Response(JSON.stringify({ error: 'The quota has been exceeded.' }), { status: 429 }),
  );
}

/** Counts how many times the network was really touched. */
function counted(fn: () => Promise<Response>) {
  let calls = 0;
  return { calls: () => calls, doFetch: () => { calls += 1; return fn(); } };
}

beforeEach(() => __resetBudget());

describe('reads', () => {
  it('collapses simultaneous identical reads into one request', async () => {
    const net = counted(ok({ equity: 100 }));
    const req = { accountKey: ACC, path: '/positions', method: 'GET', doFetch: net.doFetch };
    const [a, b, c] = await Promise.all([budgetedFetch(req), budgetedFetch(req), budgetedFetch(req)]);
    expect(net.calls()).toBe(1);
    // Each caller still gets its own readable body — a shared, already-consumed
    // Response would break every second caller.
    expect(await a.json()).toEqual({ equity: 100 });
    expect(await b.json()).toEqual({ equity: 100 });
    expect(await c.json()).toEqual({ equity: 100 });
  });

  it('serves a second read from cache inside the TTL', async () => {
    const net = counted(ok({ equity: 100 }));
    const req = { accountKey: ACC, path: '/positions', method: 'GET', doFetch: net.doFetch };
    await budgetedFetch(req);
    const second = await budgetedFetch(req);
    expect(net.calls()).toBe(1);
    expect(second.headers.get('x-axe-cache')).toBe('hit');
  });

  it('keeps separate budgets per account', async () => {
    const net = counted(ok({ ok: true }));
    await budgetedFetch({ accountKey: 'a', path: '/positions', method: 'GET', doFetch: net.doFetch });
    await budgetedFetch({ accountKey: 'b', path: '/positions', method: 'GET', doFetch: net.doFetch });
    // Same path, different accounts — one must not serve the other's data.
    expect(net.calls()).toBe(2);
    expect(metaApiBudgetState('a').callsInWindow).toBe(1);
    expect(metaApiBudgetState('b').callsInWindow).toBe(1);
  });
});

describe('orders', () => {
  it('never dedupes or caches a write', async () => {
    const net = counted(ok({ orderId: 1 }));
    const req = { accountKey: ACC, path: '/trade', method: 'POST', doFetch: net.doFetch };
    // Two identical order requests are TWO ORDERS. Collapsing them would be a
    // trade silently not placed.
    await Promise.all([budgetedFetch(req), budgetedFetch(req)]);
    await budgetedFetch(req);
    expect(net.calls()).toBe(3);
  });

  it('passes a broker refusal straight back', async () => {
    const net = counted(quota());
    const res = await budgetedFetch({ accountKey: ACC, path: '/trade', method: 'POST', doFetch: net.doFetch });
    // A refused order must never be able to look like a placed one.
    expect(res.status).toBe(429);
    expect(net.calls()).toBe(1);
  });
});

describe('when the quota refuses', () => {
  it('stops calling and serves the last good value', async () => {
    const good = counted(ok({ equity: 42 }));
    const req = { accountKey: ACC, path: '/account-information', method: 'GET' };
    await budgetedFetch({ ...req, doFetch: good.doFetch });

    // Force the cached entry to be stale so the cache alone cannot explain the
    // next result, then trip the quota on a different path.
    const bad = counted(quota());
    await budgetedFetch({ accountKey: ACC, path: '/orders', method: 'GET', doFetch: bad.doFetch });
    expect(metaApiBudgetState(ACC).coolingDownFor).toBeGreaterThan(0);

    const after = counted(ok({ equity: 999 }));
    const res = await budgetedFetch({ ...req, doFetch: after.doFetch });
    // Did not touch the network while cooling down...
    expect(after.calls()).toBe(0);
    // ...and served the real number this account really had.
    expect(await res.json()).toEqual({ equity: 42 });
  });

  it('explains itself when there is nothing cached to fall back on', async () => {
    const bad = counted(quota());
    await budgetedFetch({ accountKey: ACC, path: '/orders', method: 'GET', doFetch: bad.doFetch });

    const fresh = counted(ok({ never: 'called' }));
    const res = await budgetedFetch({ accountKey: ACC, path: '/positions', method: 'GET', doFetch: fresh.doFetch });
    expect(fresh.calls()).toBe(0);
    expect(res.status).toBe(429);
    // The caller has to be able to tell "backing off" from "broker said no".
    expect((await res.json()).error).toMatch(/quota was exceeded/i);
  });
});

describe('a launch burst', () => {
  it('does not let a cap be spent all at once', async () => {
    // The failure this exists for: 25-per-minute still permits all 25 inside
    // the first second, which is exactly what an app launch does — chart
    // subscribe, first autopilot cycle, Accounts tab, together.
    const net = counted(ok({ v: 1 }));
    const many = Array.from({ length: 14 }, (_, i) =>
      budgetedFetch({ accountKey: ACC, path: `/p${i}`, method: 'GET', doFetch: net.doFetch }),
    );
    const settled = await Promise.all(many);
    const paced = await Promise.all(settled.map(r => r.status === 429 ? r.json() : null));

    // Some were refused rather than fired...
    expect(paced.some(p => p && /paced/i.test(String(p.error)))).toBe(true);
    // ...and the network saw far fewer than the 14 that were asked for.
    expect(net.calls()).toBeLessThan(14);
  }, 20_000);
});

describe('the knobs themselves', () => {
  it('caches by how fast the thing can actually change', () => {
    expect(ttlFor('/users/x/symbols')).toBeGreaterThan(ttlFor('/users/x/positions'));
    expect(ttlFor('/users/x/history-deals')).toBeGreaterThan(ttlFor('/users/x/account-information'));
    // Live money figures must stay short.
    expect(ttlFor('/users/x/account-information')).toBeLessThanOrEqual(10_000);
  });

  it('recognises the refusal in prose, not only as a status code', () => {
    expect(isQuotaRefusal(200, 'The quota has been exceeded.')).toBe(true);
    expect(isQuotaRefusal(429, '')).toBe(true);
    expect(isQuotaRefusal(200, '{"positions":[]}')).toBe(false);
  });
});
