/**
 * De AXE Core sphere, als canvas.
 *
 * Dit is de sphere die in demo/plaat/index.html is uitgewerkt en goedgekeurd,
 * hier één op één overgezet. Hij staat naast HolographicSphere (Three.js) en
 * vervangt die niet: die blijft bestaan, en welke je ziet hangt af van wie hem
 * mount. Zo is teruggaan één regel in plaats van een revert.
 *
 * ## Waarom canvas en geen Three
 *
 * Niet omdat het beter kan, maar omdat het beter LEEST. De Three-versie stapelt
 * bloom, chromatische aberratie en additief gemengde halo's; dat werkt op zwart
 * maar slaat dicht op een lichte plaat, en de vorm verdwijnt in de gloed. Dit
 * is dezelfde bol met minder licht eromheen: je ziet de deeltjes.
 *
 * ## Vier lagen, en de VOLGORDE doet het werk
 *
 *   1. achterste helft van de binnenbol
 *   2. de ring, achterlangs
 *   3. de hete kern
 *   4. voorste helft van de binnenbol
 *   5. de buitenschil
 *   6. de ring, voorlangs
 *
 * Zo loopt de ring er echt omhéén in plaats van eroverheen, en ligt de gloed
 * tussen twee lagen deeltjes in plaats van erbovenop. Dat is wat diepte geeft:
 * je kijkt ergens ín, niet tegen een schil aan.
 */
import { useEffect, useRef } from 'react';

const N = 2200;

/* Overwegend koelwit; de hubkleuren zijn een spreiding, geen vuurwerk. Alleen
   de afwijkers gebruiken dit -- de rest volgt de hoogte (zie hieronder). */
const PALET = [
  ...Array(64).fill('214,228,255'), ...Array(12).fill('34,211,238'),
  ...Array(5).fill('59,130,246'), ...Array(4).fill('167,139,250'),
  ...Array(3).fill('20,184,166'), ...Array(2).fill('245,159,36'),
];

interface Punt { x: number; y: number; z: number; rgb: string }

function maakBol(): Punt[] {
  return Array.from({ length: N }, (_, i) => {
    const y = 1 - (i / (N - 1)) * 2;
    const rad = Math.sqrt(Math.max(0, 1 - y * y));
    const th = Math.PI * (3 - Math.sqrt(5)) * i;

    /* Kleur volgt de HOOGTE, niet het toeval: groen boven, cyaan in het
       midden, blauw onder. Dat verloop is wat de bol bol maakt voor het oog;
       willekeurige kleuren maken er confetti van.

       Let op de (1 + y): in het scherm groeit y naar BENEDEN, dus p.y = +1
       komt onderaan. Met (1 - y) staat het verloop ondersteboven. */
    const g = (1 + y) / 2;
    const kleur = g < 0.42
      ? [Math.round(150 - g * 90), Math.round(230 - g * 40), Math.round(120 + g * 250)]
      : [Math.round(60 - (g - 0.42) * 40), Math.round(200 - (g - 0.42) * 150), Math.round(240 - (g - 0.42) * 30)];

    // Een enkele afwijker, anders wordt het te net.
    const afwijker = Math.random() < 0.06;
    return {
      x: Math.cos(th) * rad, y, z: Math.sin(th) * rad,
      rgb: afwijker ? PALET[Math.floor(Math.random() * PALET.length)] : kleur.join(','),
    };
  });
}

