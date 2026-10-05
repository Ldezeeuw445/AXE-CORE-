/**
 * Zet de kluisboom klaar: workplace per tab, werkplek per roster-agent,
 * workspace per repo. Alleen een pad dat écht in Supabase staat telt.
 * Een mislukte write wordt niet onthouden, en de catalogus is geen
 * vervanger voor een rij.
 */
import {
  getObsidianNoteByPath,
  listKluisNotities,
  writeObsidianNote,
  type ObsidianNote,
} from '@/infrastructure/persistence/obsidianMemoryService';
import {
  kluisZaadNotities,
  ontbrekendeZaadNotities,
  type ZaadNotitie,
} from '@/domain/obsidian/kluisZaadCatalogus';
import { voegKluisNotitiesSamen } from '@/domain/obsidian/kluisNotities';

const ZAAD_SLEUTEL = 'axe_kluis_zaad_paden_v2';
const OUD_SLEUTEL = 'axe_kluis_zaad_paden_v1';

function wisVerouderdZaad(): void {
  try {
    if (localStorage.getItem(OUD_SLEUTEL) != null) localStorage.removeItem(OUD_SLEUTEL);
  } catch { /* quota / private */ }
}

function gelezenZaadPaden(): Set<string> {
  try {
    const raw = JSON.parse(localStorage.getItem(ZAAD_SLEUTEL) || '[]');
    return new Set(Array.isArray(raw) ? raw.filter((p): p is string => typeof p === 'string') : []);
  } catch {
    return new Set();
  }
}

function onthoudZaadPaden(paden: Iterable<string>): void {
  const s = gelezenZaadPaden();
  for (const p of paden) s.add(p);
  try {
    localStorage.setItem(ZAAD_SLEUTEL, JSON.stringify([...s]));
  } catch { /* quota */ }
}

export interface KluisZaadUit {
  notes: ObsidianNote[];
  fout: string | null;
  geschreven: number;
}

async function schrijfZaad(n: ZaadNotitie): Promise<ObsidianNote> {
  await writeObsidianNote({
    path: n.path,
    title: n.title,
    content: n.content,
    tags: n.tags,
    source: 'system',
  });
  const rij = await getObsidianNoteByPath(n.path);
  if (!rij) throw new Error(`Seed write not confirmed in Supabase: ${n.path}`);
  return rij;
}

/** Open en Sync now: zaai wat in Supabase ontbreekt. Catalogus vult de grafiek niet. */
export async function zaaiEnLeesKluis(): Promise<KluisZaadUit> {
  wisVerouderdZaad();
  const bestaande = await listKluisNotities().catch(() => [] as ObsidianNote[]);
  const inDb = new Set(bestaande.map((n) => n.path));
  const ontbrekend = ontbrekendeZaadNotities(inDb);
  const geschreven: ObsidianNote[] = [];
  const fouten: string[] = [];
  for (const n of ontbrekend) {
    try {
      const rij = await schrijfZaad(n);
      geschreven.push(rij);
      onthoudZaadPaden([rij.path]);
    } catch (err) {
      fouten.push(err instanceof Error ? err.message : String(err));
    }
  }

  const na = await listKluisNotities().catch(() => bestaande);
  const notes = voegKluisNotitiesSamen(na, geschreven);
  const fout = fouten.length
    ? `Vault seed failed for ${fouten.length} note${fouten.length === 1 ? '' : 's'}: ${fouten[0]}`
    : null;
  return { notes, fout, geschreven: geschreven.length };
}

export async function maybeSeedKluisBoom(): Promise<ObsidianNote[]> {
  return (await zaaiEnLeesKluis()).notes;
}
