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
 * Strip UI / routing chrome that must never be spoken:
 * "google · gemini-3.6-flash", markdown fences, trailing model badges.
 */
export function sanitizeForSpeech(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .split('\n')
    .filter((line) => {
      const t = line.trim();
      if (!t) return false;
      // provider · model badges (UI chrome under chat bubbles)
      if (/^(google|openai|anthropic|xai|groq|openrouter|ollama|deepseek)\s*[·•|]\s*\S+/i.test(t)) return false;
      if (/^(model|provider|via|routed)\s*[:=]/i.test(t)) return false;
      if (/^[a-z0-9_.-]+\s*[·•|]\s*[a-z0-9_.-]+$/i.test(t) && t.length < 48) return false;
      return true;
    })
    .join(' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
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
  const line = sanitizeForSpeech(text);
  if (!line) {
    onDone?.();
    return;
  }

  stopGlobalTts();
  const provider = getActiveTtsProvider();

  if (provider === 'fish' && isFishAudioConfigured()) {
    try {
      localStorage.setItem('axe_tts_provider', 'fish');
    } catch { /* ignore */ }
    void speakWithFishAudio(
      line,
      onDone,
      (reason) => {
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

  if (isFishAudioConfigured() && getFishVoiceId()) {
    void speakWithFishAudio(line, onDone, () => speakWithBrowser(line, onDone));
    return;
  }

  speakWithBrowser(line, onDone);
}
