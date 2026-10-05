/**
 * De badge écht op het icoon zetten. De beslissing staat in domain/appBadge.ts.
 *
 * De API is `navigator.setAppBadge` / `clearAppBadge`. Beide geven een Promise
 * die kan afwijzen (geen toestemming, niet geïnstalleerd als PWA), en een
 * afwijzing die niemand vangt is in Safari een rode regel in de console bij elke
 * poging. Vandaar het afvangen hier, op één plek.
 */
import { badgeOpdracht } from '@/domain/appBadge';

interface BadgeNavigator {
  setAppBadge?: (aantal?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
}

function nav(): BadgeNavigator | null {
  if (typeof navigator === 'undefined') return null;
  return navigator as unknown as BadgeNavigator;
}

/** Kent deze browser de Badging API? Alleen hier nodig: de beslissing wat er
 *  dan moet gebeuren staat in domain/appBadge.ts. */
function badgeKan(): boolean {
  const n = nav();
  return typeof n?.setAppBadge === 'function' && typeof n?.clearAppBadge === 'function';
}

/** Zet of wis het cijfertje. Gooit nooit: een badge is nooit de hoofdzaak. */
export function pasBadgeToe(ongelezen: number): void {
  const n = nav();
  if (!n) return;
  const opdracht = badgeOpdracht(ongelezen, badgeKan());
  try {
    if (opdracht.soort === 'zet') void n.setAppBadge?.(opdracht.aantal)?.catch(() => {});
    else if (opdracht.soort === 'wis') void n.clearAppBadge?.()?.catch(() => {});
  } catch {
    // Een icoon zonder cijfer is geen reden om iets anders te laten mislukken.
  }
}
