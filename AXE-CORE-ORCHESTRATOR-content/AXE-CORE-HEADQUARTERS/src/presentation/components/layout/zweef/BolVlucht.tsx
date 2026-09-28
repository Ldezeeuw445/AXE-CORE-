/**
 * De vlucht: deeltjes die uit de bol naar een deel van het scherm gaan, daar
 * even de rand van dat deel volgen met één regel over wat AXE doet, en terug.
 *
 * Eén schermvullend canvas in een portal, alleen zolang er een vlucht is --
 * daarna wordt het afgebroken. In rust kost dit dus niets (zie de traagheid
 * van 13 september: niets hier tekent als er niets gebeurt).
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { boog, randPunt, type Punt2, type Rechthoek } from '@/domain/bolVlucht';

export interface Vlucht {
  van: Punt2;
  straal: number;
  rect: Rechthoek;
  label: string;
  kleur: string;
  id: number;
}

/* Luka, 23 sep 2026: "die particles mogen wel wat subtieler en rustiger".
   Was 140 deeltjes tot 2,6px met gloed 8, heen in 0,7 s, bogen tot 160px en
   een trilling van 180ms. Nu: de helft, kleiner en doorzichtiger, trager heen
   en terug in zachtere bogen, en een kalme drift langs de rand. */
const HEEN = 1050, BLIJF = 2000, TERUG = 950;
const AANTAL = 70;
const BOCHT = 90;
const MAX_ALFA = 0.5;

export function BolVlucht({ vlucht, klaar }: { vlucht: Vlucht | null; klaar: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [labelZichtbaar, setLabelZichtbaar] = useState(false);

  useEffect(() => {
    if (!vlucht) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) { klaar(); return; }
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const stil = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const deeltjes = Array.from({ length: AANTAL }, (_, i) => {
      const hoek = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * vlucht.straal;
      return {
        start: { x: vlucht.van.x + Math.cos(hoek) * r, y: vlucht.van.y + Math.sin(hoek) * r },
        t: i / AANTAL,
        bocht: (Math.random() - 0.5) * BOCHT,
        vertraging: Math.random() * 260,
        grootte: 0.6 + Math.random() * 1.0,
      };
    });

    let frame = 0;
    const begin = performance.now();
    const totaal = stil ? BLIJF : HEEN + BLIJF + TERUG;
    setLabelZichtbaar(false);

    const lus = (nu: number) => {
      const tijd = nu - begin;
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      const draai = tijd / 14000;
      ctx.fillStyle = vlucht.kleur;
      ctx.shadowColor = vlucht.kleur;
      ctx.shadowBlur = 4;

      for (const d of deeltjes) {
        const doel = randPunt(vlucht.rect, d.t + draai);
        let p: Punt2; let alfa = 1;
        if (stil) {
          p = doel; alfa = Math.sin(Math.PI * Math.min(1, tijd / BLIJF));
        } else if (tijd < HEEN + d.vertraging) {
          p = boog(d.start, doel, Math.max(0, tijd - d.vertraging) / HEEN, d.bocht);
        } else if (tijd < HEEN + BLIJF) {
          const tril = Math.sin((tijd + d.vertraging * 20) / 520) * 0.6;
          p = { x: doel.x + tril, y: doel.y - tril };
        } else {
          const u = (tijd - HEEN - BLIJF) / TERUG;
          p = boog(doel, d.start, u, -d.bocht);
          alfa = 1 - Math.max(0, u - 0.7) / 0.3;
        }
        ctx.globalAlpha = Math.max(0, Math.min(1, alfa)) * MAX_ALFA;
        ctx.beginPath();
        ctx.arc(p.x, p.y, d.grootte, 0, Math.PI * 2);
        ctx.fill();
      }

      if (tijd > (stil ? 0 : HEEN * 0.8) && tijd < (stil ? BLIJF : HEEN + BLIJF)) setLabelZichtbaar(true);
      else setLabelZichtbaar(false);

      if (tijd < totaal) frame = requestAnimationFrame(lus);
      else { ctx.clearRect(0, 0, window.innerWidth, window.innerHeight); klaar(); }
    };
    frame = requestAnimationFrame(lus);
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vlucht?.id]);

  if (!vlucht || typeof document === 'undefined') return null;
  // Groot doel (een paneel): de regel BINNEN de linkerbovenhoek, want erboven
  // ligt vaak de topbalk (gemeten 14 sep: over "Command Center" heen). Klein
  // doel (een nav-icoon): erboven, of eronder als daar geen ruimte is.
  const groot = vlucht.rect.h > 120 && vlucht.rect.b > 200;
  const labelTop = groot
    ? vlucht.rect.y + 12
    : vlucht.rect.y > 48 ? vlucht.rect.y - 38 : vlucht.rect.y + vlucht.rect.h + 10;
  const labelLinks = groot ? vlucht.rect.x + 12 : vlucht.rect.x + vlucht.rect.b / 2 - 160;
  return createPortal(
    <div className="axe-bolvlucht" aria-live="polite">
      <canvas ref={canvasRef} className="axe-bolvlucht__canvas" />
      <div
        className={`axe-ruit axe-bolvlucht__label${labelZichtbaar ? ' axe-bolvlucht__label--aan' : ''}`}
        style={{
          left: Math.max(12, Math.min(window.innerWidth - 432, labelLinks)),
          top: labelTop,
          color: vlucht.kleur,
        }}
      >
        <span className="axe-bolvlucht__wie">AXE</span> {vlucht.label}
      </div>
    </div>,
    document.body,
  );
}
