import { getSpeechProgress } from '@/infrastructure/gateways/speechProgress';
import { zichtbareChatTekst } from '@/domain/chatLatency';

/**
 * Tekst van een AXE-reply voor de chat-UI.
 *
 * Vroeger sneed dit op speech-fraction ("typt terwijl hij praat"). Bij
 * fraction 0 — de eerste Kokoro-chunk is vaak 2–12s weg — bleef de bubble
 * leeg terwijl het antwoord al klaar was. De stem mag meelopen; de letters
 * niet wachten.
 */
export function useSpokenReveal(text: string): string {
  return zichtbareChatTekst(text, getSpeechProgress());
}
