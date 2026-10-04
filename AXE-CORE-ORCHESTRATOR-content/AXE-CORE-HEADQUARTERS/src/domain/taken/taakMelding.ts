/**
 * Klaar of vastgelopen: één zichtbare melding, geen mail, geen bericht.
 * Zelfde standen als TaskCompletionToasts / core_tasks — geen tweede bron.
 */
import { TERMINAL_TASK_STATUSES } from '@/domain/tasks/taskStatus';

const AFGEROND = new Set<string>(TERMINAL_TASK_STATUSES as readonly string[]);
const MISLUKT = new Set(['failed', 'cancelled', 'rejected', 'blocked']);

export interface TaakStand {
  id: string;
  title: string;
  status: string;
}

export interface TaakMelding {
  id: string;
  titel: string;
  tekst: string;
  mislukt: boolean;
  /** Altijd false: deze melding stuurt niets. */
  stuurde: false;
}

export function taakIsAfgerond(status: string): boolean {
  return AFGEROND.has(String(status || '').toLowerCase());
}

export function taakIsVastgelopen(status: string): boolean {
  return MISLUKT.has(String(status || '').toLowerCase());
}

/**
 * Eerste meting (geen vorige stand) zwijgt — anders meldt de app bij
 * elke herstart alles wat ooit klaar was.
 */
export function taakMeldingVan(nu: TaakStand, vorige?: TaakStand | null): TaakMelding | null {
  if (!vorige) return null;
  const wasOpen = !taakIsAfgerond(vorige.status);
  const nuAf = taakIsAfgerond(nu.status) || taakIsVastgelopen(nu.status);
  if (!(wasOpen && nuAf)) return null;
  const mislukt = taakIsVastgelopen(nu.status);
  return {
    id: nu.id,
    titel: nu.title,
    tekst: mislukt ? `Stuck: ${nu.title}` : `Done: ${nu.title}`,
    mislukt,
    stuurde: false,
  };
}

/** Wat de kluis toont zonder een log te openen. Geen verzenden. */
export function zichtbareTaakMeldingen(rijen: readonly TaakStand[]): TaakMelding[] {
  const uit: TaakMelding[] = [];
  for (const r of rijen) {
    if (taakIsAfgerond(r.status) || taakIsVastgelopen(r.status)) {
      const mislukt = taakIsVastgelopen(r.status);
      uit.push({
        id: r.id,
        titel: r.title,
        tekst: mislukt ? `Stuck: ${r.title}` : `Done: ${r.title}`,
        mislukt,
        stuurde: false,
      });
    }
  }
  return uit;
}
