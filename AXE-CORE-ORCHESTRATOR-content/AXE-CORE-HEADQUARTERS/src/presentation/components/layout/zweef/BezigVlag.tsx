/**
 * Zet `data-bezig="ja"` op <html> zolang AXE aan een antwoord werkt.
 *
 * De onderglow van de chatplaat hoort alleen te ademen als er echt iets
 * gebeurt (DESIGN.md, lichtmodel: "werkt"). De plaat zelf zit in de schil en
 * die is niet van deze sessie, dus de toestand gaat als attribuut op het
 * document en axe-look.css leest hem daar:
 *
 *   :root[data-look='black'][data-bezig='ja'] .axe-chatplaat
 *
 * Eén bron: voiceStatus in de voiceStore. Geen eigen teller, geen tweede
 * "bezig" die uit de pas kan lopen met wat de chat zelf zegt.
 */
import { useEffect } from 'react';
import { useVoiceStore } from '@/presentation/store/voiceStore';
import { isBezig } from './bezig';

export function BezigVlag() {
  const status = useVoiceStore((s) => s.voiceStatus);
  useEffect(() => {
    const el = document.documentElement;
    if (isBezig(status)) el.dataset.bezig = 'ja';
    else delete el.dataset.bezig;
    return () => { delete el.dataset.bezig; };
  }, [status]);
  return null;
}
