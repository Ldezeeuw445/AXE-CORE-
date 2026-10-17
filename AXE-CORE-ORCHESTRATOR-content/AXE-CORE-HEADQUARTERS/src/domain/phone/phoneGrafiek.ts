/**
 * Telefoon-grafiek: sparkline uit de lockscreen-snapshot, nooit een lege
 * zwarte bak en nooit een MetaAPI-foutregel over de candles.
 */

export function sparkPunten(spark: readonly number[] | undefined, last?: number): number[] {
  const raw = (spark ?? []).filter((n) => Number.isFinite(n));
  if (raw.length >= 2) return [...raw];
  if (last != null && Number.isFinite(last)) return [last, last];
  return [];
}

export function sparkLijn(punten: readonly number[], w: number, h: number): string {
  if (punten.length < 2 || w <= 0 || h <= 0) return '';
  const min = Math.min(...punten);
  const max = Math.max(...punten);
  const span = max - min || 1;
  return punten.map((p, i) => {
    const x = (i / (punten.length - 1)) * w;
    const y = h - ((p - min) / span) * (h - 2) - 1;
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(' ');
}

/** Quota / 429 / ruwe JSON → één woord voor de UI. */
export function menselijkeBrokerFout(error: string): 'paused' | 'empty' {
  const e = (error ?? '').toLowerCase();
  if (!e.trim()) return 'empty';
  if (/quota|backing off|429|nothing cached|rate limit/.test(e)) return 'paused';
  return 'paused';
}

export function brokerFoutTekst(error: string): string {
  return menselijkeBrokerFout(error) === 'empty' ? 'No open positions.' : 'Positions paused.';
}
