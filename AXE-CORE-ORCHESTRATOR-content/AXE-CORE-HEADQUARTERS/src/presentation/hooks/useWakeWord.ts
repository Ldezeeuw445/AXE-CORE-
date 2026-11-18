/**
 * Opt-in "hey axe" wake. Standaard uit: geen achtergrond-mic.
 * Alleen als Luka hem in Settings aanzet, luistert een lichte herkenner
 * naar de frase en opent dan dezelfde mic-tik als de knop.
 */
import { useEffect, useState } from 'react';
import { loadSetting } from '@/infrastructure/persistence/userSettingsService';
import { isWakeZin, WAKE_SLEUTEL, wakeAanVan } from '@/domain/voice/luisterBeleid';
import { useVoiceStore } from '@/presentation/store/voiceStore';
import { magLuisteren } from '@/infrastructure/gateways/stemVloer';

const EVT = 'axe-wake-changed';

export function meldWakeKeuze(aan: boolean) {
  try { window.dispatchEvent(new CustomEvent(EVT, { detail: aan })); } catch { /* */ }
}

type RecCtor = new () => {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((ev: { resultIndex: number; results: ArrayLike<{ 0?: { transcript?: string } }> }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

function getRec(): RecCtor | null {
  const w = window as unknown as { SpeechRecognition?: RecCtor; webkitSpeechRecognition?: RecCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/**
 * Alleen het hoofdvenster luistert.
 *
 * 17 nov, ~/.axe/focus.log op de Mac mini: elke ~10 s "focus axe-float-axe".
 * App.tsx draait in elk AXE-venster, dus ook in de notch, en daar zat deze
 * herkenner dus ook in. Spraakherkenning stopt na een paar seconden stilte en
 * `onend` start hem opnieuw -- en elke herstart maakte de notch het actieve
 * venster: Luka's toetsenbord sprong weg, midden in een zin op zijn andere
 * scherm. Eén luisteraar is genoeg; het hoofdvenster is die ene.
 */
export function isHoofdvenster(w: unknown = typeof window === 'undefined' ? undefined : window): boolean {
  const meta = (w as { __TAURI_INTERNALS__?: { metadata?: { currentWindow?: { label?: string } } } } | undefined)
    ?.__TAURI_INTERNALS__?.metadata;
  if (!meta) return true; // browser of telefoon: één venster
  return (meta.currentWindow?.label ?? 'main') === 'main';
}

export function useWakeWord() {
  const [aan, setAan] = useState(false);

  useEffect(() => {
    void loadSetting(WAKE_SLEUTEL, false).then((v) => setAan(wakeAanVan(v)));
    const op = (e: Event) => setAan(wakeAanVan((e as CustomEvent<boolean>).detail));
    window.addEventListener(EVT, op);
    return () => window.removeEventListener(EVT, op);
  }, []);

  useEffect(() => {
    if (!aan) return;
    if (!isHoofdvenster()) return;
    const Ctor = getRec();
    if (!Ctor) return;
    let stop = false;
    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = false;
    rec.lang = 'nl-NL';
    rec.onresult = (ev: { resultIndex: number; results: ArrayLike<{ 0?: { transcript?: string } }> }) => {
      let tekst = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        tekst += ev.results[i]?.[0]?.transcript ?? '';
      }
      if (!isWakeZin(tekst)) return;
      if (useVoiceStore.getState().voiceStatus !== 'idle') return;
      // ADR-01: hoort een andere Mac het ook, dan luistert er maar één.
      void magLuisteren('wake').then((b) => {
        const voice = useVoiceStore.getState();
        if (b.winner && voice.voiceStatus === 'idle') void voice.startListening();
      });
    };
    /* 18 nov, focus.log Mac mini (na de notch-fix): nu elke ~10 s 'focus main'.
       Spraakherkenning stopt na stilte en onend startte hem meteen opnieuw; in
       WebKit maakt elke start het venster actief, dus AXE trok elke keer het
       toetsenbord weg uit de app waar Luka in zat. Nu herstart hij alleen als
       AXE zelf vooraan staat; anders wacht hij tot Luka terugkomt. */
    let wachtOpFocus = false;
    const start = () => {
      if (stop || !aan) return;
      if (typeof document !== 'undefined' && !document.hasFocus()) { wachtOpFocus = true; return; }
      wachtOpFocus = false;
      try { rec.start(); } catch { /* */ }
    };
    const opFocus = () => { if (wachtOpFocus) start(); };
    rec.onend = start;
    window.addEventListener('focus', opFocus);
    start();
    return () => {
      stop = true;
      window.removeEventListener('focus', opFocus);
      try { rec.stop(); } catch { /* */ }
    };
  }, [aan]);
}
