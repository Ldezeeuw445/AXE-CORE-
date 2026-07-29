/**
 * installFishVoice.ts
 * On boot: ensure Fish Audio has the Lewis (Damian Lewis / Bobby Axelrod)
 * voice id when none is stored, and keep axe_tts_provider in localStorage
 * so Settings choices (fish | elevenlabs | browser) are what speakSafely uses.
 */
import { LEWIS_VOICE_ID } from '@/infrastructure/gateways/fishAudioService';

const FISH_VOICE_KEY = 'axe_fish_voice_id';
const TTS_PROVIDER_KEY = 'axe_tts_provider';

export function installFishVoice(): void {
  try {
    const existing = (localStorage.getItem(FISH_VOICE_KEY) ?? '').trim();
    if (!existing) {
      localStorage.setItem(FISH_VOICE_KEY, LEWIS_VOICE_ID);
    }
    // If user never picked a provider, default to fish (Lewis).
    if (!localStorage.getItem(TTS_PROVIDER_KEY)) {
      localStorage.setItem(TTS_PROVIDER_KEY, 'fish');
    }
  } catch {
    /* ignore */
  }
}
