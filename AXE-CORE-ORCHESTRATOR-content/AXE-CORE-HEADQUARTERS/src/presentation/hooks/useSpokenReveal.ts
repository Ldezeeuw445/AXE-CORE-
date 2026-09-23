import { useSyncExternalStore } from 'react';
import { getSpeechProgress, subscribeSpeechProgress } from '@/infrastructure/gateways/speechProgress';
import { revealCut } from '@/domain/speechChunks';

/**
 * "AXE typt terwijl hij praat": geeft het deel van `text` terug dat de stem
 * al heeft uitgesproken, woord voor woord. Is `text` niet wat er nu wordt
 * uitgesproken (of praat AXE niet), dan komt de hele tekst terug.
 *
 * De snapshot is een GETAL per bericht (hoeveel tekens zichtbaar, of -1),
 * geen object: de voortgang tikt tot ~60x per seconde, en dan zou elk
 * chatbericht op het scherm z'n Markdown opnieuw opbouwen. Nu ververst alleen
 * het bericht dat wordt uitgesproken, en alleen als er een woord bijkomt.
 */
export function useSpokenReveal(text: string): string {
  const snede = useSyncExternalStore(
    subscribeSpeechProgress,
    () => {
      const p = getSpeechProgress();
      return p.text !== null && p.text === text ? revealCut(text, p.fraction) : -1;
    },
    () => -1,
  );
  return snede < 0 ? text : text.slice(0, snede);
}
