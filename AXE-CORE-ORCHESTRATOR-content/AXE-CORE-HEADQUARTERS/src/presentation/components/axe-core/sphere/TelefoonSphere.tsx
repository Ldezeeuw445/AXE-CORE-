/**
 * De AXE Core sphere op de telefoon-Home, in WebGL.
 *
 * Schil met hoogteverloop, binnenbol, gouden ring en een hart, dezelfde
 * draaiing en kanteling als AxeCoreSphere, getekend door de GPU op de volle 3x
 * van het scherm. Elk deeltje is een exact rondje met een rand dunner dan een
 * pixel, en het canvas ligt één op één op de schermpixels (Luka, 2 okt:
 * "vlijmscherp").
 *
 * Schil en binnenbol liggen in rijen stippen, zoals Dot Wave: strak rond, op
 * beide platen dezelfde bol (Luka, 3 okt). Alleen de kleur verschilt:
 *
 *   donker  de kleuren van altijd -- groen, cyaan, blauw, een koelwitte
 *           binnenbol, gouden ring, wit heet hart dat licht optelt
 *   licht   inkt -- bijna zwart naar goud, cyaan binnenbol, gouden ring, een
 *           cyaan hart; licht dat optelt zag je op de lichte plaat niet
 *
 * De look wisselen kleurt hem meteen om.
 *
 * Alleen MobileSystem gebruikt hem. Desktop, iPad, Tauri en de zwevende bol
 * houden AxeCoreSphere, en zonder WebGL valt deze daar ook op terug.
 *
 * ## De volgorde doet het werk (zoals in AxeCoreSphere)
 *
 *   (gloed), achterkant schil, achterkant binnenbol, achterkant ring,
 *   hart, voorkant binnenbol, (heet hart), voorkant schil, voorkant ring
 *
 * Zo loopt de ring er echt omhéén en ligt de kern binnenin.
 */
import { useEffect, useRef, useState } from 'react';
import { useVoiceStore } from '@/presentation/store/voiceStore';
import { useAxeJobStore } from '@/presentation/store/axeJobStore';
import { werkStand } from '@/domain/tierRouter/axeJobRegels';
import { getGlobalTtsLevel } from '@/infrastructure/gateways/globalTts';
import { AxeCoreSphere } from '@/presentation/components/axe-core/sphere/AxeCoreSphere';
import {
  LICHT_INKT, STAP, TEL_RING,
  bolStand, canvasMaat, dotRijen, maakBinnenbol, maakRing, maakSchil, pixelRaster, ringMaat, stipMaat,
  type Bereik, type Plaat,
} from '@/presentation/components/axe-core/sphere/telefoonBol';

const VS_DEELTJES = `
  attribute vec3 aPos; attribute vec3 aKleur; attribute float aZaad;
  uniform vec4 uStand; uniform vec2 uMaat; uniform vec2 uMidden;
  uniform float uR; uniform float uSchaal; uniform float uKant;
  uniform vec2 uGrootte; uniform vec2 uAlfa; uniform float uTijd; uniform float uFonkel;
  uniform vec3 uTintAchter; uniform vec3 uTintVoor; uniform float uTint;
  varying vec3 vKleur; varying float vA; varying float vRad;
  void main() {
    float X = aPos.x * uStand.x - aPos.z * uStand.y;
    float Z = aPos.x * uStand.y + aPos.z * uStand.x;
    float Y = aPos.y * uStand.z - Z * uStand.w;
    Z = aPos.y * uStand.w + Z * uStand.z;
    float diepte = clamp((Z + 1.0) * 0.5, 0.0, 1.0);
    if (uKant < 1.5 && ((diepte > 0.5) != (uKant > 0.5))) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return;
    }
    float persp = 1.9 / (2.4 - Z);
    vec2 p = uMidden + vec2(X, Y) * uR * uSchaal * persp;
    gl_Position = vec4(p.x / uMaat.x * 2.0 - 1.0, 1.0 - p.y / uMaat.y * 2.0, 0.0, 1.0);
    float rad = mix(uGrootte.x, uGrootte.y, diepte);
    float tw = 0.5 + 0.5 * sin(uTijd * (1.1 + fract(aZaad * 7.31) * 2.4) + aZaad * 6.2832);
    vA = mix(uAlfa.x, uAlfa.y, diepte) * (1.0 - uFonkel * tw);
    vKleur = mix(aKleur, mix(uTintAchter, uTintVoor, diepte), uTint);
    vRad = rad;
    gl_PointSize = 2.0 * rad + 2.0;
  }`;

