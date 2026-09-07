/**
 * Hoe een prestatieregel van een agent bijwerkt.
 *
 * De oude versie bouwde de nieuwe waarde zo op:
 *
 *   JSON.stringify({ total, successes, latency: latencyMs, ...data })
 *
 * `data` is de vórige waarde, en die stond als laatste. Een spread die later
 * komt wint, dus de zojuist opgehoogde total en successes werden meteen weer
 * overschreven door de oude. De teller stond daardoor voorgoed op wat er bij
 * de tweede aanroep in kwam: de regel bewoog wel -- confidence veranderde --
 * maar hij telde niet.
 *
 * Precies de faalwijze waar deze codebase vol mee zit: er ontstaat data, dus
 * het lijkt te werken.
 *
 * Wat er van de oude waarde bewaard moet blijven zijn de velden die wij niet
 * kennen. Die horen eronder, niet erover.
 */

export interface Prestatie {
  total: number;
  successes: number;
  latency: number;
}

export interface PrestatieUitkomst extends Prestatie {
  /** Meegedragen velden uit een vorige versie die wij niet kennen. */
  [extra: string]: unknown;
}

/** Een getal dat geen getal is telt als nul, niet als NaN -- één kapotte rij
 *  hoort de hele teller niet onbruikbaar te maken. */
function getal(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function volgendePrestatie(
  vorige: Record<string, unknown> | null,
  gelukt: boolean,
  latencyMs: number,
): PrestatieUitkomst {
  return {
    // De hele vorige waarde eerst, zodat onbekende velden bewaard blijven en
    // onze eigen tellers er daarna overheen gaan. De volgorde ís de fix: stond
    // deze spread achteraan, dan won de oude teller.
    ...(vorige ?? {}),
    total: getal(vorige?.total) + 1,
    successes: getal(vorige?.successes) + (gelukt ? 1 : 0),
    latency: latencyMs,
  };
}

/**
 * Vertrouwen is het slaagpercentage, met één uitzondering: bij de allereerste
 * meting weet je nog niets. Eén mislukking maakt een agent niet waardeloos en
 * één succes niet betrouwbaar, dus daar staan vaste startwaarden.
 */
export function vertrouwenVan(p: Prestatie, gelukt: boolean): number {
  if (p.total <= 1) return gelukt ? 0.7 : 0.3;
  return p.successes / p.total;
}
