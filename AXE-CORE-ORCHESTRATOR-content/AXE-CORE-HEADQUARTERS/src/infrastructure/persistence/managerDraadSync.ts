/**
 * De Managers-tab als Grok Bot: één gesprek per manager, op elk apparaat.
 *
 * De chat stond alleen in localStorage (managerChatOpslag.ts); wat de managers
 * 24/7 deden kwam nergens in de app. De VPS houdt nu de draad bij
 * (backend/axe_api/manager_draad.py). Deze module:
 *
 * - haalt nieuwe berichten op (ook die de managers zelf in gewone taal
 *   schrijven) en zet ze in de lokale chat van die manager;
 * - stuurt wat Luka typt en wat een manager in de app antwoordt naar de VPS,
 *   zodat de Mac mini, de iMac en de telefoon hetzelfde gesprek zien.
 *
 * Alleen berichten van ná de eerste sync gaan omhoog: de oude lokale
 * geschiedenis wordt niet opnieuw (met de tijd van nu) op de server gezet.
 */
import { managersDraad, schrijfManagerBericht, markeerManagerGelezen } from '@/infrastructure/gateways/axeCoreApiService';
import { bewaarManagerChat, laadManagerChat, type ManagerChatMsg } from '@/domain/agents/managerChatOpslag';
import { koppelServerBerichten, teVersturen, type ServerBericht } from '@/domain/agents/managerDraad';

const SINDS = 'axe_manager_draad_sinds_v1';
const GEKOPPELD = 'axe_manager_draad_gekoppeld_v1';
const LAATST = 'axe_manager_draad_laatst_v1';
export const MANAGER_DRAAD_EVT = 'axe-manager-draad';

function lees<T>(sleutel: string, standaard: T): T {
  try {
    const raw = localStorage.getItem(sleutel);
    return raw ? (JSON.parse(raw) as T) : standaard;
  } catch {
    return standaard;
  }
}

function zet(sleutel: string, waarde: unknown) {
  try { localStorage.setItem(sleutel, JSON.stringify(waarde)); } catch { /* */ }
}

/** Lokaal bericht-id -> server-id. Wat hierin staat, gaat nooit nog eens omhoog. */
function gekoppeld(): Record<string, string> {
  return lees<Record<string, string>>(GEKOPPELD, {});
}

function startMoment(): number {
  let t = lees<number>(SINDS, 0);
  if (!t) {
    t = Date.now();
    zet(SINDS, t);
  }
  return t;
}

let bezig = false;

/** Eén ronde: eerst eigen nieuwe berichten omhoog, dan nieuwe van de server binnen. */
export async function syncManagerDraad(agentIds: readonly string[]): Promise<number> {
  if (bezig || typeof localStorage === 'undefined') return 0;
  bezig = true;
  try {
    const sinds = startMoment();
    const kop = gekoppeld();
    for (const id of agentIds) {
      for (const m of teVersturen(laadManagerChat(id), kop, sinds)) {
        try {
          const r = await schrijfManagerBericht({ agent: id, role: m.role as 'user' | 'assistant', text: m.text });
          if (r?.id) kop[m.id] = r.id;
        } catch { /* volgende ronde opnieuw */ }
      }
    }
    zet(GEKOPPELD, kop);

    // Tien minuten overlap: koppelen is idempotent (op id), en zo valt een
    // bericht nooit weg als de chat het lokaal net overschreef.
    const laatst = lees<string | null>(LAATST, null);
    const vanaf = laatst ? new Date(Date.parse(laatst) - 10 * 60_000).toISOString() : undefined;
    const { messages } = await managersDraad(vanaf);
    if (!messages?.length) return 0;
    let nieuw = 0;
    const perAgent = new Map<string, ServerBericht[]>();
    for (const b of messages) {
      if (!b.agent) continue;
      perAgent.set(b.agent, [...(perAgent.get(b.agent) ?? []), b]);
    }
    for (const [agent, rijen] of perAgent) {
      const voor = laadManagerChat(agent);
      const na: ManagerChatMsg[] = koppelServerBerichten(voor, rijen, kop);
      if (na.length !== voor.length) {
        nieuw += na.length - voor.length;
        bewaarManagerChat(agent, na);
      }
    }
    zet(LAATST, messages[messages.length - 1].at);
    if (nieuw) {
      try { globalThis.dispatchEvent?.(new CustomEvent(MANAGER_DRAAD_EVT, { detail: nieuw })); } catch { /* */ }
    }
    return nieuw;
  } catch {
    return 0;
  } finally {
    bezig = false;
  }
}

export function managerGelezen(agentId: string) {
  void markeerManagerGelezen(agentId).catch(() => {});
}