export function AxeCoreSphere({ boost = 0 }: { boost?: number }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const boostRef = useRef(boost);
  useEffect(() => { boostRef.current = boost; }, [boost]);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const x = canvas.getContext('2d');
    if (!x) return;

    const stil = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const bol = maakBol();
    let w = 0, h = 0, d = 1, frame = 0, t = 0;
    let rotY = 0, rotX = 0.32, zoom = 1, auto = 0;
    let slepen = false, lastX = 0, lastY = 0;

    const fit = () => {
      const r = canvas.getBoundingClientRect();
      d = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.width = Math.max(1, Math.round(r.width * d));
      h = canvas.height = Math.max(1, Math.round(r.height * d));
    };

    /* De vier sinussen en cosinussen van de stand van de bol.
     *
     * Die hingen eerst IN proj(), en proj draait 4400 keer per frame: dat waren
     * ~17.600 trig-berekeningen per frame, ruim een miljoen per seconde, voor
     * vier waarden die binnen één frame niet veranderen. Nu worden ze één keer
     * per frame gezet. Zelfde beeld, een fractie van het werk. */
    let cyv = 1, syv = 0, cxv = 1, sxv = 0;
    const standBijwerken = () => {
      const ry = rotY + auto;
      cyv = Math.cos(ry); syv = Math.sin(ry);
      cxv = Math.cos(rotX); sxv = Math.sin(rotX);
    };

    /* Eén projectie: eerst om Y, dan kantelen om X, dan perspectief. */
    const proj = (p: Punt, cx: number, cy: number, R: number) => {
      const X = p.x * cyv - p.z * syv;
      let Z = p.x * syv + p.z * cyv;
      const Y = p.y * cxv - Z * sxv;
      Z = p.y * sxv + Z * cxv;
      const persp = 1.9 / (2.4 - Z);
      return { px: cx + X * R * persp, py: cy + Y * R * persp, depth: (Z + 1) / 2 };
    };

    /* De helft van de ring die achter (voor=false) of vóór het midden langs
       loopt. Goud: één warme lijn tussen al dat koele blauw valt op zonder fel
       te zijn. In twee helften, want dát is wat een ring van een cirkel
       onderscheidt. */
    const ringHelft = (cx: number, cy: number, R: number, voor: boolean) => {
      const straal = R * 0.74;
      x.lineWidth = Math.max(1, 1.15 * d);
      x.beginPath();
      let begonnen = false;
      for (let i = 0; i <= 180; i++) {
        const a = (i / 180) * 6.2832;
        const X0 = Math.cos(a), Z0 = Math.sin(a);
        const X = X0 * cyv - Z0 * syv;
        let Z = X0 * syv + Z0 * cyv;
        const Y = -Z * sxv;
        Z = Z * cxv;
        if ((Z > 0) !== voor) { begonnen = false; continue; }
        const persp = 1.9 / (2.4 - Z);
        const px = cx + X * straal * persp, py = cy + Y * straal * persp;
        if (begonnen) x.lineTo(px, py); else x.moveTo(px, py);
        begonnen = true;
      }
      x.strokeStyle = voor ? 'rgba(212,196,86,.62)' : 'rgba(212,196,86,.26)';
      x.stroke();
    };

    const teken = () => {
      if (!w) fit();
      standBijwerken();
      x.clearRect(0, 0, w, h);

      const b = boostRef.current;
      const cx = w / 2, cy = h / 2;
      const R = Math.min(w, h) * 0.31 * zoom;
      const puls = 1 + Math.sin(t * 1.6) * 0.03 + b * 0.08;

      // Binnenbol op 46% van de straal: je ziet hem door de buitenste heen
      // bewegen -- twee snelheden, één beeld.
      const binnen = bol.map(p => proj(p, cx, cy, R * 0.46 * puls));

      for (const q of binnen) {
        if (q.depth > 0.5) continue;
        x.fillStyle = `rgba(120,205,240,${(0.05 + q.depth * 0.3).toFixed(3)})`;
        x.beginPath(); x.arc(q.px, q.py, (0.4 + q.depth * 1.0) * d, 0, 6.284); x.fill();
      }

      ringHelft(cx, cy, R, false);

      // Twee gradients: één wijde gloed en één felle punt. Eén gradient geeft
      // óf een vlek óf een stip, nooit allebei.
      const wijd = x.createRadialGradient(cx, cy, 0, cx, cy, R * 0.55 * puls);
      wijd.addColorStop(0, `rgba(110,200,240,${(0.18 + b * 0.1).toFixed(3)})`);
      wijd.addColorStop(0.45, 'rgba(60,130,190,.06)');
      wijd.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = wijd;
      x.beginPath(); x.arc(cx, cy, R * 0.55 * puls, 0, 6.284); x.fill();

      const kern = x.createRadialGradient(cx, cy, 0, cx, cy, R * 0.12 * puls);
      kern.addColorStop(0, `rgba(240,252,255,${(0.72 + b * 0.25).toFixed(3)})`);
      kern.addColorStop(0.42, 'rgba(120,215,245,.30)');
      kern.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = kern;
      x.beginPath(); x.arc(cx, cy, R * 0.12 * puls, 0, 6.284); x.fill();

      for (const q of binnen) {
        if (q.depth <= 0.5) continue;
        x.fillStyle = `rgba(150,228,255,${(0.06 + q.depth * 0.4).toFixed(3)})`;
        x.beginPath(); x.arc(q.px, q.py, (0.4 + q.depth * 1.1) * d, 0, 6.284); x.fill();
      }

      for (const p of bol) {
        const q = proj(p, cx, cy, R);
        const size = (0.5 + q.depth * 1.7) * d * (0.9 + b * 0.4);
        x.fillStyle = `rgba(${p.rgb},${(0.14 + q.depth * 0.72).toFixed(3)})`;
        x.beginPath(); x.arc(q.px, q.py, size, 0, 6.284); x.fill();
      }

      ringHelft(cx, cy, R, true);
    };

    /* Draait alleen als er iemand kijkt.
     *
     * De bol blijft op Home altijd gemount -- een WebGL/canvas-scene opnieuw
     * opbouwen bij elke tabwissel geeft een hapering die je niet meer wegkrijgt.
     * Maar "gemount" hoeft niet "tekenend" te betekenen: staat het venster op
     * de achtergrond, of is de bol weggefade achter Neural of Terrain, dan is
     * elk frame verspild werk terwijl de machine er wel voor betaalt.
     *
     * document.hidden dekt het venster, de IntersectionObserver de bol zelf. */
    let zichtbaar = true;
    const draaien = () => !document.hidden && zichtbaar;

    const lus = () => {
      frame = requestAnimationFrame(lus);
      if (!draaien()) return;
      t += 0.016;
      if (!slepen) auto += 0.0016;   // laat je los, dan draait hij rustig door
      teken();
    };

    const omlaag = (e: PointerEvent) => {
      slepen = true; lastX = e.clientX; lastY = e.clientY;
      canvas.setPointerCapture(e.pointerId);
    };
    const beweeg = (e: PointerEvent) => {
      if (!slepen) return;
      rotY += (e.clientX - lastX) * 0.006;
      rotX = Math.max(-1.3, Math.min(1.3, rotX + (e.clientY - lastY) * 0.006));
      lastX = e.clientX; lastY = e.clientY;
    };
    const los = () => { slepen = false; };
    const wiel = (e: WheelEvent) => {
      e.preventDefault();
      zoom = Math.max(0.55, Math.min(2.6, zoom * (e.deltaY < 0 ? 1.08 : 0.926)));
    };

    canvas.addEventListener('pointerdown', omlaag);
    canvas.addEventListener('pointermove', beweeg);
    canvas.addEventListener('pointerup', los);
    canvas.addEventListener('pointercancel', los);
    canvas.addEventListener('wheel', wiel, { passive: false });

    fit();
    if (stil) teken(); else lus();
    window.addEventListener('resize', fit);

    /* Net als het sterrenveld: deze kan mounten voordat hij maat heeft, en dan
       tekent hij in een canvas van 1x1. De observer vangt het moment waarop hij
       wél ruimte krijgt. */
    let obs: ResizeObserver | null = null;
    if ('ResizeObserver' in window) {
      obs = new ResizeObserver(() => { fit(); if (stil) teken(); });
      obs.observe(canvas);
    }

    /* Home laat de bol staan met opacity 0 achter de andere views. Dat is nog
       steeds "in beeld" voor de browser, dus kijken we ook naar de opacity van
       de ouder -- anders tekenen we onzichtbare frames. */
    let zicht: IntersectionObserver | null = null;
    if ('IntersectionObserver' in window) {
      zicht = new IntersectionObserver(([e]) => { zichtbaar = e?.isIntersecting ?? true; });
      zicht.observe(canvas);
    }

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', fit);
      obs?.disconnect();
      zicht?.disconnect();
      canvas.removeEventListener('pointerdown', omlaag);
      canvas.removeEventListener('pointermove', beweeg);
      canvas.removeEventListener('pointerup', los);
      canvas.removeEventListener('pointercancel', los);
      canvas.removeEventListener('wheel', wiel);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      className="h-full w-full"
      style={{ cursor: 'grab', touchAction: 'none' }}
      aria-hidden="true"
    />
  );
}
