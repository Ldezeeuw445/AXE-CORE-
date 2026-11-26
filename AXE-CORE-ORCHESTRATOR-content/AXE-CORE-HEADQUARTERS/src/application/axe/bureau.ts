/**
 * Bureau -- de I/O rond domain/bureau. Links in global_memory (luka_bureau),
 * dus op elke Mac en de telefoon hetzelfde. Weghalen archiveert (weg: true).
 */
import { memList, memUpsert } from '@/infrastructure/gateways/axeCoreApiService';
import { AXE_USER_ID } from '@/infrastructure/persistence/chatPersistence';
import {
  BUREAU_CATEGORIE, BUREAU_PREFIX, bewaardAntwoord, bureauBlok, bureauOpdracht, domein, leesLink, linkId, lijstAntwoord,
  mapNaam, normUrl, type BureauLink,
} from '@/domain/bureau';

const VERS_MS = 3 * 60_000;
let cache: BureauLink[] = [];
let opgehaaldOp = 0;

export async function haalBureau(force = false): Promise<BureauLink[]> {
  if (!force && opgehaaldOp && Date.now() - opgehaaldOp < VERS_MS) return cache;
  const rijen = await memList({ user_id: AXE_USER_ID, category: BUREAU_CATEGORIE, key_prefix: BUREAU_PREFIX, limit: 500 });
  cache = (rijen ?? []).flatMap((r) => {
    const l = leesLink(String((r as { key?: string }).key ?? ''), String((r as { value?: string }).value ?? ''));
    return l ? [l] : [];
  });
  opgehaaldOp = Date.now();
  return cache;
}

async function schrijf(l: BureauLink): Promise<BureauLink> {
  const { id, ...rest } = l;
  const bewaard = await memUpsert([{
    user_id: AXE_USER_ID, category: BUREAU_CATEGORIE, key: `${BUREAU_PREFIX}${id}`, value: JSON.stringify(rest),
    confidence: 0.95, metadata: { agentId: 'bureau', map: l.map },
  }]);
  if (!bewaard?.length) throw new Error('the server did not save it');
  cache = [...cache.filter((x) => x.id !== id), l];
  return l;
}

export async function bewaarLink(invoer: { url: string; map?: string; waarom?: string; titel?: string }): Promise<BureauLink> {
  const url = normUrl(invoer.url);
  if (!url) throw new Error('That is not a web address.');
  const id = linkId(url);
  const oud = cache.find((x) => x.id === id);
  return schrijf({
    id, url,
    titel: (invoer.titel ?? '').trim() || oud?.titel || domein(url),
    map: mapNaam(invoer.map || oud?.map),
    waarom: (invoer.waarom ?? '').trim() || (oud?.weg ? '' : oud?.waarom ?? ''),
    op: Date.now(),
  });
}

/** Van het bureau halen: archiveren, niet wissen. */
export async function archiveerLink(l: BureauLink): Promise<void> {
  await schrijf({ ...l, weg: true });
}

/** Het bureau-blok voor de prompt, of '' -- synchroon, uit de cache. */
export function bureauContext(bericht: string): string {
  return bureauBlok(cache, bericht);
}

/** "bewaar <link> in <map>: waarom" / "wat staat er op mijn bureau". Null = geen opdracht. */
export async function bureauBeurt(tekst: string): Promise<string | null> {
  const o = bureauOpdracht(tekst);
  if (!o) return null;
  try {
    if (o.soort === 'lijst') return lijstAntwoord(await haalBureau(true));
    await haalBureau().catch(() => cache);
    return bewaardAntwoord(await bewaarLink(o));
  } catch (e) {
    return `Dat lukte niet: ${e instanceof Error ? e.message : String(e)}`.slice(0, 200);
  }
}

/** Alleen voor tests. */
export function _resetBureau(): void {
  cache = [];
  opgehaaldOp = 0;
}
