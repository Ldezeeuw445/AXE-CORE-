/**
 * globalTts.ts — single entry for spoken output anywhere in the app.
 *
 * Canonical AXE speech has one identity: OpenAI Cedar. Every surface that
 * speaks as AXE calls this module so a provider failure can never silently
 * swap the assistant to a different voice, accent or playback engine.
 */
import { stopFishAudio } from '@/infrastructure/gateways/fishAudioService';
import { stopTTS } from '@/infrastructure/gateways/elevenLabsService';
import {
  speakWithOpenAi,
  stopOpenAiTts,
  isOpenAiTtsConfigured,
  STANDAARD_STEM as AXE_OPENAI_VOICE,
  getAxeTtsLevel,
} from '@/infrastructure/gateways/openAiTtsService';
import { normalizeForSpeech } from '@/domain/speechText';

export type TtsProvider = 'fish' | 'elevenlabs' | 'openai' | 'browser';

/**
 * AXE has ONE voice: OpenAI cedar (AXE_OPENAI_VOICE). There is no picker,
 * provider guessing or voice fallback. If Cedar is unavailable AXE keeps the
 * text reply visible and reports the TTS error instead of impersonating a
 * second identity.
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

/** Speak with the single canonical AXE voice. */
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

  if (!isOpenAiTtsConfigured()) {
    onError?.('AXE voice unavailable: OpenAI TTS is not configured.');
    onDone?.();
    return;
  }

  void speakWithOpenAi(
    line,
    onDone,
    (reason) => {
      onError?.(`AXE Cedar TTS failed: ${reason}`);
      onDone?.();
    },
    AXE_OPENAI_VOICE,
  );
}


/** Real 0..1 playback energy from the one canonical Cedar playback path. */
export function getGlobalTtsLevel(): number {
  return getAxeTtsLevel();
}
