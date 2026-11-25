/**
 * Interview -- de I/O rond domain/chat/interview.
 *
 * Antwoorden staan in global_memory (category luka_profiel, key `profiel:<id>`),
 * dus de Macs en de telefoon kennen dezelfde Luka. De prompt leest de cache
 * synchroon (net als sessieGeheugen), zodat geen antwoord op het geheugen wacht.
 * Waar het interview staat (welke vraag open is) is per apparaat: localStorage.
 */
import { memList, memUpsert } from '@/infrastructure/gateways/axeCoreApiService';
import { AXE_USER_ID } from '@/infrastructure/persistence/chatPersistence';
import {
  PROFIEL_CATEGORIE,
  PROFIEL_PREFIX,
  idUitSleutel,
  profielBlok,
  profielSleutel,
  verwerk,
  type ProfielRegel,
  type Stand,
} from '@/domain/chat/interview';

const STAND_SLEUTEL = 'axe_interview_stand_v1';
const VERS_MS = 3 * 60_000;

let cache: ProfielRegel[] = [];
let opgehaaldOp = 0;

export async function haalProfiel(force = false): Promise<ProfielRegel[]> {
  if (!force && opgehaaldOp && Date.now() - opgehaaldOp < VERS_MS) return cache;
  try {
    const rijen = await memList({ user_id: AXE_USER_ID, category: PROFIEL_CATEGORIE, key_prefix: PROFIEL_PREFIX, limit: 40 });
    cache = (rijen ?? []).flatMap((r) => {
      const id = idUitSleutel(String((r as { key?: string }).key ?? ''));
      const antwoord = String((r as { value?: string }).value ?? '');
      return id && antwoord ? [{ id, antwoord }] : [];
    });
    opgehaaldOp = Date.now();
  } catch {
    /* geen verbinding: houd wat er was */
  }
  return cache;
}

/** Het blok voor de systeemprompt, of '' -- synchroon, uit de cache. */
export function profielContext(): string {
  return profielBlok(cache);
}

function leesStand(): Stand {
  try {
    const v = JSON.parse(localStorage.getItem(STAND_SLEUTEL) ?? 'null') as Stand | null;
    return v && (typeof v.open === 'number' || v.open === null) ? v : { open: null };
  } catch {
    return { open: null };
  }
}

function schrijfStand(s: Stand): void {
  try { localStorage.setItem(STAND_SLEUTEL, JSON.stringify(s)); } catch { /* privémodus */ }
}

/**
 * Eén chatbericht door het interview. Null = hoort er niet bij (gewoon chatten).
 * Anders het antwoord van AXE; een gegeven antwoord is dan al bewaard.
 */
export async function interviewBeurt(tekst: string): Promise<string | null> {
  const stand = leesStand();
  // Snel pad: geen lopend interview en geen interview-woorden -> nooit wachten op het netwerk.
  if (stand.open === null && !verwerk(tekst, stand, new Set(['_']))) return null;
  const bekend = new Set((await haalProfiel(true)).map((r) => r.id));
  const beurt = verwerk(tekst, stand, bekend);
  if (!beurt) return null;
  if (beurt.bewaar) {
    const { id, kop, vraag, antwoord } = beurt.bewaar;
    try {
      await memUpsert([{
        user_id: AXE_USER_ID, category: PROFIEL_CATEGORIE, key: profielSleutel(id), value: antwoord,
        confidence: 0.95, metadata: { agentId: 'interview', kop, vraag },
      }]);
      cache = [...cache.filter((r) => r.id !== id), { id, antwoord }];
    } catch (e) {
      // Niet doen alsof: de vraag blijft open zodat hij het opnieuw kan zeggen.
      return `Ik kon je antwoord niet bewaren (${e instanceof Error ? e.message : String(e)}). Zeg het nog eens, of "stop interview".`.slice(0, 260);
    }
  }
  schrijfStand(beurt.stand);
  return beurt.antwoord;
}

/** Alleen voor tests. */
export function _resetProfiel(): void {
  cache = [];
  opgehaaldOp = 0;
}
