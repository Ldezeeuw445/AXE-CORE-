/**
 * localStorage writes that stay inside the browser's quota.
 *
 * ## The bug this exists for
 *
 * Measured 2026-08-25 on the live desktop app: localStorage held 6.75 MB
 * against WKWebView's ~5 MB quota, so `localStorage.setItem` threw
 * QuotaExceededError — whose WebKit message is, word for word,
 * **"The quota has been exceeded."**
 *
 * That sentence is also how MetaAPI phrases its own rate limit, and for days
 * this project read it as MetaAPI's. `saveSetting` starts with a
 * `localStorage.setItem`, so every settings write of any size was failing at
 * the first line and reporting a broker problem. The autopilot's status line
 * was the visible casualty — `status write failed (The quota has been
 * exceeded.)` on every cycle, while the cycle itself had finished fine.
 *
 * ## Why the existing caps did not help
 *
 * They were there, and they were counted in the wrong unit. The embedding
 * cache capped at 400 ENTRIES, but an entry is a 256-float vector — about
 * 3.8 KB serialised — so a "capped" cache is inherently ~1.5 MB. Same shape
 * for the RAG store at 250 entries of ~5.4 KB.
 *
 * A cap on entries cannot bound a store whose entries vary in size by two
 * orders of magnitude. This bounds the thing the quota actually measures.
 */

/** Rough UTF-16 size, which is what the quota is counted in. */
export function approxBytes(serialised: string): number {
  return serialised.length * 2;
}

/**
 * Write `entries` under `key`, dropping the OLDEST until it fits `maxBytes`.
 *
 * Oldest-first because every caller here is a cache or a recency list: the
 * newest entry is the one just computed and about to be read back, and
 * dropping it to keep an old one would make the write pointless.
 *
 * Returns how many were kept, so a caller can log or surface the trim rather
 * than silently losing half its cache.
 */
export function setBoundedRecord<T>(
  key: string,
  entries: Array<[string, T]>,
  maxBytes: number,
): number {
  const sizes = entries.map(([k, v]) => approxBytes(JSON.stringify(k)) + approxBytes(JSON.stringify(v)) + 2);
  const kept = dropOldestUntilItFits(entries, sizes, maxBytes);
  if (!kept.length) {
    localStorage.removeItem(key);
    return 0;
  }
  localStorage.setItem(key, JSON.stringify(Object.fromEntries(kept)));
  return kept.length;
}

/**
 * How many of the newest entries fit, measured once.
 *
 * The first version re-serialised the whole store on every iteration and
 * looped until it fit. That is O(n²) on a hot path, and the caches sit right
 * at their ceiling by design, so almost every write took the slow path: the
 * embedding cache is ~500 KB and this ran on every embedding computed.
 *
 * Measured 2026-08-25: after that shipped, the app wrote nothing to
 * localStorage for 51 minutes — no autopilot status, no scan offset, no new
 * cycle — while the process was alive and its 60-second tick should have been
 * firing. A synchronous megabyte-scale loop on the main thread is what that
 * looks like from outside, and it stalled the trading loop it was meant to
 * unblock.
 *
 * Sizes are summed once and serialisation happens once. The per-entry estimate
 * is a hair under the real JSON (no allowance for the enclosing braces), which
 * is why callers get a ceiling well below the true quota rather than one that
 * has to be exact.
 */
function dropOldestUntilItFits<E>(entries: E[], sizes: number[], maxBytes: number): E[] {
  let total = sizes.reduce((a, b) => a + b, 0);
  let first = 0;
  // Oldest first: the newest entry is the one just computed and about to be
  // read back, so dropping it to keep an old one would make the write pointless.
  while (first < entries.length && total > maxBytes) {
    total -= sizes[first];
    first += 1;
  }
  return entries.slice(first);
}

/** The array equivalent, same oldest-first rule and the same single pass. */
export function setBoundedArray<T>(key: string, items: T[], maxBytes: number): number {
  const sizes = items.map(v => approxBytes(JSON.stringify(v)) + 1);
  const kept = dropOldestUntilItFits(items, sizes, maxBytes);
  if (!kept.length) {
    localStorage.removeItem(key);
    return 0;
  }
  localStorage.setItem(key, JSON.stringify(kept));
  return kept.length;
}
