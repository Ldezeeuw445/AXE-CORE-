/**
 * Gedeelde telefoon-schil voor de A17 (PWA + Android WebView).
 *
 * Vijf tabs onderin: vier pins + More. Default: Home, Trading, AXE, Memory, More.
 * Home op de telefoon is `/mobile`. More opent `/apps`.
 */
import { menuTarget } from '@/domain/mobileMenu';
import {
  DEFAULT_PHONE_PINS, MORE_PIN, balkTabs, type PhonePin,
} from '@/domain/phone/phonePins';

export type PhoneTab = PhonePin;
export type PhoneTabId = string;

export const PHONE_TABS: readonly PhoneTab[] = balkTabs([...DEFAULT_PHONE_PINS]);

/** Tikdoel op de A17: minstens 44 CSS-pixels. */
export const PHONE_TIKMAAT = 44;

export function phoneTabDoel(path: string): string {
  if (path === MORE_PIN.path || path === '') return '/apps';
  return menuTarget(path);
}

export function phoneTabActief(pathname: string, tab: PhoneTab, pins: readonly PhoneTab[] = PHONE_TABS): boolean {
  if (tab.id === 'more' || tab.path === MORE_PIN.path) {
    const paden = pins.filter((p) => p.id !== 'more').map((p) => p.path);
    return pathname === '/apps' || !paden.some((p) => pathname === p || (p !== '/mobile' && pathname.startsWith(`${p}/`)));
  }
  if (tab.id === 'home') return pathname === '/' || pathname === '/mobile';
  return pathname === tab.path || pathname.startsWith(`${tab.path}/`);
}

/** Glance-lock én cijfer-PIN: geen composer, onderbalk, bel of Home-bol. */
export function isLockPad(path: string): boolean {
  return path === '/lock' || path === '/lock/pin';
}

export { phoneZonderComposer } from '@/domain/phone/phonePins';
