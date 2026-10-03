/**
 * De AXE Core sphere op de telefoon-Home, in WebGL.
 *
 * Zelfde bol als AxeCoreSphere -- schil met hoogteverloop, binnenbol, gouden
 * ring, hete kern, dezelfde draaiing en kanteling -- maar getekend door de GPU
 * op de volle 3x van het scherm. Elk deeltje is een exact rondje met een rand
 * dunner dan een pixel, en het canvas ligt één op één op de schermpixels.
 * Luka (2 okt): "vlijmscherp", kleinere en meer deeltjes. Uitgewerkt in de
 * artifact "AXE Core Sphere" en daar goedgekeurd.
 *
 * Alleen MobileSystem gebruikt hem. Desktop, iPad, Tauri en de zwevende bol
 * houden AxeCoreSphere, en zonder WebGL valt deze daar ook op terug.
 *
 * ## De volgorde doet het werk (zoals in AxeCoreSphere)
 *
 *   stof, achterkant schil, achterkant binnenbol, achterkant ring,
 *   gloed + halo, voorkant binnenbol, hete kern (oplichtend),
 *   voorkant schil, voorkant ring
 *
 * Zo loopt de ring er echt omhéén en ligt de kern binnenin.
 *
 * ## Op de lichte plaat (3 okt)
 *
 * Licht dat optelt verdwijnt in een lichte plaat. Daar is het dezelfde bol --
 * schil, binnenbol, ring, dezelfde draaiing en ademhaling -- maar in de stippen
 * en kleuren van Dot Wave, die Luka op light wel goed zag: rijen stippen in
 * inkt, van bijna zwart naar goud, een cyaan binnenbol en een gouden ring, en
 * geen gloed. Op donker is hij precies de bol hierboven (Luka: "zoals hij
 * echt is"). De look wisselen kleurt hem meteen om.
 */
