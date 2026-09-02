/**
 * The line that answers "is this the build I just made?".
 *
 * Sits under the Settings title because that is where someone already goes
 * when they suspect the app is not what they think it is. Selectable text on
 * purpose — the commit is worth copying into a message when the answer is no.
 */
import { buildStamp, buildStampLine, buildLooksStale } from '@/domain/buildStamp';
import { meaningVar } from '@/domain/meaning';

/** Older than a day during a working session is worth a second look. */
const AMBER_AFTER_MS = 24 * 60 * 60 * 1000;

export function BuildStampLine() {
  const stamp = buildStamp();
  const old = buildLooksStale(stamp, AMBER_AFTER_MS);
  return (
    <p
      className="text-[9px] font-mono-data select-text -mt-4 mb-5"
      style={{ color: old ? meaningVar('budget') : 'rgba(255,255,255,0.3)' }}
      title={old ? 'This bundle is over a day old — rebuild if you expected changes' : 'When this bundle was built, and from which commit'}
    >
      {buildStampLine(stamp)}
    </p>
  );
}
