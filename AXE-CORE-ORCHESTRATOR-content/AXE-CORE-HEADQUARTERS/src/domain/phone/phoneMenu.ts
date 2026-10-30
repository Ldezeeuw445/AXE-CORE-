/**
 * Het telefoonmenu: dezelfde zes primaire deuren als desktop (fase 1).
 * Diepere apps zitten onder Bouwen / Systeem.
 */
export interface PhoneMenuItem {
  path: string;
  label: string;
}

export const PHONE_MENU: readonly PhoneMenuItem[] = [
  { path: '/mobile', label: 'Home' },
  { path: '/managers', label: 'Managers' },
  { path: '/northsea', label: 'NorthSea' },
  { path: '/trading', label: 'Trading' },
  { path: '/bouwen', label: 'Bouwen' },
  { path: '/systeem', label: 'Systeem' },
];

export function phoneMenuActief(pathname: string, path: string): boolean {
  if (path === '/mobile') return pathname === '/mobile' || pathname === '/';
  if (path === '/northsea') return pathname === '/northsea' || pathname === '/maps-3d';
  if (path === '/managers') return pathname === '/managers' || pathname === '/agents' || pathname === '/ai-core';
  if (path === '/bouwen') {
    return ['/bouwen', '/browser', '/code-editor', '/terminals', '/computer-use', '/apps', '/control-plane', '/developer'].some(
      (p) => pathname === p || pathname.startsWith(`${p}/`),
    );
  }
  if (path === '/systeem') {
    return ['/systeem', '/settings', '/device', '/memory', '/tasks', '/infrastructure', '/cron-manager'].some(
      (p) => pathname === p || pathname.startsWith(`${p}/`),
    );
  }
  return pathname === path || pathname.startsWith(`${path}/`);
}

/** App-balk met hamburger + titel op élke tab behalve Home en lock. */
export function phoneHeeftAppBar(path: string): boolean {
  if (path === '/mobile' || path === '/' || path === '/lock' || path === '/lock/pin') return false;
  return true;
}

export function phoneAppBarTitel(path: string): { title: string; extra?: string } {
  const hit = PHONE_MENU.find((i) => phoneMenuActief(path, i.path));
  if (path === '/trading' || path.startsWith('/trading')) return { title: 'Trading', extra: 'Demo only' };
  if (path === '/northsea' || path === '/maps-3d') return { title: 'NorthSea', extra: 'Never send' };
  if (path === '/bouwen' || path === '/code-editor') return { title: hit?.label ?? 'Bouwen' };
  if (hit) return { title: hit.label };
  const stuk = path.split('/').filter(Boolean)[0] ?? 'AXE';
  return { title: stuk.replace(/-/g, ' ') };
}