const FS_DEELTJES = `
  precision mediump float;
  varying vec3 vKleur; varying float vA; varying float vRad;
  uniform float uWit;
  void main() {
    float r = length(gl_PointCoord - 0.5) * (2.0 * vRad + 2.0);
    float rond = clamp((vRad - r) / 0.7 + 0.5, 0.0, 1.0);
    float a = rond * vA;
    if (a < 0.002) discard;
    float hart = clamp(1.0 - r / (vRad * 0.8 + 0.001), 0.0, 1.0);
    gl_FragColor = vec4(mix(vKleur, vec3(1.0), hart * uWit) * a, a);
  }`;

const VS_GLOED = `
  attribute vec2 aQ; uniform vec2 uMaat; uniform vec2 uMidden; uniform float uStraal;
  varying vec2 vQ;
  void main() {
    vQ = aQ;
    vec2 p = uMidden + aQ * uStraal;
    gl_Position = vec4(p.x / uMaat.x * 2.0 - 1.0, 1.0 - p.y / uMaat.y * 2.0, 0.0, 1.0);
  }`;

const FS_GLOED = `
  precision mediump float;
  varying vec2 vQ;
  uniform vec3 uK0; uniform float uA0; uniform vec3 uK1; uniform float uA1; uniform float uS1; uniform vec3 uK2;
  void main() {
    float t = length(vQ);
    if (t >= 1.0) discard;
    vec3 c; float a;
    if (t < uS1) { float k = t / uS1; c = mix(uK0, uK1, k); a = mix(uA0, uA1, k); }
    else { float k = (t - uS1) / (1.0 - uS1); k = k * k * (3.0 - 2.0 * k); c = mix(uK1, uK2, k); a = mix(uA1, 0.0, k); }
    gl_FragColor = vec4(c * a, a);
  }`;

type Kleur = readonly [number, number, number];
const kleur = (r: number, g: number, b: number): Kleur => [r / 255, g / 255, b / 255];
const GOUD_ACHTER = kleur(210, 190, 100), GOUD_VOOR = kleur(236, 212, 120);
const KERN_ACHTER = kleur(130, 212, 246), KERN_VOOR = kleur(160, 232, 255);
const inkt = (k: readonly [number, number, number]): Kleur => kleur(k[0], k[1], k[2]);
const L_CYAAN_ACHTER = inkt(LICHT_INKT.cyaanAchter), L_CYAAN = inkt(LICHT_INKT.cyaan);
const L_GOUD_ACHTER = inkt(LICHT_INKT.goudAchter), L_GOUD_VOOR = inkt(LICHT_INKT.goudVoor);

/**
 * Wat per plaat verschilt: alleen de kleur. Schil, binnenbol, ring en hart zijn
 * op beide platen dezelfde (Luka, 3 okt). Op donker het witte hart in elke stip
 * en de koelwitte binnenbol van altijd; op licht effen inkt.
 */
const STIJL: Record<Plaat, { wit: { schil: number; kern: number; ring: number }; schilAlfa: Bereik; kernTint: readonly [Kleur, Kleur]; ringTint: readonly [Kleur, Kleur] }> = {
  donker: { wit: { schil: 0.55, kern: 0.4, ring: 0.35 }, schilAlfa: [0.2, 1.0], kernTint: [KERN_ACHTER, KERN_VOOR], ringTint: [GOUD_ACHTER, GOUD_VOOR] },
  licht: { wit: { schil: 0, kern: 0, ring: 0 }, schilAlfa: [0.24, 1.0], kernTint: [L_CYAAN_ACHTER, L_CYAAN], ringTint: [L_GOUD_ACHTER, L_GOUD_VOOR] },
};

/** De plaat volgt de look: `glass` is licht, al het andere donker. */
const leesPlaat = (): Plaat => (document.documentElement.dataset.look === 'glass' ? 'licht' : 'donker');

/** Kan dit toestel WebGL? Eén keer gevraagd, en de proefcontext meteen weer vrij. */
function heeftWebGl(): boolean {
  try {
    const proef = document.createElement('canvas').getContext('webgl');
    if (!proef) return false;
    proef.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return false;
  }
}

interface Programma { p: WebGLProgram; u: Record<string, WebGLUniformLocation | null> }

