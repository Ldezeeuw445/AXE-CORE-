/**
 * Is a high-impact release due for this pair inside the next 48 hours?
 *
 * This fills phase 2 of the decision funnel, which has been reporting
 * "unavailable" since it was written — every pair passed the macro-agenda check
 * unexamined, which the phase itself described as a gap rather than a clean
 * sweep.
 *
 * ## Why FRED, after four providers said no
 *
 * Measured 2026-08-27 against the keys on this desk: Finnhub answered 403,
 * FMP 402, EODHD 403 ("Only EOD data allowed for free users"), and TwelveData
 * sells its calendar as an add-on. FRED answers, is free, and publishes the
 * release schedule the US statistical agencies actually work to.
 *
 * The cost is coverage: FRED is United States only. That is a real limit and it
 * is handled by admitting it — a pair with no covered currency returns `null`,
 * "not checked", never `false`. Claiming a quiet agenda for EURGBP off a US
 * calendar would be worse than having no calendar, because the funnel would
 * treat the silence as an all-clear. On this desk almost every pair is
 * USD-quoted, so the honest coverage is most of the board.
 *
 * ## Exact names, not keywords
 *
 * FRED publishes near-identical names for releases that move nothing:
 * "Research Consumer Price Index" beside "Consumer Price Index", "Gross
 * Domestic Product by State" beside "Gross Domestic Product", "Metropolitan
 * Area Employment and Unemployment" beside "Employment Situation". A substring
 * match on "consumer price" or "employment" pulls in the regional and research
 * variants and would halt trading on a schedule of releases nobody trades.
 *
 * So the list is an allowlist of exact names. It is deliberately short: this
 * gate stops the desk from opening positions, and a gate that fires on 235
 * releases a week is a gate that stops the desk permanently.
 */

export interface CalendarEvent {
  /** Release date, YYYY-MM-DD as FRED publishes it. */
  date: string;
  /** The release name, verbatim. */
  name: string;
}

/**
 * The US releases worth standing aside for, by exact FRED name.
 *
 * Chosen for what actually reprices the dollar within the session: the two
 * inflation prints, payrolls, growth, retail sales, and the Fed's preferred
 * inflation gauge inside Personal Income and Outlays. Weekly claims and JOLTS
 * are deliberately absent — they move the tape occasionally and would fire most
 * weeks, which costs more in missed trades than it saves in avoided ones.
 *
 * ## FOMC is missing, and that is a real gap
 *
 * The rate decision is the single most market-moving event on this list, and it
 * is not on it. FRED cannot say when it happens. Measured 2026-08-27 against
 * /fred/release/dates for release_id 101: 127 dates, every consecutive calendar
 * day — FRED models the FOMC release as a daily series, not a schedule. Every
 * other release on this list returns its real monthly dates:
 *
 *   Employment Situation   2026-09-04, 10-02, 11-06, 12-04
 *   Consumer Price Index   2026-09-11, 10-14, 11-10, 12-10
 *
 * Including FOMC anyway would have flagged an event within 48h on every single
 * day, which turns this gate from "stand aside for the print" into "never open
 * a USD position again". A gate that always fires is a closed desk, so the
 * honest choice is to leave it out and say so. Covering FOMC needs a second
 * source with a real meeting calendar.
 */
export const HIGH_IMPACT_US_RELEASES: ReadonlySet<string> = new Set([
  'Employment Situation',
  'Consumer Price Index',
  'Producer Price Index',
  'Gross Domestic Product',
  'Personal Income and Outlays',
  'Advance Monthly Sales for Retail and Food Services',
]);

/** Currencies this calendar can actually speak to. */
export const COVERED_CURRENCIES: ReadonlySet<string> = new Set(['USD']);

const HOURS_48_MS = 48 * 60 * 60 * 1000;

export function isHighImpact(name: string): boolean {
  return HIGH_IMPACT_US_RELEASES.has(name.trim());
}

/**
 * The two currencies a pair is exposed to.
 *
 * Six-character symbols split cleanly down the middle, which covers FX, metals
 * (XAUUSD) and the crypto pairs this desk trades (BTCUSD). Anything else
 * returns empty rather than guessing — a wrong split would attach a pair to a
 * currency whose agenda has nothing to do with it.
 */
export function currenciesOf(pairId: string): string[] {
  const s = pairId.trim().toUpperCase();
  if (!/^[A-Z]{6}$/.test(s)) return [];
  return [s.slice(0, 3), s.slice(3)];
}

/**
 * Whether a high-impact release lands inside the next 48 hours for this pair.
 *
 * Returns `null` when the question could not be answered — no events supplied,
 * or none of the pair's currencies are covered. The funnel reads null as "not
 * checked" and lets the pair through, which is the correct behaviour: an
 * unanswered question is not an all-clear, and it must not become one.
 *
 * A release date carries no time of day, so the whole day is treated as
 * occupied. That errs toward standing aside, which is the right direction for
 * a gate whose job is avoiding known volatility.
 */
export function eventWithin48h(input: {
  pairId: string;
  events: CalendarEvent[] | null | undefined;
  now?: number;
}): boolean | null {
  const { pairId, events } = input;
  if (!events || events.length === 0) return null;

  const currencies = currenciesOf(pairId);
  if (!currencies.some(c => COVERED_CURRENCIES.has(c))) return null;

  const now = input.now ?? Date.now();
  const until = now + HOURS_48_MS;

  for (const ev of events) {
    if (!isHighImpact(ev.name)) continue;
    // Midnight UTC of the release day, and the day counts as occupied until it
    // ends — a print at 08:30 New York is inside the day this bounds.
    const start = Date.parse(`${ev.date}T00:00:00Z`);
    if (!Number.isFinite(start)) continue;
    const end = start + 24 * 60 * 60 * 1000;
    if (end > now && start < until) return true;
  }
  return false;
}
