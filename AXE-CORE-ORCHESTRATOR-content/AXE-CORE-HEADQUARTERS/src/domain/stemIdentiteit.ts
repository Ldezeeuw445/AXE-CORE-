/**
 * AXE's stem is één ding: George.
 *
 * De runtime (globalTts → kokoroTtsService, stem `bm_george`) wist dat al
 * sinds 23 sep 2026. Settings en de statusrij wisten het niet: die bleven
 * Cedar of Fish Audio noemen, en altijd groen. Luka hoorde dus George (of
 * stil Cedar als de dienst dood was) terwijl het scherm iets anders zei.
 *
 * Dit bestand is de enige plek voor de naam, het stem-id en de Engelse
 * UI-regels. De health-probe zelf blijft in de gateway: die moet fetchen.
 */

export const AXE_STEM_NAAM = 'George';
export const AXE_STEM_ID = 'bm_george';
export const AXE_STEM_FALLBACK = 'Cedar';

export const STEM_UI = {
  uitleg:
    'AXE speaks with one fixed voice — George (Kokoro, local on this Mac). Cedar is only the fallback if George cannot make a sound. It never switches voices mid-reply.',
  label: 'George — British, chosen by ear.',
  live: 'George is running.',
  dood: 'George is not running.',
  doodWatNu:
    'Start the local voice with backend/axe_tts/install.sh. Until then AXE falls back to Cedar if an OpenAI key is set.',
  kortLive: 'George',
  kortDood: 'George down',
  luister: 'Listen',
  speelt: 'Playing…',
} as const;

function verkeerdeStemRegel(voice: string): string {
  return `George service answered as "${voice}", not ${AXE_STEM_ID}. AXE will not silently switch voices.`;
}

export type StemStand = {
  ok: boolean;
  regel: string;
  watNu: string | null;
};

/** Puur: JSON van /health (of het ontbreken daarvan) → wat het scherm mag zeggen. */
export function stemStandVanHealth(
  health: { ok?: boolean; voice?: string } | null,
  fout?: string,
): StemStand {
  if (!health || health.ok !== true) {
    return {
      ok: false,
      regel: STEM_UI.dood,
      watNu: fout ? `${STEM_UI.doodWatNu} (${fout})` : STEM_UI.doodWatNu,
    };
  }
  if (health.voice && health.voice !== AXE_STEM_ID) {
    return { ok: false, regel: verkeerdeStemRegel(health.voice), watNu: null };
  }
  return { ok: true, regel: STEM_UI.live, watNu: null };
}
