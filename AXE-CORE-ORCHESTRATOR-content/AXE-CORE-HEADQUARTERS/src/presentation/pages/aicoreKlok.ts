/** Lokale klok voor de cognitive stream — niet UTC. */
export function formatLocalClock(at: number | Date = Date.now(), withMs = true): string {
  const d = at instanceof Date ? at : new Date(at);
  const basis = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
  return withMs ? `${basis}.${String(d.getMilliseconds()).padStart(3, '0')}` : basis;
}
