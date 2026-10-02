/**
 * De AXE Core sphere op de telefoon-Home, in WebGL: Dot Wave.
 *
 * Rijen piepkleine stippen op een bol die golft als een vloeibaar vel (Luka,
 * 2 okt, gekozen in de artifact "AXE Sphere Studio"). De golf zit in de
 * vertex-shader -- simplex-ruis over de bol, in de tijd -- dus de CPU doet per
 * beeld niets meer dan een paar getallen doorgeven. Waar het vel plooit
 * schuiven de rijen in elkaar en lichten de toppen vanzelf op.
 *
 * Wat hij van de vorige telefoon-sphere houdt: één canvaspixel per
 * schermpixel op het raster van het scherm, elke stip een exact rondje met een
 * rand dunner dan een pixel, in het midden van zijn vak, 30 beelden per seconde
 * in rust, slepen en knijpen, en herstel als iOS de context weghaalt.
 *
 * Signalen: loopt er werk (axeJobStore), dan golft hij dieper en sneller;
 * spreekt AXE, dan zwelt hij mee op het echte stemniveau (globalTts).
 *
 * Twee platen: op donker telt het licht op (blauw dat naar violet smelt), op
 * licht ligt er inkt op de plaat (zwart, goud, een beetje cyaan). Zie DOT_INKT.
 *
 * Alleen MobileSystem gebruikt hem. Desktop, iPad, Tauri en de zwevende bol
 * houden AxeCoreSphere, en zonder WebGL valt deze daar ook op terug.
 */
import { useEffect, useRef, useState } from 'react';
import { useVoiceStore } from '@/presentation/store/voiceStore';
import { useAxeJobStore } from '@/presentation/store/axeJobStore';
import { werkStand } from '@/domain/tierRouter/axeJobRegels';
import { getGlobalTtsLevel } from '@/infrastructure/gateways/globalTts';
import { AxeCoreSphere } from '@/presentation/components/axe-core/sphere/AxeCoreSphere';
import { SIMPLEX_RUIS } from '@/presentation/components/axe-core/sphere/simplexRuis';
import {
  DOT_INKT, STAP,
  bolStand, canvasMaat, dotMaat, dotRijen, maakDotWave, pixelRaster,
  type Plaat,
} from '@/presentation/components/axe-core/sphere/telefoonBol';

const VS_STIPPEN = `
  attribute vec3 aPos; attribute float aZaad;
  uniform vec4 uStand; uniform vec2 uMaat; uniform vec2 uMidden; uniform float uR;
  uniform float uFase; uniform float uAmp; uniform float uPuls; uniform float uRad;
  varying float vVoor; varying float vY; varying float vGolf; varying float vTop; varying float vRad;
  ${SIMPLEX_RUIS}
  void main() {
    vec3 p = aPos;
    float f = snoise(p * 1.55 + vec3(0.0, uFase * 0.9, uFase * 0.55));
    f += 0.5 * snoise(p * 3.1 + vec3(uFase * 0.7, -uFase * 0.4, 0.0));
    float d = f * uAmp + uPuls * (0.65 + 0.35 * snoise(p * 3.0 + uFase * 2.0));
    vec3 q = p * (1.0 + d);
    float X = q.x * uStand.x - q.z * uStand.y;
    float Z = q.x * uStand.y + q.z * uStand.x;
    float Y = q.y * uStand.z - Z * uStand.w;
    Z = q.y * uStand.w + Z * uStand.z;
    // Naar de kijker toe of ervan af, op de normaal van de ongegolfde bol.
    float voor = p.y * uStand.w + (p.x * uStand.y + p.z * uStand.x) * uStand.z;
    float persp = 1.9 / (2.4 - Z);
    vec2 s = uMidden + vec2(X, Y) * uR * persp;
    gl_Position = vec4(s.x / uMaat.x * 2.0 - 1.0, 1.0 - s.y / uMaat.y * 2.0, 0.0, 1.0);
    vVoor = voor; vY = p.y; vGolf = d;
    // Hoe hoog op de golf: de toppen krijgen hun eigen kleur.
    vTop = smoothstep(0.35, 1.0, d / max(uAmp, 0.001) * 0.5 + 0.25);
    float rad = uRad * persp * mix(0.55, 1.0, smoothstep(-0.2, 0.6, voor));
    vRad = rad;
    gl_PointSize = 2.0 * rad + 2.0;
  }`;

