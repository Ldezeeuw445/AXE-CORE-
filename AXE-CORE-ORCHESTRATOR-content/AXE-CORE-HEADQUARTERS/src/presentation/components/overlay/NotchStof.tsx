/**
 * Stof bij de groet (Luka 27 nov t78u: "heel fijn stof dat in- en uitfadet,
 * canvas, GPU-zuinig").
 *
 * Eén <canvas> per kaart met een paar dozijn stofjes van een halve pixel.
 * Elk stofje drijft traag omhoog, komt op en verdwijnt weer (sinus over zijn
 * leven), en wordt daarna ergens anders opnieuw geboren. Meer stof dicht bij
 * AXE (links), weinig verderop. Eén rAF-lus, gedeeld door alle stofjes; stil
 * als het venster verborgen is; niets als minder beweging gevraagd is.
 *
 * v4 had hier CSS-stof dat background-position animeerde: dat is elke frame
 * opnieuw schilderen (paint), en je zag de rasters als stippelkolommen.
 */
import { useEffect, useRef } from 'react';

type Stofje = { x: number; y: number; vx: number; vy: number; r: number; a: number; t: number; leven: number };

function minderBeweging(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function NotchStof({ bron = 0.08 }: { /** Waar AXE staat (0 = links, 1 = rechts). */ bron?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const doek = ref.current;
    if (!doek || minderBeweging()) return;
    const ctx = doek.getContext('2d', { alpha: true });
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let b = 0, h = 0;
    let stof: Stofje[] = [];
    const nieuw = (s: Stofje | null, jong: boolean): Stofje => {
      // Twee derde dicht bij AXE (gauss-achtig rond `bron`), de rest overal.
      const bijAxe = Math.random() < 0.66;
      const x = bijAxe
        ? (bron + (Math.random() + Math.random() + Math.random() - 1.5) * 0.12) * b
        : Math.random() * b;
      const o = s ?? ({} as Stofje);
      o.x = x; o.y = Math.random() * h;
      o.vx = (Math.random() - 0.5) * 3;
      o.vy = -(1.5 + Math.random() * 4.5);
      o.r = 0.35 + Math.random() * Math.random() * 0.75;
      o.a = 0.18 + Math.random() * (bijAxe ? 0.5 : 0.28);
      o.leven = 2.8 + Math.random() * 4.2;
      o.t = jong ? 0 : Math.random() * o.leven;
      return o;
    };
    const maat = () => {
      const r = doek.getBoundingClientRect();
      b = r.width; h = r.height;
      doek.width = Math.max(1, Math.round(b * dpr));
      doek.height = Math.max(1, Math.round(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const aantal = Math.min(70, Math.round((b * h) / 1600));
      stof = Array.from({ length: aantal }, () => nieuw(null, false));
    };
    maat();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(maat) : null;
    ro?.observe(doek);

    let frame = 0;
    let vorige = performance.now();
    const teken = (nu: number) => {
      frame = requestAnimationFrame(teken);
      const dt = Math.min(0.05, (nu - vorige) / 1000);
      vorige = nu;
      if (document.hidden) return;
      ctx.clearRect(0, 0, b, h);
      for (const s of stof) {
        s.t += dt;
        if (s.t >= s.leven) { nieuw(s, true); continue; }
        s.x += s.vx * dt; s.y += s.vy * dt;
        // Opkomen en weer verdwijnen; sin² is zachter dan een driehoek.
        const f = Math.sin((Math.PI * s.t) / s.leven);
        const alpha = s.a * f * f;
        if (alpha < 0.01) continue;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = s.r > 0.7 ? '#e6fbff' : '#ffffff';
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };
    frame = requestAnimationFrame(teken);
    return () => { cancelAnimationFrame(frame); ro?.disconnect(); };
  }, [bron]);

  return <canvas ref={ref} className="axe-ov__stofdoek" aria-hidden="true" />;
}
