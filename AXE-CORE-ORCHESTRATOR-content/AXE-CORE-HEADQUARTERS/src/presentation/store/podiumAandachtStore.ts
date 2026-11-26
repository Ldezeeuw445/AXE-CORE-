/**
 * Doorgeefluik van HomeLiveDashboard naar het 3D-vak (SphereStage): de tegels
 * die nu aandacht vragen en de vandaag-strook. Het dashboard haalt de data al
 * op; zo komt er geen tweede fetch bij. Op de telefoon (geen dashboard) blijft
 * dit leeg en toont het vak zijn oude agent-pil.
 *
 * Fase 2: vastgezette tegels (per apparaat) blijven staan tijdens een antwoord.
 * Fase 3: eigen volgorde door slepen (per apparaat), en een tegel naar voren
 * halen met stem of chat ("wat wacht er", "laat trading zien", "het nieuws").
 * Nieuws wordt alleen opgehaald als je erom vraagt.
 */
import { create } from 'zustand';
import {
  aandachtSleutel, naarVorenAntwoord, nieuwsTegel, podiumOpdracht, verplaats,
  type AandachtSoort, type AandachtTegel,
} from '@/domain/sphere/podiumAandacht';
import { fetchMarketNews } from '@/infrastructure/gateways/axeCoreApiService';

const VAST_SLEUTEL = 'axe_podium_vast_v1';
const VOLGORDE_SLEUTEL = 'axe_podium_volgorde_v1';

function leesLijst(sleutel: string): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(sleutel) ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function bewaar(sleutel: string, lijst: readonly string[]): void {
  try { localStorage.setItem(sleutel, JSON.stringify(lijst)); } catch { /* privémodus */ }
}

interface PodiumAandacht {
  tegels: AandachtTegel[];
  strook: string | null;
  sleutel: string;
  vast: Set<string>;
  volgorde: string[];
  /** Een tegel die niet uit het dashboard komt (nieuws, op verzoek). */
  extra: AandachtTegel | null;
  /** Laatste "naar voren"-verzoek; ts = het AXE-bericht dat erbij hoort. */
  voren: { id: AandachtSoort; ts: number } | null;
  zet: (tegels: AandachtTegel[], strook?: string | null) => void;
  wisselVast: (id: string) => void;
  sleep: (zichtbaar: readonly string[], van: string, naar: string) => void;
  naarVoren: (id: AandachtSoort, ts: number) => void;
}

export const usePodiumAandacht = create<PodiumAandacht>((set, get) => ({
  tegels: [],
  strook: null,
  sleutel: '',
  vast: new Set(leesLijst(VAST_SLEUTEL)),
  volgorde: leesLijst(VOLGORDE_SLEUTEL),
  extra: null,
  voren: null,
  zet: (tegels, strook = null) => {
    const sleutel = aandachtSleutel(tegels, strook);
    if (sleutel !== get().sleutel) set({ tegels, strook, sleutel });
  },
  wisselVast: (id) => {
    const vast = new Set(get().vast);
    if (vast.has(id)) vast.delete(id); else vast.add(id);
    bewaar(VAST_SLEUTEL, [...vast]);
    set({ vast });
  },
  sleep: (zichtbaar, van, naar) => {
    const volgorde = verplaats(get().volgorde, zichtbaar, van, naar);
    bewaar(VOLGORDE_SLEUTEL, volgorde);
    set({ volgorde });
  },
  naarVoren: (id, ts) => set({ voren: { id, ts } }),
}));

/**
 * Een chat- of stemzin die een tegel naar voren haalt. Null = geen podium-
 * opdracht, of niet op Home (dan gaat de zin gewoon naar AXE, zodat "laat
 * trading zien" elders blijft doen wat het deed).
 */
export async function podiumBeurt(tekst: string, opHome: boolean): Promise<{ antwoord: string; id: AandachtSoort | null } | null> {
  const ids = podiumOpdracht(tekst);
  if (!ids || !opHome) return null;
  if (ids[0] === 'nieuws') {
    const r = await fetchMarketNews('general', 6).catch(() => null);
    const tegel = r ? nieuwsTegel(r.news.map((n) => ({ kop: n.headline, bron: n.source }))) : null;
    usePodiumAandacht.setState({ extra: tegel });
    return { antwoord: naarVorenAntwoord(tegel, 'nieuws'), id: tegel ? 'nieuws' : null };
  }
  const tegels = usePodiumAandacht.getState().tegels;
  const tegel = ids.map((id) => tegels.find((t) => t.id === id)).find(Boolean) ?? null;
  return { antwoord: naarVorenAntwoord(tegel, ids[0]), id: tegel?.id ?? null };
}
