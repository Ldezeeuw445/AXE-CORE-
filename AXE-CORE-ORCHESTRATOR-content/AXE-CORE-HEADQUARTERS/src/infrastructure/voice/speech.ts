/**
 * infrastructure/voice/speech.ts
 *
 * Browser speech I/O adapters: SpeechRecognition (STT) and the TTS fallback
 * chain (ElevenLabs → VPS TTS → browser speechSynthesis). Isolated here so
 * the voice store deals only with state transitions, not Web APIs.
 */

import { speakWithElevenLabs, stopTTS } from '@/services/elevenLabsService';
import { isAxeApiConfigured, tts } from '@/services/axeCoreApiService';
import { readString } from '@/infrastructure/storage/localStore';

export { stopTTS };

function speakWithBrowser(text: string, onDone?: () => void) {
  if (typeof window === 'undefined' || !window.speechSynthesis) {
    onDone?.();
    return;
  }
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = 'nl-NL';
  utter.rate = 1.1;
  utter.pitch = 1;
  utter.onend = () => onDone?.();
  utter.onerror = () => onDone?.();
  window.speechSynthesis.speak(utter);
}

/** Speak text respecting the user's response-mode preference ("type" = mute).
 *  localStorage is read directly to avoid a circular dependency on the store. */
export function speakSafely(text: string, onDone?: () => void) {
  if (readString('axe_response_mode') === 'type') { onDone?.(); return; }
  speakWithElevenLabs(text, onDone, () => {
    if (isAxeApiConfigured) {
      void tts(text).then(blob => { const url = URL.createObjectURL(blob); const audio = new Audio(url); audio.onended = () => { URL.revokeObjectURL(url); onDone?.(); }; audio.onerror = () => { URL.revokeObjectURL(url); onDone?.(); }; audio.play().catch(() => onDone?.()); }).catch(() => { speakWithBrowser(text, onDone); });
      return;
    }
    speakWithBrowser(text, onDone);
  });
}

const SpeechRecCtor = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;
let recInstance: SpeechRecognition | null = null;

export const recognitionSupported = !!SpeechRecCtor;

/** Lazily created singleton SpeechRecognition instance (nl-NL). */
export function getRecognizer(): SpeechRecognition | null {
  if (!SpeechRecCtor) return null;
  if (!recInstance) { recInstance = new SpeechRecCtor(); recInstance.continuous = false; recInstance.interimResults = true; recInstance.lang = 'nl-NL'; }
  return recInstance;
}

export function stopRecognizer(): void {
  try { recInstance?.stop(); } catch { /* not started */ }
}
