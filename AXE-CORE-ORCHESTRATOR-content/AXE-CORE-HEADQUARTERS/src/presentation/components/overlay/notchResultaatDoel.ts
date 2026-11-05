/**
 * Waar "open groot" heen gaat, en welke bron eronder staat.
 *
 * Eigen bestand omdat `NotchResultaat.tsx` een component is: een bestand dat
 * zowel een component als losse functies exporteert, breekt fast refresh
 * (react-refresh/only-export-components). Dat is geen stijlregel maar een
 * echte: tijdens ontwikkelen herlaadt dan de hele pagina in plaats van het
 * component, en dan is de notch elke keer weer dicht.
 */
import type { OpenablePage } from '@/infrastructure/gateways/windowManagerService';

/**
 * Welk bestaand venster hoort bij deze projectie.
 *
 * Niets nieuws bouwen: 3D Maps, Trading en de Browser zijn er al en staan in
 * de allowlist van `openPageOnMonitor`. Een vierde kaartvenster zou alleen
 * betekenen dat er twee kaarten zijn die van elkaar afwijken.
 */
export function paginaVoorProjectie(mode: string): OpenablePage {
  if (mode === 'map') return 'maps-3d';
  if (mode === 'chart') return 'trading';
  return 'browser';
}

/** De eerste bron-URL uit een webresultaat, om onder de tekst te zetten. */
export function eersteUrl(tekst: string | undefined): string | null {
  const m = (tekst || '').match(/https?:\/\/[^\s)]+/);
  return m ? m[0] : null;
}
