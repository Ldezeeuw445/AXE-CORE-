/**
 * Opslag van Luka's afspraken (domain/agenda/afspraken): één lijst in user_settings onder `axe_agenda_v1`,
 * dus lokaal snel en in Supabase duurzaam, op elk apparaat hetzelfde.
 *
 * Wijzigingen lopen achter elkaar: "zet de tandarts erin en het diner erbij" is twee schrijfacties vlak na
 * elkaar, en lezen-aanpassen-schrijven zonder wachtrij laat de tweede de eerste overschrijven.
 */
import { loadSetting, saveSetting } from '@/infrastructure/persistence/userSettingsService';
import { leesAfspraken, type Afspraak } from '@/domain/agenda/afspraken';

export const AFSPRAKEN_SLEUTEL = 'axe_agenda_v1';
export const AFSPRAKEN_EVENT = 'axe-agenda-updated';

let wachtrij: Promise<unknown> = Promise.resolve();

export async function laadAfspraken(): Promise<Afspraak[]> {
  return leesAfspraken(await loadSetting<unknown>(AFSPRAKEN_SLEUTEL, []));
}

/** Pas de lijst aan en bewaar hem. Geeft terug wat de aanpassing teruggaf en of het ook in de cloud staat. */
export function wijzigAfspraken<T>(
  aanpassing: (huidig: Afspraak[]) => { lijst: Afspraak[]; uitkomst: T },
): Promise<{ uitkomst: T; gesynct: boolean }> {
  const stap = wachtrij.then(async () => {
    const { lijst, uitkomst } = aanpassing(await laadAfspraken());
    const opslag = await saveSetting(AFSPRAKEN_SLEUTEL, lijst);
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(AFSPRAKEN_EVENT));
    return { uitkomst, gesynct: opslag.synced };
  });
  wachtrij = stap.catch(() => undefined);
  return stap;
}
