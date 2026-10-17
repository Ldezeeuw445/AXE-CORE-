/**
 * Wanneer AXE mag luisteren.
 *
 * Geen always-on, geen auto-start bij het openen van de app. Luisteren begint
 * alleen na een mic-tik (of dezelfde tik via de sneltoets). Terwijl de mic aan
 * staat blijft het huidige VAD/STT-pad lopen — dit bestand beslist alleen
 * wanneer hij aan of uit mag.
 *
 * "Hey AXE" is opt-in en standaard uit. Zonder die keuze start er geen
 * wake-luisteraar.
 */

export const STILTE_MS = 12_000;
export const WAKE_SLEUTEL = 'axe_wake_word_enabled';
export const WAKE_WOORD = 'hey axe';

export type LuisterBron = 'mic-tik' | 'sneltoets' | 'auto' | 'wake' | 'clap';

/** Mag deze bron de microfoon openen? Auto en wake nooit, tenzij wake aanstaat. */
export function magLuisterenStarten(bron: LuisterBron, wakeAan = false): boolean {
  if (bron === 'auto') return false;
  if (bron === 'wake') return wakeAan;
  return bron === 'mic-tik' || bron === 'sneltoets' || bron === 'clap';
}

/** Wake-woord staat alleen aan bij een expliciete waarheid. */
export function wakeAanVan(waarde: unknown): boolean {
  return waarde === true || waarde === 'true' || waarde === 1 || waarde === '1';
}

export function isWakeZin(tekst: string, woord = WAKE_WOORD): boolean {
  const t = tekst.toLowerCase().replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const w = woord.toLowerCase().replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();
  return t === w || t.startsWith(`${w} `);
}

/** Lange stilte na de laatste spraak: mic uit. Korte VAD-stilte (einde beurt) telt hier niet. */
export function stilteVerlopen(nu: number, laatsteSpraak: number, timeout = STILTE_MS): boolean {
  if (laatsteSpraak <= 0) return false;
  return nu - laatsteSpraak >= timeout;
}
