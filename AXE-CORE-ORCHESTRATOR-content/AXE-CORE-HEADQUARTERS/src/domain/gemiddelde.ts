/**
 * Het gemiddelde van gemeten waarden, of niets als er niets gemeten is.
 *
 * `som / aantal` met aantal nul geeft NaN, en `Math.round(NaN)` is NaN. Op het
 * MCP-scherm stond daardoor letterlijk "NaNms Avg Latency" zodra er geen enkele
 * server verbonden was.
 *
 * Null en niet nul. Nul milliseconden is een meting -- het zou betekenen dat
 * alles onmiddellijk antwoordt. Dat er niets te meten viel is iets anders, en
 * dat verschil hoort zichtbaar te blijven. Dezelfde regel als elders in deze
 * codebase: een leeg antwoord mag niet als een geldig antwoord ogen.
 */
export function gemiddelde(waarden: readonly number[]): number | null {
  const bruikbaar = waarden.filter((w) => Number.isFinite(w));
  if (!bruikbaar.length) return null;
  return Math.round(bruikbaar.reduce((a, w) => a + w, 0) / bruikbaar.length);
}

/** Hoe je een ontbrekende meting toont: een streepje, geen getal. */
export function toonGetal(waarde: number | null, eenheid = ''): string {
  return waarde === null ? '—' : `${waarde}${eenheid}`;
}
