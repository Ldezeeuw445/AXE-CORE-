/**
 * Wat er ACHTER de plaat zit.
 *
 * De plaat (.axe-shell) is semi-transparant met een backdrop-filter. Die filter
 * vervaagt alleen wat achter het element ligt -- dus de gloed staat fixed op
 * z-index 0, buiten de schil, en de schil erover blurt hem tot glas.
 *
 * Het STERRENVELD staat juist bovenop de plaat (z-index 3). Door 15px
 * vervaging heen blijft van een ster van één pixel niets over; dan houd je
 * grijze mist over in plaats van punten. Op de plaat blijven het sterren.
 *
 * Drie lagen:
 *   axe-sky      de kleurgloed, via --glow in design/axe-look.css
 *   axe-stars    het veld, op de plaat
 *   axe-schemer  alleen in de glasstand: nacht om de sterren in te zetten,
 *                met progressieve vervaging naar de randen
 *
 * Deze opbouw komt uit demo/plaat/index.html -- de losse demo waarin het
 * ontwerp is uitgewerkt en beoordeeld. Wijk je hier af, wijk dan daar ook af,
 * anders lopen de twee uit elkaar en weet niemand meer welke de waarheid is.
 */
import { useEffect, useRef } from 'react';

/**
 * Een ster.
 *
 * Wat een hemel echt maakt is niet het aantal sterren maar hun VERDELING. Een
 * veld waarin elke ster ongeveer even fel is leest als korrel of als confetti;
 * een echte hemel heeft heel veel zwakke en een enkele felle. Die
 * machtsverdeling (m = random^3.4) is hier het belangrijkste ingrediënt --
 * belangrijker dan kleur of geflonker.
 */
interface Ster {
  x: number; y: number; r: number; a: number;
  halo: boolean; kleur: string; f: number; v: number;
}

/* Een ster is nooit grijs. Van heet naar koel: blauwwit, wit, geelwit, amber.
   Zwaartepunt op wit, anders wordt het bont. */
const KLEUR = ['168,196,255', '214,226,248', '255,252,244', '255,236,206', '255,214,170'];

function useSterren() {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const stil = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let sterren: Ster[] = [];
    let w = 0, h = 0, d = 1, frame = 0, t = 0;

    const fit = () => {
      const r = canvas.getBoundingClientRect();
      d = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.width = Math.max(1, Math.round(r.width * d));
      h = canvas.height = Math.max(1, Math.round(r.height * d));

      // Ongeveer één ster per 5200 CSS-pixels. Meer wordt ruis, minder leeg.
      const aantal = Math.round((r.width * r.height) / 5200);
      sterren = Array.from({ length: aantal }, () => {
        const m = Math.pow(Math.random(), 3.4);
        // y^1.5 duwt de verdeling naar boven: dichter bij de kop, ijler onderin,
        // waar hij anders met de scene zou gaan concurreren.
        return {
          x: Math.random(),
          y: Math.pow(Math.random(), 1.5),
          r: (0.45 + m * 1.7) * d,
          a: 0.1 + m * 0.62,
          halo: m > 0.92,
          kleur: KLEUR[Math.min(4, Math.floor(Math.pow(Math.random(), 1.6) * 5))],
          f: Math.random() * 6.283,
          // Traag en met kleine uitslag: je hoort het pas te zien als je erop
          // let. Grote uitslag leest als kerstverlichting.
          v: 0.0016 + Math.random() * 0.0042,
        };
      });
    };

    const teken = () => {
      if (!w) fit();
      ctx.clearRect(0, 0, w, h);
      for (const p of sterren) {
        const o = p.a * (0.82 + 0.18 * Math.sin(p.f + t * p.v * 60));
        const px = p.x * w, py = p.y * h;
        if (p.halo) {
          // Zonder halo blijft een felle ster een hard schijfje.
          const g = ctx.createRadialGradient(px, py, 0, px, py, p.r * 5.5);
          g.addColorStop(0, `rgba(${p.kleur},${(o * 0.34).toFixed(3)})`);
          g.addColorStop(1, `rgba(${p.kleur},0)`);
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(px, py, p.r * 5.5, 0, 6.283); ctx.fill();
        }
        ctx.fillStyle = `rgba(${p.kleur},${o.toFixed(3)})`;
        ctx.beginPath(); ctx.arc(px, py, p.r, 0, 6.283); ctx.fill();
      }
    };

    const lus = () => { t += 1; teken(); frame = requestAnimationFrame(lus); };

    fit();
    if (stil) teken(); else lus();
    window.addEventListener('resize', fit);

    /* ResizeObserver en niet alleen 'resize'.
     *
     * Deze component mount vóórdat data-look op <html> staat, en zonder dat
     * attribuut is .axe-stars display:none. De eerste fit() meet dan nul, en
     * het aantal sterren (oppervlak / 5200) wordt nul -- een canvas dat netjes
     * op z-index 3 staat en helemaal niets tekent. Gemeten: 0 pixels.
     *
     * De observer vangt het moment waarop hij wél maat krijgt. Dat is ook het
     * moment waarop je van stand wisselt of het venster van vorm verandert,
     * dus één mechanisme dekt alle drie. */
    let obs: ResizeObserver | null = null;
    if ('ResizeObserver' in window) {
      obs = new ResizeObserver(() => { fit(); if (stil) teken(); });
      obs.observe(canvas);
    }

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', fit);
      obs?.disconnect();
    };
  }, []);

  return ref;
}

export function AxeAtmosphere() {
  const sterren = useSterren();

  return (
    <>
      <div className="axe-sky" aria-hidden="true" />
      {/* De schemer draagt de drie vervagingslagen. Eén blur over het geheel
          maakt van de rand een lijn: je ziet waar hij ophoudt. Drie gemaskeerde
          lagen geven een verloop zonder grens. */}
      <div className="axe-schemer" aria-hidden="true"><i /><i /><i /></div>
      <canvas ref={sterren} className="axe-stars" aria-hidden="true" />
    </>
  );
}
