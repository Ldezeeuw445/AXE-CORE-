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
import {
  speakWithOpenAi,
  stopOpenAiTts,
  isOpenAiTtsConfigured,
} from '@/infrastructure/gateways/openAiTtsService';
import { normalizeForSpeech } from '@/domain/speechText';

export type TtsProvider = 'fish' | 'elevenlabs' | 'openai' | 'browser';

export function getActiveTtsProvider(): TtsProvider {
  try {
    const v = localStorage.getItem('axe_tts_provider') as TtsProvider | null;
    if (v === 'fish' || v === 'elevenlabs' || v === 'openai' || v === 'browser') return v;
  } catch { /* ignore */ }
  return 'fish';
}

/** Stop any in-flight TTS from any provider. */
export function stopGlobalTts(): void {
  stopTTS();
  stopFishAudio();
  stopOpenAiTts();
}

/**
 * Prepare text for the voice. Two jobs, in order:
 *  1. Drop UI / routing chrome that must never be spoken — the "google · gemini"
 *     model badges under chat bubbles, "provider:"/"routed:" lines. These are
 *     whole lines, so they are filtered before anything collapses the newlines.
 *  2. Hand the rest to normalizeForSpeech, which removes Markdown, links, emoji
 *     and stray symbols so AXE reads words, not "star star" and "backtick".
 */
export function sanitizeForSpeech(text: string): string {
  const withoutChrome = text
    .replace(/```[\s\S]*?```/g, ' ')
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
    .join('\n');
  return normalizeForSpeech(withoutChrome);
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

  /* De stem van ChatGPT, voor zover die met een sleutel te draaien is: Arbor is
     app-only, marin/cedar zijn OpenAI's eigen beste. Zie openAiTtsService.ts. */
  if (provider === 'openai' && isOpenAiTtsConfigured()) {
    void speakWithOpenAi(line, onDone, (reason) => {
      speakWithBrowser(line, onDone);
      onError?.(reason);
    });
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
