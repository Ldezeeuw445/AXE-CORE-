/**
 * The line under a panel's numbers saying where they came from.
 *
 * Small, quiet, and always present. Always present is the point: a source line
 * that only appears when something is wrong teaches the reader to ignore its
 * absence, and the absence is exactly when they most need to ask.
 *
 * Amber when the figure is older than the panel says it should be. Not red —
 * stale data is usually still the best available answer, and colouring it as a
 * failure invites throwing away a number that is merely old. See
 * domain/provenance.ts for what this exists to prevent.
 */
import { provenanceLine, isStale, type Provenance } from '@/domain/provenance';
import { meaningVar } from '@/domain/meaning';

export function ProvenanceLine({
  source, scope, at, stale, staleAfterMs,
}: Provenance & { staleAfterMs?: number }) {
  const p: Provenance = { source, scope, at, stale };
  const old = staleAfterMs != null && isStale(p, staleAfterMs);
  return (
    <p
      className="text-[9px] mt-1.5 font-mono-data"
      style={{ color: old ? meaningVar('budget') : 'rgba(255,255,255,0.3)' }}
      title={old ? 'Older than this panel expects — still the best answer available' : undefined}
    >
      {provenanceLine(p)}
    </p>
  );
}
