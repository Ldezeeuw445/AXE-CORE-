/**
 * Live Managers-desk → AppShell / PlaatChat.
 *
 * ManagersDesk zet dit zolang een manager (of Boss) open is. AppShell verbergt
 * de globale AXE Core-composer; PlaatChat, als hij toch nog hangt, stuurt
 * via `stuur` zodat het bericht niet bij wingman belandt.
 */
import { create } from 'zustand';
import type { AxeAgentId } from '@/domain/agents/roster';

export type ManagersDeskStuur = (tekst: string) => void;

interface ManagersDeskState {
  deskActief: boolean;
  gekozenId: AxeAgentId | null;
  stuur: ManagersDeskStuur | null;
  zet: (over: {
    deskActief: boolean;
    gekozenId: AxeAgentId | null;
    stuur: ManagersDeskStuur | null;
  }) => void;
}

export const useManagersDeskStore = create<ManagersDeskState>((set) => ({
  deskActief: false,
  gekozenId: null,
  stuur: null,
  zet: (over) => set(over),
}));
