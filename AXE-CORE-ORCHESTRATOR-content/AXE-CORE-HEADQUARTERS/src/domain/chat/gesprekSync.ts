/**
 * Eén doorlopend gesprek over alle apparaten (Rabbit OS3: één chat, overal).
 *
 * Elk apparaat bewaart zijn berichten in axe_messages. Dit bepaalt wat een
 * apparaat doet met rijen die een ANDER apparaat net heeft opgeslagen:
 * toevoegen aan het gesprek dat open staat, of overstappen naar het gesprek
 * waar Luka op dat andere apparaat mee verder ging. Geen I/O hier.
 */

export interface ExterneRij {
  conversationId: string;
  role: 'user' | 'axe';
  text: string;
  /** ms sinds epoch (created_at van de server). */
  timestamp: number;
  /** Apparaat dat hem schreef; ontbreekt bij rijen van vóór 25 sep. */
  device?: string;
}

export interface GesprekBericht {
  role: 'user' | 'axe';
  text: string;
  timestamp: number;
}

export type SyncActie =
  | { actie: 'niets' }
  | { actie: 'toevoegen'; berichten: GesprekBericht[] }
  | { actie: 'wissel'; naar: string };

/** Zelfde rol en tekst binnen twee minuten = hetzelfde bericht. */
const ZELFDE_MS = 2 * 60_000;

function alBekend(gesprek: GesprekBericht[], r: ExterneRij): boolean {
  return gesprek.some((m) => m.role === r.role && m.text === r.text
    && Math.abs(m.timestamp - r.timestamp) < ZELFDE_MS);
}

export function verwerkExterneRijen(
  huidigGesprek: string,
  gesprek: GesprekBericht[],
  rijen: ExterneRij[],
  ditApparaat: string,
): SyncActie {
  const vreemd = rijen.filter((r) => r.device !== ditApparaat && r.text.trim());
  if (!vreemd.length) return { actie: 'niets' };

  // Luka ging op een ander apparaat verder in een ander gesprek: volg hem.
  const laatsteHier = gesprek.length ? gesprek[gesprek.length - 1].timestamp : 0;
  const elders = vreemd
    .filter((r) => r.conversationId !== huidigGesprek && r.timestamp > laatsteHier)
    .sort((a, b) => b.timestamp - a.timestamp)[0];
  if (elders) return { actie: 'wissel', naar: elders.conversationId };

  const nieuw = vreemd
    .filter((r) => r.conversationId === huidigGesprek && !alBekend(gesprek, r))
    .sort((a, b) => a.timestamp - b.timestamp)
    .map(({ role, text, timestamp }) => ({ role, text, timestamp }));
  return nieuw.length ? { actie: 'toevoegen', berichten: nieuw } : { actie: 'niets' };
}
