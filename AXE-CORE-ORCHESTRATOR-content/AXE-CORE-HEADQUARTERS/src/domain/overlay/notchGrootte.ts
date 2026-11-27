/**
 * Hoe groot de notch openvouwt (Luka, 27 nov).
 *
 * "niet altijd zo groot als hij uitvouwt maar net als op deze foto's ... en
 * daarnaast moet hij wel ook zo groot kunnen, maar alleen als je het wilt."
 *
 * Twee standen. `compact` is de standaard: een smalle kaart onder de strook
 * met alleen wat er nu speelt. `groot` is het oude paneel (chat, widgets,
 * home met alles). Groot gaat alleen open als Luka erom vraagt: de knop
 * rechtsboven of ⌘E. Die keuze wordt onthouden, per Mac.
 *
 * Esc gaat één stap terug: groot → compact → dicht.
 *
 * Chat, goedkeuringen, Claude, instellingen en push-to-talk openen altijd
 * groot (daar past compact niet), maar veranderen de onthouden keuze niet:
 * Home en widgets gaan daarna weer open zoals Luka het laatst koos.
 *
 * Geen DOM, geen React: puur, zodat elk geval te toetsen is.
 */

export type NotchGrootte = 'compact' | 'groot';

/** localStorage-sleutel voor de onthouden keuze. */
export const GROOTTE_SLEUTEL = 'axe_notch_grootte';

export const STANDAARD_GROOTTE: NotchGrootte = 'compact';

type Opslag = { getItem(k: string): string | null; setItem(k: string, v: string): void };

function isGrootte(v: unknown): v is NotchGrootte {
  return v === 'compact' || v === 'groot';
}

export function leesGrootte(opslag: Opslag | null | undefined): NotchGrootte {
  try {
    const v = opslag?.getItem(GROOTTE_SLEUTEL);
    return isGrootte(v) ? v : STANDAARD_GROOTTE;
  } catch {
    return STANDAARD_GROOTTE;
  }
}

export function bewaarGrootte(opslag: Opslag | null | undefined, g: NotchGrootte): void {
  try {
    opslag?.setItem(GROOTTE_SLEUTEL, g);
  } catch {
    /* private modus: dan alleen niet onthouden */
  }
}

export function wisselGrootte(g: NotchGrootte): NotchGrootte {
  return g === 'compact' ? 'groot' : 'compact';
}

/** Tabs die compact iets te tonen hebben. De rest opent altijd groot. */
export type NotchTab = 'chat' | 'approvals' | 'settings' | 'claude' | 'home' | 'widgets';
export function heeftCompact(tab: NotchTab): boolean {
  return tab === 'home' || tab === 'widgets';
}

/** De stand die je ziet: de onthouden keuze, behalve waar compact niet past. */
export function zichtbareGrootte(tab: NotchTab, onthouden: NotchGrootte): NotchGrootte {
  return heeftCompact(tab) ? onthouden : 'groot';
}

export type ToetsActie = 'wissel' | 'stap-terug' | null;

/** ⌘E / Ctrl+E wisselt, Esc stapt terug. Alles anders is niet van ons. */
export function toetsActie(e: { key: string; metaKey?: boolean; ctrlKey?: boolean; altKey?: boolean }): ToetsActie {
  if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 'e') return 'wissel';
  if (e.key === 'Escape') return 'stap-terug';
  return null;
}

/**
 * Esc: groot → compact → dicht. Op een tab zonder compacte vorm (chat e.d.)
 * gaat Esc naar compact Home, niet meteen dicht: dan zie je nog wat er speelt.
 */
export function stapTerug(s: { open: boolean; zichtbaar: NotchGrootte }): { open: boolean; naarCompactHome: boolean } {
  if (!s.open) return { open: false, naarCompactHome: false };
  if (s.zichtbaar === 'groot') return { open: true, naarCompactHome: true };
  return { open: false, naarCompactHome: false };
}

/** overlay.cmd (Hammerspoon / axe-keys) kan een stand expliciet kiezen. */
export function grootteUitCmd(cmd: string, onthouden: NotchGrootte): NotchGrootte | null {
  if (cmd === 'expand-large') return 'groot';
  if (cmd === 'expand-compact') return 'compact';
  if (cmd === 'toggle-size') return wisselGrootte(onthouden);
  return null;
}
