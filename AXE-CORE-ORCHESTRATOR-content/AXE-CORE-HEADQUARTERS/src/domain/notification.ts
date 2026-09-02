/**
 * Reading a notification row as something a person can act on.
 *
 * ## What was actually wrong
 *
 * The bell showed nothing while 186 unread rows sat in `core_notifications`,
 * 173 of them warnings that a chat provider had dropped out. Measured
 * 2026-08-27, the exact query the app makes:
 *
 *     select=id,type,title,message,read,created_at
 *     → 42703: column core_notifications.title does not exist
 *
 * The same query without `title` returns 200. So every historical notification
 * failed to load, permanently, and the only ones that ever appeared were the
 * ones arriving live while the tab happened to be open — with no title, since
 * the field they were read from is not there either. A writer had the mirror
 * of the same bug: notifyAutoRun inserted `title` and `source`, and those rows
 * were rejected and lost.
 *
 * The lesson is not "add the column". It is that a notification centre showing
 * zero is indistinguishable from a quiet system, and quiet was believed for a
 * month. Nothing checked the error; supabase-js returns it rather than
 * throwing, so the failure had no symptom other than silence.
 *
 * ## Title without a title column
 *
 * These messages already carry one. Every writer uses the same shape — a short
 * subject, a colon, then the detail:
 *
 *     "OpenAI (Primair) is niet meer bereikbaar: AXE's chat-provider ..."
 *
 * So the split is read out of the text rather than stored twice, which also
 * means the 186 rows already in the table get titles retroactively. When there
 * is no colon, the whole thing is the title and there is no detail — better
 * than an empty heading over the real text.
 */
import type { Meaning } from './meaning';

/** How wide a subject can be before a colon is just punctuation mid-sentence. */
const MAX_TITLE_LENGTH = 72;

export interface NotificationText {
  title: string;
  detail: string;
}

/**
 * Split a stored message into a heading and the rest.
 *
 * The colon has to be early to count. "Daily Briefing: None" has a subject;
 * a sentence that happens to contain a colon eighty characters in does not,
 * and treating it as one produces a heading nobody can read.
 */
export function notificationText(message: string): NotificationText {
  const text = (message ?? '').trim();
  if (!text) return { title: 'Zonder tekst', detail: '' };

  // A newline beats a colon: a multi-line message's first line is its subject
  // however it is punctuated.
  const firstBreak = text.indexOf('\n');
  if (firstBreak > 0 && firstBreak <= MAX_TITLE_LENGTH) {
    return { title: text.slice(0, firstBreak).trim(), detail: text.slice(firstBreak + 1).trim() };
  }

  const colon = text.indexOf(': ');
  if (colon > 0 && colon <= MAX_TITLE_LENGTH) {
    return { title: text.slice(0, colon).trim(), detail: text.slice(colon + 2).trim() };
  }
  return { title: text, detail: '' };
}

/**
 * What a notification's type means, in the app's colour vocabulary.
 *
 * `info` is structure rather than idle: it is a real event someone chose to
 * report, and idle is for "nothing to say". The bell had its own fourth green
 * (#22c55e, matching nothing else in the app) and a red that was not --error,
 * on the one surface whose whole premise is that colour is information.
 */
export function meaningOfNotification(type: string): Meaning {
  switch (type) {
    case 'success': return 'happened';
    case 'warning': return 'budget';
    case 'error': return 'broken';
    default: return 'structure';
  }
}

/**
 * Collapse repeats of the same notification.
 *
 * 173 of the 186 rows are the same sentence about a provider dropping out. A
 * list of 173 identical lines is not a record of 173 events anyone needs, it is
 * one event and a count — and showing it as 173 buries the twelve rows that say
 * something else. Newest of each kind is kept, since that is the one whose time
 * still matters.
 */
export function collapseRepeats<T extends { message: string; timestamp: number }>(
  items: readonly T[],
): Array<T & { repeats: number }> {
  const bySubject = new Map<string, T & { repeats: number }>();
  for (const item of items) {
    const key = notificationText(item.message).title;
    const seen = bySubject.get(key);
    if (!seen) {
      bySubject.set(key, { ...item, repeats: 1 });
    } else {
      seen.repeats += 1;
      // Keep the newest occurrence's own fields; only the count accumulates.
      if (item.timestamp > seen.timestamp) bySubject.set(key, { ...item, repeats: seen.repeats });
    }
  }
  return [...bySubject.values()].sort((a, b) => b.timestamp - a.timestamp);
}

/**
 * Where a notification happened, so clicking it goes there.
 *
 * ## Why a guess rather than a stored link
 *
 * There is no link column and adding one would only help notifications written
 * from today onward — the 186 already stored, which are the ones a person has
 * to wade through right now, would stay unclickable forever. The subject line
 * already says where it belongs, and reading it costs nothing.
 *
 * The rule for adding a pattern: only when the destination is somewhere the
 * reader can actually DO something about the notification. A guess that lands
 * on a plausible-looking page is worse than no link, because it teaches people
 * that clicking is a waste of time and then they stop clicking the good ones.
 * Returning null is a perfectly good answer and the default.
 */
const TARGETS: Array<{ test: RegExp; route: string; why: string }> = [
  // "OpenAI (Primair) is niet meer bereikbaar" -- 173 of the stored rows. The
  // key lives in Settings and that is where the fix is made.
  { test: /niet meer bereikbaar|provider|api[- ]?key|quota|rate.?limit/i, route: '/settings', why: 'de key of de limiet' },
  { test: /trade|order|positie|account|margin|equity|MT5|OANDA/i, route: '/trading', why: 'het account' },
  { test: /cyclus|cycle|funnel|strateg/i, route: '/trading', why: 'de cyclus' },
  { test: /memory|geheugen|herinnering|embedding/i, route: '/memory', why: 'het geheugen' },
  { test: /cron|schedule|planning/i, route: '/cron-manager', why: 'de planning' },
  { test: /agent|crew|skill/i, route: '/agents', why: 'de agent' },
];

export interface NotificationTarget {
  route: string;
  /** What the reader will find there, for the tooltip. */
  why: string;
}

export function notificationTarget(message: string): NotificationTarget | null {
  const { title } = notificationText(message);
  // Matched on the SUBJECT, not the whole message. A detail paragraph mentions
  // half the app in passing, and matching on it sends people somewhere the
  // notification was never about.
  for (const t of TARGETS) {
    if (t.test.test(title)) return { route: t.route, why: t.why };
  }
  return null;
}
