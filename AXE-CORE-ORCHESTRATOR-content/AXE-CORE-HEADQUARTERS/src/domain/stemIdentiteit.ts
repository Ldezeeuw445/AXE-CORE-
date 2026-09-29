/** Canonical AXE voice identity shared by Tauri, iPad and iPhone. */
export const AXE_STEM_NAAM = 'Marin';
export const AXE_STEM_ID = 'marin';
export const AXE_STEM_FALLBACK = 'same central voice path';

export const STEM_UI = {
  uitleg:
    'AXE uses one central voice identity — Marin. Realtime conversation and spoken replies use AXE Core, so no device-local voice service or key decides whether voice works.',
  label: 'Marin — central AXE voice.',
  live: 'AXE Voice is online.',
  dood: 'AXE Voice is offline.',
  doodWatNu:
    'AXE Core could not validate the central OpenAI voice connection. Device-local voice settings are not used.',
  kortLive: 'Online',
  kortDood: 'Offline',
  luister: 'Listen',
  speelt: 'Playing…',
} as const;

export type StemStand = {
  ok: boolean;
  regel: string;
  watNu: string | null;
};

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
  return { ok: true, regel: STEM_UI.live, watNu: null };
}
