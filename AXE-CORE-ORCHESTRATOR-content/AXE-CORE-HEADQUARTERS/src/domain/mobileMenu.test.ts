import { describe, it, expect } from 'vitest';
import {
  groupMenu, searchMenu, toggleFavourite, moveFavourite, parseFavourites, menuTarget,
  DEFAULT_FAVOURITES, MENU_GROUPS, type MenuItem,
} from './mobileMenu';
import { NAV_ITEMS } from './navRegistry';

const item = (path: string, label = path, keywords: string[] = []): MenuItem => ({ path, label, keywords });

describe('groupMenu', () => {
  it('puts known tabs in their group, in the group order', () => {
    const g = groupMenu([item('/calendar'), item('/tasks')], []);
    expect(g.groups).toHaveLength(1);
    expect(g.groups[0].id).toBe('command');
    expect(g.groups[0].items.map(i => i.path)).toEqual(['/tasks', '/calendar']);
  });

  it('files an unknown tab under More instead of losing it', () => {
    const g = groupMenu([item('/tasks'), item('/brand-new')], []);
    expect(g.groups.map(x => x.id)).toEqual(['command', 'more']);
    expect(g.groups[1].items[0].path).toBe('/brand-new');
  });

  it('omits empty groups', () => {
    const g = groupMenu([item('/settings')], []);
    expect(g.groups.map(x => x.id)).toEqual(['phone']);
  });

  it('favourites keep their own order and stay in their group too', () => {
    const g = groupMenu([item('/tasks'), item('/calendar')], ['/calendar', '/tasks']);
    expect(g.favourites.map(i => i.path)).toEqual(['/calendar', '/tasks']);
    expect(g.groups[0].items.map(i => i.path)).toEqual(['/tasks', '/calendar']);
  });

  it('a favourite that no longer exists is dropped, and duplicates collapse', () => {
    const g = groupMenu([item('/tasks')], ['/gone', '/tasks', '/tasks']);
    expect(g.favourites.map(i => i.path)).toEqual(['/tasks']);
  });

  it('every real registry tab ends up somewhere visible', () => {
    const g = groupMenu(NAV_ITEMS, []);
    const shown = new Set(g.groups.flatMap(x => x.items.map(i => i.path)));
    for (const n of NAV_ITEMS) expect(shown.has(n.path)).toBe(true);
  });

  it('no path is listed in two groups', () => {
    const all = MENU_GROUPS.flatMap(g => g.paths);
    expect(new Set(all).size).toBe(all.length);
  });
});

describe('searchMenu', () => {
  const items = [
    item('/cron-manager', 'Cron Manager', ['cron', 'scheduler']),
    item('/memory/trading', 'Trading Memory', ['lessons']),
    item('/tasks', 'Tasks', ['todo']),
  ];
  it('returns everything for an empty query', () => {
    expect(searchMenu(items, '  ')).toHaveLength(3);
  });
  it('matches keywords the label does not contain', () => {
    expect(searchMenu(items, 'scheduler').map(i => i.path)).toEqual(['/cron-manager']);
  });
  it('needs every word to match', () => {
    expect(searchMenu(items, 'trading mem').map(i => i.path)).toEqual(['/memory/trading']);
    expect(searchMenu(items, 'trading cron')).toEqual([]);
  });
  it('ignores case', () => {
    expect(searchMenu(items, 'TASKS')).toHaveLength(1);
  });
});

describe('favourites', () => {
  it('toggle adds at the end and removes', () => {
    expect(toggleFavourite(['/a'], '/b')).toEqual(['/a', '/b']);
    expect(toggleFavourite(['/a', '/b'], '/a')).toEqual(['/b']);
  });
  it('move clamps and ignores unknown', () => {
    expect(moveFavourite(['/a', '/b', '/c'], '/c', -1)).toEqual(['/a', '/c', '/b']);
    expect(moveFavourite(['/a', '/b', '/c'], '/a', -5)).toEqual(['/a', '/b', '/c']);
    expect(moveFavourite(['/a', '/b', '/c'], '/a', 9)).toEqual(['/b', '/c', '/a']);
    expect(moveFavourite(['/a'], '/zzz', 1)).toEqual(['/a']);
  });
  it('never-set gets the defaults, an explicitly empty list stays empty', () => {
    expect(parseFavourites(null)).toEqual([...DEFAULT_FAVOURITES]);
    expect(parseFavourites('[]')).toEqual([]);
  });
  it('garbage gets the defaults, not a crash', () => {
    expect(parseFavourites('{nope')).toEqual([...DEFAULT_FAVOURITES]);
    expect(parseFavourites('{"a":1}')).toEqual([...DEFAULT_FAVOURITES]);
  });
  it('non-strings are filtered out', () => {
    expect(parseFavourites('["/a", 5, null, "/b"]')).toEqual(['/a', '/b']);
  });
});

describe('menuTarget', () => {
  it('sends Home to the phone home, everything else untouched', () => {
    expect(menuTarget('/')).toBe('/mobile');
    expect(menuTarget('/tasks')).toBe('/tasks');
  });
});