const FS_STIPPEN = `
  precision mediump float;
  uniform vec3 uBoven; uniform vec3 uOnder; uniform vec3 uRand; uniform vec3 uTop;
  uniform vec2 uAlfa; uniform float uTopMix;
  varying float vVoor; varying float vY; varying float vGolf; varying float vTop; varying float vRad;
  void main() {
    float r = length(gl_PointCoord - 0.5) * (2.0 * vRad + 2.0);
    float rond = clamp((vRad - r) / 0.7 + 0.5, 0.0, 1.0);
    float a = rond * mix(uAlfa.x, uAlfa.y, smoothstep(-0.35, 0.45, vVoor));
    if (a < 0.002) discard;
    // y groeit naar beneden: +1 is de onderkant.
    float g = clamp(0.5 + vY * 0.5 + vGolf * 0.9, 0.0, 1.0);
    vec3 c = mix(uBoven, uOnder, smoothstep(0.3, 0.78, g));
    c = mix(c, uRand, smoothstep(0.74, 1.0, g) * 0.85);
    c = mix(c, uTop, vTop * uTopMix);
    gl_FragColor = vec4(c * a, a);
  }`;

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

/** De plaat volgt de look: `glass` is licht, al het andere donker. */
const leesPlaat = (): Plaat => (document.documentElement.dataset.look === 'glass' ? 'licht' : 'donker');

const rgb = (k: readonly [number, number, number]) => [k[0] / 255, k[1] / 255, k[2] / 255] as const;

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
    let W = 1, H = 1, d = 1, frame = 0, beeld = 0, fase = 0;
    let rotY = 0, rotX = 0.32, zoom = 1, auto = 0, snelY = 0, snelX = 0;
    let slepen = false, lastX = 0, lastY = 0, lastT = 0;
    let stem = 0, b = 0;
    let kwijt = false;
    let plaat = leesPlaat();

    let P: Programma;
    let stippen: WebGLBuffer;
    let rijen = 0, aantal = 0;

    /* De stippen hangen af van de straal: een stip om de ~7 schermpixels. Na
       een andere maat (lade, knijpen) worden ze opnieuw gelegd. */
    const legStippen = (R: number) => {
      const nodig = dotRijen(R);
      if (rijen && Math.abs(nodig - rijen) <= 3) return;
      const data = maakDotWave(nodig);
      gl.bindBuffer(gl.ARRAY_BUFFER, stippen);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      rijen = nodig;
      aantal = data.length / STAP;
    };

    const opbouwen = () => {
      P = maakProgramma(gl, VS_STIPPEN, FS_STIPPEN, ['aPos', 'aZaad']);
      const buf = gl.createBuffer();
      if (!buf) throw new Error('geen buffer');
      stippen = buf;
      rijen = 0;
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

    const teken = () => {
      if (kwijt) return;
      gl.viewport(0, 0, W, H);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND);
      // Donker: licht telt op, zodat de plooien gloeien. Licht: inkt over de plaat.
      if (plaat === 'donker') gl.blendFuncSeparate(gl.ONE, gl.ONE, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      else gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

      const { cx, cy, R } = bolStand(W, H, zoom);
      legStippen(R);
      const inkt = DOT_INKT[plaat];
      const u = P.u;
      gl.useProgram(P.p);
      gl.bindBuffer(gl.ARRAY_BUFFER, stippen);
      gl.enableVertexAttribArray(0); gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, STAP * 4, 0);
      gl.vertexAttribPointer(1, 1, gl.FLOAT, false, STAP * 4, 12);
      const ry = rotY + auto;
      gl.uniform4f(u.uStand, Math.cos(ry), Math.sin(ry), Math.cos(rotX), Math.sin(rotX));
      gl.uniform2f(u.uMaat, W, H);
      gl.uniform2f(u.uMidden, cx, cy);
      gl.uniform1f(u.uR, R);
      gl.uniform1f(u.uFase, fase);
      gl.uniform1f(u.uAmp, 0.11 + b * 0.06);
      gl.uniform1f(u.uPuls, stem * 0.09);
      gl.uniform1f(u.uRad, dotMaat(R, rijen, plaat));
      gl.uniform3fv(u.uBoven, rgb(inkt.boven));
      gl.uniform3fv(u.uOnder, rgb(inkt.onder));
      gl.uniform3fv(u.uRand, rgb(inkt.rand));
      gl.uniform3fv(u.uTop, rgb(inkt.top));
      gl.uniform2f(u.uAlfa, inkt.alfa[0], inkt.alfa[1]);
      gl.uniform1f(u.uTopMix, inkt.topMix);
      gl.drawArrays(gl.POINTS, 0, aantal);
    };

    /* Loopt er werk op de achtergrond? Dan golft hij dieper en sneller, net als
       AxeCoreSphere ademt. Via subscribe: geen re-render per frame. */
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

      b = Math.min(1, boostRef.current + (werkt ? 0.6 : 0));
      if (!stil) {
        fase += dt * (0.16 + b * 0.39);
        if (!slepen) auto += (0.096 + b * 0.2) * dt;
      }
      if (!slepen && (Math.abs(snelY) > 0.002 || Math.abs(snelX) > 0.002)) {
        rotY += snelY * dt;
        rotX = Math.max(-1.3, Math.min(1.3, rotX + snelX * dt));
        const k = Math.exp(-dt * 3.2);
        snelY *= k; snelX *= k;
      }
      // Hij zwelt mee met AXE: hetzelfde signaal als de voice pulse.
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
