/**
 * Jouw stem -- de I/O rond domain/chat/stem.
 *
 * Voorbeelden staan in global_memory (category luka_stem, key `stem:<1..5>`),
 * dus de Macs en de telefoon schrijven in dezelfde stem. De prompt leest de
 * cache synchroon, net als profiel en sessieGeheugen.
 */
import { memList, memUpsert } from '@/infrastructure/gateways/axeCoreApiService';
import { AXE_USER_ID } from '@/infrastructure/persistence/chatPersistence';
import {
  STEM_CATEGORIE,
  STEM_PREFIX,
  bewaardAntwoord,
  lijstAntwoord,
  plekUitSleutel,
  stemBlok,
  stemOpdracht,
  stemSleutel,
  teKortAntwoord,
  volgendePlek,
  type StemVoorbeeld,
} from '@/domain/chat/stem';

const VERS_MS = 3 * 60_000;

let cache: StemVoorbeeld[] = [];
let opgehaaldOp = 0;

export async function haalStem(force = false): Promise<StemVoorbeeld[]> {
  if (!force && opgehaaldOp && Date.now() - opgehaaldOp < VERS_MS) return cache;
  try {
    const rijen = await memList({ user_id: AXE_USER_ID, category: STEM_CATEGORIE, key_prefix: STEM_PREFIX, limit: 10 });
    cache = (rijen ?? []).flatMap((r) => {
      const rij = r as { key?: string; value?: string; metadata?: { op?: unknown } | null; updated_at?: string };
      const plek = plekUitSleutel(String(rij.key ?? ''));
      const tekst = String(rij.value ?? '');
      const op = Number(rij.metadata?.op) || Date.parse(String(rij.updated_at ?? '')) || 0;
      return plek && tekst ? [{ plek, tekst, op }] : [];
    });
    opgehaaldOp = Date.now();
  } catch {
    /* geen verbinding: houd wat er was */
  }
  return cache;
}

/** Zijn er voorbeelden (uit de cache)? */
export function heeftStem(): boolean {
  return cache.length > 0;
}

/** Het stem-blok voor dit bericht, of '' -- synchroon, uit de cache. */
export function stemContext(bericht: string): string {
  return stemBlok(cache, bericht);
}

/**
 * Een chatbericht over de stem ("leer mijn stem: ...", "mijn stem").
 * Null = geen stem-opdracht: gewoon door naar de chat.
 */
export async function stemBeurt(tekst: string): Promise<string | null> {
  const o = stemOpdracht(tekst);
  if (!o) return null;
  if (o.soort === 'te-kort') return teKortAntwoord(o.tekens);
  const bestaand = await haalStem(true);
  if (o.soort === 'lijst') return lijstAntwoord(bestaand);
  const plek = volgendePlek(bestaand);
  const op = Date.now();
  try {
    const bewaard = await memUpsert([{
      user_id: AXE_USER_ID, category: STEM_CATEGORIE, key: stemSleutel(plek), value: o.tekst,
      confidence: 0.95, metadata: { agentId: 'stem', op },
    }]);
    if (!bewaard?.length) throw new Error('the server did not save it');
  } catch (e) {
    return `Ik kon je tekst niet bewaren (${e instanceof Error ? e.message : String(e)}). Probeer het nog eens.`.slice(0, 220);
  }
  cache = [...cache.filter((v) => v.plek !== plek), { plek, tekst: o.tekst, op }];
  return bewaardAntwoord(cache.length);
}

/** Alleen voor tests. */
export function _resetStem(): void {
  cache = [];
  opgehaaldOp = 0;
}
