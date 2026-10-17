/**
 * Gedeelde telefoon-schil voor de A17 (PWA + Android WebView).
 *
 * Vijf tabs onderin, dezelfde overal: Home, Desk, Agents, Trading, More.
 * Home op de telefoon is `/mobile`; Desk is Northsea Desk.
 */
import { menuTarget } from '@/domain/mobileMenu';

type PhoneTabId = 'home' | 'desk' | 'agents' | 'trading' | 'more';

interface PhoneTab {
  id: PhoneTabId;
  label: string;
  /** null = opent het menu, geen route. */
  path: string | null;
}

export const PHONE_TABS: readonly PhoneTab[] = [
  { id: 'home', label: 'Home', path: '/' },
  { id: 'desk', label: 'Desk', path: '/maps-3d' },
  { id: 'agents', label: 'Agents', path: '/agents' },
  { id: 'trading', label: 'Trading', path: '/trading' },
  { id: 'more', label: 'More', path: null },
];

/** Tikdoel op de A17: minstens 44 CSS-pixels. */
export const PHONE_TIKMAAT = 44;

export function phoneTabDoel(path: string): string {
  return menuTarget(path);
}

export function phoneTabActief(pathname: string, tab: PhoneTab): boolean {
  if (tab.id === 'more' || tab.path == null) return false;
  if (tab.id === 'home') return pathname === '/' || pathname === '/mobile';
  return pathname === tab.path || pathname.startsWith(`${tab.path}/`);
}

/** Glance-lock én cijfer-PIN: geen composer, onderbalk, bel of Home-bol. */
export function isLockPad(path: string): boolean {
  return path === '/lock' || path === '/lock/pin';
}
