/**
 * Wat de chatkop boven de composer toont zolang je op de Code Editor bent.
 *
 * Op Home staat daar wie er praat. Op de code-tab gaat de composer naar de
 * code-agent, dus hoort daar te staan: CODE AGENT, met welke motor, in welke
 * repo, en wat hij nu doet. De editor zet dit; PlaatChat leest het. De editor
 * haalt het bij het verlaten weer weg.
 */
import { create } from 'zustand';
import type { Snelactie } from '@/domain/snelacties';

export interface CodeAgentKop {
  motor: string;
  repo: string;
  branch?: string;
  /** Wat de agent nu doet, of leeg. */
  spoor?: string;
  snelacties: Snelactie[];
}

interface State {
  kop: CodeAgentKop | null;
  zet: (kop: CodeAgentKop | null) => void;
}

export const useCodeAgentKop = create<State>(set => ({
  kop: null,
  zet: kop => set({ kop }),
}));
