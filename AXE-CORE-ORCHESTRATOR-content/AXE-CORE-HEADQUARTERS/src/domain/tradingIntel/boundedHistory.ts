/**
 * Keep the newest entries that fit in a byte budget, not the newest N.
 *
 * ## Why a count is the wrong bound
 *
 * Both of this desk's history stores were bounded by item count — the cycle
 * journal at 200 records, the decision traces at 50 — and both outgrew what
 * they can actually be written to. Measured 2026-08-27 on the live install:
 * the journal was 111 kB and the traces 101 kB, and both had stopped reaching
 * the server while the 26-byte settings beside them synced fine. A count says
 * nothing about size, so a store bounded that way grows silently as its
 * entries get richer, and the day it stops fitting nothing announces it.
 *
 * The cost is real and worth stating: these are rewritten IN FULL on every
 * save. The journal saves after each of six stages, for each symbol in a
 * cycle — so a 111 kB value was being serialised and uploaded roughly eighteen
 * times per cycle. That is also what filled the browser store and made every
 * local write fail with WebKit's quota error.
 *
 * ## Newest wins, and at least one always survives
 *
 * Entries are kept from the front (callers put the newest there) until the
 * budget is spent. A single entry larger than the whole budget is still kept:
 * dropping everything is never the more useful answer, and a store that can
 * return empty because one record got fat is a worse failure than one that is
 * briefly over budget.
 */

export interface CapResult<T> {
  kept: T[];
  /** Bytes the kept entries serialise to, so a caller can report it. */
  bytes: number;
  /** How many were dropped to fit. */
  dropped: number;
}

/** Bytes of the JSON encoding, which is what actually gets written. */
function sizeOf(value: unknown): number {
  try {
    // TextEncoder counts UTF-8 bytes; a symbol name or a broker message with
    // an accent is more bytes than characters, and the budget is in bytes.
    return new TextEncoder().encode(JSON.stringify(value) ?? '').length;
  } catch {
    return 0;
  }
}

export function capBySize<T>(
  entries: readonly T[],
  maxBytes: number,
  maxCount = Number.POSITIVE_INFINITY,
): CapResult<T> {
  const kept: T[] = [];
  let bytes = 2; // the enclosing [] of the array itself

  for (const entry of entries) {
    if (kept.length >= maxCount) break;
    const size = sizeOf(entry) + 1; // + the comma
    // The first entry is kept whatever it costs — see the header.
    if (kept.length > 0 && bytes + size > maxBytes) break;
    kept.push(entry);
    bytes += size;
  }

  return { kept, bytes, dropped: entries.length - kept.length };
}
