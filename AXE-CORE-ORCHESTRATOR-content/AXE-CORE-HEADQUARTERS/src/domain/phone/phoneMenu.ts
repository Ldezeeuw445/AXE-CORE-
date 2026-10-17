/**
 * Het telefoonmenu: negen apps, één naam, geen desktop-favorieten.
 * De hamburger is de enige navigatie op de A17.
 */
export interface PhoneMenuItem {
  path: string;
  label: string;
}

export const PHONE_MENU: readonly PhoneMenuItem[] = [
  { path: '/mobile', label: 'Home' },
  { path: '/trading', label: 'Trading' },
  { path: '/maps-3d', label: 'NorthSea Desk' },
  { path: '/browser', label: 'Browser' },
  { path: '/companion', label: 'AXE Companion' },
  { path: '/memory', label: 'AXON Memory' },
  { path: '/code-editor', label: 'AXE Developer' },
  { path: '/tasks', label: 'Tasks' },
  { path: '/infrastructure', label: 'Systems' },
];

export function phoneMenuActief(pathname: string, path: string): boolean {
  if (path === '/mobile') return pathname === '/mobile' || pathname === '/';
  if (path === '/memory') return pathname === '/memory' || pathname.startsWith('/memory/');
  return pathname === path || pathname.startsWith(`${path}/`);
}

/** App-balk met hamburger + titel op élke tab behalve Home en lock. */
export function phoneHeeftAppBar(path: string): boolean {
  if (path === '/mobile' || path === '/' || path === '/lock' || path === '/lock/pin') return false;
  return true;
}

export function phoneAppBarTitel(path: string): { title: string; extra?: string } {
  const hit = PHONE_MENU.find((i) => phoneMenuActief(path, i.path));
  if (path === '/trading') return { title: 'Trading', extra: 'Read-only' };
  if (path === '/maps-3d') return { title: 'NorthSea', extra: 'Never send' };
  if (path === '/browser') return { title: 'Browser' };
  if (path === '/code-editor') return { title: 'AXE Developer' };
  if (path === '/notifications') return { title: 'Alerts' };
  if (path === '/apps') return { title: 'Apps' };
  if (hit) return { title: hit.label };
  const stuk = path.split('/').filter(Boolean)[0] ?? 'AXE';
  return { title: stuk.replace(/-/g, ' ') };
}
