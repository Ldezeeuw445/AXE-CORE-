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
  /** Identifies the DATA — the cache is per account, because two accounts
   *  return different positions for the same path. */
  accountKey: string;
  /**
   * Identifies the QUOTA, and it is not the same thing.
   *
   * MetaAPI meters per SUBSCRIPTION, i.e. per token, and Luka's accounts share
   * one. Keying the rate bucket by account gave each account its own 25/min
   * against a ceiling they actually share — so two accounts asked for 50/min
   * of a budget meant to be 25, and MetaAPI kept refusing while the local
   * counter reported plenty of headroom. Measured 2026-08-20: the fan-out
   * started working and every account still came back "The quota has been
   * exceeded".
   *
   * Cache per account, budget per token.
   */
  quotaKey: string;
  path: string;
  method: string;
  doFetch: () => Promise<Response>;
  /**
   * 'background' work YIELDS to trading.
   *
   * The twice-daily self-test sweeps pairs x 8 strategies x 4 timeframes, and
   * AXE's own backtests pull MetaAPI candles as their primary source — the same
   * budget the trading cycle needs to read an account and place an order. Two
   * consumers, one meter, and the background one fires continuously while the
   * trading one fires every fifteen minutes. Learning was starving trading.
   *
   * Background requests are served only while the budget is under
   * BACKGROUND_CEILING, and they never wait for a slot. A self-test that runs
   * a little slower costs nothing; a trading cycle that cannot read an account
   * places no orders.
   */
  priority?: 'trade' | 'background';
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
 * THIS CEILING WAS SET FOR A PROBLEM THAT DID NOT EXIST.
 *
 * 25/minute was chosen on 2026-08-20 because every symbol came back "The quota
 * has been exceeded" and that was read as rate limiting. It was not. The
 * broker's own words, once an order finally reached it, were "you are trying to
 * access too many unexisting or undeployed trading accounts … check your logs
 * for NotFoundError" — AXE was asking each broker for instruments it does not
 * carry, about seven 404s a cycle, and MetaAPI throttles the whole subscription
 * once there are enough. Per-account symbol filtering fixed the cause.
 *
 * The pacing then became the bottleneck it was built to prevent. Measured
 * 2026-08-21: the Demo book showing "history-deals 429: MetaAPI calls are being
 * paced to stay under the quota" — AXE refusing AXE, on a user-facing read,
 * while the broker was answering fine.
 *
 * 100 is still well under MetaAPI's real ceiling and leaves room for the phone
 * and desktop running as separate processes. The genuine protection was never
 * this number anyway: it is the cooldown below, which only engages when the
 * broker itself says no.
 */
let MAX_PER_WINDOW = 100;
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
/**
 * EVERY BUDGETED REQUEST HAS A DEADLINE, and it exists because dedupe without
 * one is worse than no dedupe at all.
 *
 * fetch() has no timeout. Before in-flight dedupe, a hung MetaAPI request stalled
 * only its own caller. After it, every later caller for the same path chains onto
 * that one promise — so a single hung request stalls all of them, permanently,
 * and the entry never leaves `inFlight` because the finally never runs.
 *
 * Measured 2026-08-20/21: autopilot cycles kept STARTING (last_run advancing
 * every interval) and stopped FINISHING — no last_result written for hours,
 * where the same code had completed cycles in ~4 minutes before dedupe landed.
 * A trading loop that hangs is worse than one that errors: an error is visible
 * on the desk, a hang looks like nothing happening at all.
 */
const REQUEST_TIMEOUT_MS = 15_000;

/** Background work stops at 60% so trading always has room. */
const BACKGROUND_CEILING = 0.6;

let BURST = 12;
let MIN_SPACING_MS = Math.floor(WINDOW_MS / MAX_PER_WINDOW); // 600ms
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
  // Backtest series are HISTORY. A d1 bar from last week cannot change, and the
  // self-test asks eight strategies the same question about the same series —
  // one fetch should answer all of them, and answer the next sweep too.
  if (path.startsWith('candles:') && /limit=(\d{3,})/.test(path)) {
    const n = Number(path.match(/limit=(\d+)/)?.[1] ?? 0);
    if (n >= 500) return 10 * 60_000;
  }
  // A completed bar never changes. Even the forming one only matters to the
  // chart, which polls on its own timer anyway.
  if (path.startsWith('candles:')) return 20_000;
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

/** Reject rather than hang. The caller can act on a failure; it cannot act on
 *  a promise that never settles. */
