/**
 * Wie AXE is als je hem hoort. Eén naam, voor Tauri, iPad en iPhone.
 *
 * Op 29 september is de stem bewust omgezet: niet meer George via een lokale
 * Kokoro-dienst met Cedar als terugval, maar één centrale Marin-stem via AXE
 * Core. Die beslissing staat; wat niet af was, is dat de naam daarna op zes
 * manieren in de code bleef staan -- `Marin`, `marin`, `AXE Voice · Marin`,
 * `Central TTS · same Marin`, `George`, `bm_george` -- en dat twee schermen
 * hem gewoon als letterlijke tekst herhaalden.
 *
 * Hier staat hij één keer. Wie de naam toont, leest hem hier.
 */

/** Zoals je hem noemt. */
export const AXE_STEM_NAAM = 'Marin';

/** Zoals de backend hem noemt (`/voice/health` en `/voice/tts`). */
export const AXE_STEM_ID = 'marin';

/** Wat er in de schermen staat. Engels, want dat staat op het scherm. */
export const STEM_UI = {
  uitleg:
    `AXE uses one central voice identity — ${AXE_STEM_NAAM}. Realtime conversation and spoken replies use AXE Core, so no device-local voice service or key decides whether voice works.`,
  label: `${AXE_STEM_NAAM} — central AXE voice.`,
  /** Wat de knop en de statusregel tonen. Eén plek, zodat het nooit uiteenloopt. */
  volledigeNaam: `AXE Voice · ${AXE_STEM_NAAM}`,
  live: 'AXE Voice is online.',
  dood: 'AXE Voice is offline.',
  doodWatNu:
    'AXE Core could not validate the central voice connection. Device-local voice settings are not used.',
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

/** De backend antwoordt met een andere stem dan AXE hoort te hebben. */
function verkeerdeStemRegel(gekregen: string): string {
  return `AXE Core answers with voice "${gekregen}" instead of ${AXE_STEM_NAAM}. Check the voice setting on the server.`;
}

/**
 * `/voice/health` omzetten in groen of rood, met wat je eraan doet.
 *
 * Eén omzetter voor beide schermen: de zijbalk en Settings bouwden hier
 * allebei hun eigen drie regels, en dan is "zeggen ze hetzelfde?" een vraag
 * die je per scherm moet nagaan.
 *
 * De stemcontrole hoort hier ook. Die stond er, en verdween op 29 september
 * samen met de oude terugval -- terwijl hij over de nieuwe opzet net zo goed
 * gaat: antwoordt de server met een andere stem dan Marin, dan is dat geen
 * detail om stil groen op te zetten. AXE wisselt niet ongemerkt van stem.
 */
export function stemStandVanHealth(
  health: { online?: boolean; ok?: boolean; voice?: string; reason?: string | null } | null,
  fout?: string,
): StemStand {
  const online = health ? (health.online ?? health.ok) === true : false;
  if (!online) {
    const reden = fout || health?.reason || '';
    return {
      ok: false,
      regel: STEM_UI.dood,
      watNu: reden ? `${STEM_UI.doodWatNu} (${reden})` : STEM_UI.doodWatNu,
    };
  }
  if (health?.voice && health.voice !== AXE_STEM_ID) {
    return { ok: false, regel: STEM_UI.dood, watNu: verkeerdeStemRegel(health.voice) };
  }
  return { ok: true, regel: STEM_UI.live, watNu: null };
}
