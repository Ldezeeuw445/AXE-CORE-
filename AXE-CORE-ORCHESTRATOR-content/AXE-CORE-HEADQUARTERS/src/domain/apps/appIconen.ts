/**
 * Het ECHTE logo van elke app die AXE zelf uitbrengt.
 *
 * ## Waarom dit bestaat
 *
 * De Apps-tab tekende voor drie van de vier apps de initialen in een gekleurd
 * vierkantje -- "AC", "TO", "AC" -- omdat `registered_apps.icon_url` voor die
 * rijen simpelweg leeg was. Alleen Axon Memory had een URL. Dat leest als een
 * plaatshouder, en dat is precies wat het ook was.
 *
 * De marks zelf bestonden wel degelijk, alleen niet hier:
 *  - AXE CORE HQ    → public/icon-512.png, al in deze repo
 *  - AXE Companion  → public/axe-logo-companion.png in Ldezeeuw445/AXE-COMPANION-OS-
 *  - Trading OS     → public/tradingos-wordmark.png in diezelfde repo
 *  - Axon Memory    → app.axon-memory.com/icons/icon-512.png
 *
 * Ze staan nu als kopie in public/app-icons/, en dat is een bewuste keuze:
 * axecompanion.com geeft vandaag HTTP 402 (deployment disabled) en Axon draait
 * op een ander domein en een ander Supabase-project. Een logo dat alleen laadt
 * als de site van die app toevallig online is, is geen logo maar een gok.
 *
 * ## De volgorde
 *
 * 1. `icon_url` van de rij -- expliciet gezet wint, ook voor deze vier.
 * 2. De bundel hieronder -- als de rij leeg is OF de URL niet laadt.
 * 3. Initialen -- alleen voor een zelf toegevoegde app zonder enig icoon.
 *
 * Stap 2 is dus ook het vangnet van stap 1: valt de remote weg, dan zie je nog
 * steeds het echte logo en niet ineens twee letters.
 */

/** Gesleuteld op `registered_apps.name`, net als VPS_SERVICE_BY_APP_NAME. */
export const GEBUNDELDE_ICONEN: Readonly<Record<string, string>> = Object.freeze({
  'AXE CORE HQ': '/app-icons/axe-core.png',
  'AXE Companion': '/app-icons/companion.png',
  'Trading OS': '/app-icons/trading-os.png',
  'Axon Memory': '/app-icons/axon-memory.png',
});

/** Het meegeleverde logo van deze app, of null als we er geen hebben. */
export function gebundeldIcoon(naam: string): string | null {
  return GEBUNDELDE_ICONEN[naam] ?? null;
}

/**
 * De bronnen voor deze app, in de volgorde waarin ze geprobeerd worden.
 * Leeg betekent: er is geen echt logo, val terug op initialen.
 */
export function icoonBronnen(naam: string, iconUrl?: string | null): string[] {
  const bronnen: string[] = [];
  const url = iconUrl?.trim();
  if (url) bronnen.push(url);
  const bundel = gebundeldIcoon(naam);
  if (bundel && bundel !== url) bronnen.push(bundel);
  return bronnen;
}
