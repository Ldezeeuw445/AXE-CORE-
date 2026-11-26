/**
 * Focusmodus in de app: de klok, het einde, en de opdrachten uit de chat
 * (domain/rust.ts). Tijdens focus houden systeemMelding en de spraak van
 * taken zich stil (zie infrastructure/persistence/focusOpslag); aan het eind
 * zegt AXE in het gesprek wat er binnenkwam.
 */
import { useEffect, useState } from 'react';
import { PIN_UITLEG, focusKlaarTekst, restTekst, type RustOpdracht } from '@/domain/rust';
import { FOCUS_SEIN, focusStand, startFocus, stopFocus } from '@/infrastructure/persistence/focusOpslag';
import { rustGeluidAan, startRustGeluid, stopRustGeluid } from '@/infrastructure/audio/rustGeluid';
import { useVoiceStore } from '@/presentation/store/voiceStore';

function zegAxe(tekst: string): void {
  useVoiceStore.setState((s) => ({
    conversation: [...s.conversation, { role: 'axe' as const, text: tekst, timestamp: Date.now() }],
  }));
}

function rondAf(): void {
  const s = stopFocus();
  if (s) zegAxe(focusKlaarTekst(s.minuten, s.meldingen, s.berichten));
}

let klok: ReturnType<typeof setInterval> | null = null;
export function installFocus(): void {
  if (klok || typeof window === 'undefined') return;
  klok = setInterval(() => {
    const s = focusStand();
    if (s && Date.now() >= s.tot) rondAf();
  }, 5_000);
}

/** Voer een rust-opdracht uit en geef AXE's antwoord terug. */
export async function voerRustUit(o: RustOpdracht): Promise<string> {
  switch (o.soort) {
    case 'focus-aan': {
      const s = startFocus(o.minuten);
      const eind = new Date(s.tot).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
      return `Focus aan tot ${eind} (${o.minuten} min). Meldingen en berichten van taken houd ik vast; daarna zeg ik wat er binnenkwam. "Focus uit" stopt eerder.`;
    }
    case 'focus-uit': {
      const s = focusStand();
      if (!s || Date.now() >= s.tot) { stopFocus(); return 'Er liep geen focus.'; }
      const klaar = stopFocus()!;
      return focusKlaarTekst(Math.max(1, Math.round((Date.now() - (klaar.tot - klaar.minuten * 60_000)) / 60_000)), klaar.meldingen, klaar.berichten);
    }
    case 'focus-stand': {
      const s = focusStand();
      return s && Date.now() < s.tot ? `Nog ${restTekst(s.tot, Date.now())} focus.` : 'Er loopt geen focus. Zeg "focus" of "focus 50 min".';
    }
    case 'muziek-aan':
      if (rustGeluidAan()) return 'Het rustige geluid staat al aan. "Muziek uit" zet het uit.';
      return (await startRustGeluid())
        ? 'Rustig geluid staat aan: zachte ruis met een lage toon. "Muziek uit" zet het uit.'
        : 'Dit apparaat kan hier geen geluid maken.';
    case 'muziek-uit':
      if (!rustGeluidAan()) return 'Er stond geen geluid aan.';
      stopRustGeluid();
      return 'Geluid uit.';
    case 'pin-uitleg':
      return PIN_UITLEG;
  }
}

/** Resterende focustijd in tekst, of null -- elke 15 s bijgewerkt. */
export function useFocusRest(): string | null {
  const lees = () => {
    const s = focusStand();
    return s && Date.now() < s.tot ? restTekst(s.tot, Date.now()) : null;
  };
  const [rest, setRest] = useState(lees);
  useEffect(() => {
    const op = () => setRest(lees());
    const t = setInterval(op, 15_000);
    window.addEventListener(FOCUS_SEIN, op);
    return () => { clearInterval(t); window.removeEventListener(FOCUS_SEIN, op); };
  }, []);
  return rest;
}

/** Stop de focus vanaf de pil. */
export function stopFocusVanPil(): void {
  rondAf();
}
