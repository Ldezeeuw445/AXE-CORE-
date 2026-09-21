/**
 * globalTts.ts — single entry for spoken output anywhere in the app.
 *
 * Always uses the Settings Fish voice id (getFishVoiceId / LEWIS default)
 * when Fish is the active provider. Mindset, AXE quotes, chat, and previews
 * must all call speakGlobal so they never drift to a different voice.
 */
import { stopFishAudio, speakWithFishAudio } from '@/infrastructure/gateways/fishAudioService';
import { stopTTS } from '@/infrastructure/gateways/elevenLabsService';
import {
  speakWithOpenAi,
  stopOpenAiTts,
  isOpenAiTtsConfigured,
  STANDAARD_STEM as AXE_OPENAI_VOICE,
} from '@/infrastructure/gateways/openAiTtsService';
import { normalizeForSpeech } from '@/domain/speechText';

export type TtsProvider = 'fish' | 'elevenlabs' | 'openai' | 'browser';

/**
 * AXE has ONE voice: OpenAI cedar (AXE_OPENAI_VOICE). There is no picker and no
 * per-message provider guessing — a single, recognisable voice is the point.
 * The browser voice is kept only as an emergency net for when there is no
 * OpenAI key or no network; it is a fallback, never a choice.
 */
export function getActiveTtsProvider(): TtsProvider {
  return 'openai';
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

  // The AXE voice: OpenAI cedar. Emergency fallback is the one fixed Fish
  // identity (Lewis), never the OS/browser voice: that path can silently swap
  // gender/accent and breaks AXE's identity.
  if (isOpenAiTtsConfigured()) {
    void speakWithOpenAi(
      line,
      onDone,
      (reason) => {
        void speakWithFishAudio(line, onDone, (fallbackReason) => {
          onError?.(`${reason}; fallback: ${fallbackReason}`);
          onDone?.();
        });
      },
      AXE_OPENAI_VOICE,
    );
    return;
  }

  void speakWithFishAudio(line, onDone, (reason) => {
    onError?.(reason);
    onDone?.();
  });
}
