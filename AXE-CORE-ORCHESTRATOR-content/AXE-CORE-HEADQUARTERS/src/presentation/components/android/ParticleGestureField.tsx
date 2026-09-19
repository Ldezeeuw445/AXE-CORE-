/**
 * Ronde particle-velden als PIN-oppervlak.
 *
 * Natuurkunde uit com.particlequickactions.ParticleShaders (SAND / axe-config):
 * eenheidscirkel, veer terug naar huis, vinger duwt + sleept. Slagen gaan
 * naar de unistroke-herkenner — het veld ís de PIN.
 */
import { useEffect, useRef } from 'react';
import type { GesturePoint } from '@/domain/gestureTemplates';

const COUNT = 4200;
const RADIUS = 0.86;
const SPRING = 4.0;
const DAMPING = 3.6;
const POINTER_RADIUS = 0.26;
const POINTER_FORCE = 6.0;
const POINT_SIZE = 2.4;

type Particle = {
  x: number; y: number; vx: number; vy: number;
  bx: number; by: number; seed: number; tint: number;
};

function hash11(p: number): number {
  let x = ((p * 0.1031) % 1 + 1) % 1;
  x *= x + 33.33;
  x *= x + x;
  return ((x % 1) + 1) % 1;
}

export function ParticleGestureField({
  onStroke,
  disabled = false,
}: {
  onStroke: (points: GesturePoint[]) => void;
  disabled?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const onStrokeRef = useRef(onStroke);
  const disabledRef = useRef(disabled);
  useEffect(() => { onStrokeRef.current = onStroke; }, [onStroke]);
  useEffect(() => { disabledRef.current = disabled; }, [disabled]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const particles: Particle[] = [];
    for (let i = 0; i < COUNT; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random());
      particles.push({
        x: 0, y: 0, vx: 0, vy: 0,
        bx: Math.cos(a) * r,
        by: Math.sin(a) * r,
        seed: Math.random(),
        tint: Math.random(),
      });
    }

    let w = 1;
    let h = 1;
    let dpr = 1;
    let raf = 0;
    let last = 0;
    let pointerActive = false;
    let px = 0;
    let py = 0;
    let pvx = 0;
    let pvy = 0;
    let lastPx = 0;
    let lastPy = 0;
    const stroke: GesturePoint[] = [];

    const fit = () => {
      const rect = wrap.getBoundingClientRect();
      w = Math.max(1, rect.width);
      h = Math.max(1, rect.height);
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
    };

    const toNorm = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const scale = Math.min(rect.width, rect.height) / 2;
      return {
        x: (clientX - cx) / scale,
        y: (clientY - cy) / scale,
        px: clientX - rect.left,
        py: clientY - rect.top,
      };
    };

    const omlaag = (e: PointerEvent) => {
      if (disabledRef.current) return;
      canvas.setPointerCapture(e.pointerId);
      const n = toNorm(e.clientX, e.clientY);
      pointerActive = true;
      px = n.x;
      py = n.y;
      lastPx = n.x;
      lastPy = n.y;
      pvx = 0;
      pvy = 0;
      stroke.length = 0;
      stroke.push({ x: n.px, y: n.py });
    };
    const beweeg = (e: PointerEvent) => {
      if (!pointerActive) return;
      const n = toNorm(e.clientX, e.clientY);
      pvx = n.x - lastPx;
      pvy = n.y - lastPy;
      lastPx = n.x;
      lastPy = n.y;
      px = n.x;
      py = n.y;
      const last = stroke[stroke.length - 1];
      if (!last || Math.hypot(n.px - last.x, n.py - last.y) >= 1.5) {
        stroke.push({ x: n.px, y: n.py });
      }
    };
    const los = () => {
      if (!pointerActive) return;
      pointerActive = false;
      pvx = 0;
      pvy = 0;
      if (stroke.length >= 4) onStrokeRef.current(stroke.slice());
      stroke.length = 0;
    };

    canvas.addEventListener('pointerdown', omlaag);
    canvas.addEventListener('pointermove', beweeg);
    canvas.addEventListener('pointerup', los);
    canvas.addEventListener('pointercancel', los);

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const lus = (nu: number) => {
      raf = requestAnimationFrame(lus);
      const dt = last ? Math.min(0.033, (nu - last) / 1000) : 0.016;
      last = nu;
      if (!ctx) return;

      const scale = Math.min(w, h) / 2;
      const cx = w / 2;
      const cy = h / 2;

      for (const p of particles) {
        const homeX = p.bx * RADIUS;
        const homeY = p.by * RADIUS;
        let ax = (homeX - p.x) * SPRING;
        let ay = (homeY - p.y) * SPRING;
        if (pointerActive) {
          const dx = p.x - px;
          const dy = p.y - py;
          const dist = Math.hypot(dx, dy);
          const r = Math.max(POINTER_RADIUS, 1e-4);
          if (dist < r) {
            let falloff = 1 - dist / r;
            falloff *= falloff;
            let dirx: number;
            let diry: number;
            if (dist > 1e-5) {
              dirx = dx / dist;
              diry = dy / dist;
            } else {
              dirx = hash11(p.seed) * 2 - 1;
              diry = hash11(p.seed + 7) * 2 - 1;
              const n = Math.hypot(dirx, diry) || 1;
              dirx /= n;
              diry /= n;
            }
            ax += dirx * POINTER_FORCE * falloff;
            ay += diry * POINTER_FORCE * falloff;
            ax += pvx * POINTER_FORCE * falloff * 0.45;
            ay += pvy * POINTER_FORCE * falloff * 0.45;
          }
        }
        p.vx += ax * dt;
        p.vy += ay * dt;
        const damp = Math.exp(-DAMPING * dt);
        p.vx *= damp;
        p.vy *= damp;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'lighter';
      for (const p of particles) {
        const speed = Math.hypot(p.vx, p.vy);
        const glow = Math.min(1.4, speed * 1.1);
        const k = Math.max(0, Math.min(1, (0.13 - p.tint) / 0.13));
        const r = 0.80 + (0.28 - 0.80) * k;
        const g = 0.86 + (0.94 - 0.86) * k;
        const b = 0.89 + (1.00 - 0.89) * k;
        const alpha = 0.5 * (0.30 + 0.70 * hash11(p.seed * 3)) * (1 + k * 0.45) * (1 + glow * 0.5);
        const size = Math.max(1, POINT_SIZE * (0.7 + 0.7 * hash11(p.seed * 11)));
        ctx.fillStyle = `rgba(${Math.round((r * (1 + glow * 0.75)) * 255)},${Math.round((g * (1 + glow * 0.75)) * 255)},${Math.round((b * (1 + glow * 0.75)) * 255)},${Math.min(1, alpha)})`;
        ctx.beginPath();
        ctx.arc(cx + p.x * scale, cy + p.y * scale, size * 0.55, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
    };

    fit();
    raf = requestAnimationFrame(lus);
    const ro = new ResizeObserver(fit);
    ro.observe(wrap);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener('pointerdown', omlaag);
      canvas.removeEventListener('pointermove', beweeg);
      canvas.removeEventListener('pointerup', los);
      canvas.removeEventListener('pointercancel', los);
    };
  }, []);

  return (
    <div ref={wrapRef} className="absolute inset-0">
      <canvas
        ref={canvasRef}
        className="block h-full w-full touch-none"
        style={{ touchAction: 'none', cursor: disabled ? 'default' : 'crosshair' }}
        aria-label="Particle gesture field"
      />
    </div>
  );
}
