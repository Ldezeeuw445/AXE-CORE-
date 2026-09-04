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

/**
 * Een ster.
 *
 * `veld` is het verschil tussen een hemel en een kolk. Eerder draaide élke ster
 * mee met de armen, en dan kijk je niet naar sterren maar naar een draaikolk —
 * beweging die het oog volgt in plaats van een achtergrond die er gewoon is.
 * In het echt draaien de armen van een sterrenstelsel; de sterren die ertussen
 * staan doen dat niet zichtbaar. Het veld staat dus stil en alleen de armen
 * draaien.
 */
interface Star {
  r: number; a: number; grootte: number; helder: number;
  /** Vaste achtergrondster: draait niet mee met de armen. */
  veld: boolean;
  reus: boolean; flonker: number; snelheid: number;
  /** Kleurtemperatuur, van blauwwit (0) naar amber (1). */
  temp: number;
}

/* Een ster is nooit grijs. Van heet naar koel: blauwwit, wit, geelwit, amber.
   Vier stops is genoeg om een veld levend te maken; meer leest als confetti. */
const KLEUREN = ['170,200,255', '226,236,255', '255,246,224', '255,214,170'] as const;

function kleurVan(temp: number): string {
  return KLEUREN[Math.min(KLEUREN.length - 1, Math.floor(temp * KLEUREN.length))];
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
        // Tweederde staat vast in het veld, eenderde vormt de armen. Het veld
        // maakt de hemel; de armen maken er een sterrenstelsel van.
        const veld = i % 3 !== 0;

        let straal: number;
        let hoek: number;
        if (veld) {
          // Gelijkmatig over het vlak: sqrt, anders klontert alles in het
          // midden omdat de oppervlakte met r² groeit.
          straal = Math.sqrt(Math.random()) * 0.75;
          hoek = Math.random() * 6.283;
        } else {
          const arm = i % 2;
          const t0 = Math.pow(Math.random(), 0.62);
          hoek = t0 * 3.1 + arm * Math.PI + (Math.random() - 0.5) * (0.35 + t0 * 0.9);
          straal = t0 * 0.48 + Math.random() * 0.035;
        }

        // Machtsverdeling, zoals een echte hemel: heel veel zwakke sterren en
        // een enkele felle. Uniform verdeeld is precies waardoor het vorige
        // veld als korrel las in plaats van als sterren -- overal hetzelfde.
        const m = Math.pow(Math.random(), 3);
        const reus = m > 0.86;
        return {
          r: straal, a: hoek, veld,
          // Fors groter dan een sterrenveld normaal is, met opzet: door de
          // vervaging heen blijft van een punt van één pixel niets over.
          grootte: (0.6 + m * (reus ? 5.2 : 2.1)) * d,
          helder: 0.22 + m * 0.78,
          reus,
          flonker: Math.random() * 6.3,
          snelheid: Math.random() * 0.004 + 0.001,
          temp: Math.pow(Math.random(), 1.7),
        };
      });
    };

    const draw = () => {
      // Niet tekenen wat verborgen is: offsetParent is null bij display:none.
      // Zo blijft de lus staan zonder elk frame een onzichtbaar canvas te
      // vullen -- de galaxy staat nu tijdelijk uit (zie axe-look.css).
      if (!canvas.offsetParent) { frame = requestAnimationFrame(draw); return; }
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
        // Alleen de armen draaien; het veld staat stil. Binnenin sneller, zoals
        // echt -- dat verschil is wat een arm laat krullen in plaats van als
        // geheel ronddraaien.
        const a = p.veld ? p.a : p.a + t / (p.r + 0.12);
        const px = cx + Math.cos(a) * p.r * R;
        // Het veld is de hemel eromheen en is dus niet afgeplat; alleen de
        // schijf staat schuin.
        const py = cy + Math.sin(a) * p.r * R * (p.veld ? 1 : 0.42);
        const o = p.helder * (0.55 + Math.abs(Math.sin(p.flonker)) * 0.45);
        const rgb = kleurVan(p.temp);

        // De grote krijgen een halo. Zonder dat blijft een ster een schijfje
        // met een harde rand -- precies wat het glas wegvaagt; een gloed
        // overleeft de vervaging wel.
        if (p.reus) {
          const g = ctx.createRadialGradient(px, py, 0, px, py, p.grootte * 4.5);
          g.addColorStop(0, 'rgba(' + rgb + ',' + o * 0.55 + ')');
          g.addColorStop(1, 'rgba(' + rgb + ',0)');
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(px, py, p.grootte * 4.5, 0, 6.284); ctx.fill();

          // Diffractiepieken op de allerfelste. Dit is het detail waardoor een
          // veld als een fóto van sterren leest in plaats van als stippen: een
          // telescoop maakt ze, en het oog herkent ze zonder erover na te
          // denken. Twee dunne lijnen, verder niets.
          const l = p.grootte * 7;
          ctx.strokeStyle = 'rgba(' + rgb + ',' + o * 0.32 + ')';
          ctx.lineWidth = Math.max(0.5, p.grootte * 0.16);
          ctx.beginPath();
          ctx.moveTo(px - l, py); ctx.lineTo(px + l, py);
          ctx.moveTo(px, py - l); ctx.lineTo(px, py + l);
          ctx.stroke();
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
  // 2200 en niet 900: met een machtsverdeling is het grootste deel nu zwak, en
  // een hemel met weinig zwakke sterren leest leeg. Het kost niets -- ze staan
  // stil, en de tekenlus vult toch al het canvas.
  const galaxy = useGalaxy(2200);

  return (
    <div className="axe-atmosphere" aria-hidden="true">
      <div className="axe-sky" />
      <canvas ref={galaxy} className="axe-galaxy" />
      <div className="axe-canopy" />
      <div className="axe-band"><i /><i /><i /></div>
    </div>
  );
}
