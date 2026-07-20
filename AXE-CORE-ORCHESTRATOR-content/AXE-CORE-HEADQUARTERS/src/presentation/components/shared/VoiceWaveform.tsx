import React, { useEffect, useRef } from 'react';

interface VoiceWaveformProps {
  isActive?: boolean;
  barCount?: number;
  className?: string;
}

export const VoiceWaveform = React.memo(function VoiceWaveform({
  isActive = false,
  barCount = 24,
  className,
}: VoiceWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);
  const timeRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;
    const barWidth = 3;
    const gap = 2;

    function animate() {
      timeRef.current += 0.05;
      const t = timeRef.current;
      if (!ctx) return;
      ctx.clearRect(0, 0, w, h);

      for (let i = 0; i < barCount; i++) {
        let barHeight: number;

        if (isActive) {
          const wave1 = Math.sin(t * 2 + i * 0.4) * 0.5 + 0.5;
          const wave2 = Math.sin(t * 3.5 + i * 0.7) * 0.3;
          const wave3 = Math.cos(t * 1.8 + i * 0.3) * 0.2;
          barHeight = (wave1 + wave2 + wave3) * h * 0.85;
          barHeight = Math.max(2, Math.min(h, barHeight));
        } else {
          barHeight = 2 + Math.sin(t * 0.8 + i * 0.3) * 2;
        }

        const x = i * (barWidth + gap) + (w - barCount * (barWidth + gap)) / 2;
        const y = (h - barHeight) / 2;

        const gradient = ctx.createLinearGradient(0, y, 0, y + barHeight);
        if (isActive) {
          gradient.addColorStop(0, 'rgba(34, 211, 238, 0.1)');
          gradient.addColorStop(0.5, 'rgba(34, 211, 238, 0.7)');
          gradient.addColorStop(1, 'rgba(34, 211, 238, 0.1)');
        } else {
          gradient.addColorStop(0, 'rgba(34, 211, 238, 0.05)');
          gradient.addColorStop(0.5, 'rgba(34, 211, 238, 0.2)');
          gradient.addColorStop(1, 'rgba(34, 211, 238, 0.05)');
        }

        ctx.fillStyle = gradient;
        ctx.beginPath();
        (ctx as unknown as { roundRect: (x: number, y: number, w: number, h: number, r: number) => void }).roundRect(x, y, barWidth, barHeight, 1.5);
        ctx.fill();

        if (isActive) {
          ctx.shadowColor = 'rgba(34, 211, 238, 0.4)';
          ctx.shadowBlur = 8;
          ctx.fillStyle = 'rgba(34, 211, 238, 0.6)';
          ctx.beginPath();
          (ctx as unknown as { roundRect: (x: number, y: number, w: number, h: number, r: number) => void }).roundRect(x, y + barHeight * 0.35, barWidth, barHeight * 0.3, 1);
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      }

      animationRef.current = requestAnimationFrame(animate);
    }

    animate();

    return () => {
      cancelAnimationFrame(animationRef.current);
    };
  }, [isActive, barCount]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ width: '100%', height: '32px' }}
    />
  );
});
