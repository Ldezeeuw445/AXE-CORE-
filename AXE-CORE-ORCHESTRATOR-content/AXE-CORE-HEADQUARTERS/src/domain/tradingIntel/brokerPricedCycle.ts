/**
 * Mag deze cyclus research en execution betalen?
 *
 * ## Waarom dit bestaat
 *
 * `assertTradeable` weigert LSE / Binance / synthetic terecht — maar pas
 * nadat de cyclus research, desk lanes en een account-uitwaaiering heeft
 * betaald. Gemeten 23 september 2026: 9 cycli, 35 account-vragen, 0 fills.
 * Elke weigering was: geen brokerprijs, wél `lse` of `binance:…`.
 *
 * De dure ronde mag alleen starten als de rekening die zou vullen zelf een
 * prijs heeft. Een plaatsvervangende voeding is voor de grafiek, niet voor
 * een order.
 *
 * Puur: de cyclus praat met brokers en LLM's; deze vraag niet. Zo is de
 * regel te testen zonder één netwerkaanroep, en faalt de test op de oude
 * volgorde (eerst LSE, wat later weigeren).
 */

/** Bronnen die een grafiek mogen tekenen en een fill nooit mogen prijzen. */
const PLAATSVERVANGERS = ['lse', 'synthetic', 'stooq'] as const;

/** True als deze snapshot-bron een fill zou prijzen van een ander boek. */
export function isSubstituteFeed(source: string): boolean {
  const s = source.trim().toLowerCase();
  if (s === 'metaapi') return false;
  if (s.startsWith('binance')) return true;
  return (PLAATSVERVANGERS as readonly string[]).includes(s);
}

/**
 * De dure cyclus (research → execution) mag alleen door als er een
 * brokerprijs is. Geen snapshot, of een plaatsvervanger, is een stop —
 * geen "eerst kijken op LSE en later weigeren".
 */
export function magDureCyclus(brokerSnapshot: { source: string } | null): boolean {
  return brokerSnapshot != null && !isSubstituteFeed(brokerSnapshot.source);
}
