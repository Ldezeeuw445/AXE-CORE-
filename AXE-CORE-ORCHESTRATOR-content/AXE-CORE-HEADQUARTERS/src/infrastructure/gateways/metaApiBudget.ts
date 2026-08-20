/**
 * THE CALL BUDGET — every MetaAPI trading read and write passes through here.
 *
 * WHY THIS EXISTS
 *
 * MetaAPI answered "The quota has been exceeded" and AXE Algo stopped trading
 * entirely: getEffectiveAccountState could not read the account, so every
 * decision correctly refused to size and returned HOLD. Measured 2026-08-20 —
 * cycles running, symbols evaluated, strategies chosen, and not one order
 * placed, for a day, while the desk read "Autopilot ON".
 *
 * The volume is structural, not one caller misbehaving. From the chart alone:
 * tick 6s + candles 10s + positions 15s + orders 15s is roughly 24 requests a
 * minute PER OPEN CHART — and the desktop and the phone are both open, and the
 * autopilot reads the account again per symbol, and cheapScreen walks the
 * broker's entire instrument list. Nobody is wrong; there was simply no ceiling.
 *
 * Adding OANDA, a second MT5 and FTMO multiplies the read side by three, which
 * is why this had to land before the accounts, not after.
 *
 * FOUR THINGS, ALL AT ONE CHOKE POINT
 *
 *   * in-flight dedupe — the chart, the autopilot and the Accounts tab ask for
 *     the same positions in the same instant; they now share one request;
 *   * a short read cache — equity and positions do not change meaningfully in
 *     four seconds, and every component polls on its own timer;
 *   * a token bucket per ACCOUNT — MetaAPI's limit is per account, so three
 *     accounts get three budgets instead of fighting over one;
 *   * a cooldown once the quota actually trips — serving slightly stale data
 *     beats hammering a limit that is already refusing, and hammering is what
 *     turns a brief limit into an hour-long outage.
 *
 * ORDERS ARE NEVER CACHED, NEVER DEDUPED, NEVER DELAYED.
 * A trade is not a read. Two identical order requests are two orders, and a
 * fill postponed to save a read is the wrong trade at the wrong price. Writes
 * skip all of it and report only the broker's own answer — including its
 * refusal, because a refused order must never look like a placed one.
 */

export interface BudgetedRequest {
  /** MetaAPI rate-limits per account, so the bucket is keyed by account. */
  accountKey: string;
  path: string;
  method: string;
  doFetch: () => Promise<Response>;
}

type CacheEntry = { at: number; status: number; body: string };

const readCache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<Response>>();
/** accountKey -> timestamps of recent calls (sliding window). */
const callLog = new Map<string, number[]>();
/** accountKey -> epoch ms until which the quota is known to be refusing. */
const cooldownUntil = new Map<string, number>();

const WINDOW_MS = 60_000;
/**
 * Deliberately far below MetaAPI's own limit, and this number is the whole
 * reason the first draft would not have worked.
 *
 * The desktop app and the phone are SEPARATE PROCESSES. They cannot share this
 * cache or this counter, so whatever ceiling one enforces, the account sees up
 * to twice it. Measured 2026-08-20 with both open: every symbol in the cycle
 * came back "The quota has been exceeded" — total exhaustion, not a spike.
 *
 * 25 per client is the budget that still leaves room when two clients are
 * running and something else (the Accounts tab, a manual refresh) also asks.
 */
const MAX_PER_WINDOW = 25;
const COOLDOWN_MS = 60_000;

/**
 * A CAP IS NOT A PACE, and that distinction is why the first version did not
 * work.
 *
 * 25-per-minute still permits all 25 inside the first second, and that is
 * exactly the shape of an app launch: the chart mounts and subscribes, the
 * autopilot fires its first cycle immediately, the Accounts tab reads every
 * account. Measured 2026-08-20 — every endpoint answered OK when tested
 * directly from the VPS seconds later, while the app itself was still being
 * refused. Nothing was broken upstream; the burst was self-inflicted.
 *
 * So: a small burst allowance for genuine interactivity, then one call every
 * MIN_SPACING_MS. A caller that has to wait gets served cache where possible,
 * and waits only briefly before being told the truth rather than hanging.
 */
const BURST = 5;
const MIN_SPACING_MS = Math.floor(WINDOW_MS / MAX_PER_WINDOW); // ~2.4s
const MAX_WAIT_MS = 6_000;

/** accountKey -> epoch ms the next call may go out. */
const nextSlot = new Map<string, number>();

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

/**
 * Reserve the next send slot, or return null if the wait is too long to be
 * worth it. Reserving BEFORE awaiting is what makes concurrent callers queue
 * behind each other instead of all deciding the line is empty.
 */
