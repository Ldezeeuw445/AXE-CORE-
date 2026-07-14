/**
 * useClapDetector.ts
 * ------------------------------------------------------------------
 * Listens on the microphone for 2-3 sharp claps in quick succession and
 * fires a callback — a hands-free way to wake AXE up, like the spacebar
 * shortcut but without needing to be at the keyboard.
 *
 * Opt-in only (mic stays off until the user enables it in Settings, see
 * 'axe_clap_activate_enabled'), because it needs a persistent mic stream.
 */
import { useEffect, useRef } from 'react';

const CLAP_WINDOW_MS = 1500;     // claps must land within this rolling window
const CLAP_REFRACTORY_MS = 180;  // ignore additional peaks for this long after a clap (avoid double-counting the same clap's decay)
const CLAP_THRESHOLD = 0.32;     // normalized peak amplitude (0-1) a clap must exceed
const CLAPS_REQUIRED = 2;        // 2 claps triggers; a 3rd within the window still counts

export interface ClapCallbacks {
  onClapCount?: (count: number) => void;
  onClapTrigger?: () => void;
}

export function useClapDetector(enabled: boolean, callbacks: ClapCallbacks | (() => void)) {
  const cbRef = useRef<ClapCallbacks>(typeof callbacks === 'function' ? { onClapTrigger: callbacks } : callbacks);
  cbRef.current = typeof callbacks === 'function' ? { onClapTrigger: callbacks } : callbacks;

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let audioCtx: AudioContext | null = null;
    let stream: MediaStream | null = null;
    let rafId = 0;
    const clapTimes: number[] = [];
    let lastClapAt = 0;

    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }

        audioCtx = new AudioContext();
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);

        const buffer = new Float32Array(analyser.fftSize);
        const tick = () => {
          if (cancelled) return;
          analyser.getFloatTimeDomainData(buffer);
          let peak = 0;
          for (let i = 0; i < buffer.length; i++) {
            const v = Math.abs(buffer[i]);
            if (v > peak) peak = v;
          }

          const now = performance.now();
          if (peak > CLAP_THRESHOLD && now - lastClapAt > CLAP_REFRACTORY_MS) {
            lastClapAt = now;
            clapTimes.push(now);
            // Drop claps outside the rolling window
            while (clapTimes.length && now - clapTimes[0] > CLAP_WINDOW_MS) clapTimes.shift();
            cbRef.current.onClapCount?.(clapTimes.length);
            if (clapTimes.length >= CLAPS_REQUIRED) {
              clapTimes.length = 0;
              cbRef.current.onClapTrigger?.();
            }
          }

          rafId = requestAnimationFrame(tick);
        };
        rafId = requestAnimationFrame(tick);
      } catch {
        // Mic permission denied or unavailable — silently stay inactive.
      }
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      stream?.getTracks().forEach(t => t.stop());
      void audioCtx?.close();
    };
  }, [enabled]);
}
