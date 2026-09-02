/**
 * Which build is running.
 *
 * ## Why a value and not a version number
 *
 * `BUILTIN_VERSION` sat at 0 and was never incremented, so it answered nothing.
 * The question people actually ask is never "which version is this" — it is
 * "did my rebuild land", asked of a phone across the room, and a number nobody
 * bumps cannot answer that. A timestamp and a commit can, and neither needs
 * anyone to remember to update it.
 *
 * The commit matters more than the time. Two builds a minute apart are
 * indistinguishable by clock, and the case where this gets used is exactly the
 * case where someone has built twice.
 */

export interface BuildStamp {
  /** ISO time the build started. */
  at: string;
  /** Short commit sha, or 'unknown' outside a git checkout. */
  commit: string;
}

/**
 * The stamp baked in at build time.
 *
 * Absent in tests and in any environment that does not go through Vite, which
 * is why every reader goes through {@link buildStamp} rather than the global.
 */
declare const __BUILD_STAMP__: BuildStamp | undefined;

export function buildStamp(): BuildStamp | null {
  try {
    return typeof __BUILD_STAMP__ === 'undefined' ? null : __BUILD_STAMP__;
  } catch { return null; }
}

/**
 * The one line to put on screen.
 *
 * Says the age rather than only the timestamp, because "11:04" means nothing
 * without knowing what today is on that device, and the whole point is to be
 * readable at a glance from arm's length.
 */
export function buildStampLine(stamp: BuildStamp | null, now = Date.now()): string {
  if (!stamp) return 'build unknown';
  const ms = now - Date.parse(stamp.at);
  const age = !Number.isFinite(ms) || ms < 0
    ? null
    : ms < 60_000 ? 'just now'
    : ms < 3_600_000 ? `${Math.round(ms / 60_000)}m ago`
    : ms < 172_800_000 ? `${Math.round(ms / 3_600_000)}h ago`
    : `${Math.round(ms / 86_400_000)}d ago`;
  const time = Number.isFinite(Date.parse(stamp.at))
    ? stamp.at.slice(0, 16).replace('T', ' ')
    : stamp.at;
  return [`build ${stamp.commit}`, time, age].filter(Boolean).join(' · ');
}

/**
 * Whether the running bundle is old enough to be suspicious.
 *
 * Only ever a hint. A build from last week is completely normal when nobody
 * has changed anything; this exists so the line can go amber during a session
 * where someone IS rebuilding and the app in front of them is not moving.
 */
export function buildLooksStale(stamp: BuildStamp | null, maxAgeMs: number, now = Date.now()): boolean {
  if (!stamp) return false;   // unknown is not the same as old
  const ms = now - Date.parse(stamp.at);
  return Number.isFinite(ms) && ms > maxAgeMs;
}
