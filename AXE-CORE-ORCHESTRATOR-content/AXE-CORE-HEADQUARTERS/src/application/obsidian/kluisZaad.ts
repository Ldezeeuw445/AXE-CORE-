/**
 * Zet de kluisboom klaar: workplace per tab, werkplek per roster-agent,
 * workspace per repo. Bestaande notities blijven staan. Schrijffouten
 * breken de zaai niet: de catalogus blijft zichtbaar.
 */
import {
  listRecentObsidianNotes,
  writeObsidianNote,
  type ObsidianNote,
} from '@/infrastructure/persistence/obsidianMemoryService';
import {
  kluisZaadNotities,
  ontbrekendeZaadNotities,
  type ZaadNotitie,
} from '@/domain/obsidian/kluisZaadCatalogus';
import { voegKluisNotitiesSamen } from '@/domain/obsidian/kluisNotities';

const ZAAD_SLEUTEL = 'axe_kluis_zaad_paden_v1';

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

function alsNote(z: ZaadNotitie): ObsidianNote {
  return {
    path: z.path,
    title: z.title,
    content: z.content,
    tags: z.tags,
    wikilinks: [],
    source: 'system',
  };
}

async function schrijfZaad(n: ZaadNotitie): Promise<ObsidianNote> {
  const note = alsNote(n);
  try {
    await writeObsidianNote({
      path: n.path,
      title: n.title,
      content: n.content,
      tags: n.tags,
      source: 'system',
    });
  } catch {
    /* lokale cache heeft hem al; toon hem toch */
  }
  return note;
}

/** Open en Sync now: zaai wat ontbreekt, lees, voeg catalogus bij zodat memory-notes de boom niet verdringen. */
export async function zaaiEnLeesKluis(): Promise<ObsidianNote[]> {
  const bestaande = await listRecentObsidianNotes(400).catch(() => [] as ObsidianNote[]);
  const paden = new Set([
    ...bestaande.map((n) => n.path),
    ...gelezenZaadPaden(),
  ]);
  const ontbrekend = ontbrekendeZaadNotities(paden);
  const geschreven: ObsidianNote[] = [];
  for (const n of ontbrekend) {
    geschreven.push(await schrijfZaad(n));
  }
  if (geschreven.length) onthoudZaadPaden(geschreven.map((n) => n.path));

  const na = await listRecentObsidianNotes(400).catch(() => bestaande);
  return voegKluisNotitiesSamen(na, geschreven, kluisZaadNotities().map(alsNote));
}

export async function maybeSeedKluisBoom(): Promise<ObsidianNote[]> {
  return zaaiEnLeesKluis();
}
