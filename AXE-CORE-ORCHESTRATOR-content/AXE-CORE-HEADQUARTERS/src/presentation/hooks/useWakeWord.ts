/**
 * Opt-in "hey axe" wake. Standaard uit: geen achtergrond-mic.
 * Alleen als Luka hem in Settings aanzet, luistert een lichte herkenner
 * naar de frase en opent dan dezelfde mic-tik als de knop.
 */
import { useEffect, useState } from 'react';
import { loadSetting } from '@/infrastructure/persistence/userSettingsService';
import { isWakeZin, WAKE_SLEUTEL, wakeAanVan } from '@/domain/voice/luisterBeleid';
import { useVoiceStore } from '@/presentation/store/voiceStore';

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
      const voice = useVoiceStore.getState();
      if (voice.voiceStatus !== 'idle') return;
      void voice.startListening();
    };
    rec.onend = () => {
      if (stop || !aan) return;
      try { rec.start(); } catch { /* */ }
    };
    try { rec.start(); } catch { /* */ }
    return () => {
      stop = true;
      try { rec.stop(); } catch { /* */ }
    };
  }, [aan]);
}
