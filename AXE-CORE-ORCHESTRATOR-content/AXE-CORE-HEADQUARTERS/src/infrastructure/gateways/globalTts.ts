/**
 * globalTts.ts — single entry for spoken output anywhere in the app.
 *
 * AXE's voice is George (Kokoro `bm_george`), running free on the Mac mini
 * (kokoroTtsService.ts, backend/axe_tts). Luka chose it by ear on 23 Sep 2026
 * and asked that AXE "always has a good voice, so a good fallback too" --
 * so if George cannot make a sound at all, OpenAI Cedar speaks instead.
 * That is the ONLY fallback, and it only happens before anything was heard:
 * AXE never switches voices in the middle of an answer. Every surface that
 * speaks as AXE calls this module, so no caller can pick a third voice.
 */
import { stopFishAudio } from '@/infrastructure/gateways/fishAudioService';
import { speakWithKokoro, stopKokoro, getKokoroTtsLevel } from '@/infrastructure/gateways/kokoroTtsService';
import { beginSpeechProgress, setSpeechFraction, endSpeechProgress } from '@/infrastructure/gateways/speechProgress';
import { stopTTS } from '@/infrastructure/gateways/elevenLabsService';
import {
  speakWithOpenAi,
  stopOpenAiTts,
  isOpenAiTtsConfigured,
  STANDAARD_STEM as AXE_OPENAI_VOICE,
  getAxeTtsLevel,
} from '@/infrastructure/gateways/openAiTtsService';
import { normalizeForSpeech } from '@/domain/speechText';

export type TtsProvider = 'kokoro' | 'fish' | 'elevenlabs' | 'openai' | 'browser';

/** AXE's voice is George (Kokoro). Cedar is only the fallback, never a pick. */
export function getActiveTtsProvider(): TtsProvider {
  return 'kokoro';
}

/** Stop any in-flight TTS from any provider. */
export function stopGlobalTts(): void {
  stopKokoro();
  stopTTS();
  stopFishAudio();
  stopOpenAiTts();
  endSpeechProgress();
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
  // The chat reveals `text` (the original, with its formatting) as far as the
  // voice has got -- "AXE types while it speaks".
  beginSpeechProgress(text);
  const klaar = () => { endSpeechProgress(); onDone?.(); };

  const viaCedar = (waaromNietGeorge: string) => {
    // Cedar reports no progress, so show the whole reply while it speaks
    // rather than leaving half a sentence frozen on screen.
    endSpeechProgress();
    if (!isOpenAiTtsConfigured()) {
      onError?.(`AXE voice unavailable: George (${waaromNietGeorge}) and no OpenAI key for Cedar.`);
      onDone?.();
      return;
    }
    void speakWithOpenAi(
      line,
      onDone,
      (reason) => {
        onError?.(`AXE voice failed: George (${waaromNietGeorge}), Cedar (${reason}).`);
        onDone?.();
      },
      AXE_OPENAI_VOICE,
    );
  };

  speakWithKokoro(line, { opVoortgang: setSpeechFraction, opKlaar: klaar, opFout: viaCedar });
}


/** Real 0..1 playback energy of whichever AXE voice is playing right now
 *  (George normally, Cedar only as fallback -- never both at once). */
export function getGlobalTtsLevel(): number {
  return Math.max(getKokoroTtsLevel(), getAxeTtsLevel());
}
