/**
 * Wat er ACHTER de plaat zit.
 *
 * De plaat (.axe-shell) is semi-transparant met een backdrop-filter. Die
 * filter vervaagt alleen wat achter het element ligt -- dus deze lagen staan
 * fixed op z-index 0, buiten de schil, en de schil erover blurt ze. Zou dit
 * IN de schil staan, dan vervaagt de filter het niet en zie je scherpe sterren
 * in plaats van glas.
 *
 * Drie lagen:
 *   sky      de kleurgloed, via --glow in design/axe-look.css
 *   galaxy   een spiraal met een lichte kern; het beeld dat het glas tot glas
 *            maakt. In de zwarte stand ontkleurt de plaat hem (saturate 0),
 *            in de lichte komt hij gekleurd door -- één render, twee uitkomsten
 *   canopy   het dak dat naar beneden wegvalt, plus de onderrand-vervaging
 *
 * De galaxy staat hier en niet in CSS omdat hij beweegt. Traag: als het opvalt
 * als beweging is het te veel.
 */
import { useEffect, useRef } from 'react';

interface Star {
  r: number; a: number; grootte: number; helder: number;
  reus: boolean; flonker: number; snelheid: number; warm: boolean;
}

function useGalaxy(count: number) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let stars: Star[] = [];
    let w = 0, h = 0, t = 0, frame = 0;

    const fit = () => {
      const rect = canvas.getBoundingClientRect();
      const d = window.devicePixelRatio || 1;
      w = canvas.width = Math.max(1, Math.round((rect.width || window.innerWidth) * d));
      h = canvas.height = Math.max(1, Math.round((rect.height || window.innerHeight) * d));
      // Twee spiraalarmen. De spreiding loopt op met de straal, zodat het
      // buitenwerk rafelt als een echte arm en niet als een getekende boog.
      stars = Array.from({ length: count }, (_, i) => {
        const arm = i % 2;
        const t0 = Math.pow(Math.random(), 0.62);
        const hoek = t0 * 3.1 + arm * Math.PI + (Math.random() - 0.5) * (0.35 + t0 * 0.9);
        const straal = t0 * 0.48 + Math.random() * 0.035;
        // Fors groter dan een sterrenveld normaal is, met opzet: door de
        // vervaging heen blijft van een punt van één pixel niets over.
        const reus = Math.random() < 0.07;
        return {
          r: straal, a: hoek,
          grootte: (reus ? 3.2 + Math.random() * 2.4 : 0.9 + Math.random() * 1.9) * d,
          helder: reus ? 0.8 + Math.random() * 0.2 : 0.3 + Math.random() * 0.6,
          reus,
          flonker: Math.random() * 6.3,
          snelheid: Math.random() * 0.004 + 0.001,
          warm: Math.random() < 0.12,
        };
      });
    };

    const draw = () => {
      if (!w) fit();
      ctx.clearRect(0, 0, w, h);
      t += 0.00035;

      const cx = w / 2, cy = h * 0.44, R = Math.min(w, h);

      // De kern: een wijde gloed en een felle punt. Eén gradient geeft óf een
      // vlek óf een stip, nooit allebei.
      const wijd = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 0.40);
      wijd.addColorStop(0, 'rgba(190,205,235,.30)');
      wijd.addColorStop(0.35, 'rgba(120,140,190,.11)');
      wijd.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = wijd; ctx.fillRect(0, 0, w, h);

      const kern = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 0.085);
      kern.addColorStop(0, 'rgba(255,252,244,.85)');
      kern.addColorStop(0.5, 'rgba(226,222,240,.28)');
      kern.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = kern; ctx.fillRect(0, 0, w, h);

      for (const p of stars) {
        p.flonker += p.snelheid;
        const a = p.a + t / (p.r + 0.12);          // binnenin sneller, zoals echt
        const px = cx + Math.cos(a) * p.r * R;
        const py = cy + Math.sin(a) * p.r * R * 0.42;   // afgeplat: schuine blik
        const o = p.helder * (0.55 + Math.abs(Math.sin(p.flonker)) * 0.45);
        const rgb = p.warm ? '255,236,205' : '214,228,255';

        // De grote krijgen een halo. Zonder dat blijft een ster een schijfje
        // met een harde rand -- precies wat het glas wegvaagt; een gloed
        // overleeft de vervaging wel.
        if (p.reus) {
          const g = ctx.createRadialGradient(px, py, 0, px, py, p.grootte * 4.5);
          g.addColorStop(0, 'rgba(' + rgb + ',' + o * 0.55 + ')');
          g.addColorStop(1, 'rgba(' + rgb + ',0)');
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(px, py, p.grootte * 4.5, 0, 6.284); ctx.fill();
        }
        ctx.fillStyle = 'rgba(' + rgb + ',' + o + ')';
        ctx.beginPath(); ctx.arc(px, py, p.grootte, 0, 6.284); ctx.fill();
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
  const galaxy = useGalaxy(900);

  return (
    <div className="axe-atmosphere" aria-hidden="true">
      <div className="axe-sky" />
      <canvas ref={galaxy} className="axe-galaxy" />
      <div className="axe-canopy" />
      <div className="axe-band"><i /><i /><i /></div>
    </div>
  );
}
