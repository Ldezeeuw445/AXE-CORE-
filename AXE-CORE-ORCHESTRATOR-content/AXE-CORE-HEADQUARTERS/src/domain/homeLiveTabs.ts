/**
 * Welke tab staat open in een Home-kaart (22 nov)? Luka's eigen keuze wint;
 * zonder keuze de standaard (rechts: "Needs your OK" als er iets wacht).
 */
export type HomeTab = 'lopend' | 'recent' | 'ok' | 'seats';

export function kiesTab(beschikbaar: HomeTab[], gekozen: HomeTab | null, standaard: HomeTab): HomeTab {
  if (gekozen && beschikbaar.includes(gekozen)) return gekozen;
  return beschikbaar.includes(standaard) ? standaard : beschikbaar[0];
}
