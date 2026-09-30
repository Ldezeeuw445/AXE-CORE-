/**
 * Draait de AXE-backend? Eén antwoord, voor elk scherm.
 *
 * `/status/axe-core` werd op vier plekken los bevraagd -- de zijbalk, Home,
 * de telefoon-Home en Settings -- elk met een eigen `useEffect`, een eigen
 * interval van 60 s en een eigen terugval bij een fout. Ze tikten niet gelijk,
 * dus Home kon "Online" tonen terwijl de zijbalk nog "Offline" stond. Dat zijn
 * geen twee weergaven van één feit maar twee antwoorden.
 *
 * Dit bestand bevat alleen de regel, zonder I/O: wat betekent wat er gemeten
 * is? `serviceStatus.ts` maakte datzelfde onderscheid al voor de zestien
 * diensten -- online, offline, en "er is geen meting gedaan" -- en dat derde
 * antwoord ontbrak hier. Een scherm dat bij het opstarten "Offline" zegt
 * terwijl er nog niets gemeten is, liegt.
 */
import type { ServiceStatus } from '@/domain/serviceStatus';

/**
 * Hoe oud een geslaagde meting mag zijn voor hij niets meer zegt.
 *
 * Tweeënhalve ronde van 60 s. Eén gemiste ronde is normaal (het venster stond
 * op de achtergrond, een verzoek duurde lang); drie gemiste rondes is geen
 * trage meting meer maar een dienst waar je niets meer van hoort.
 */
export const CORE_VERS_MS = 150_000;

export interface CoreMeting {
  /** Wat de laatste geslaagde meting zei. null = nog nooit iets gemeten. */
  online: boolean | null;
  /** Wanneer die meting slaagde. */
  laatsteOkAt: number | null;
  /** Loopt er op dit moment een meting? */
  bezig: boolean;
}

/**
 * De stand van de backend, in hetzelfde vocabulaire als de andere diensten.
 *
 * - `unknown` — nog niets gemeten, of de laatste geslaagde meting is te oud.
 *   Niet hetzelfde als offline: er is geen antwoord, geen slecht antwoord.
 * - `online` / `offline` — wat de laatste verse meting zei.
 */
export function coreStand(m: CoreMeting, nu: number): ServiceStatus {
  if (m.online == null || m.laatsteOkAt == null) return 'unknown';
  if (nu - m.laatsteOkAt > CORE_VERS_MS) return 'unknown';
  return m.online ? 'online' : 'offline';
}

/** Eén woord voor op het scherm. Engels: dit staat in de UI. */
export function coreLabel(stand: ServiceStatus, bezig: boolean): string {
  switch (stand) {
    case 'online': return 'Online';
    case 'offline': return 'Offline';
    case 'degraded': return 'Degraded';
    default: return bezig ? 'Checking…' : 'Not measured';
  }
}

/**
 * Of een scherm dit als "draait" mag tonen.
 *
 * Bewust strikt: alleen een verse, geslaagde meting telt. De vier plekken
 * hielden `coreOnline` als `boolean | null` bij en behandelden null elk
 * anders -- de een als offline, de ander als niets tonen.
 */
export function coreDraait(m: CoreMeting, nu: number): boolean {
  return coreStand(m, nu) === 'online';
}
