/**
 * axeAlgoWidgetStore — just UI state for the always-on AXE ALGO surfaces
 * (RightPanel widget + the floating chat window). Chat history/sending
 * logic lives in useAxeAlgoChat / tradingAgentChat.ts — this store only
 * tracks whether the floating window is open, so it survives navigation
 * the same way voiceStore does.
 */
import { create } from 'zustand';

interface AxeAlgoWidgetState {
  floatingOpen: boolean;
  openFloating: () => void;
  closeFloating: () => void;
  toggleFloating: () => void;
}

export const useAxeAlgoWidgetStore = create<AxeAlgoWidgetState>((set) => ({
  floatingOpen: false,
  openFloating: () => set({ floatingOpen: true }),
  closeFloating: () => set({ floatingOpen: false }),
  toggleFloating: () => set(s => ({ floatingOpen: !s.floatingOpen })),
}));
