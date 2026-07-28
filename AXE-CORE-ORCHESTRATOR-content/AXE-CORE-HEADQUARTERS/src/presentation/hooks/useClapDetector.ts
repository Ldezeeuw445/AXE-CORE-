/**
 * useClapDetector.ts
 * ------------------------------------------------------------------
 * Listens on the microphone for 3 sharp claps in quick succession and
 * fires a callback — a hands-free way to wake AXE up, like the spacebar
 * shortcut but without needing to be at the keyboard, and (unlike the
 * keyboard) it still works while the window is hidden (closed to tray).
 *
 * Uses a ScriptProcessorNode instead of requestAnimationFrame on purpose:
 * rAF is throttled to near-zero by the webview as soon as the window isn't
 * visible (document.visibilityState === 'hidden'), which is exactly the
 * state this needs to work in — the whole point of "clap to bring the
 * window back" is that the window is currently hidden. Audio node
 * callbacks run on the audio-processing thread, driven by the audio
 * hardware's buffer rate, independent of page visibility.
 * ScriptProcessorNode is deprecated in favor of AudioWorkletNode, but the
 * worklet replacement needs its own module file loaded via a resolvable
 * URL (audioContext.audioWorklet.addModule(url)) — extra build/packaging
 * complexity for a Tauri app with no upside here, since ScriptProcessorNode
 * remains fully supported in every engine this app targets.
 *
 * Opt-in only (mic stays off until the user enables it in Settings, see
 * 'axe_clap_activate_enabled'), because it needs a persistent mic stream.
 */
import { useEffect, useRef } from 'react';

const CLAP_WINDOW_MS = 1200;     // claps must land within this rolling window
const CLAP_REFRACTORY_MS = 220;  // ignore additional peaks for this long after a clap (avoid double-counting the same clap's decay)
const CLAP_THRESHOLD = 0.60;     // normalized peak amplitude (0-1) — raised to avoid false triggers from background noise
const CLAPS_REQUIRED = 3;        // 3 sharp claps required to trigger (was 2 — too easy to false-fire)
const PROCESSOR_BUFFER_SIZE = 2048; // ~46ms at 44.1kHz — frequent enough to catch a clap transient without excessive callback overhead

export function useClapDetector(enabled: boolean, onClap: () => void) {
  const onClapRef = useRef(onClap);
  onClapRef.current = onClap;

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let audioCtx: AudioContext | null = null;
    let stream: MediaStream | null = null;
    let processor: ScriptProcessorNode | null = null;
    const clapTimes: number[] = [];
    let lastClapAt = 0;

    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }

        audioCtx = new AudioContext();
        const source = audioCtx.createMediaStreamSource(stream);
        // 1 in / 1 out channel — this node doesn't emit audio, it only
        // observes it, but Web Audio requires a real output to keep the
        // graph (and therefore the callback) alive.
        processor = audioCtx.createScriptProcessor(PROCESSOR_BUFFER_SIZE, 1, 1);
        source.connect(processor);
        // Connect through a silent gain, not audioCtx.destination directly —
        // keeps the processing graph active without looping the mic audibly
        // back to the speakers.
        const silentGain = audioCtx.createGain();
        silentGain.gain.value = 0;
        processor.connect(silentGain);
        silentGain.connect(audioCtx.destination);

        processor.onaudioprocess = (event) => {
          if (cancelled) return;
          const buffer = event.inputBuffer.getChannelData(0);
          let peak = 0;
          for (let i = 0; i < buffer.length; i++) {
            const v = Math.abs(buffer[i]);
            if (v > peak) peak = v;
          }

          const now = performance.now();
          if (peak > CLAP_THRESHOLD && now - lastClapAt > CLAP_REFRACTORY_MS) {
            lastClapAt = now;
            clapTimes.push(now);
            while (clapTimes.length && now - clapTimes[0] > CLAP_WINDOW_MS) clapTimes.shift();
            if (clapTimes.length >= CLAPS_REQUIRED) {
              clapTimes.length = 0;
              onClapRef.current();
            }
          }
        };
      } catch {
        // Mic permission denied or unavailable — silently stay inactive.
      }
    })();

    return () => {
      cancelled = true;
      if (processor) processor.onaudioprocess = null;
      processor?.disconnect();
      stream?.getTracks().forEach(t => t.stop());
      void audioCtx?.close();
    };
  }, [enabled]);
}
