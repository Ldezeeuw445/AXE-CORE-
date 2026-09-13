/**
 * Wat een pagina in de globale radiaal-dok mag hangen.
 *
 * ## Waarom een store en geen prop
 *
 * De dok hangt in de schil (AppShell) en staat op elke tab. De knop in het gat
 * is soms van de PAGINA -- op de trading-desk is dat de kill switch, die
 * posities sluit en dus niet thuishoort op een pagina waar je niets met
 * posities doet.
 *
 * Een prop kan niet: de schil rendert de dok, niet de pagina. Een store wel:
 * de pagina meldt zijn knop aan zolang hij open staat, en meldt hem af als je
 * wegklikt. Zonder dat afmelden zou de kill switch op elke tab blijven staan
 * nadat je één keer op trading bent geweest -- precies het soort ding dat je
 * pas merkt als je erop drukt.
 */
import { create } from 'zustand';
import type { ReactNode } from 'react';

export interface DokHoek {
  /** Wat er in het gat staat. */
  teken: ReactNode;
  label: string;
  doe: () => void;
}

interface DokState {
  /** De hoekknop van de RECHTER dok, of null voor de standaard. */
  rechtsHoek: DokHoek | null;
  zetRechtsHoek: (h: DokHoek | null) => void;
}

export const useDokStore = create<DokState>(set => ({
  rechtsHoek: null,
  zetRechtsHoek: h => set({ rechtsHoek: h }),
}));
