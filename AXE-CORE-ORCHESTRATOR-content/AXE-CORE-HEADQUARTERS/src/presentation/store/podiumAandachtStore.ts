/**
 * Doorgeefluik van HomeLiveDashboard naar het 3D-vak (SphereStage): de tegels
 * die nu aandacht vragen en de vandaag-strook. Het dashboard haalt de data al
 * op; zo komt er geen tweede fetch bij. Op de telefoon (geen dashboard) blijft
 * dit leeg en toont het vak zijn oude agent-pil.
 *
 * Fase 2: vastgezette tegels (per apparaat, localStorage) blijven ook tijdens
 * een antwoord staan.
 */
import { create } from 'zustand';
import { aandachtSleutel, type AandachtTegel } from '@/domain/sphere/podiumAandacht';

const VAST_SLEUTEL = 'axe_podium_vast_v1';

function leesVast(): Set<string> {
  try {
    const v = JSON.parse(localStorage.getItem(VAST_SLEUTEL) ?? '[]');
    return new Set(Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

interface PodiumAandacht {
  tegels: AandachtTegel[];
  strook: string | null;
  sleutel: string;
  vast: Set<string>;
  zet: (tegels: AandachtTegel[], strook?: string | null) => void;
  wisselVast: (id: string) => void;
}

export const usePodiumAandacht = create<PodiumAandacht>((set, get) => ({
  tegels: [],
  strook: null,
  sleutel: '',
  vast: leesVast(),
  zet: (tegels, strook = null) => {
    const sleutel = aandachtSleutel(tegels, strook);
    if (sleutel !== get().sleutel) set({ tegels, strook, sleutel });
  },
  wisselVast: (id) => {
    const vast = new Set(get().vast);
    if (vast.has(id)) vast.delete(id); else vast.add(id);
    try { localStorage.setItem(VAST_SLEUTEL, JSON.stringify([...vast])); } catch { /* privémodus */ }
    set({ vast });
  },
}));
