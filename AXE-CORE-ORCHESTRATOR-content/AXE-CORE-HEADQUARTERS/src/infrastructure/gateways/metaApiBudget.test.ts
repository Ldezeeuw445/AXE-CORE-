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
    const req = { accountKey: ACC, quotaKey: 'sub-1', path: '/positions', method: 'GET', doFetch: net.doFetch };
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
    const req = { accountKey: ACC, quotaKey: 'sub-1', path: '/positions', method: 'GET', doFetch: net.doFetch };
    await budgetedFetch(req);
    const second = await budgetedFetch(req);
    expect(net.calls()).toBe(1);
    expect(second.headers.get('x-axe-cache')).toBe('hit');
  });

  it('keeps separate budgets per account', async () => {
    const net = counted(ok({ ok: true }));
    await budgetedFetch({ accountKey: 'a', quotaKey: 'sub-a', path: '/positions', method: 'GET', doFetch: net.doFetch });
    await budgetedFetch({ accountKey: 'b', quotaKey: 'sub-b', path: '/positions', method: 'GET', doFetch: net.doFetch });
    // Same path, different accounts — one must not serve the other's data.
    expect(net.calls()).toBe(2);
    expect(metaApiBudgetState('sub-a').callsInWindow).toBe(1);
    expect(metaApiBudgetState('sub-b').callsInWindow).toBe(1);
  });
});

describe('orders', () => {
  it('never dedupes or caches a write', async () => {
    const net = counted(ok({ orderId: 1 }));
    const req = { accountKey: ACC, quotaKey: 'sub-1', path: '/trade', method: 'POST', doFetch: net.doFetch };
    // Two identical order requests are TWO ORDERS. Collapsing them would be a
    // trade silently not placed.
    await Promise.all([budgetedFetch(req), budgetedFetch(req)]);
    await budgetedFetch(req);
    expect(net.calls()).toBe(3);
  });

  it('passes a broker refusal straight back', async () => {
    const net = counted(quota());
    const res = await budgetedFetch({ accountKey: ACC, quotaKey: 'sub-1', path: '/trade', method: 'POST', doFetch: net.doFetch });
    // A refused order must never be able to look like a placed one.
    expect(res.status).toBe(429);
    expect(net.calls()).toBe(1);
  });
});

describe('when the quota refuses', () => {
  it('stops calling and serves the last good value', async () => {
    const good = counted(ok({ equity: 42 }));
    const req = { accountKey: ACC, quotaKey: 'sub-1', path: '/account-information', method: 'GET' };
    await budgetedFetch({ ...req, doFetch: good.doFetch });

    // Force the cached entry to be stale so the cache alone cannot explain the
    // next result, then trip the quota on a different path.
    const bad = counted(quota());
    await budgetedFetch({ accountKey: ACC, quotaKey: 'sub-1', path: '/orders', method: 'GET', doFetch: bad.doFetch });
    expect(metaApiBudgetState('sub-1').coolingDownFor).toBeGreaterThan(0);

    const after = counted(ok({ equity: 999 }));
    const res = await budgetedFetch({ ...req, doFetch: after.doFetch });
    // Did not touch the network while cooling down...
    expect(after.calls()).toBe(0);
    // ...and served the real number this account really had.
    expect(await res.json()).toEqual({ equity: 42 });
  });

  it('explains itself when there is nothing cached to fall back on', async () => {
    const bad = counted(quota());
    await budgetedFetch({ accountKey: ACC, quotaKey: 'sub-1', path: '/orders', method: 'GET', doFetch: bad.doFetch });

    const fresh = counted(ok({ never: 'called' }));
    const res = await budgetedFetch({ accountKey: ACC, quotaKey: 'sub-1', path: '/positions', method: 'GET', doFetch: fresh.doFetch });
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
      budgetedFetch({ accountKey: ACC, quotaKey: 'sub-1', path: `/p${i}`, method: 'GET', doFetch: net.doFetch }),
    );
    const settled = await Promise.all(many);
    const paced = await Promise.all(settled.map(r => r.status === 429 ? r.json() : null));

    // Some were refused rather than fired...
    expect(paced.some(p => p && /paced/i.test(String(p.error)))).toBe(true);
    // ...and the network saw far fewer than the 14 that were asked for.
    expect(net.calls()).toBeLessThan(14);
  }, 20_000);
});

