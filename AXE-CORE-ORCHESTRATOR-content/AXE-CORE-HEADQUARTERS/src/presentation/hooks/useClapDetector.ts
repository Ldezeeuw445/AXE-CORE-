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

const CLAP_WINDOW_MS = 1200;     // claps must land within this rolling window
const CLAP_REFRACTORY_MS = 220;  // ignore additional peaks for this long after a clap (avoid double-counting the same clap's decay)
const CLAP_THRESHOLD = 0.60;     // normalized peak amplitude (0-1) — raised to avoid false triggers from background noise
const CLAPS_REQUIRED = 3;        // 3 sharp claps required to trigger (was 2 — too easy to false-fire)

export function useClapDetector(enabled: boolean, onClap: () => void) {
  const onClapRef = useRef(onClap);
  onClapRef.current = onClap;

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
            if (clapTimes.length >= CLAPS_REQUIRED) {
              clapTimes.length = 0;
              onClapRef.current();
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
