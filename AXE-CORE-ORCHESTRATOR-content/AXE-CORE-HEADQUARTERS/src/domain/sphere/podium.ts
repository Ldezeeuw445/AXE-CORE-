/**
 * Wat het Home-podium laat zien, afgeleid van de echte bronnen.
 *
 * Geen mock, geen tweede waarheid: de kaarten zijn een view-model van
 * projectie + laatste AXE-antwoord + agentstand. De UI zet ze neer;
 * deze file beslist WAT er staat en HOE GROOT. Inhoud bepaalt de maat:
 * een korte zin blijft klein in het midden, een kaart of tabel mag tot
 * het volle toneel groeien.
 */
import { werkPulseTekst } from '@/domain/homeLive';
import type { ProjectionMode, ProjectionPayload, SpherePhase } from '@/domain/sphere/projectionTypes';

export type PodiumMaat = 'compact' | 'medium' | 'vol';

export type PodiumKaartSoort =
  | 'antwoord'
  | 'beeld'
  | 'grafiek'
  | 'kaart'
  | 'tabel'
  | 'html'
  | 'code'
  | 'media'
  | 'agenten';

export interface PodiumKaart {
  id: string;
  soort: PodiumKaartSoort;
  maat: PodiumMaat;
  titel: string;
  tekst?: string;
  /** Alleen gezet als de kaart een Living Display-projectie is. */
  payloadId?: string;
}

/** Korter dan dit is een knik, geen antwoord om op het toneel te zetten. */
export const PODIUM_ANTWOORD_MIN = 12;

export function heeftMarkdownTabel(tekst: string): boolean {
  const regels = tekst.split('\n');
  let kop = false;
  for (const regel of regels) {
    const t = regel.trim();
    if (!kop && /^\|.+\|$/.test(t)) {
      kop = true;
      continue;
    }
    if (kop && /^\|?\s*:?-{3,}/.test(t)) return true;
    if (kop && t && !t.includes('|')) kop = false;
  }
  return false;
}

export function heeftUrl(tekst: string): boolean {
  return /https?:\/\/\S+/i.test(tekst) || /\[[^\]]+\]\([^)]+\)/.test(tekst);
}

export function podiumMaatVoor(soort: PodiumKaartSoort, tekstLengte = 0): PodiumMaat {
  if (soort === 'kaart' || soort === 'html' || soort === 'tabel') return 'vol';
  if (soort === 'beeld' || soort === 'grafiek' || soort === 'code' || soort === 'media') return 'medium';
  if (soort === 'agenten') return 'compact';
  if (tekstLengte >= 1600) return 'vol';
  if (tekstLengte >= 420) return 'medium';
  return 'compact';
}

export function soortVanMode(mode: ProjectionMode, tekst?: string): PodiumKaartSoort {
  if (mode === 'map' || mode === 'scene3d') return 'kaart';
  if (mode === 'image') return 'beeld';
  if (mode === 'chart') return 'grafiek';
  if (mode === 'html') return 'html';
  if (mode === 'code') return 'code';
  if (mode === 'media') return 'media';
  if (tekst && heeftMarkdownTabel(tekst)) return 'tabel';
  return 'antwoord';
}

function projectieActief(phase: SpherePhase): boolean {
  return phase === 'opening' || phase === 'projecting' || phase === 'closing';
}

/** Te kort of een home-commando-bevestiging: geen eigen kaart. */
export function antwoordHoortOpPodium(tekst: string): boolean {
  const t = tekst.trim();
  if (t.length < PODIUM_ANTWOORD_MIN) return false;
  if (/^staat op (de bol|neural|terrain|runtime)\.?$/i.test(t)) return false;
  if (/^notch (staat open|is dicht)\.?$/i.test(t)) return false;
  return true;
}

/** De voiceStore.response blijft staan na een beurt. Alleen meenemen als AXE
 *  nu spreekt/denkt én het laatste axe-bericht bij déze vraag hoort. */
export function streamVanDezeBeurt(invoer: {
  voiceStatus: string;
  laatsteAxeTs?: number | null;
  laatsteUserTs?: number | null;
}): boolean {
  if (invoer.voiceStatus !== 'processing' && invoer.voiceStatus !== 'speaking') return false;
  if (invoer.laatsteUserTs == null) return true;
  /* Eerste beurt: AXE heeft nog geen bericht, de stream ís deze vraag. */
  if (invoer.laatsteAxeTs == null) return true;
  return invoer.laatsteAxeTs >= invoer.laatsteUserTs;
}

/** Alleen het antwoord van déze beurt: een nieuwe vraag veegt het oude van het toneel. */
export function antwoordIsHuidig(invoer: {
  voiceStatus: string;
  laatsteAxeTs?: number | null;
  laatsteUserTs?: number | null;
  heeftStream?: boolean;
}): boolean {
  if (invoer.heeftStream && streamVanDezeBeurt(invoer)) return true;
  if (invoer.laatsteAxeTs == null) return false;
  if (invoer.laatsteUserTs == null) return true;
  return invoer.laatsteAxeTs >= invoer.laatsteUserTs;
}

export function podiumKaartenVan(invoer: {
  phase: SpherePhase;
  payload: ProjectionPayload | null;
  antwoord?: string;
  vraag?: string;
  voiceStatus: string;
  antwoordHuidig?: boolean;
  agenten: number;
  goedkeuringen: number;
}): PodiumKaart[] {
  const kaarten: PodiumKaart[] = [];
  const projectie = invoer.payload && projectieActief(invoer.phase) ? invoer.payload : null;

  if (projectie && projectie.mode !== 'none') {
    const soort = soortVanMode(projectie.mode, projectie.text);
    kaarten.push({
      id: projectie.id,
      soort,
      maat: podiumMaatVoor(soort, (projectie.text || '').length),
      titel: projectie.title,
      tekst: projectie.text,
      payloadId: projectie.id,
    });
  }

  const antwoord = (invoer.antwoord || '').trim();
  const toontAntwoord =
    !projectie
    && antwoordHoortOpPodium(antwoord)
    && invoer.antwoordHuidig !== false;

  if (toontAntwoord) {
    const soort: PodiumKaartSoort = heeftMarkdownTabel(antwoord) ? 'tabel' : 'antwoord';
    const titel = (invoer.vraag || '').trim().slice(0, 72) || 'AXE';
    kaarten.push({
      id: 'antwoord',
      soort,
      maat: podiumMaatVoor(soort, antwoord.length),
      titel,
      tekst: antwoord,
    });
  }

  if (invoer.agenten > 0 || invoer.goedkeuringen > 0) {
    kaarten.push({
      id: 'agenten',
      soort: 'agenten',
      maat: 'compact',
      titel: werkPulseTekst(invoer.agenten, invoer.goedkeuringen),
    });
  }

  return kaarten;
}

/**
 * Demo-inhoud alleen als DEV én de vlag. Nooit in het productiepad:
 * SphereStage roept dit alleen aan achter `podiumDemoAan`.
 */
export function podiumDemoAan(vlag: string | null | undefined, isDev: boolean): boolean {
  return isDev && (vlag === '1' || vlag === 'true');
}

export function podiumDemoKaarten(): PodiumKaart[] {
  return [
    {
      id: 'demo-antwoord',
      soort: 'antwoord',
      maat: 'compact',
      titel: 'What is AXE Core?',
      tekst: 'Your second brain. I show the answer here, on the stage, not only in the chat plate.',
    },
    {
      id: 'demo-agenten',
      soort: 'agenten',
      maat: 'compact',
      titel: werkPulseTekst(2, 1),
    },
  ];
}