async function withDeadline(doFetch: () => Promise<Response>): Promise<Response> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      doFetch(),
      new Promise<Response>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`MetaAPI request timed out after ${REQUEST_TIMEOUT_MS / 1000}s`)),
          REQUEST_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
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
/**
 * Test seam for the two tuned knobs.
 *
 * The pacing tests assert PROPERTIES — a cap is not spent all at once,
 * background yields before trading is starved — but their arithmetic was
 * written against MAX_PER_WINDOW = 25. When that moved to 100 both failed
 * while the properties still held, which is a test bound to a number rather
 * than to the behaviour. Binding them here keeps them fast (filling a
 * 100-call window at 600ms spacing would take a minute) and keeps them true
 * after the next tuning pass.
 */
export function __setBudgetLimits(limits: { maxPerWindow?: number; burst?: number }): void {
  if (limits.maxPerWindow != null) {
    MAX_PER_WINDOW = limits.maxPerWindow;
    MIN_SPACING_MS = Math.floor(WINDOW_MS / MAX_PER_WINDOW);
  }
  if (limits.burst != null) BURST = limits.burst;
}

/** What the knobs are right now, so a test can size itself to them. */
export function __budgetLimits(): { maxPerWindow: number; burst: number; minSpacingMs: number } {
  return { maxPerWindow: MAX_PER_WINDOW, burst: BURST, minSpacingMs: MIN_SPACING_MS };
}

export function __resetBudget(): void {
  MAX_PER_WINDOW = 100;
  BURST = 12;
  MIN_SPACING_MS = Math.floor(WINDOW_MS / MAX_PER_WINDOW);
  readCache.clear();
  inFlight.clear();
  callLog.clear();
  cooldownUntil.clear();
}

export async function budgetedFetch(req: BudgetedRequest): Promise<Response> {
  const { accountKey, path, method, doFetch } = req;
  // Everything that meters — bucket, pacing, cooldown — keys on the
  // subscription. Everything that remembers keys on the account.
  const quotaKey = req.quotaKey || accountKey;

  if (method !== 'GET') {
    // Not paced. An order waiting two seconds for a slot is a worse trade.
    // Still deadlined: an order that never returns leaves the cycle unable to
    // say whether it filled.
    recordCall(quotaKey);
    const res = await withDeadline(doFetch);
    const body = await res.clone().text().catch(() => '');
    if (isQuotaRefusal(res.status, body)) {
      cooldownUntil.set(quotaKey, Date.now() + COOLDOWN_MS);
    }
    return res;
  }

  const key = `${accountKey}:${path}`;
  const hit = readCache.get(key);
  if (hit && Date.now() - hit.at < ttlFor(path)) return cachedResponse(hit);

  const pending = inFlight.get(key);
  if (pending) {
    // A rejected shared promise must not take its followers down with it —
    // they retry on their own rather than inheriting one caller's failure.
    return pending.then(r => r.clone()).catch(() =>
      new Response(JSON.stringify({ error: 'the shared MetaAPI request failed — retrying separately' }), { status: 503 }),
    );
  }

  // Background work yields early and never queues, so a sweep cannot push the
  // trading cycle out of its own budget.
  if (req.priority === 'background') {
    const used = metaApiBudgetState(quotaKey).callsInWindow / MAX_PER_WINDOW;
    if (used >= BACKGROUND_CEILING) {
      if (hit) return cachedResponse(hit);
      return new Response(
        JSON.stringify({ error: 'background request yielded — the MetaAPI budget is reserved for trading right now' }),
        { status: 429 },
      );
    }
  }

  const cooling = (cooldownUntil.get(quotaKey) ?? 0) > Date.now();
  if (cooling || !withinBudget(quotaKey)) {
    // Stale beats absent: an eight-second-old equity is a real number this
    // account really had. Refusing outright is what makes the agent HOLD.
    if (hit) return cachedResponse(hit);
    const why = cooling
      ? 'MetaAPI quota was exceeded — backing off, and nothing cached for this call yet'
      : 'local MetaAPI call budget reached for this account — nothing cached for this call yet';
    return new Response(JSON.stringify({ error: why }), { status: 429 });
  }

  const slotAt = reserveSlot(quotaKey);
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
    recordCall(quotaKey);
    const res = await withDeadline(doFetch);
    const body = await res.clone().text().catch(() => '');
    if (isQuotaRefusal(res.status, body)) {
      cooldownUntil.set(quotaKey, Date.now() + COOLDOWN_MS);
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
