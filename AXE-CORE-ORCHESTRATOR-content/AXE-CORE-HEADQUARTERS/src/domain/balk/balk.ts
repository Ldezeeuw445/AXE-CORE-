/**
 * balk.ts — pure beslissingen achter de AXE-notch (zwevend paneel bovenaan).
 *
 * Visueel: matzwart notch hangt vanaf de bovenrand (zie twin/ref-notch-reel.jpg),
 * met gloeiend AXE-avatar. Geen dunne taakbalk meer.
 *
 * Het venster maakt Rust aan (src-tauri/src/lib.rs, label `axe-balk`). Namen
 * hieronder staan daar ook; verandert er één, dan moet de andere mee.
 *
 * Onafhankelijkheid (macOS Mac Mini):
 * - Voorkeur: aparte lightweight Tauri-app `apps/axe-overlay` (eigen proces,
 *   LaunchAgent, werkt zonder HQ-hoofdvenster).
 * - Alternatief in deze HQ-binary: tray + notch met main verborgen
 *   (`AXE_NOTCH_ONLY=1` of main dichtdoen → proces blijft, notch blijft).
 */

export const BALK_LABEL = 'axe-balk';
export const BALK_SNELTOETS = 'Alt+Shift+Space';

/** Zichtbaarheids-/interactiestanden van de notch. */
export type NotchState = 'hidden' | 'collapsed' | 'hover' | 'expanded';

/**
 * Zes tabs in het sidepanel (bewuste keuze, backlog AXE-as-OS):
 * - home: HQ-shell openen
 * - chat: met AXE praten
 * - meldingen: meldingen + goedkeuringen
 * - agents: DAX / agents / workers
 * - northsea: NorthSea commodity/deals
 * - trading: trading-desk
 */
export type NotchTab =
  | 'home'
  | 'chat'
  | 'meldingen'
  | 'agents'
  | 'northsea'
  | 'trading';

export const NOTCH_TABS: readonly { id: NotchTab; label: string }[] = [
  { id: 'home', label: 'Home' },
  { id: 'chat', label: 'Chat' },
  { id: 'meldingen', label: 'Meldingen' },
  { id: 'agents', label: 'Agents' },
  { id: 'northsea', label: 'NorthSea' },
  { id: 'trading', label: 'Trading' },
] as const;

/** Logische venstergroottes (Rust past het echte venster hierop aan). */
export const NOTCH_AFMETINGEN = {
  collapsed: { w: 200, h: 44 },
  hover: { w: 260, h: 52 },
  expanded: { w: 720, h: 420 },
} as const;

export type NotchActie =
  | { soort: 'zet-stand'; stand: NotchState }
  | { soort: 'kies-tab'; tab: NotchTab }
  | { soort: 'open-hoofdvenster' };

/** Sneltoets: verborgen/in → uitgeklapt; uitgeklapt → ingeklapt (kleine notch). */
export function notchSneltoetsActie(stand: NotchState): NotchState {
  if (stand === 'expanded') return 'collapsed';
  return 'expanded';
}

/** Hover alleen op de kleine notch; expanded/hidden blijven zoals ze zijn. */
export function notchHoverActie(stand: NotchState, hovering: boolean): NotchState {
  if (stand === 'expanded' || stand === 'hidden') return stand;
  return hovering ? 'hover' : 'collapsed';
}

/**
 * Esc: expanded/hover → collapsed. Op collapsed nog eens Esc → hidden
 * (optioneel volledig weg; shortcut haalt hem terug).
 */
export function notchEscActie(stand: NotchState): NotchState | null {
  if (stand === 'expanded' || stand === 'hover') return 'collapsed';
  if (stand === 'collapsed') return 'hidden';
  return null;
}

/**
 * Tabklik. Home opent altijd de HQ-shell. Andere tabs houden de notch uitgeklapt
 * en wisselen de actieve tab; nog eens op dezelfde tab → inklappen.
 */
export function notchTabActie(
  tab: NotchTab,
  openTab: NotchTab | null,
  stand: NotchState,
): NotchActie {
  if (tab === 'home') return { soort: 'open-hoofdvenster' };
  if (stand === 'expanded' && openTab === tab) {
    return { soort: 'zet-stand', stand: 'collapsed' };
  }
  return { soort: 'kies-tab', tab };
}

/** Esc-toets → standwijziging of niets. */
export function notchToetsActie(toets: string, stand: NotchState): NotchActie | null {
  if (toets !== 'Escape') return null;
  const next = notchEscActie(stand);
  return next ? { soort: 'zet-stand', stand: next } : null;
}

/** Afmeting voor een zichtbare stand (hidden heeft geen size-update nodig). */
export function notchAfmeting(stand: Exclude<NotchState, 'hidden'>): { w: number; h: number } {
  return NOTCH_AFMETINGEN[stand];
}

/** Een vraag is pas te versturen als er echt tekst of een bestand is. */
export function kanVersturen(vraag: string, bestanden: readonly string[]): boolean {
  return vraag.trim().length > 0 || bestanden.length > 0;
}

/** @deprecated alias — oude balk-API; gebruik notchTabActie. */
export type BalkTab = NotchTab;
/** @deprecated */
export type BalkActie = NotchActie;
/** @deprecated */
export function balkTabActie(tab: BalkTab, openTab: BalkTab | null): BalkActie {
  return notchTabActie(tab, openTab, openTab ? 'expanded' : 'collapsed');
}
/** @deprecated */
export function balkToetsActie(toets: string): BalkActie | null {
  return notchToetsActie(toets, 'expanded');
}
