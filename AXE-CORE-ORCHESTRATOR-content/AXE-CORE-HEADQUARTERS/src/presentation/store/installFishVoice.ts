/**
 * installFishVoice.ts
 * On boot: ensure Fish Audio has the configured AXE identity voice id,
 * and keep axe_tts_provider in localStorage so Settings choices
 * (fish | elevenlabs | browser) are what speakSafely uses.
 */
import { LEWIS_VOICE_ID } from '@/infrastructure/gateways/fishAudioService';

const FISH_VOICE_KEY = 'axe_fish_voice_id';
const TTS_PROVIDER_KEY = 'axe_tts_provider';
/** Previous default (Damian Lewis / Bobby Axelrod style) — migrate to new identity. */
const LEGACY_LEWIS_VOICE_ID = 'e385288efc394446b3155a4fdaf24b75';

export function installFishVoice(): void {
  try {
    const existing = (localStorage.getItem(FISH_VOICE_KEY) ?? '').trim();
    if (!existing || existing === LEGACY_LEWIS_VOICE_ID) {
      localStorage.setItem(FISH_VOICE_KEY, LEWIS_VOICE_ID);
    }
    // If user never picked a provider, default to fish.
    if (!localStorage.getItem(TTS_PROVIDER_KEY)) {
      localStorage.setItem(TTS_PROVIDER_KEY, 'fish');
    }
  } catch {
    /* ignore */
  }
}