describe('two accounts on one subscription', () => {
  it('shares the quota, because MetaAPI meters per token not per account', async () => {
    // The bug this replaces: the bucket was keyed by ACCOUNT, so two accounts
    // on one token each believed they had a full budget and together asked for
    // twice the ceiling they actually share. The fan-out started working and
    // every account still came back "The quota has been exceeded".
    const net = counted(quota());
    await budgetedFetch({ accountKey: 'acct-A', quotaKey: 'shared-token', path: '/orders', method: 'GET', doFetch: net.doFetch });

    // The OTHER account on the same subscription must now be backing off too.
    const other = counted(ok({ never: 'called' }));
    const res = await budgetedFetch({ accountKey: 'acct-B', quotaKey: 'shared-token', path: '/positions', method: 'GET', doFetch: other.doFetch });
    expect(other.calls()).toBe(0);
    expect(res.status).toBe(429);
  });

  it('still caches per account, because the data differs', async () => {
    const a = counted(ok({ equity: 1 }));
    const b = counted(ok({ equity: 2 }));
    const ra = await budgetedFetch({ accountKey: 'acct-A', quotaKey: 'shared-token', path: '/account-information', method: 'GET', doFetch: a.doFetch });
    const rb = await budgetedFetch({ accountKey: 'acct-B', quotaKey: 'shared-token', path: '/account-information', method: 'GET', doFetch: b.doFetch });
    // Same path, same subscription — one account must never be served the
    // other's equity.
    expect(await ra.json()).toEqual({ equity: 1 });
    expect(await rb.json()).toEqual({ equity: 2 });
  });
});

describe('a hung request', () => {
  it('cannot stall the caller forever', async () => {
    // The regression this exists for: fetch has no timeout, and in-flight
    // dedupe chained every later caller onto one hung promise. Cycles kept
    // STARTING and stopped FINISHING — no result written for hours, where the
    // same code completed in ~4 minutes before dedupe landed.
    const hang = () => new Promise<Response>(() => { /* never settles */ });
    const started = Date.now();
    await expect(
      budgetedFetch({ accountKey: ACC, quotaKey: 'sub-1', path: '/positions', method: 'GET', doFetch: hang }),
    ).rejects.toThrow(/timed out/i);
    // Deadline is 15s; assert it did not wait indefinitely.
    expect(Date.now() - started).toBeLessThan(20_000);
  }, 25_000);

  it('does not take the other callers down with it', async () => {
    const hang = () => new Promise<Response>((_, reject) => setTimeout(() => reject(new Error('boom')), 50));
    const first = budgetedFetch({ accountKey: ACC, quotaKey: 'sub-1', path: '/orders', method: 'GET', doFetch: hang });
    const second = budgetedFetch({ accountKey: ACC, quotaKey: 'sub-1', path: '/orders', method: 'GET', doFetch: hang });
    await expect(first).rejects.toThrow();
    // The follower gets a definite answer instead of inheriting the rejection.
    const res = await second;
    expect(res.status).toBe(503);
  });
});

describe('learning must not starve trading', () => {
  it('yields background work once the budget is mostly spent', async () => {
    // The self-test sweeps pairs x 8 strategies x 4 timeframes, and AXE's own
    // backtests pull MetaAPI candles as their primary source — the same meter
    // the trading cycle needs to read an account. Background fires constantly;
    // trading fires every fifteen minutes. Learning was crowding it out.
    const net = counted(ok({ v: 1 }));
    // Spend most of the window on trading-priority reads.
    for (let i = 0; i < 16; i++) {
      await budgetedFetch({ accountKey: ACC, quotaKey: 'sub-1', path: `/t${i}`, method: 'GET', doFetch: net.doFetch });
    }
    const before = net.calls();
    const bg = await budgetedFetch({
      accountKey: ACC, quotaKey: 'sub-1', path: '/candles:/XAUUSD/1h?limit=1000',
      method: 'GET', priority: 'background', doFetch: net.doFetch,
    });
    expect(net.calls()).toBe(before);      // never touched the network
    expect(bg.status).toBe(429);
    expect((await bg.json()).error).toMatch(/reserved for trading/i);
  }, 60_000);

  it('caches a backtest series far longer than a live one', () => {
    // Historical bars cannot change, and eight strategies ask the same question
    // about the same series.
    expect(ttlFor('candles:/XAUUSD/1h?limit=1000')).toBeGreaterThan(ttlFor('candles:/XAUUSD/1h?limit=120'));
  });
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
