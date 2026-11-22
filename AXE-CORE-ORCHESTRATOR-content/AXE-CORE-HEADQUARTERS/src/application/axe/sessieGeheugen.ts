/**
 * Geheugen tussen sessies -- de I/O rond domain/chat/sessieNotities.
 *
 * Notities staan in global_memory (category conversation_context, key
 * `sessie:<start>`), dus beide Macs en de telefoon lezen dezelfde. Ophalen
 * gebeurt hoogstens eens per paar minuten; de prompt leest de cache synchroon,
 * net als terugkomstContext, zodat de eerste token nooit op het geheugen wacht.
 */
import { memList, memUpsert } from '@/infrastructure/gateways/axeCoreApiService';
import { AXE_USER_ID } from '@/infrastructure/persistence/chatPersistence';
import type { Beurt } from '@/domain/chat/hoofdgesprek';
import {
  SESSIE_PREFIX,
  leesNotitie,
  notitieBerichten,
  notitiesBlok,
  sessieSleutel,
  simpeleNotitie,
  startUitSleutel,
  teNoteren,
  type SessieNotitie,
} from '@/domain/chat/sessieNotities';

type Bericht = { role: 'system' | 'user' | 'assistant'; content: string };
export type Vat = (berichten: Bericht[]) => Promise<string>;

const VERS_MS = 3 * 60_000;

let cache: SessieNotitie[] = [];
let opgehaaldOp = 0;
let bezig = false;

function rijNaarNotitie(r: { key?: string; value?: string; metadata?: Record<string, unknown> | null }): SessieNotitie | null {
  const key = String(r.key ?? '');
  const metaStart = Number((r.metadata as { start?: unknown } | null)?.start);
  const start = Number.isFinite(metaStart) && metaStart > 0 ? metaStart : startUitSleutel(key);
  if (!start || !r.value) return null;
  return { key, start, tekst: String(r.value) };
}

/** Haal de notities op (cache van een paar minuten). Fout = houd wat je had. */
export async function haalSessieNotities(force = false): Promise<SessieNotitie[]> {
  if (!force && cache.length && Date.now() - opgehaaldOp < VERS_MS) return cache;
  try {
    const rijen = await memList({ user_id: AXE_USER_ID, category: 'conversation_context', key_prefix: SESSIE_PREFIX, limit: 40 });
    cache = (rijen ?? []).map((r) => rijNaarNotitie(r as never)).filter((x): x is SessieNotitie => !!x);
    opgehaaldOp = Date.now();
  } catch {
    /* geen verbinding: de vorige cache blijft staan */
  }
  return cache;
}

/** Het blok voor de systeemprompt, of '' -- synchroon, uit de cache. */
export function sessieGeheugenContext(nu = Date.now()): string {
  return notitiesBlok(cache, nu);
}

/**
 * Noteer afgeronde sessies die nog geen notitie hebben. Fire-and-forget vanuit
 * de chat: blokkeert nooit een antwoord. Met `vat` (een model) wordt het een
 * echte samenvatting; zonder, of als het model faalt, de simpele notitie.
 */
export async function noteerAfgerondeSessies(draad: readonly Beurt[], vat?: Vat, nu = Date.now()): Promise<number> {
  if (bezig) return 0;
  bezig = true;
  try {
    const bekend = new Set((await haalSessieNotities()).map((n) => n.key));
    const open = teNoteren(draad, bekend, nu);
    let geschreven = 0;
    for (const s of open) {
      let tekst: string | null = null;
      if (vat) {
        try {
          tekst = leesNotitie(await vat(notitieBerichten(s)));
        } catch {
          tekst = null;
        }
      }
      const echt = !!tekst;
      tekst = tekst ?? simpeleNotitie(s);
      const key = sessieSleutel(s);
      await memUpsert([
        {
          user_id: AXE_USER_ID,
          category: 'conversation_context',
          key,
          value: tekst,
          confidence: echt ? 0.8 : 0.5,
          metadata: { agentId: 'sessie-notities', start: s.start, eind: s.eind, beurten: s.beurten.length, bron: echt ? 'model' : 'simpel' },
        },
      ]);
      cache = [...cache.filter((n) => n.key !== key), { key, start: s.start, tekst }];
      geschreven++;
    }
    return geschreven;
  } catch {
    return 0;
  } finally {
    bezig = false;
  }
}

/** Alleen voor tests. */
export function _resetSessieGeheugen(): void {
  cache = [];
  opgehaaldOp = 0;
  bezig = false;
}
