import { describe, expect, it } from 'vitest';
import { AXE_AGENTS } from '@/domain/agents/roster';
import { NAV_ITEMS } from '@/domain/navRegistry';
import { REPO_WERKPLEKKEN } from '@/domain/obsidian/werkplek';
import { kluisZaadNotities, ontbrekendeZaadNotities } from './kluisZaadCatalogus';

describe('kluiszaad uit het echte rooster', () => {
  it('zaait workplaces, agents en repos één keer, niet twee keer', () => {
    const eerste = kluisZaadNotities();
    expect(eerste.filter((n) => n.path.startsWith('AXE/Workplaces/'))).toHaveLength(NAV_ITEMS.length);
    expect(eerste.filter((n) => n.tags.includes('agent'))).toHaveLength(AXE_AGENTS.length);
    expect(eerste.filter((n) => n.path.startsWith('AXE/Repos/'))).toHaveLength(REPO_WERKPLEKKEN.length);
    expect(eerste.some((n) => n.path.includes('Northsea Desk'))).toBe(true);
    expect(eerste.some((n) => n.title.includes('AXE Core'))).toBe(true);
    expect(eerste.some((n) => n.path.includes('AXE CORE'))).toBe(true);
    expect(eerste.every((n) => !/fake|placeholder|dummy/i.test(n.title))).toBe(true);

    const tweede = ontbrekendeZaadNotities(eerste.map((n) => n.path));
    expect(tweede).toEqual([]);
  });

  it('zaait alleen wat ontbreekt als de kluis al een deel heeft', () => {
    const alle = kluisZaadNotities();
    const helft = alle.slice(0, 3).map((n) => n.path);
    const rest = ontbrekendeZaadNotities(helft);
    expect(rest).toHaveLength(alle.length - 3);
    expect(rest.every((n) => !helft.includes(n.path))).toBe(true);
  });
});