function maakProgramma(gl: WebGLRenderingContext, vs: string, fs: string, attributen: string[]): Programma {
  const shader = (soort: number, bron: string) => {
    const s = gl.createShader(soort);
    if (!s) throw new Error('geen shader');
    gl.shaderSource(s, bron);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader');
    return s;
  };
  const p = gl.createProgram();
  if (!p) throw new Error('geen programma');
  gl.attachShader(p, shader(gl.VERTEX_SHADER, vs));
  gl.attachShader(p, shader(gl.FRAGMENT_SHADER, fs));
  attributen.forEach((a, i) => gl.bindAttribLocation(p, i, a));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? 'link');
  const u: Programma['u'] = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS) as number;
  for (let i = 0; i < n; i++) {
    const info = gl.getActiveUniform(p, i);
    if (info) u[info.name] = gl.getUniformLocation(p, info.name);
  }
  return { p, u };
}

export function TelefoonSphere({ boost = 0 }: { boost?: number }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const boostRef = useRef(boost);
  useEffect(() => { boostRef.current = boost; }, [boost]);
  const [webgl] = useState(heeftWebGl);

  useEffect(() => {
    const canvas = ref.current;
    const vak = canvas?.parentElement;
    if (!canvas || !vak) return;
    const gl = canvas.getContext('webgl', {
      alpha: true, premultipliedAlpha: true, antialias: false, powerPreference: 'high-performance',
    });
    if (!gl) return;

    const stil = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const ringData = maakRing();
    let W = 1, H = 1, d = 1, frame = 0, t = 0, beeld = 0;
    let rotY = 0, rotX = 0.32, zoom = 1, auto = 0, snelY = 0, snelX = 0;
    let slepen = false, lastX = 0, lastY = 0, lastT = 0;
    let stem = 0, b = 0;
    let kwijt = false;
    let plaat = leesPlaat();

    type Laag = { b: WebGLBuffer; n: number };
    type Rijen = Laag & { rijen: number };
    let P: Programma, G: Programma;
    let ring: Laag;
    let vierkant: WebGLBuffer;
    /* Schil en binnenbol liggen in rijen, een stip om de ~7 schermpixels. Na
       een andere maat (lade, knijpen) of een andere plaat opnieuw gelegd. */
    let bol: { schil: Rijen; kern: Rijen; plaat: Plaat } | null = null;
    const opbouwen = () => {
      P = maakProgramma(gl, VS_DEELTJES, FS_DEELTJES, ['aPos', 'aKleur', 'aZaad']);
      G = maakProgramma(gl, VS_GLOED, FS_GLOED, ['aQ']);
      const buffer = (inhoud: Float32Array) => {
        const buf = gl.createBuffer();
        if (!buf) throw new Error('geen buffer');
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, inhoud, gl.STATIC_DRAW);
        return buf;
      };
      ring = { b: buffer(ringData), n: TEL_RING };
      vierkant = buffer(new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]));
      bol = null;
    };
    const legBol = (R: number, kernR: number) => {
      const rs = dotRijen(R), rk = dotRijen(kernR);
      const oud = bol;
      const vul = (buf: WebGLBuffer | undefined, inhoud: Float32Array, rijen: number): Rijen => {
        const b2 = buf ?? gl.createBuffer();
        if (!b2) throw new Error('geen buffer');
        gl.bindBuffer(gl.ARRAY_BUFFER, b2);
        gl.bufferData(gl.ARRAY_BUFFER, inhoud, gl.STATIC_DRAW);
        return { b: b2, n: inhoud.length / STAP, rijen };
      };
      const schilGoed = oud && oud.plaat === plaat && Math.abs(oud.schil.rijen - rs) <= 3;
      const kernGoed = oud && Math.abs(oud.kern.rijen - rk) <= 3;
      if (oud && schilGoed && kernGoed) return oud;
      bol = {
        schil: oud && schilGoed ? oud.schil : vul(oud?.schil.b, maakSchil(rs, plaat), rs),
        kern: oud && kernGoed ? oud.kern : vul(oud?.kern.b, maakBinnenbol(rk), rk),
        plaat,
      };
      return bol;
    };
    try {
      opbouwen();
    } catch (fout) {
      console.warn('[TelefoonSphere] WebGL lukt niet:', fout);
      return;
    }

    /* Precies één canvaspixel per schermpixel, op het raster van het scherm. */
    const raster = () => {
      const r = vak.getBoundingClientRect();
      const s = pixelRaster(r.left, r.top, d);
      canvas.style.transform = `translate(${s.x}px, ${s.y}px)`;
    };
    const fit = () => {
      const r = vak.getBoundingClientRect();
      d = Math.min(window.devicePixelRatio || 1, 3);
      const m = canvasMaat(r.width, r.height, d);
      W = m.W; H = m.H;
      if (canvas.width !== W) canvas.width = W;
      if (canvas.height !== H) canvas.height = H;
      canvas.style.width = `${m.cssW}px`;
      canvas.style.height = `${m.cssH}px`;
      raster();
    };

    let wit = 0;
    const laag = (
      l: { b: WebGLBuffer; n: number },
      o: { kant: number; schaal: number; grootte: Bereik; alfa: Bereik; fonkel: number; wit: number; tint?: readonly [Kleur, Kleur] },
    ) => {
      gl.bindBuffer(gl.ARRAY_BUFFER, l.b);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, STAP * 4, 0);
      gl.vertexAttribPointer(1, 3, gl.FLOAT, false, STAP * 4, 12);
      gl.vertexAttribPointer(2, 1, gl.FLOAT, false, STAP * 4, 24);
      const u = P.u;
      gl.uniform1f(u.uSchaal, o.schaal);
      gl.uniform1f(u.uKant, o.kant);
      gl.uniform2f(u.uGrootte, o.grootte[0], o.grootte[1]);
      gl.uniform2f(u.uAlfa, o.alfa[0], o.alfa[1]);
      gl.uniform1f(u.uFonkel, stil ? 0 : o.fonkel);
      if (o.wit !== wit) { gl.uniform1f(u.uWit, o.wit); wit = o.wit; }
      gl.uniform1f(u.uTint, o.tint ? 1 : 0);
      if (o.tint) { gl.uniform3fv(u.uTintAchter, o.tint[0]); gl.uniform3fv(u.uTintVoor, o.tint[1]); }
      gl.drawArrays(gl.POINTS, 0, l.n);
    };

    const gloed = (cx: number, cy: number, straal: number, k0: Kleur, a0: number, k1: Kleur, a1: number, s1: number, k2: Kleur) => {
      gl.useProgram(G.p);
      gl.disableVertexAttribArray(1); gl.disableVertexAttribArray(2);
      gl.bindBuffer(gl.ARRAY_BUFFER, vierkant);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.uniform2f(G.u.uMaat, W, H);
      gl.uniform2f(G.u.uMidden, cx, cy);
      gl.uniform1f(G.u.uStraal, straal);
      gl.uniform3fv(G.u.uK0, k0); gl.uniform1f(G.u.uA0, a0);
      gl.uniform3fv(G.u.uK1, k1); gl.uniform1f(G.u.uA1, a1);
      gl.uniform1f(G.u.uS1, s1); gl.uniform3fv(G.u.uK2, k2);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };

    const deeltjes = (cx: number, cy: number, R: number) => {
      gl.useProgram(P.p);
      gl.enableVertexAttribArray(0); gl.enableVertexAttribArray(1); gl.enableVertexAttribArray(2);
      const ry = rotY + auto;
      gl.uniform4f(P.u.uStand, Math.cos(ry), Math.sin(ry), Math.cos(rotX), Math.sin(rotX));
      gl.uniform2f(P.u.uMaat, W, H);
      gl.uniform2f(P.u.uMidden, cx, cy);
      gl.uniform1f(P.u.uR, R);
      gl.uniform1f(P.u.uTijd, t);
      wit = -1;
    };

    const teken = () => {
      if (kwijt) return;
      gl.viewport(0, 0, W, H);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

      const donker = plaat === 'donker';
      const st = STIJL[plaat];
      const { cx, cy, R } = bolStand(W, H, zoom);
      const puls = 1 + (stil ? 0 : Math.sin(t * 1.6) * 0.03) + b * 0.08;
      const lagen = legBol(R, R * 0.46 * puls);
      const rs = stipMaat(R, lagen.schil.rijen) * (1 + b * 0.3);
      const rk = stipMaat(R * 0.46 * puls, lagen.kern.rijen) * 0.9;
      const rm = ringMaat(R);

      const schil = (kant: number) => laag(lagen.schil, {
        kant, schaal: 1, grootte: [rs * 0.55, rs], alfa: st.schilAlfa, fonkel: kant ? 0.1 : 0.05, wit: st.wit.schil,
      });
      const kern = (kant: number) => laag(lagen.kern, {
        kant, schaal: 0.46 * puls, grootte: [rk * 0.55, rk], alfa: kant ? [0.35, 1.0] : [0.2, 0.6], fonkel: 0.08, wit: st.wit.kern,
        tint: st.kernTint,
      });
      const ringL = (kant: number) => laag(ring, {
        kant, schaal: 0.74, grootte: rm, alfa: kant ? [0.7, 1.0] : [0.3, 0.65], fonkel: 0.2, wit: st.wit.ring,
        tint: st.ringTint,
      });

      // Donker: een vage atmosfeer met een lichtere rand, zodat de schil als bol
      // leest. Laag gehouden; de stippen moeten winnen.
      if (donker) gloed(cx, cy, R * 0.84, kleur(50, 140, 215), 0.028 + b * 0.02, kleur(70, 175, 240), 0.08 + b * 0.03, 0.9, kleur(70, 175, 240));

      deeltjes(cx, cy, R);
      schil(0);
      kern(0);
      ringL(0);

      if (donker) {
        gloed(cx, cy, R * 0.5 * puls, kleur(110, 200, 240), 0.05 + b * 0.05 + stem * 0.12, kleur(80, 160, 220), 0.012, 0.5, kleur(40, 110, 180));
        gloed(cx, cy, R * 0.2 * puls * (1 + stem * 0.6), kleur(150, 226, 252), Math.min(0.6, 0.24 + b * 0.12 + stem * 0.25), kleur(130, 215, 248), 0.08, 0.45, kleur(110, 200, 240));
      } else {
        // Licht: het hart is cyaan inkt die meeademt en meespreekt, geen wit licht.
        gloed(cx, cy, R * 0.2 * puls * (1 + stem * 0.6), L_CYAAN, Math.min(0.5, 0.14 + b * 0.08 + stem * 0.25), L_CYAAN_ACHTER, 0.04, 0.45, L_CYAAN_ACHTER);
      }

      deeltjes(cx, cy, R);
      kern(1);

      if (donker) {
        // Het hete hart telt licht op, zodat de stippen ervoor zichtbaar blijven.
        gl.blendFunc(gl.ONE, gl.ONE);
        gloed(cx, cy, R * 0.085 * puls * (1 + stem * 0.9), kleur(255, 255, 255), Math.min(1, 0.85 + b * 0.15), kleur(190, 240, 255), 0.5, 0.35, kleur(120, 215, 245));
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      }

      deeltjes(cx, cy, R);
      schil(1);
      ringL(1);
    };

    /* Loopt er werk op de achtergrond? Eén langzame ademhaling, net als in
       AxeCoreSphere. Via subscribe: geen re-render per frame. */
    let werkt = werkStand(useAxeJobStore.getState().jobs).lopend > 0;
    const stopWerkLet = useAxeJobStore.subscribe((st) => {
      werkt = werkStand(st.jobs).lopend > 0;
    });

    /* Van look wisselen kleurt hem meteen om, ook als hij stilstaat. */
    const lookLet = new MutationObserver(() => {
      const nu = leesPlaat();
      if (nu !== plaat) { plaat = nu; teken(); }
    });
    lookLet.observe(document.documentElement, { attributes: true, attributeFilter: ['data-look'] });

    /* Draait alleen als er iemand kijkt (zie AxeCoreSphere). */
    let zichtbaar = true;
    const draaien = () => !document.hidden && zichtbaar && document.hasFocus() && !kwijt;

    /* Dertig beelden per seconde in rust: de bol ligt onder de chatplaat en de
       composer, en elk veranderd frame laat hun backdrop-filter opnieuw
       rekenen. Slepen loopt op volle snelheid mee. */
    const INTERVAL = 1000 / 30;
    let vorige = 0;
    const lus = (nu: number) => {
      frame = requestAnimationFrame(lus);
      if (!draaien()) return;
      const verstreken = nu - vorige;
      if (!slepen && vorige && verstreken < INTERVAL) return;
      const dt = (!vorige || verstreken > 500) ? 1 / 60 : verstreken / 1000;
      vorige = nu;

      if (!stil) {
        t += dt;
        if (!slepen) auto += 0.096 * dt;
      }
      if (!slepen && (Math.abs(snelY) > 0.002 || Math.abs(snelX) > 0.002)) {
        rotY += snelY * dt;
        rotX = Math.max(-1.3, Math.min(1.3, rotX + snelX * dt));
        const k = Math.exp(-dt * 3.2);
        snelY *= k; snelX *= k;
      }
      b = Math.min(1, boostRef.current + (werkt ? 0.14 + 0.08 * Math.sin(t * 0.8) : 0));
      // De kern spreekt mee met AXE: hetzelfde signaal als de voice pulse.
      const doel = useVoiceStore.getState().voiceStatus === 'speaking' ? getGlobalTtsLevel() : 0;
      const k = doel > stem ? 0.5 : 0.18;
      stem += (doel - stem) * (1 - Math.pow(1 - k, dt * 60));

      // Eens per seconde het raster nalopen: een lade die schuift kan het vak
      // op een halve pixel laten landen.
      if (++beeld % 30 === 0) raster();
      teken();
    };

    /* Eén vinger draait, twee vingers zoomen. Laat je los, dan draait hij uit. */
    const pointers = new Map<number, { x: number; y: number }>();
    let knijp = 0;
    const tweeAfstand = () => {
      const p = [...pointers.values()];
      return p.length < 2 ? 0 : Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
    };
    const omlaag = (e: PointerEvent) => {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      canvas.setPointerCapture(e.pointerId);
      if (pointers.size === 1) { slepen = true; lastX = e.clientX; lastY = e.clientY; lastT = performance.now(); snelX = snelY = 0; }
      else if (pointers.size === 2) { slepen = false; knijp = tweeAfstand(); }
    };
    const beweeg = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size >= 2) {
        const d2 = tweeAfstand();
        if (knijp > 0 && d2 > 0) zoom = Math.max(0.55, Math.min(2.6, zoom * (d2 / knijp)));
        knijp = d2;
        return;
      }
      if (!slepen) return;
      const nu = performance.now();
      const dts = Math.max(1, nu - lastT) / 1000;
      const dy = (e.clientX - lastX) * 0.006, dx = (e.clientY - lastY) * 0.006;
      rotY += dy;
      rotX = Math.max(-1.3, Math.min(1.3, rotX + dx));
      snelY = snelY * 0.6 + (dy / dts) * 0.4;
      snelX = snelX * 0.6 + (dx / dts) * 0.4;
      lastX = e.clientX; lastY = e.clientY; lastT = nu;
      if (stil) teken();
    };
    const los = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) knijp = 0;
      if (pointers.size === 0) {
        slepen = false;
        if (performance.now() - lastT > 80) snelX = snelY = 0;
      } else if (pointers.size === 1) {
        const [p] = pointers.values();
        slepen = true; lastX = p.x; lastY = p.y; lastT = performance.now();
      }
    };

    /* iOS haalt een WebGL-context weg als de app lang op de achtergrond staat. */
    const contextWeg = (e: Event) => { e.preventDefault(); kwijt = true; };
    const contextTerug = () => {
      try { opbouwen(); kwijt = false; fit(); teken(); } catch (fout) { console.warn('[TelefoonSphere] herstel lukt niet:', fout); }
    };

    canvas.addEventListener('pointerdown', omlaag);
    canvas.addEventListener('pointermove', beweeg);
    canvas.addEventListener('pointerup', los);
    canvas.addEventListener('pointercancel', los);
    canvas.addEventListener('webglcontextlost', contextWeg);
    canvas.addEventListener('webglcontextrestored', contextTerug);

    fit();
    teken();
    frame = requestAnimationFrame(lus);
    window.addEventListener('resize', fit);

    let maat: ResizeObserver | null = null;
    if ('ResizeObserver' in window) {
      maat = new ResizeObserver(() => { fit(); teken(); });
      maat.observe(vak);
    }
    let zicht: IntersectionObserver | null = null;
    if ('IntersectionObserver' in window) {
      zicht = new IntersectionObserver(([e]) => { zichtbaar = e?.isIntersecting ?? true; });
      zicht.observe(canvas);
    }

    return () => {
      cancelAnimationFrame(frame);
      stopWerkLet();
      lookLet.disconnect();
      window.removeEventListener('resize', fit);
      maat?.disconnect();
      zicht?.disconnect();
      canvas.removeEventListener('pointerdown', omlaag);
      canvas.removeEventListener('pointermove', beweeg);
      canvas.removeEventListener('pointerup', los);
      canvas.removeEventListener('pointercancel', los);
      canvas.removeEventListener('webglcontextlost', contextWeg);
      canvas.removeEventListener('webglcontextrestored', contextTerug);
      // iOS houdt maar een handvol WebGL-contexten tegelijk; deze geeft hij terug.
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    };
  }, []);

  if (!webgl) return <AxeCoreSphere telefoon />;
  return (
    <canvas
      ref={ref}
      className="absolute left-0 top-0 block"
      style={{ cursor: 'grab', touchAction: 'none' }}
      aria-hidden="true"
    />
  );
}
