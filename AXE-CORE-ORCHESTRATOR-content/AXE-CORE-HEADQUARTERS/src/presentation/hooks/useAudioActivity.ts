import { useEffect, useRef, useState } from 'react';

/**
 * One small audio meter used only for presence visuals.
 *
 * It does not transcribe, record, persist, upload or otherwise consume the
 * microphone stream. SpeechRecognition/VoiceBeam remain responsible for their
 * own jobs; this hook only measures RMS so the colorful idle pulse can yield
 * to the inner beam on REAL audio instead of a boolean "listening" state.
 */
export function useAudioActivity(
  stream: MediaStream | null | undefined,
  fallbackLevel?: () => number,
): { level: number; mix: number; active: boolean } {
  const [level, setLevel] = useState(0);
  const [mix, setMix] = useState(0);
  const mixRef = useRef(0);

  useEffect(() => {
    let raf = 0;
    let ctx: AudioContext | null = null;
    let analyser: AnalyserNode | null = null;
    let data: Uint8Array<ArrayBuffer> | null = null;
    let source: MediaStreamAudioSourceNode | null = null;

    if (stream?.getAudioTracks().some(t => t.readyState === 'live')) {
      try {
        ctx = new AudioContext();
        analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        data = new Uint8Array(analyser.fftSize);
        source = ctx.createMediaStreamSource(stream);
        source.connect(analyser);
      } catch {
        analyser = null;
        data = null;
      }
    }

    const frame = () => {
      let next = 0;
      if (analyser && data) {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (const v of data) {
          const x = (v - 128) / 128;
          sum += x * x;
        }
        next = Math.min(1, Math.sqrt(sum / data.length) * 3.2);
      } else if (fallbackLevel) {
        try { next = Math.max(0, Math.min(1, fallbackLevel())); } catch { next = 0; }
      }

      // Noise gate + asymmetric attack/release. This is intentionally based on
      // measured energy, not voiceStatus. A silent open microphone therefore
      // leaves the existing colorful outer pulse exactly where it was.
      const target = next >= 0.045 ? 1 : next <= 0.018 ? 0 : mixRef.current;
      const speed = target > mixRef.current ? 0.34 : 0.095;
      mixRef.current += (target - mixRef.current) * speed;
      if (mixRef.current < 0.01) mixRef.current = 0;
      if (mixRef.current > 0.99) mixRef.current = 1;

      setLevel(next);
      setMix(mixRef.current);
      raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      try { source?.disconnect(); } catch { /* noop */ }
      try { analyser?.disconnect(); } catch { /* noop */ }
      if (ctx && ctx.state !== 'closed') void ctx.close().catch(() => {});
      mixRef.current = 0;
      setLevel(0);
      setMix(0);
    };
  }, [stream, fallbackLevel]);

  return { level, mix, active: mix > 0.08 };
}
