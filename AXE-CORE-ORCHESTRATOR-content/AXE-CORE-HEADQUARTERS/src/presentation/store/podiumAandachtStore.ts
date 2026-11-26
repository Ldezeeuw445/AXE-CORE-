/**
 * Doorgeefluik van HomeLiveDashboard naar het 3D-vak (SphereStage): de tegels
 * die nu aandacht vragen. Het dashboard haalt de data al op; zo komt er geen
 * tweede fetch bij. Op de telefoon (geen dashboard) blijft dit leeg en toont
 * het vak zijn oude agent-pil.
 */
import { create } from 'zustand';
import { aandachtSleutel, type AandachtTegel } from '@/domain/sphere/podiumAandacht';

interface PodiumAandacht {
  tegels: AandachtTegel[];
  sleutel: string;
  zet: (tegels: AandachtTegel[]) => void;
}

export const usePodiumAandacht = create<PodiumAandacht>((set, get) => ({
  tegels: [],
  sleutel: '',
  zet: (tegels) => {
    const sleutel = aandachtSleutel(tegels);
    if (sleutel !== get().sleutel) set({ tegels, sleutel });
  },
}));
