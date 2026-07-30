/**
 * globalTts.ts — single entry for spoken output anywhere in the app.
 *
 * Always uses the Settings Fish voice id (getFishVoiceId / LEWIS default)
 * when Fish is the active provider. Mindset, AXE quotes, chat, and previews
 * must all call speakGlobal so they never drift to a different voice.
 */
import {
  speakWithFishAudio,
  isFishAudioConfigured,
  stopFishAudio,
  getFishVoiceId,
} from '@/infrastructure/gateways/fishAudioService';
import {
  speakWithElevenLabs,
  stopTTS,
  speakWithBrowser,
} from '@/infrastructure/gateways/elevenLabsService';

export type TtsProvider = 'fish' | 'elevenlabs' | 'browser';

export function getActiveTtsProvider(): TtsProvider {
  try {
    const v = localStorage.getItem('axe_tts_provider') as TtsProvider | null;
    if (v === 'fish' || v === 'elevenlabs' || v === 'browser') return v;
  } catch { /* ignore */ }
  return 'fish';
}

/** Stop any in-flight TTS from any provider. */
export function stopGlobalTts(): void {
  stopTTS();
  stopFishAudio();
}

/**
 * Speak text with the globally configured provider + Fish voice id.
 * Fish path always passes getFishVoiceId() (already inside speakWithFishAudio).
 */
export function speakGlobal(
  text: string,
  onDone?: () => void,
  onError?: (reason: string) => void,
): void {
  const line = text.trim();
  if (!line) {
    onDone?.();
    return;
  }

  stopGlobalTts();
  const provider = getActiveTtsProvider();

  if (provider === 'fish' && isFishAudioConfigured()) {
    // Force Fish as active so Settings "primary" sticks for this session
    try {
      localStorage.setItem('axe_tts_provider', 'fish');
    } catch { /* ignore */ }
    void speakWithFishAudio(
      line,
      onDone,
      (reason) => {
        // Fallback still browser — same words, never a random ElevenLabs voice
        speakWithBrowser(line, onDone);
        onError?.(reason);
      },
    );
    return;
  }

  if (provider === 'elevenlabs') {
    void speakWithElevenLabs(line, onDone, onDone, () => speakWithBrowser(line, onDone));
    return;
  }

  // Prefer Fish whenever a voice id exists, even if provider flag drifted
  if (isFishAudioConfigured() && getFishVoiceId()) {
    void speakWithFishAudio(line, onDone, () => speakWithBrowser(line, onDone));
    return;
  }

  speakWithBrowser(line, onDone);
}
