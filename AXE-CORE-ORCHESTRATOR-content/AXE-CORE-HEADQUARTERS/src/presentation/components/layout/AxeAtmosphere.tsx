/**
 * De grond waar de app op ligt in de glasstand.
 *
 * Drie lagen, allemaal vast aan het scherm en niet aan de inhoud, zodat ze
 * achtergrond blijven in plaats van mee te scrollen:
 *
 *   sky     drie zachte lichtbronnen buiten de plaat
 *   canopy  het dak: donkerder bovenin, met een masker dat naar beneden
 *           wegvalt -- daar zit de progressieve vervaging in
 *   band    dezelfde vervaging langs de onderrand, waar de navigatie tegen
 *           de inhoud aan komt
 *
 * De sterren staan hier en niet in CSS omdat ze bewegen. Traag, en zacht: als
 * dit opvalt is het te veel. Het hoort alleen te voorkomen dat de achtergrond
 * dood aanvoelt.
 *
 * In de zwarte stand staat alles op opacity 0 (zie design/axe-look.css), maar
 * de tekenlus stopt dan ook -- een onzichtbare animatie die toch elk frame
 * rekent is precies het soort verspilling dat niemand ooit terugvindt.
 */
import { useEffect, useRef } from 'react';

function useStarfield(count: number) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let stars: Array<{ x: number; y: number; r: number; a: number; v: number }> = [];
    let width = 0;
    let height = 0;
    let frame = 0;

    const fit = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      width = canvas.width = Math.max(1, Math.round(rect.width * dpr));
      height = canvas.height = Math.max(1, Math.round(rect.height * dpr));
      stars = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        r: (Math.random() * 1.2 + 0.25) * dpr,
        a: Math.random(),
        v: Math.random() * 0.006 + 0.002,
      }));
    };

    const draw = () => {
      // Niet tekenen wanneer de stand hem toch verbergt.
      if (document.documentElement.dataset.look !== 'glass') {
        frame = requestAnimationFrame(draw);
        return;
      }
      if (!width) fit();
      ctx.clearRect(0, 0, width, height);
      for (const s of stars) {
        s.a += s.v;
        ctx.fillStyle = `rgba(200,225,255,${0.16 + Math.abs(Math.sin(s.a)) * 0.5})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      frame = requestAnimationFrame(draw);
    };

    fit();
    frame = requestAnimationFrame(draw);
    window.addEventListener('resize', fit);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', fit);
    };
  }, [count]);

  return ref;
}

export function AxeAtmosphere() {
  const skyStars = useStarfield(140);
  const canopyStars = useStarfield(110);

  return (
    <>
      <div className="axe-sky" aria-hidden="true">
        <canvas ref={skyStars} className="axe-stars" />
      </div>
      <div className="axe-canopy" aria-hidden="true">
        <canvas ref={canopyStars} className="axe-canopy-stars" />
      </div>
      <div className="axe-band" aria-hidden="true">
        <i /><i /><i />
      </div>
    </>
  );
}
