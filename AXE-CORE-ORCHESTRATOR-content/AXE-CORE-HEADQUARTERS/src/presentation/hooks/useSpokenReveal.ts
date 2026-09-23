import { useSyncExternalStore } from 'react';
import { getSpeechProgress, subscribeSpeechProgress } from '@/infrastructure/gateways/speechProgress';
import { zichtbareChatTekst } from '@/domain/chatLatency';

/**
 * Tekst van een AXE-reply voor de chat-UI.
 *
 * Vroeger sneed dit op speech-fraction ("typt terwijl hij praat"). Bij
 * fraction 0 — de eerste Kokoro-chunk is vaak 2–12s weg — bleef de bubble
 * leeg terwijl het antwoord al klaar was. De stem mag meelopen; de letters
 * niet wachten. De subscription blijft zodat de stem-laag een aanroeper
 * houdt; de snapshot is de hele tekst, dus de bubble flikkert niet mee.
 */
export function useSpokenReveal(text: string): string {
  return useSyncExternalStore(
    subscribeSpeechProgress,
    () => zichtbareChatTekst(text, getSpeechProgress()),
    () => text,
  );
}
