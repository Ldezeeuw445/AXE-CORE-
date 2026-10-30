/**
 * balk.ts — de pure beslissingen achter de AXE-balk (zwevende balk bovenaan).
 *
 * Het venster zelf maakt Rust aan (src-tauri/src/lib.rs, `axe-balk`). De namen
 * hieronder staan daar ook; verandert er één, dan moet de andere mee.
 */

export const BALK_LABEL = 'axe-balk';
export const BALK_SNELTOETS = 'Alt+Shift+Space';

export type BalkTab = 'home' | 'chat' | 'plus';

export type BalkActie =
  | { soort: 'open-hoofdvenster' }
  | { soort: 'uitklappen'; tab: Exclude<BalkTab, 'home'> }
  | { soort: 'inklappen' };

/**
 * Wat een klik op een tab doet. Home opent de volledige app; chat en plus
 * klappen de balk uit. Nog een keer op de open tab klikken klapt hem weer in.
 */
export function balkTabActie(tab: BalkTab, openTab: BalkTab | null): BalkActie {
  if (tab === 'home') return { soort: 'open-hoofdvenster' };
  if (openTab === tab) return { soort: 'inklappen' };
  return { soort: 'uitklappen', tab };
}

/** Esc klapt altijd in; andere toetsen doen in de balk niets bijzonders. */
export function balkToetsActie(toets: string): BalkActie | null {
  return toets === 'Escape' ? { soort: 'inklappen' } : null;
}

/** Een vraag is pas te versturen als er echt tekst of een bestand is. */
export function kanVersturen(vraag: string, bestanden: readonly string[]): boolean {
  return vraag.trim().length > 0 || bestanden.length > 0;
}