function reserveSlot(accountKey: string): number | null {
  const now = Date.now();
  const recent = (callLog.get(accountKey) ?? []).filter(t => now - t < WINDOW_MS);
  const earliest = recent.length < BURST ? now : (nextSlot.get(accountKey) ?? now);
  const at = Math.max(now, earliest);
  if (at - now > MAX_WAIT_MS) return null;
  nextSlot.set(accountKey, at + MIN_SPACING_MS);
  return at;
}

/** How long a GET may be reused — set by how fast the value can really change
 *  and by what a stale answer would cost if acted on. */
export function ttlFor(path: string): number {
  if (path.includes('/symbols')) return 12 * 60 * 60_000; // a broker's catalogue
  if (path.includes('/history-deals')) return 30_000;     // closed trades are final
  if (path.includes('/account-information')) return 8_000;
  if (path.includes('/positions')) return 8_000;
  if (path.includes('/orders')) return 12_000;
  return 5_000;
}

/** MetaAPI states this in prose as well as in a status code. */
export function isQuotaRefusal(status: number, body: string): boolean {
  return status === 429 || /quota has been exceeded|too many requests/i.test(body);
}

function withinBudget(accountKey: string): boolean {
  const now = Date.now();
  const log = (callLog.get(accountKey) ?? []).filter(t => now - t < WINDOW_MS);
  callLog.set(accountKey, log);
  return log.length < MAX_PER_WINDOW;
}

function recordCall(accountKey: string): void {
  const log = callLog.get(accountKey) ?? [];
  log.push(Date.now());
  callLog.set(accountKey, log);
}

function cachedResponse(entry: CacheEntry): Response {
  return new Response(entry.body, {
    status: entry.status,
    headers: { 'content-type': 'application/json', 'x-axe-cache': 'hit' },
  });
}

/** Visible to the UI so a degraded state can say so instead of looking broken. */
export function metaApiBudgetState(accountKey: string): {
  callsInWindow: number; limit: number; coolingDownFor: number;
} {
  const now = Date.now();
  const log = (callLog.get(accountKey) ?? []).filter(t => now - t < WINDOW_MS);
  const until = cooldownUntil.get(accountKey) ?? 0;
  return {
    callsInWindow: log.length,
    limit: MAX_PER_WINDOW,
    coolingDownFor: Math.max(0, Math.round((until - now) / 1000)),
  };
}

/** Test seam — state is module-level by design (one budget per process). */
export function __resetBudget(): void {
  readCache.clear();
  inFlight.clear();
  callLog.clear();
  cooldownUntil.clear();
}

export async function budgetedFetch(req: BudgetedRequest): Promise<Response> {
  const { accountKey, path, method, doFetch } = req;

  if (method !== 'GET') {
    // Not paced. An order waiting two seconds for a slot is a worse trade.
    recordCall(accountKey);
    const res = await doFetch();
    const body = await res.clone().text().catch(() => '');
    if (isQuotaRefusal(res.status, body)) {
      cooldownUntil.set(accountKey, Date.now() + COOLDOWN_MS);
    }
    return res;
  }

  const key = `${accountKey}:${path}`;
  const hit = readCache.get(key);
  if (hit && Date.now() - hit.at < ttlFor(path)) return cachedResponse(hit);

  const pending = inFlight.get(key);
  if (pending) return pending.then(r => r.clone());

  const cooling = (cooldownUntil.get(accountKey) ?? 0) > Date.now();
  if (cooling || !withinBudget(accountKey)) {
    // Stale beats absent: an eight-second-old equity is a real number this
    // account really had. Refusing outright is what makes the agent HOLD.
    if (hit) return cachedResponse(hit);
    const why = cooling
      ? 'MetaAPI quota was exceeded — backing off, and nothing cached for this call yet'
      : 'local MetaAPI call budget reached for this account — nothing cached for this call yet';
    return new Response(JSON.stringify({ error: why }), { status: 429 });
  }

  const slotAt = reserveSlot(accountKey);
  if (slotAt === null) {
    if (hit) return cachedResponse(hit);
    return new Response(
      JSON.stringify({ error: 'MetaAPI calls are being paced to stay under the quota — nothing cached for this call yet' }),
      { status: 429 },
    );
  }

  const run = (async () => {
    const delay = slotAt - Date.now();
    if (delay > 0) await sleep(delay);
    recordCall(accountKey);
    const res = await doFetch();
    const body = await res.clone().text().catch(() => '');
    if (isQuotaRefusal(res.status, body)) {
      cooldownUntil.set(accountKey, Date.now() + COOLDOWN_MS);
    } else if (res.ok) {
      readCache.set(key, { at: Date.now(), status: res.status, body });
    }
    return res;
  })();

  inFlight.set(key, run);
  try {
    return (await run).clone();
  } finally {
    inFlight.delete(key);
  }
}
