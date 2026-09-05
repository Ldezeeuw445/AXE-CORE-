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
}

export const useCoreViewStore = create<CoreViewState>(set => ({
  coreView: 'axe',
  setCoreView: view => set({ coreView: view }),
  showAwareness: false,
  setShowAwareness: open => set({ showAwareness: open }),
  chatDicht: false,
  setChatDicht: dicht => set({ chatDicht: dicht }),
}));
