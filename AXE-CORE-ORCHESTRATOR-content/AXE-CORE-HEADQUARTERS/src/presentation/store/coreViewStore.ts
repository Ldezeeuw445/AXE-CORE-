/**
 * Welke wereld er op de plaat staat: Core, Neural, Terrain of Architecture.
 *
 * ## Waarom dit een store is en geen useState in Home
 *
 * De schakelaar stond in Home, dus hij bestond alleen op Home. Zodra je naar
 * een andere tab ging was hij weg, en kwam je terug dan stond hij weer op Core.
 * De knoppen horen bij de SCHIL, niet bij één pagina -- ze zijn de manier
 * waarop je van de ene wereld naar de andere gaat, en die moet altijd binnen
 * handbereik zijn.
 *
 * Zodra de knoppen in de schil staan kan Home ze niet meer bezitten: twee
 * plekken die dezelfde stand bijhouden lopen gegarandeerd uit elkaar. Vandaar
 * één bron.
 */
import { create } from 'zustand';

export type CoreView = 'axe' | 'neural' | 'terrain' | 'runtime';

interface CoreViewState {
  coreView: CoreView;
  setCoreView: (view: CoreView) => void;
  /** Awareness zit in dezelfde knoppenrij, dus zijn stand hoort hier ook --
   *  anders staat de knop in de schil en het paneel op de pagina, en weet
   *  niemand meer wie de baas is over "is het open". */
  showAwareness: boolean;
  setShowAwareness: (open: boolean) => void;
  /** Of de chatplaat ingeklapt is. Staat hier en niet in de chat zelf, omdat de
   *  beslissing van BUITEN komt: Terrain en Neural klappen hem dicht om ruimte
   *  te maken voor hun eigen weergave. */
  chatDicht: boolean;
  setChatDicht: (dicht: boolean) => void;
  /** Of de gebruiker de chat op de telefoon al eens zelf heeft geopend/omgezet.
   *  Op de Tauri-webview is de 'mobiele' breedte bij de eerste render nog niet
   *  bekend, dus kan een effect de begintoestand missen. Daarom leidt de chat
   *  zijn zichtbare stand af: op de telefoon dicht tótdat dit true is. Gedeeld
   *  hier zodat de cijferregel onder de sphere dezelfde stand ziet als de chat
   *  zelf. */
  chatUserSet: boolean;
  setChatUserSet: (v: boolean) => void;
}

export const useCoreViewStore = create<CoreViewState>(set => ({
  coreView: 'axe',
  setCoreView: view => set({ coreView: view }),
  showAwareness: false,
  setShowAwareness: open => set({ showAwareness: open }),
  chatDicht: false,
  setChatDicht: dicht => set({ chatDicht: dicht }),
  chatUserSet: false,
  setChatUserSet: v => set({ chatUserSet: v }),
}));

/**
 * De zichtbare stand van de chat, gedeeld door de chat zelf en de cijferregel.
 *
 * Op de telefoon start de home clean (chat dicht), zoals de Tauri-mockup; pas
 * als de gebruiker — of een approval/bestand — de chat expliciet opent, telt de
 * echte stand. Afgeleid i.p.v. via een effect, want de Tauri-webview meldt zijn
 * 'mobiele' breedte pas ná de eerste render, waardoor een effect die stand
 * miste. Op de desktop is het gewoon `chatDicht`.
 */
export function useChatCollapsed(isMobile: boolean): boolean {
  const chatDicht = useCoreViewStore(s => s.chatDicht);
  const chatUserSet = useCoreViewStore(s => s.chatUserSet);
  return (chatUserSet || !isMobile) ? chatDicht : true;
}
