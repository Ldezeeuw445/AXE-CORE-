import { beforeEach, describe, expect, it, vi } from 'vitest';

const listKluis = vi.fn();
const writeNote = vi.fn();
const getByPath = vi.fn();

vi.mock('@/infrastructure/persistence/obsidianMemoryService', () => ({
  listKluisNotities: (...args: unknown[]) => listKluis(...args),
  writeObsidianNote: (...args: unknown[]) => writeNote(...args),
  getObsidianNoteByPath: (...args: unknown[]) => getByPath(...args),
}));

import { kluisZaadNotities } from '@/domain/obsidian/kluisZaadCatalogus';
import { zaaiEnLeesKluis } from './kluisZaad';

describe('zaaiEnLeesKluis', () => {
  beforeEach(() => {
    listKluis.mockReset();
    writeNote.mockReset();
    getByPath.mockReset();
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v); },
      removeItem: (k: string) => { store.delete(k); },
      clear: () => store.clear(),
    });
  });

  it('zaait ontbrekende workplaces/agents/repos en onthoudt alleen bevestigde rijen', async () => {
    const catalogus = kluisZaadNotities();
    listKluis.mockResolvedValue([]);
    writeNote.mockImplementation(async (in_: { path?: string }) => ({ path: in_.path }));
    getByPath.mockImplementation(async (path: string) => ({
      path, title: path, content: '', tags: [], wikilinks: [], source: 'system',
    }));

    const eerst = await zaaiEnLeesKluis();
    expect(writeNote).toHaveBeenCalledTimes(catalogus.length);
    expect(eerst.geschreven).toBe(catalogus.length);
    expect(eerst.fout).toBeNull();
    expect(eerst.notes.some((n) => n.path.startsWith('AXE/Workplaces/'))).toBe(true);

    writeNote.mockClear();
    getByPath.mockClear();
    listKluis.mockResolvedValue(catalogus.map((n) => ({ ...n, wikilinks: [], source: 'system' })));
    const tweede = await zaaiEnLeesKluis();
    expect(writeNote).not.toHaveBeenCalled();
    expect(tweede.geschreven).toBe(0);
    expect(tweede.notes.filter((n) => n.path.startsWith('AXE/Workplaces/')).length)
      .toBe(eerst.notes.filter((n) => n.path.startsWith('AXE/Workplaces/')).length);
  });

  it('onthoudt een mislukte write niet: volgende open probeert opnieuw, catalogus vult de grafiek niet', async () => {
    localStorage.setItem('axe_kluis_zaad_paden_v1', JSON.stringify(
      kluisZaadNotities().map((n) => n.path),
    ));
    writeNote.mockRejectedValue(new Error('proxy 502'));
    listKluis.mockResolvedValue(
      Array.from({ length: 20 }, (_, i) => ({
        path: `AXE/Reflections/memory-${i}.md`,
        title: 'MEMORY HEALTH CHECK',
        content: 'self-heal',
        tags: ['memory'],
        wikilinks: [],
        source: 'system',
      })),
    );

    const eerste = await zaaiEnLeesKluis();
    expect(eerste.fout).toMatch(/Vault seed failed/);
    expect(eerste.notes.some((n) => n.path.startsWith('AXE/Workplaces/'))).toBe(false);
    expect(localStorage.getItem('axe_kluis_zaad_paden_v1')).toBeNull();

    writeNote.mockClear();
    writeNote.mockResolvedValue({ path: 'x' });
    getByPath.mockImplementation(async (path: string) => (
      path.startsWith('AXE/Workplaces/') || path.startsWith('AXE/Agents/') || path.startsWith('AXE/Repos/')
        ? { path, title: path, content: '', tags: [], wikilinks: [], source: 'system' }
        : null
    ));
    const tweede = await zaaiEnLeesKluis();
    expect(writeNote).toHaveBeenCalled();
    expect(tweede.geschreven).toBeGreaterThan(0);
  });

  it('schrijft opnieuw als write terugkomt maar de rij niet in Supabase staat', async () => {
    listKluis.mockResolvedValue([]);
    writeNote.mockResolvedValue({ path: 'AXE/Workplaces/Home/context.md' });
    getByPath.mockResolvedValue(null);
    const uit = await zaaiEnLeesKluis();
    expect(uit.geschreven).toBe(0);
    expect(uit.fout).toMatch(/not confirmed|failed/i);
  });
});
