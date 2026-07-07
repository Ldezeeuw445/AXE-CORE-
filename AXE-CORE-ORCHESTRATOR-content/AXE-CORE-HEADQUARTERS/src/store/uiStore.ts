import { create } from 'zustand';

interface UIState {
  sidebarExpanded: boolean;
  rightPanelOpen: boolean;
  bottomBarVisible: boolean;
  activeModule: string;
  commandPaletteOpen: boolean;
  voiceState: 'idle' | 'listening' | 'processing' | 'speaking';

  toggleSidebar: () => void;
  toggleRightPanel: () => void;
  setRightPanelOpen: (open: boolean) => void;
  toggleBottomBar: () => void;
  setActiveModule: (module: string) => void;
  setCommandPaletteOpen: (open: boolean) => void;
  setVoiceState: (state: 'idle' | 'listening' | 'processing' | 'speaking') => void;
}

export const useUIStore = create<UIState>((set) => ({
  sidebarExpanded: false,
  rightPanelOpen: true,
  bottomBarVisible: true,
  activeModule: 'home',
  commandPaletteOpen: false,
  voiceState: 'idle',

  toggleSidebar: () => set((s) => ({ sidebarExpanded: !s.sidebarExpanded })),
  toggleRightPanel: () => set((s) => ({ rightPanelOpen: !s.rightPanelOpen })),
  setRightPanelOpen: (open) => set({ rightPanelOpen: open }),
  toggleBottomBar: () => set((s) => ({ bottomBarVisible: !s.bottomBarVisible })),
  setActiveModule: (module) => set({ activeModule: module }),
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
  setVoiceState: (state) => set({ voiceState: state }),
}));
