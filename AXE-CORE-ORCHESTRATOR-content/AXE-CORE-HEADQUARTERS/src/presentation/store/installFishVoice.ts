/**
 * Legacy boot migration kept under its historical name so older imports do not
 * create a second startup path.
 *
 * AXE now has one speech identity: George through globalTts.ts. Old builds
 * stored a selectable TTS provider (usually "fish"), and that persisted value
 * was still enough to make a status row or greeting look like the old AXE
 * after a fresh native rebuild. Clear that obsolete selector at boot.
 *
 * Fish Audio itself remains available as a standalone service for explicit
 * diagnostics/preview code; it is not an AXE identity fallback.
 */
const TTS_PROVIDER_KEY = 'axe_tts_provider';

export function installFishVoice(): void {
  try {
    localStorage.removeItem(TTS_PROVIDER_KEY);
  } catch {
    /* storage unavailable */
  }
}
