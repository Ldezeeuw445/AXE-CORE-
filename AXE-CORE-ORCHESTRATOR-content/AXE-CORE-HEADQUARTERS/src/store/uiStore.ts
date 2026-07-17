import { create } from 'zustand';

interface UIState {
  sidebarExpanded: boolean;
  rightPanelOpen: boolean;
  bottomBarVisible: boolean;
  activeModule: string;
  commandPaletteOpen: boolean;
  mobileNavOpen: boolean;
  voiceState: 'idle' | 'listening' | 'processing' | 'speaking';

  toggleSidebar: () => void;
  toggleRightPanel: () => void;
  setRightPanelOpen: (open: boolean) => void;
  toggleBottomBar: () => void;
  setActiveModule: (module: string) => void;
  setCommandPaletteOpen: (open: boolean) => void;
  toggleMobileNav: () => void;
  setMobileNavOpen: (open: boolean) => void;
  leftDrawerOpen: boolean;
  rightDrawerOpen: boolean;
  setLeftDrawerOpen: (open: boolean) => void;
  setRightDrawerOpen: (open: boolean) => void;
  setVoiceState: (state: 'idle' | 'listening' | 'processing' | 'speaking') => void;
}

export const useUIStore = create<UIState>((set) => ({
  sidebarExpanded: false,
  rightPanelOpen: true,
  bottomBarVisible: true,
  activeModule: 'home',
  commandPaletteOpen: false,
  mobileNavOpen: false,
  leftDrawerOpen: false,
  rightDrawerOpen: false,
  voiceState: 'idle',

  toggleSidebar: () => set((s) => ({ sidebarExpanded: !s.sidebarExpanded })),
  toggleRightPanel: () => set((s) => ({ rightPanelOpen: !s.rightPanelOpen })),
  setRightPanelOpen: (open) => set({ rightPanelOpen: open }),
  toggleBottomBar: () => set((s) => ({ bottomBarVisible: !s.bottomBarVisible })),
  setActiveModule: (module) => set({ activeModule: module }),
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
  toggleMobileNav: () => set((s) => ({ mobileNavOpen: !s.mobileNavOpen })),
  setMobileNavOpen: (open) => set({ mobileNavOpen: open }),
  setLeftDrawerOpen: (open) => set({ leftDrawerOpen: open }),
  setRightDrawerOpen: (open) => set({ rightDrawerOpen: open }),
  setVoiceState: (state) => set({ voiceState: state }),
}));
