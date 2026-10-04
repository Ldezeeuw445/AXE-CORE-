import { beforeEach, describe, expect, it, vi } from 'vitest';

const listRecent = vi.fn();
const writeNote = vi.fn();

vi.mock('@/infrastructure/persistence/obsidianMemoryService', () => ({
  listRecentObsidianNotes: (...args: unknown[]) => listRecent(...args),
  writeObsidianNote: (...args: unknown[]) => writeNote(...args),
}));

import { kluisZaadNotities } from '@/domain/obsidian/kluisZaadCatalogus';
import { zaaiEnLeesKluis } from './kluisZaad';

describe('zaaiEnLeesKluis', () => {
  beforeEach(() => {
    listRecent.mockReset();
    writeNote.mockReset();
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v); },
      removeItem: (k: string) => { store.delete(k); },
      clear: () => store.clear(),
    });
  });

  it('zaait het rooster één keer als workplaces leeg zijn, en niet opnieuw', async () => {
    const catalogus = kluisZaadNotities();
    listRecent.mockResolvedValue([]);
    writeNote.mockResolvedValue({ path: 'x' });

    const eerst = await zaaiEnLeesKluis();
    expect(writeNote).toHaveBeenCalledTimes(catalogus.length);
    expect(eerst.filter((n) => n.path.startsWith('AXE/Workplaces/')).length).toBeGreaterThan(0);
    expect(eerst.filter((n) => n.tags?.includes('agent')).length).toBeGreaterThan(0);
    expect(eerst.filter((n) => n.path.startsWith('AXE/Repos/')).length).toBeGreaterThan(0);

    writeNote.mockClear();
    listRecent.mockResolvedValue(catalogus.map((n) => ({ ...n, wikilinks: [], source: 'system' })));
    const tweede = await zaaiEnLeesKluis();
    expect(writeNote).not.toHaveBeenCalled();
    expect(tweede.filter((n) => n.path.startsWith('AXE/Workplaces/')).length)
      .toBe(eerst.filter((n) => n.path.startsWith('AXE/Workplaces/')).length);
  });

  it('houdt de catalogus zichtbaar als schrijven faalt of memory-notes de lijst vullen', async () => {
    writeNote.mockRejectedValue(new Error('proxy 502'));
    listRecent.mockResolvedValue(
      Array.from({ length: 20 }, (_, i) => ({
        path: `AXE/Reflections/memory-${i}.md`,
        title: 'MEMORY HEALTH CHECK',
        content: 'self-heal',
        tags: ['memory'],
        wikilinks: [],
        source: 'system',
      })),
    );
    const notes = await zaaiEnLeesKluis();
    expect(notes.some((n) => n.path.startsWith('AXE/Workplaces/'))).toBe(true);
    expect(notes.some((n) => n.path.startsWith('AXE/Agents/'))).toBe(true);
    expect(notes.some((n) => n.path.startsWith('AXE/Repos/'))).toBe(true);
  });
});
