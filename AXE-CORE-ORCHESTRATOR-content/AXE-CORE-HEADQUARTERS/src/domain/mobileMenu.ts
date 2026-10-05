/**
 * The phone's command menu: how the tabs are grouped, searched and pinned.
 *
 * The old drawer was one flat list of 30 routes, alphabetical by accident, with a
 * wallpaper button at the bottom. A command centre is used a hundred times a day, so
 * the things used most must be one tap away and everything else findable: pinned
 * favourites on top (in the order you set), the rest in groups by what they are for,
 * and a search box that matches the words the nav registry already knows for each tab
 * ("cron", "agenda", "shell", ...).
 *
 * Pure on purpose: grouping and ordering are rules, and rules that live in a React
 * component get re-implemented wrongly in the next one.
 */

export interface MenuItem {
  path: string;
  label: string;
  keywords?: string[];
}

export interface MenuGroup {
  id: string;
  title: string;
  /** Paths, in the order they are shown. Anything not named lands in "More". */
  paths: string[];
}

export const MENU_GROUPS: readonly MenuGroup[] = [
  { id: 'command', title: 'Command', paths: ['/', '/tasks', '/calendar', '/cron-manager', '/ledger', '/agents', '/crewai'] },
  { id: 'intel', title: 'Intelligence', paths: ['/ai-core', '/memory', '/memory/trading', '/obsidian', '/knowledge', '/thinkthanks', '/eve'] },
  { id: 'money', title: 'Trading & deals', paths: ['/trading-intel', '/maps-3d', '/finance', '/trading'] },
  { id: 'systems', title: 'Systems', paths: ['/mcp', '/infrastructure', '/control-plane', '/table-editor', '/terminals', '/terminal', '/computer-use', '/developer'] },
  { id: 'build', title: 'Build', paths: ['/code-editor', '/browser', '/organization'] },
  { id: 'phone', title: 'Phone', paths: ['/device', '/lock', '/settings'] },
] as const;

/** Where "Home" goes: `/` is empty on a phone, the real home is `/mobile`. */
export function menuTarget(path: string): string {
  return path === '/' ? '/mobile' : path;
}

export interface GroupedMenu {
  favourites: MenuItem[];
  groups: Array<{ id: string; title: string; items: MenuItem[] }>;
}

/**
 * Items -> favourites + groups.
 *
 * A path that is in the registry but in no group (a tab added later, a dynamic
 * THINKTHANKS entry) is shown under "More" rather than silently missing: a menu that
 * loses a tab is worse than one that files it awkwardly. A favourite also stays in its
 * group; pinning is a shortcut, not a move.
 */
export function groupMenu(items: MenuItem[], favourites: string[]): GroupedMenu {
  const byPath = new Map(items.map(i => [i.path, i] as const));
  const fav = favourites.filter((p, i) => byPath.has(p) && favourites.indexOf(p) === i).map(p => byPath.get(p)!);

  const used = new Set<string>();
  const groups = MENU_GROUPS.map(g => {
    const its = g.paths.filter(p => byPath.has(p)).map(p => { used.add(p); return byPath.get(p)!; });
    return { id: g.id, title: g.title, items: its };
  }).filter(g => g.items.length > 0);

  const rest = items.filter(i => !used.has(i.path));
  if (rest.length) groups.push({ id: 'more', title: 'More', items: rest });

  return { favourites: fav, groups };
}

/**
 * Search over label, path and keywords. Every word typed must match something
 * ("trading mem" finds Trading Memory); order of the registry is kept so results do
 * not jump around while typing.
 */
export function searchMenu(items: MenuItem[], query: string): MenuItem[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return items;
  return items.filter(i => {
    const hay = [i.label, i.path, ...(i.keywords ?? [])].join(' ').toLowerCase();
    return words.every(w => hay.includes(w));
  });
}

// ── favourites ──────────────────────────────────────────────────────────────

export const DEFAULT_FAVOURITES: readonly string[] = ['/tasks', '/calendar', '/agents', '/settings'];

export function toggleFavourite(favs: string[], path: string): string[] {
  return favs.includes(path) ? favs.filter(p => p !== path) : [...favs, path];
}

/** Move one favourite by `delta` places; clamps at both ends, ignores unknown paths. */
export function moveFavourite(favs: string[], path: string, delta: number): string[] {
  const from = favs.indexOf(path);
  if (from < 0) return favs;
  const to = Math.min(favs.length - 1, Math.max(0, from + delta));
  if (to === from) return favs;
  const next = favs.slice();
  next.splice(from, 1);
  next.splice(to, 0, path);
  return next;
}

/** Stored JSON -> list of strings. Anything else is "never set", which gets the defaults. */
export function parseFavourites(raw: string | null | undefined): string[] {
  if (raw == null) return [...DEFAULT_FAVOURITES];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [...DEFAULT_FAVOURITES];
  } catch {
    return [...DEFAULT_FAVOURITES];
  }
}
