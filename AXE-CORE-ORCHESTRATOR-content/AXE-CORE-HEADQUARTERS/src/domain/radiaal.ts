/**
 * Waar de knoppen van een radiaal menu komen te staan.
 *
 * ## Waarom dit domeinlogica is en geen stijl
 *
 * Het is rekenwerk met randgevallen -- één item, nul items, een halve ring --
 * en dat hoort testbaar te zijn zonder een browser. Een radiaal menu dat bij
 * één item de knop bovenop het midden legt, of bij een halve ring de laatste
 * knop dubbel plaatst, ziet er verkeerd uit zonder dat je kunt zien waarom.
 *
 * ## De hoekafspraak
 *
 * Nul graden is BOVEN en de ring loopt met de klok mee. Dat is niet de
 * wiskundige afspraak (nul is rechts, tegen de klok in), en met opzet: een
 * gebruiker beschrijft een menu als "de eerste staat bovenaan, dan naar
 * rechts". Code die die beschrijving volgt hoeft niet omgerekend te worden bij
 * het lezen.
 */

export interface RadiaalPunt {
  /** Verschuiving vanaf het midden, in pixels. */
  x: number;
  y: number;
  /** De hoek in graden, boven = 0, met de klok mee. Voor een draaiend icoon. */
  hoek: number;
}

export interface RadiaalOpties {
  /** Afstand tot het midden, in pixels. */
  straal: number;
  /** Waar het eerste item staat. 0 = boven. */
  startHoek?: number;
  /**
   * Over hoeveel graden de items verdeeld worden. 360 is een volle ring.
   *
   * Bij een volle ring wordt door n gedeeld en niet door n-1: anders vallen de
   * eerste en de laatste op dezelfde plek, want 0 en 360 graden zijn hetzelfde
   * punt.
   */
  boog?: number;
}

export function radiaalPosities(aantal: number, opties: RadiaalOpties): RadiaalPunt[] {
  const { straal, startHoek = 0, boog = 360 } = opties;
  if (aantal <= 0) return [];

  // Eén item hoort op de starthoek te staan, niet in het midden. Delen door
  // (aantal - 1) zou hier 0/0 geven.
  if (aantal === 1) return [punt(startHoek, straal)];

  const volleRing = Math.abs(boog % 360) < 0.001 && Math.abs(boog) >= 360;
  const stap = volleRing ? boog / aantal : boog / (aantal - 1);

  return Array.from({ length: aantal }, (_, i) => punt(startHoek + i * stap, straal));
}

function punt(hoek: number, straal: number): RadiaalPunt {
  // -90 omdat de wiskunde nul naar rechts legt en wij naar boven.
  const rad = ((hoek - 90) * Math.PI) / 180;
  return {
    x: Math.round(Math.cos(rad) * straal * 1000) / 1000,
    y: Math.round(Math.sin(rad) * straal * 1000) / 1000,
    hoek,
  };
}