import { useEffect, useRef, useState } from 'react';
import { useVoiceStore } from '@/presentation/store/voiceStore';
import { useAxeJobStore } from '@/presentation/store/axeJobStore';
import { werkStand } from '@/domain/tierRouter/axeJobRegels';
import { getGlobalTtsLevel } from '@/infrastructure/gateways/globalTts';
import { AxeCoreSphere } from '@/presentation/components/axe-core/sphere/AxeCoreSphere';
import {
  LICHT_INKT, STAP, TEL_KERN, TEL_RING, TEL_SCHIL, TEL_STOF,
  bolStand, canvasMaat, deeltjesMaat, dotRijen, lichtMaat, maakLichteSchil, maakRijenBol,
  maakTelefoonBol, pixelRaster,
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
    const data = maakTelefoonBol();
    let W = 1, H = 1, d = 1, frame = 0, t = 0, beeld = 0;
    let rotY = 0, rotX = 0.32, zoom = 1, auto = 0, snelY = 0, snelX = 0;
    let slepen = false, lastX = 0, lastY = 0, lastT = 0;
    let stem = 0, b = 0;
    let kwijt = false;
    let plaat = leesPlaat();

    let P: Programma, G: Programma;
    let lagen: Record<'schil' | 'kern' | 'ring' | 'stof', { b: WebGLBuffer; n: number }>;
    let vierkant: WebGLBuffer;
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
      lagen = {
        schil: { b: buffer(data.schil), n: TEL_SCHIL },
        kern: { b: buffer(data.kern), n: TEL_KERN },
        ring: { b: buffer(data.ring), n: TEL_RING },
        stof: { b: buffer(data.stof), n: TEL_STOF },
      };
      vierkant = buffer(new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]));
      licht = null;
    };

    /* De lichte schil en binnenbol liggen in rijen, een stip om de ~7
       schermpixels; na een andere maat (lade, knijpen) opnieuw gelegd. */
    let licht: { schil: { b: WebGLBuffer; n: number; rijen: number }; kern: { b: WebGLBuffer; n: number; rijen: number } } | null = null;
    const legLicht = (R: number, kernR: number) => {
      const rs = dotRijen(R), rk = dotRijen(kernR);
      if (licht && Math.abs(licht.schil.rijen - rs) <= 3 && Math.abs(licht.kern.rijen - rk) <= 3) return licht;
      const vul = (oud: WebGLBuffer | undefined, data: Float32Array, rijen: number) => {
        const buf = oud ?? gl.createBuffer();
        if (!buf) throw new Error('geen buffer');
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
        return { b: buf, n: data.length / STAP, rijen };
      };
      licht = {
        schil: vul(licht?.schil.b, maakLichteSchil(rs), rs),
        kern: vul(licht?.kern.b, maakRijenBol(rk, () => [255, 255, 255]), rk),
      };
      return licht;
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

    /* De lichte plaat: inkt over de plaat, geen licht dat optelt en geen gloed
       behalve een zacht cyaan hart. Zelfde volgorde als de donkere bol. */
    const tekenLicht = () => {
      const { cx, cy, R } = bolStand(W, H, zoom);
      const puls = 1 + (stil ? 0 : Math.sin(t * 1.6) * 0.03) + b * 0.08;
      const lagenL = legLicht(R, R * 0.46 * puls);
      const rs = lichtMaat(R, lagenL.schil.rijen);
      const rk = lichtMaat(R * 0.46 * puls, lagenL.kern.rijen) * 0.9;
      const m = deeltjesMaat(R, puls, 0.9 + b * 0.4);
      const ringMaat: Bereik = [m.ring[0] * 1.3, m.ring[1] * 1.3];

      const schil = (kant: number) => laag(lagenL.schil, {
        kant, schaal: 1, grootte: [rs * 0.55, rs], alfa: LICHT_INKT.alfa, fonkel: kant ? 0.1 : 0.05, wit: 0,
      });
      const kern = (kant: number) => laag(lagenL.kern, {
        kant, schaal: 0.46 * puls, grootte: [rk * 0.55, rk], alfa: kant ? [0.35, 1.0] : [0.2, 0.6], fonkel: 0.08, wit: 0,
        tint: [L_CYAAN_ACHTER, L_CYAAN],
      });
      const ring = (kant: number) => laag(lagen.ring, {
        kant, schaal: 0.74, grootte: ringMaat, alfa: kant ? [0.7, 1.0] : [0.3, 0.65], fonkel: 0.2, wit: 0,
        tint: [L_GOUD_ACHTER, L_GOUD_VOOR],
      });

      deeltjes(cx, cy, R);
      schil(0);
      kern(0);
      ring(0);

      // Het hart: cyaan inkt die meeademt en meespreekt, in plaats van wit licht.
      gloed(cx, cy, R * 0.2 * puls * (1 + stem * 0.6), L_CYAAN, Math.min(0.5, 0.14 + b * 0.08 + stem * 0.25), L_CYAAN_ACHTER, 0.04, 0.45, L_CYAAN_ACHTER);

      deeltjes(cx, cy, R);
      kern(1);
      deeltjes(cx, cy, R);
      schil(1);
      ring(1);
    };

    const teken = () => {
      if (kwijt) return;
      gl.viewport(0, 0, W, H);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      if (plaat === 'licht') { tekenLicht(); return; }

      const { cx, cy, R } = bolStand(W, H, zoom);
      const puls = 1 + (stil ? 0 : Math.sin(t * 1.6) * 0.03) + b * 0.08;
      const groei = 0.9 + b * 0.4;
      const m = deeltjesMaat(R, puls, groei);

      const schil = (kant: number) => laag(lagen.schil, {
        kant, schaal: 1, grootte: m.schil, alfa: [0.2, 1.0], fonkel: kant ? 0.22 : 0.12, wit: 0.55,
      });
      const kern = (kant: number) => laag(lagen.kern, {
        kant, schaal: 0.46 * puls, grootte: m.kern, alfa: kant ? [0.42, 1.0] : [0.2, 0.7], fonkel: 0.14, wit: 0.4,
        tint: [KERN_ACHTER, KERN_VOOR],
      });
      const ring = (kant: number) => laag(lagen.ring, {
        kant, schaal: 0.74, grootte: m.ring, alfa: kant ? [0.65, 1.0] : [0.25, 0.6], fonkel: 0.3, wit: 0.35,
        tint: [GOUD_ACHTER, GOUD_VOOR],
      });

      // Een vage atmosfeer met een lichtere rand: de schil leest als bol en
      // niet als losse spikkels. Laag gehouden; de korrel moet winnen.
      gloed(cx, cy, R * 0.84, kleur(50, 140, 215), 0.028 + b * 0.02, kleur(70, 175, 240), 0.08 + b * 0.03, 0.9, kleur(70, 175, 240));

      deeltjes(cx, cy, R);
      laag(lagen.stof, { kant: 2, schaal: 1, grootte: m.stof, alfa: [0.05, 0.3], fonkel: 0.7, wit: 0.3 });
      schil(0);
      kern(0);
      ring(0);

      gloed(cx, cy, R * 0.5 * puls, kleur(110, 200, 240), 0.05 + b * 0.05 + stem * 0.12, kleur(80, 160, 220), 0.012, 0.5, kleur(40, 110, 180));
      gloed(cx, cy, R * 0.2 * puls * (1 + stem * 0.6), kleur(150, 226, 252), Math.min(0.6, 0.24 + b * 0.12 + stem * 0.25), kleur(130, 215, 248), 0.08, 0.45, kleur(110, 200, 240));

      deeltjes(cx, cy, R);
      kern(1);

      // Het hete hart telt licht op, zodat de deeltjes ervoor zichtbaar blijven.
      gl.blendFunc(gl.ONE, gl.ONE);
      gloed(cx, cy, R * 0.085 * puls * (1 + stem * 0.9), kleur(255, 255, 255), Math.min(1, 0.85 + b * 0.15), kleur(190, 240, 255), 0.5, 0.35, kleur(120, 215, 245));
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

      deeltjes(cx, cy, R);
      schil(1);
      ring(1);
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
