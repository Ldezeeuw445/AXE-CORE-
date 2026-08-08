/**
 * AXE Core — Neural view (Three.js brain).
 *
 * Adapted from the standalone prototype in three ways, all so it can live
 * inside Home's stage instead of owning the whole window:
 *   1. every DOM lookup is scoped to this component's root instead of
 *      `document`, so ids can't collide with the rest of the app;
 *   2. sizing and screen projection use the container's rect rather than
 *      `window.innerWidth/Height`, so labels land correctly when the view
 *      is not full-bleed;
 *   3. a ResizeObserver drives resize, because the container can change size
 *      without the window ever firing a resize event (sidebar collapse,
 *      panel toggle).
 */
import { memo, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { EffectComposer, RenderPass, EffectPass, BloomEffect, KernelSize } from 'postprocessing';
import { useGlobalMemoryStats, timeAgo, type GlobalMemoryStats, type HubId } from './useGlobalMemoryStats';
import './NeuralBrain.css';

/**
 * The view is built imperatively by the Three.js effect, so this shell must be
 * written to the DOM exactly once. It used to be inline in `NeuralBrain`, which
 * was safe only while that component held no state: adding the memory-stats
 * hook made it re-render, React re-applied `dangerouslySetInnerHTML`, and every
 * re-render silently wiped the scene — canvas, labels and hub rows included.
 * `memo` with a stable ref prop keeps it mounted through parent updates.
 */
const SHELL_HTML = `<div id="canvas-wrap"><canvas id="brain"></canvas></div>
<div id="labels"></div>
<svg id="leader-svg"></svg>

<div id="back-btn">← Terug naar Global Memory</div>
<div id="hub-info">
  <div class="breadcrumb">Global Memory / <span id="hi-crumb"></span></div>
  <h3 id="hi-title"></h3>
  <p id="hi-desc"></p>
  <div class="cnt" id="hi-count"></div>
</div>

<div id="composer">
  <div class="box">
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" style="color:var(--dim); flex-shrink:0;"><path d="M12 3l1.6 5.4L19 10l-5.4 1.6L12 17l-1.6-5.4L5 10l5.4-1.6L12 3z"/></svg>
    <input id="neural-input" type="text" placeholder="Ask anything..." />
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" style="color:var(--dim); flex-shrink:0;"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>
  </div>
  <div class="reply" id="neural-reply"></div>
</div>

<div class="sidebar" id="sidebar-left">
  <div class="panel">
    <h1 class="title">GLOBAL MEMORY</h1>
    <div class="status"><span class="d"></span> ACTIVE</div>
  </div>
  <div class="panel">
    <div class="search-box">
      <span style="display:flex; align-items:center; gap:9px;">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
        Search memories...
      </span>
      <span>⌘K</span>
    </div>
  </div>
  <div class="panel">
    <h2>MEMORY OVERVIEW</h2>
    <div class="stat-row"><span class="k">Total Memories</span><span class="v" id="stat-total">—</span></div>
    <div class="stat-row"><span class="k">Connections</span><span class="v" id="stat-connections">—</span></div>
    <div class="stat-row"><span class="k">Last Updated</span><span class="v" id="stat-updated">—</span></div>
    <div class="stat-row"><span class="k">Integrity</span><span class="v" id="stat-integrity">—</span></div>
    <div class="bar"><i id="stat-bar"></i></div>
  </div>
  <div class="panel" style="flex:1; min-height:0;">
    <h2>MEMORY HUBS</h2>
    <div id="hub-list"></div>
  </div>
  <div class="panel">
    <div class="legend" id="legend"></div>
  </div>
</div>

<div class="sidebar" id="sidebar-right">
  <div class="panel">
    <h2>ABOUT THIS VIEW</h2>
    <p class="about-text" id="about-text">Dit is jouw Global Memory. Het bevat alles wat AXE weet, onthoudt en leert over jou en onze gesprekken. Klik op een hub om dieper te verkennen.</p>
  </div>
  <div class="panel" style="flex:1; min-height:0; overflow-y:auto;">
    <h2>MEMORY STREAM <span class="live-tag"><span class="d"></span>LIVE</span></h2>
    <div id="stream-list"></div>
    <button class="viewall-btn" type="button">View all</button>
  </div>
  <div class="panel">
    <h2>BRAIN OVERVIEW</h2>
    <canvas id="mini-brain-canvas"></canvas>
    <div class="toggle-row"><span>Rotate</span><div class="switch on" id="sw-rotate"><i></i></div></div>
    <div class="toggle-row"><span>Auto Rotate</span><div class="switch on" id="sw-auto"><i></i></div></div>
  </div>
  <div class="panel">
    <div class="sync">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style="color:var(--green); flex-shrink:0;"><circle cx="12" cy="12" r="10" fill="currentColor" opacity="0.15"/><path d="M8 12.5l2.5 2.5L16 9" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
      <span><b>Memory synchronized</b>All systems up to date</span>
    </div>
  </div>
</div>

<div id="depthbar">
  <div class="label">DEPTH LEVEL</div>
  <div class="row" id="depth-row"></div>
</div>`;

const NeuralShell = memo(function NeuralShell(
  { rootRef }: { rootRef: React.RefObject<HTMLDivElement | null> },
) {
  return (
    <div className="axe-neural-root" ref={rootRef} dangerouslySetInnerHTML={{ __html: SHELL_HTML }} />
  );
});

export default function NeuralBrain() {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const stats = useGlobalMemoryStats();
  // The scene build is expensive and must not re-run when counts refresh every
  // 45s, so the effect below stays on an empty dep list and reads stats through
  // a ref; a second effect pushes new numbers into the DOM it already built.
  const statsRef = useRef<GlobalMemoryStats>(stats);
  statsRef.current = stats;
  const applyStatsRef = useRef<((s: GlobalMemoryStats) => void) | null>(null);
  // Bridges live memory activity into the WebGL scene without re-running the
  // expensive build effect: the scene registers a pulse trigger here, and the
  // stats effect calls it whenever a hub's memory count grows.
  const triggerHubPulseRef = useRef<((hubId: string, strength?: number) => void) | null>(null);
  const prevHubCountsRef = useRef<Record<string, number> | null>(null);

  useEffect(() => {
    const maybeRoot = rootRef.current;
    if (!maybeRoot) return;
    const root: HTMLDivElement = maybeRoot;

    /** All lookups scoped to this component — never the whole document. */
    const q = <T extends Element = HTMLElement>(sel: string): T | null =>
      root.querySelector<T>(sel);

    /* ============================== DATA ============================== */
    const HUBS = [
      { id: 'knowledge', name: 'Knowledge', color: 0x3b82f6, count: '7,214', pos: [0.3, 3.8, 2.5],
        desc: 'Alles wat AXE geleerd heeft over markten, systemen en strategie.' },
      { id: 'conversations', name: 'Conversations', color: 0xa855f7, count: '4,382', pos: [-3.4, 2.6, 2.8],
        desc: 'Elk strategiegesprek, debat en dagelijkse check-in met AXE.' },
      { id: 'tasksgoals', name: 'Tasks & Goals', color: 0x14b8a6, count: '3,896', pos: [3.3, 2.8, 1.8],
        desc: 'Waar je naartoe werkt, en wat er nu op de planning staat.' },
      { id: 'projects', name: 'Projects', color: 0x22c55e, count: '2,951', pos: [4.6, 0.2, 0.6],
        desc: 'AXE Companion, TradingOS en het ecosysteem dat ze verbindt.' },
      { id: 'insights', name: 'Insights', color: 0x38bdf8, count: '2,341', pos: [-4.6, -0.3, 0.4],
        desc: 'Patronen die AXE opmerkt in jouw gebruikers en jouw werk.' },
      { id: 'resources', name: 'Resources', color: 0xf59e0b, count: '1,987', pos: [-3.2, -3.0, 1.0],
        desc: 'Docs, assets en data feeds — alles waar AXE bij kan.' },
      { id: 'preferences', name: 'Preferences', color: 0xeab308, count: '1,542', pos: [3.4, -2.7, 1.2],
        desc: 'Hoe jij wilt dat AXE werkt, praat en zich gedraagt.' },
      { id: 'events', name: 'Events', color: 0xec4899, count: '579', pos: [0.2, -4.2, 1.0],
        desc: 'Launches, outages, milestones — de momenten die telden.' },
    ] as Array<{
      id: string; name: string; color: number; count: string; pos: number[]; desc: string;
      _phase?: number; _glowSprite?: THREE.Sprite; _hotSprite?: THREE.Sprite; _marker?: THREE.Group;
    }>;

    const TREE_DATA: Record<string, Array<{ name: string; leaves: string[] }>> = {
      knowledge: [
        { name: 'Market Structure', leaves: ['Order flow basics', 'Liquidity zones'] },
        { name: 'Risk Frameworks', leaves: ['Position sizing', 'Drawdown limits'] },
        { name: 'Technical Patterns', leaves: ['Trend continuation', 'Reversal setups'] },
      ],
      conversations: [
        { name: 'Strategy Sessions', leaves: ['Roadmap Q3', 'Pricing model'] },
        { name: 'Daily Check-ins', leaves: ['Morning sync', 'Blockers review'] },
        { name: 'Feature Debates', leaves: ['Voice UI', 'Onboarding flow'] },
      ],
      tasksgoals: [
        { name: 'Launch Checklist', leaves: ['App store listing', 'Beta invites'] },
        { name: 'Bug Backlog', leaves: ['Sync lag fix', 'Chart render bug'] },
        { name: 'Growth Targets', leaves: ['1k active users', 'Retention 40%'] },
      ],
      projects: [
        { name: 'AXE Companion', leaves: ['Mobile UI polish', 'Push notifications'] },
        { name: 'TradingOS App', leaves: ['PWA offline mode', 'Terminal view'] },
        { name: 'RAG Pipeline', leaves: ['Per-user embeddings', 'Vector refresh'] },
      ],
      insights: [
        { name: 'User Behavior', leaves: ['Peak usage hours', 'Drop-off screen'] },
        { name: 'Pricing Feedback', leaves: ['Tier confusion', 'Trial length'] },
        { name: 'Feature Requests', leaves: ['Dark mode', 'Alerts export'] },
      ],
      resources: [
        { name: 'API Docs', leaves: ['Supabase schema', 'Broker endpoints'] },
        { name: 'Design Assets', leaves: ['Icon set', 'Color tokens'] },
        { name: 'Data Feeds', leaves: ['Market data vendor', 'News API'] },
      ],
      preferences: [
        { name: 'Communication Style', leaves: ['Concise tone', 'Emoji off'] },
        { name: 'UI Theme', leaves: ['Dark mode default', 'Accent color'] },
        { name: 'Notifications', leaves: ['Trade alerts', 'Digest time'] },
      ],
      events: [
        { name: 'Product Launches', leaves: ['AXE Companion v1', 'TradingOS beta'] },
        { name: 'Milestones', leaves: ['First 100 users', 'Supabase sync live'] },
        { name: 'Outages', leaves: ['API downtime', 'Sync delay'] },
      ],
    };

    /* ============================== SETUP ============================== */
    const maybeCanvas = q<HTMLCanvasElement>('#brain');
    if (!maybeCanvas) return;
    const canvas: HTMLCanvasElement = maybeCanvas;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x020203);
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
    const brainGroup = new THREE.Group();
    scene.add(brainGroup);

    // Post-processing: a Bloom pass makes the bright vertex cores and hub peaks
    // radiate light, exactly like the reference image. Runs through an
    // EffectComposer instead of renderer.render() straight to the canvas.
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new BloomEffect({
      intensity: 1.7,
      luminanceThreshold: 0.08,
      luminanceSmoothing: 0.45,
      mipmapBlur: true,
      kernelSize: KernelSize.HUGE,
      radius: 0.85,
    });
    composer.addPass(new EffectPass(camera, bloom));

    /** Container size — not the window's, so projection stays correct when contained. */
    const viewSize = () => {
      const r = root.getBoundingClientRect();
      return { w: Math.max(1, r.width), h: Math.max(1, r.height) };
    };

    function resize() {
      const { w, h } = viewSize();
      renderer.setSize(w, h, false);
      composer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    resize();

    function makeDotTexture() {
      const size = 32;
      const cvs = document.createElement('canvas');
      cvs.width = cvs.height = size;
      const ctx = cvs.getContext('2d')!;
      const grd = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      grd.addColorStop(0, 'rgba(255,255,255,1)');
      grd.addColorStop(0.5, 'rgba(255,255,255,0.7)');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, size, size);
      return new THREE.CanvasTexture(cvs);
    }
    const dotTex = makeDotTexture();

    /**
     * Glowing star texture — a bright hot core, a soft coloured halo and four
     * thin diffraction spikes, so every vertex reads as a radiating star rather
     * than a flat dot. This is what gives the point cloud the "peaks radiating
     * light" quality of the reference once Bloom amplifies the bright centres.
     */
    function makeStarTexture() {
      const size = 128;
      const cvs = document.createElement('canvas');
      cvs.width = cvs.height = size;
      const ctx = cvs.getContext('2d')!;
      const c = size / 2;

      // Soft outer halo.
      const halo = ctx.createRadialGradient(c, c, 0, c, c, c);
      halo.addColorStop(0, 'rgba(255,255,255,1)');
      halo.addColorStop(0.14, 'rgba(255,255,255,0.9)');
      halo.addColorStop(0.4, 'rgba(255,255,255,0.28)');
      halo.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = halo;
      ctx.fillRect(0, 0, size, size);

      // Diffraction spikes — additive so they only brighten the halo.
      ctx.globalCompositeOperation = 'lighter';
      ctx.translate(c, c);
      const drawSpike = (angle: number, len: number, width: number) => {
        ctx.save();
        ctx.rotate(angle);
        const g = ctx.createLinearGradient(0, 0, 0, -len);
        g.addColorStop(0, 'rgba(255,255,255,0.85)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(-width, 0);
        ctx.lineTo(0, -len);
        ctx.lineTo(width, 0);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      };
      for (let i = 0; i < 4; i++) {
        drawSpike(i * Math.PI / 2, c * 0.95, 1.6);       // long cross
        drawSpike(i * Math.PI / 2 + Math.PI / 4, c * 0.45, 1.0); // shorter diagonals
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'source-over';

      const tex = new THREE.CanvasTexture(cvs);
      tex.needsUpdate = true;
      return tex;
    }
    const starTex = makeStarTexture();

    (function stars() {
      const N = 1600;
      const pos = new Float32Array(N * 3);
      for (let i = 0; i < N; i++) {
        const r = 40 + Math.random() * 60;
        const phi = Math.acos(2 * Math.random() - 1);
        const th = Math.random() * Math.PI * 2;
        pos[i * 3] = r * Math.sin(phi) * Math.cos(th);
        pos[i * 3 + 1] = r * Math.cos(phi);
        pos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(th);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const m = new THREE.PointsMaterial({
        map: dotTex, color: 0x6b7290, size: 0.09, transparent: true,
        opacity: 0.4, sizeAttenuation: true, depthWrite: false,
      });
      scene.add(new THREE.Points(g, m));
    })();

    /* ============================== HUB COLOR BLEND ============================== */
    function nearestHubBlend(pv: THREE.Vector3, hubColors: THREE.Color[], hubVecs: THREE.Vector3[]) {
      let d0 = 1e9, d1 = 1e9, idx0 = 0, idx1 = 1;
      for (let h = 0; h < hubVecs.length; h++) {
        const d = pv.distanceToSquared(hubVecs[h]);
        if (d < d0) { d1 = d0; idx1 = idx0; d0 = d; idx0 = h; }
        else if (d < d1) { d1 = d; idx1 = h; }
      }
      const w0 = 1 / (d0 + 1.1), w1 = 1 / (d1 + 1.1), wsum = w0 + w1;
      const col = new THREE.Color(0, 0, 0);
      col.r = (hubColors[idx0].r * w0 + hubColors[idx1].r * w1) / wsum;
      col.g = (hubColors[idx0].g * w0 + hubColors[idx1].g * w1) / wsum;
      col.b = (hubColors[idx0].b * w0 + hubColors[idx1].b * w1) / wsum;
      return { col, nearDist: Math.sqrt(d0), idx0 };
    }

    /* ============================== BRAIN SHAPE ==============================
     * The silhouette used to be a plain ellipsoid with fold noise, which reads
     * as a walnut-textured blob rather than a brain. What actually makes a
     * brain recognisable is the lobe structure — the temporal lobe hanging off
     * the side, the cerebellum tucked under the back, the stem below it — so
     * the shape is defined as a field of overlapping ellipsoids ("metaballs")
     * and the surface is wherever that field crosses a threshold.
     *
     * Anatomy is mirrored on x, so the two hemispheres come out of the same
     * definition and the longitudinal fissure falls naturally at x = 0.
     * Model axes: +x right, +y up, +z anterior (front of the head).
     */
    type Blob = { c: [number, number, number]; r: [number, number, number]; w: number };
    const BRAIN_BLOBS: Blob[] = (() => {
      // Half the brain, then mirrored. `w` weights how strongly each lobe
      // pushes the surface out where lobes overlap.
      // Proportions matter more than the lobe count: a cerebrum much longer
      // than it is tall reads as a slug, so the anterior-posterior axis is kept
      // to roughly 1.4x the height — about what a real brain measures in
      // profile.
      const half: Blob[] = [
        // Lateral (side-profile) brain. Seen down the +x axis we read the z-y
        // plane: z is length (front↔back), y is height. A real brain in profile
        // is only ~1.2x longer than tall with a big rounded crown, so the body
        // is kept tall and the lobes give the outline its bumps.
        { c: [0.95, 0.55, -0.15], r: [2.25, 2.95, 3.35], w: 1.00 }, // cerebrum body (tall)
        { c: [0.85, 1.75, -0.55], r: [1.95, 1.75, 2.55], w: 0.66 }, // parietal crown — rounds the top
        { c: [0.90, 0.15, 2.75], r: [1.90, 2.00, 1.85], w: 0.85 },  // frontal lobe (front, +z)
        { c: [0.85, 0.00, -3.05], r: [1.75, 1.90, 1.75], w: 0.80 }, // occipital lobe (back, -z)
        // The lower lobes must overlap the cerebrum, not merely sit under it, or
        // the ray march skips the gap and the underside dangles loose.
        { c: [1.55, -1.75, 1.15], r: [1.30, 1.15, 2.15], w: 0.80 }, // temporal lobe (hangs, forward)
        { c: [1.05, -1.65, -2.50], r: [1.45, 1.30, 1.50], w: 0.80 }, // cerebellum (lower back)
        { c: [1.35, -0.85, -0.70], r: [1.50, 1.70, 2.60], w: 0.55 }, // bridge: keeps the field continuous
      ];
      const mirrored = half.map(b => ({ ...b, c: [-b.c[0], b.c[1], b.c[2]] as [number, number, number] }));
      return [
        ...half,
        ...mirrored,
        { c: [0, -2.75, -0.55], r: [0.58, 1.50, 0.80], w: 0.5 },    // brain stem (on the midline, descends)
      ];
    })();

    const FIELD_ISO = 0.5;

    function brainField(x: number, y: number, z: number): number {
      let f = 0;
      for (let i = 0; i < BRAIN_BLOBS.length; i++) {
        const b = BRAIN_BLOBS[i];
        const dx = (x - b.c[0]) / b.r[0];
        const dy = (y - b.c[1]) / b.r[1];
        const dz = (z - b.c[2]) / b.r[2];
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < 1) {
          const t = 1 - d2;
          f += b.w * t * t * t;
        }
      }
      return f;
    }

    /**
     * Distance from the origin to the brain surface along a direction.
     *
     * Takes the *outermost* crossing rather than the first: the temporal lobe
     * overhangs, so a ray can leave and re-enter the field, and stopping at the
     * first crossing would slice the lobe off.
     */
    function marchRadius(dx: number, dy: number, dz: number): number {
      const MAX = 7.5, STEP = 0.06;
      let lastInside = -1;
      for (let r = 0.2; r <= MAX; r += STEP) {
        if (brainField(dx * r, dy * r, dz * r) >= FIELD_ISO) lastInside = r;
      }
      if (lastInside < 0) return 1.4; // direction misses every lobe — keep a small core
      let lo = lastInside, hi = lastInside + STEP;
      for (let i = 0; i < 18; i++) {
        const mid = (lo + hi) / 2;
        if (brainField(dx * mid, dy * mid, dz * mid) >= FIELD_ISO) lo = mid; else hi = mid;
      }
      return lo;
    }

    // Ray-marching per particle would mean ~100k marches; sampling a direction
    // grid once and interpolating gives the same silhouette for a fraction of
    // the work, and the fold noise hides any interpolation softness.
    const LUT_T = 192, LUT_P = 96;
    const radiusLUT = new Float32Array(LUT_T * LUT_P);
    for (let ti = 0; ti < LUT_T; ti++) {
      const theta = (ti / LUT_T) * Math.PI * 2;
      for (let pi = 0; pi < LUT_P; pi++) {
        const phi = (pi / (LUT_P - 1)) * Math.PI;
        const sp = Math.sin(phi);
        radiusLUT[ti * LUT_P + pi] = marchRadius(sp * Math.cos(theta), Math.cos(phi), sp * Math.sin(theta));
      }
    }

    function brainRadius(theta: number, phi: number): number {
      let t = ((theta % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      const tf = (t / (Math.PI * 2)) * LUT_T;
      const pf = THREE.MathUtils.clamp((phi / Math.PI) * (LUT_P - 1), 0, LUT_P - 1);
      const t0 = Math.floor(tf) % LUT_T, t1 = (t0 + 1) % LUT_T;
      const p0 = Math.floor(pf), p1 = Math.min(p0 + 1, LUT_P - 1);
      const ft = tf - Math.floor(tf), fp = pf - p0;
      const a = radiusLUT[t0 * LUT_P + p0], b = radiusLUT[t1 * LUT_P + p0];
      const c = radiusLUT[t0 * LUT_P + p1], d = radiusLUT[t1 * LUT_P + p1];
      return (a * (1 - ft) + b * ft) * (1 - fp) + (c * (1 - ft) + d * ft) * fp;
    }

    /** Drops a hub's stored direction onto the actual surface, just inside it. */
    function projectToSurface(pos: number[], inset = 0.84): THREE.Vector3 {
      const v = new THREE.Vector3(pos[0], pos[1], pos[2]).normalize();
      const phi = Math.acos(THREE.MathUtils.clamp(v.y, -1, 1));
      const theta = Math.atan2(v.z, v.x);
      return v.multiplyScalar(brainRadius(theta, phi) * inset);
    }

    // Hubs are authored as directions; the shape decides where they actually sit,
    // so they stay on the surface if the anatomy is ever retuned.
    HUBS.forEach(h => {
      const p = projectToSurface(h.pos);
      h.pos = [p.x, p.y, p.z];
    });

    /* ============================== BRAIN GEOMETRY ============================== */
    function outwardBasis(pos: number[]) {
      const outward = new THREE.Vector3(pos[0], pos[1], pos[2]).normalize();
      const up = Math.abs(outward.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
      const t1 = new THREE.Vector3().crossVectors(outward, up).normalize();
      const t2 = new THREE.Vector3().crossVectors(outward, t1).normalize();
      return { outward, t1, t2 };
    }

    function buildBrainGeometry(surfaceCount = 108000, coreBurstCount = 620, strandsPerHub = 230, strandLen = 26) {
      const burstTotal = HUBS.length * coreBurstCount;
      const filamentTotal = HUBS.length * strandsPerHub * strandLen;
      const total = surfaceCount + filamentTotal + burstTotal;
      const positions = new Float32Array(total * 3);
      const colors = new Float32Array(total * 3);
      const phases = new Float32Array(total);
      const sizes = new Float32Array(total);
      // Per-vertex routing info for the "living pulse": which hub a point
      // belongs to (-1 = generic surface, never pulses) and how far along its
      // strand it sits (0 at the hub, ~1 at the tip). A moving band in aDist
      // then reads as a light pulse travelling outward along the connections.
      const hubIdxArr = new Float32Array(total).fill(-1);
      const distArr = new Float32Array(total);
      const baseColor = new THREE.Color(0x05060f);
      const hubColors = HUBS.map(h => new THREE.Color(h.color));
      const hubVecs = HUBS.map(h => new THREE.Vector3(h.pos[0], h.pos[1], h.pos[2]));
      let idx = 0;

      // Points are rejection-sampled from a shell around the isosurface rather
      // than cast outward from the centre. Casting assumed every part of the
      // surface is visible from the origin, which the temporal lobe and
      // cerebellum break: rays skipped the gap under the overhang, leaving a
      // dark seam with the underside floating free. Sampling the field directly
      // has no such assumption, so overhangs come out whole.
      const BB = { x: 4.6, yLo: -4.8, yHi: 4.0, z: 5.0 };
      // Surface-only sampling produced a hollow bowl: with additive blending a
      // thin skin lights up at the silhouette edge and vanishes through the
      // middle. Accepting the whole interior and thinning it with depth keeps
      // the crisp outline while giving the mass something behind it.
      const SHELL_LO = FIELD_ISO * 0.96;
      let guard = 0;
      while (idx < surfaceCount && guard < surfaceCount * 60) {
        guard++;
        const px = (Math.random() * 2 - 1) * BB.x;
        const py = BB.yLo + Math.random() * (BB.yHi - BB.yLo);
        const pz = (Math.random() * 2 - 1) * BB.z;
        const f = brainField(px, py, pz);
        if (f < SHELL_LO) continue;

        // Gyral texture: bias which shell depth survives, so the surface gains
        // ridges and sulci instead of reading as a uniform fog.
        // Higher-frequency folding than a smooth blob needs: the reference's
        // surface reads as convolutions, which takes a ridged pattern rather
        // than a gentle wave.
        const fold = Math.sin(px * 3.4 + py * 2.2) * 0.5 + Math.sin(pz * 4.0 - py * 2.9) * 0.35
          + Math.sin(px * 6.9 + pz * 5.4) * 0.22 + Math.sin(py * 8.2 + px * 3.1) * 0.12;
        const depth = (f - FIELD_ISO) / FIELD_ISO;               // 0 at the skin, up inside
        // A soft falloff spread the mass through the whole volume and read as
        // fog. Concentrating hard on the shell is what makes the silhouette
        // legible; the small remaining interior keeps it from looking hollow.
        const skin = Math.exp(-Math.max(0, depth) * 5.5);
        const gyri = 0.45 + 0.55 * Math.abs(Math.sin(fold * 2.6 + depth * 4.0));
        if (Math.random() > skin * gyri) continue;

        const pv = new THREE.Vector3(px, py, pz);
        const { col, nearDist } = nearestHubBlend(pv, hubColors, hubVecs);
        const bright = THREE.MathUtils.clamp(1.95 - nearDist * 0.30, 0.16, 1.70);
        col.multiplyScalar(bright);
        col.lerp(baseColor, 0.06 + 0.55 * (1 - skin));
        // Longitudinal fissure — a real gap down the midline of the top surface.
        const fissure = Math.exp(-Math.pow(px * 1.5, 2)) * Math.max(0, py * 0.32);
        col.multiplyScalar(1 - Math.min(0.85, fissure));

        positions[idx * 3] = px; positions[idx * 3 + 1] = py; positions[idx * 3 + 2] = pz;
        colors[idx * 3] = col.r; colors[idx * 3 + 1] = col.g; colors[idx * 3 + 2] = col.b;
        phases[idx] = Math.random() * Math.PI * 2;
        sizes[idx] = (0.034 + Math.random() * 0.022) * (0.38 + 0.62 * skin);
        idx++;
      }
      // Whatever the guard cut short stays as zeroed, fully transparent points.
      idx = surfaceCount;

      // Fibre tracts. Without them the volume is just a cloud — the radiating
      // bundles are what make it read as neural rather than nebular. Each
      // strand walks outward through the field from its hub and stops when it
      // leaves the tissue, so filaments follow the anatomy instead of being
      // projected onto an assumed surface.
      HUBS.forEach((hub, hi) => {
        const hc = hubColors[hi];
        const origin = new THREE.Vector3(hub.pos[0], hub.pos[1], hub.pos[2]);
        const outward = origin.clone().normalize();
        for (let s = 0; s < strandsPerHub; s++) {
          // Biased outward, but wide enough that bundles fan through the lobe
          // rather than all spiking along one axis.
          const dir = new THREE.Vector3(
            Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1,
          ).normalize().lerp(outward, 0.45).normalize();
          const curl = new THREE.Vector3(
            Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5,
          ).multiplyScalar(0.035);
          const pos = origin.clone().addScaledVector(dir, 0.12 + Math.random() * 0.25);
          let alive = true;
          for (let k = 0; k < strandLen; k++) {
            if (alive) {
              dir.add(curl).normalize();
              pos.addScaledVector(dir, 0.115);
              if (brainField(pos.x, pos.y, pos.z) < FIELD_ISO * 0.9) alive = false;
            }
            const t = k / strandLen;
            // Dead strands keep writing at their last point with zero size, so
            // the buffer stays packed without a second sizing pass.
            const col = hc.clone().multiplyScalar(alive ? 1.95 - t * 1.0 : 0);
            positions[idx * 3] = pos.x; positions[idx * 3 + 1] = pos.y; positions[idx * 3 + 2] = pos.z;
            colors[idx * 3] = col.r; colors[idx * 3 + 1] = col.g; colors[idx * 3 + 2] = col.b;
            phases[idx] = Math.random() * Math.PI * 2;
            sizes[idx] = alive ? (0.048 - t * 0.018) + Math.random() * 0.012 : 0;
            hubIdxArr[idx] = hi;
            distArr[idx] = t;
            idx++;
          }
        }
      });

      // Hub core bursts — a dense particle cluster fused into the fiber cloud at
      // each hub, kept firmly in the hub's own hue so it reads as "brain
      // particles lit up in this color", not a separate marker floating on top.
      HUBS.forEach((hub, hi) => {
        const hc = hubColors[hi];
        const hpos = new THREE.Vector3(hub.pos[0], hub.pos[1], hub.pos[2]);
        const { outward, t1, t2 } = outwardBasis(hub.pos);
        for (let k = 0; k < coreBurstCount; k++) {
          const rr = 0.05 + Math.pow(Math.random(), 1.7) * 0.85;
          const ang = Math.random() * Math.PI * 2;
          const spread = Math.pow(Math.random(), 0.7) * rr * 1.3;
          const offset = t1.clone().multiplyScalar(Math.cos(ang) * spread)
            .add(t2.clone().multiplyScalar(Math.sin(ang) * spread))
            .add(outward.clone().multiplyScalar(rr * 0.55 + Math.random() * 0.08));
          const p = hpos.clone().add(offset);
          const t = THREE.MathUtils.clamp(rr / 0.85, 0, 1);
          const col = hc.clone().multiplyScalar(1.85 - t * 0.75);

          positions[idx * 3] = p.x; positions[idx * 3 + 1] = p.y; positions[idx * 3 + 2] = p.z;
          colors[idx * 3] = col.r; colors[idx * 3 + 1] = col.g; colors[idx * 3 + 2] = col.b;
          phases[idx] = Math.random() * Math.PI * 2;
          sizes[idx] = (0.05 - t * 0.024) + Math.random() * 0.012;
          hubIdxArr[idx] = hi;
          distArr[idx] = 0.02 + rr * 0.05;
          idx++;
        }
      });

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      geo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
      geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
      geo.setAttribute('aHub', new THREE.BufferAttribute(hubIdxArr, 1));
      geo.setAttribute('aDist', new THREE.BufferAttribute(distArr, 1));
      return geo;
    }

    // Per-hub "living pulse" state, shared into the shader as uniform arrays.
    // uPulsePos[i] is the current position of the pulse front along the strand
    // (0 at the hub → ~1.2 at the tip); uPulseStr[i] is its brightness, which
    // decays as the pulse travels. Driven from real memory activity below.
    const HUB_N = HUBS.length;
    const pulsePos: number[] = new Array(HUB_N).fill(-1);
    const pulseStr: number[] = new Array(HUB_N).fill(0);
    const brainUniforms = {
      uTime: { value: 0 },
      uOpacity: { value: 1.0 },
      uTex: { value: starTex },
      uPulsePos: { value: pulsePos },
      uPulseStr: { value: pulseStr },
    };
    const brainMat = new THREE.ShaderMaterial({
      uniforms: brainUniforms, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
      vertexShader: `
        attribute vec3 color;
        attribute float aPhase;
        attribute float aSize;
        attribute float aHub;
        attribute float aDist;
        varying vec3 vColor;
        varying float vTwinkle;
        varying float vPulse;
        uniform float uTime;
        uniform float uPulsePos[${HUB_N}];
        uniform float uPulseStr[${HUB_N}];
        void main(){
          vColor = color;
          vTwinkle = 0.7 + 0.4*sin(uTime*1.1 + aPhase);
          // Light pulse: a moving bright band in aDist for the active hub.
          float pulse = 0.0;
          for(int i=0;i<${HUB_N};i++){
            if(uPulseStr[i] > 0.001 && abs(aHub - float(i)) < 0.5){
              float band = exp(-pow((aDist - uPulsePos[i]) * 7.0, 2.0));
              pulse += band * uPulseStr[i];
            }
          }
          vPulse = pulse;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * (vTwinkle + pulse * 2.2) * (1150.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        varying float vTwinkle;
        varying float vPulse;
        uniform float uOpacity;
        uniform sampler2D uTex;
        void main(){
          vec4 tex = texture2D(uTex, gl_PointCoord);
          float a = tex.a * uOpacity * (0.55 + 0.45*vTwinkle) + tex.a * vPulse * 0.9;
          a = min(a, 1.0);
          if(a < 0.008) discard;
          // Push the hot centre well above 1.0 so the Bloom pass treats each
          // vertex core (and any pulse it carries) as a light source.
          vec3 col = vColor * (1.0 + tex.r * 0.9 + vPulse * 2.6);
          gl_FragColor = vec4(col, a);
        }
      `,
    });
    const brainPoints = new THREE.Points(buildBrainGeometry(132000, 760, 340, 30), brainMat);
    brainGroup.add(brainPoints);

    /* ============================== LIVING PULSE ============================== */
    // A pulse is a bright band that starts at a hub (aDist 0) and travels
    // outward along that hub's strands. Real memory activity fires them via
    // triggerHubPulseRef; a gentle ambient cadence keeps a connection breathing
    // while the app is idle so the brain always feels alive.
    function firePulse(i: number, strength = 1.0) {
      if (i < 0 || i >= HUB_N) return;
      pulsePos[i] = 0;
      pulseStr[i] = Math.max(pulseStr[i], strength);
      const spr = HUBS[i]._hotSprite;
      if (spr) (spr.material as THREE.SpriteMaterial).opacity = 1.0; // flash the source
    }
    triggerHubPulseRef.current = (hubId: string, strength = 1.0) => {
      firePulse(HUBS.findIndex(h => h.id === hubId), strength);
    };
    let ambientPulseAt = 0;

    (function sparkles() {
      const N = 1700;
      const positions = new Float32Array(N * 3), colors = new Float32Array(N * 3);
      const hubColors = HUBS.map(h => new THREE.Color(h.color));
      const hubVecs = HUBS.map(h => new THREE.Vector3(h.pos[0], h.pos[1], h.pos[2]));
      for (let i = 0; i < N; i++) {
        const phi = Math.acos(2 * Math.random() - 1), theta = Math.random() * Math.PI * 2;
        const shellJ = 0.88 + Math.random() * 0.2;
        const R = brainRadius(theta, phi) * shellJ;
        const px = Math.sin(phi) * Math.cos(theta) * R;
        const py = Math.cos(phi) * R;
        const pz = Math.sin(phi) * Math.sin(theta) * R;
        const { col } = nearestHubBlend(new THREE.Vector3(px, py, pz), hubColors, hubVecs);
        col.lerp(new THREE.Color(0xffffff), 0.55);
        positions[i * 3] = px; positions[i * 3 + 1] = py; positions[i * 3 + 2] = pz;
        colors[i * 3] = col.r; colors[i * 3 + 1] = col.g; colors[i * 3 + 2] = col.b;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      const m = new THREE.PointsMaterial({
        map: starTex, size: 0.11, vertexColors: true, transparent: true, opacity: 0.9,
        sizeAttenuation: true, blending: THREE.AdditiveBlending, depthWrite: false,
      });
      brainGroup.add(new THREE.Points(g, m));
    })();

    /* ---- hub markers ---- */
    function makeGlowTexture(hex: number, hot: boolean) {
      const col = new THREE.Color(hex);
      const r = Math.round(col.r * 255), g = Math.round(col.g * 255), b = Math.round(col.b * 255);
      const hr = Math.min(255, Math.round(r * 1.5 + 40)), hg = Math.min(255, Math.round(g * 1.5 + 40)), hb = Math.min(255, Math.round(b * 1.5 + 40));
      const size = 128;
      const cvs = document.createElement('canvas');
      cvs.width = cvs.height = size;
      const ctx = cvs.getContext('2d')!;
      const grd = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      if (hot) {
        grd.addColorStop(0, `rgba(${hr},${hg},${hb},1)`);
        grd.addColorStop(0.22, `rgba(${r},${g},${b},0.95)`);
        grd.addColorStop(1, `rgba(${r},${g},${b},0)`);
      } else {
        grd.addColorStop(0, `rgba(${r},${g},${b},1)`);
        grd.addColorStop(0.35, `rgba(${r},${g},${b},0.6)`);
        grd.addColorStop(1, `rgba(${r},${g},${b},0)`);
      }
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, size, size);
      return new THREE.CanvasTexture(cvs);
    }

    const hitMeshes: THREE.Mesh[] = [];
    HUBS.forEach(hub => {
      const grp = new THREE.Group();
      grp.position.set(hub.pos[0], hub.pos[1], hub.pos[2]);

      const glow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: makeGlowTexture(hub.color, false), transparent: true,
        blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.5,
      }));
      glow.scale.set(0.5, 0.5, 0.5);
      grp.add(glow);

      const hot = new THREE.Sprite(new THREE.SpriteMaterial({
        map: makeGlowTexture(hub.color, true), transparent: true,
        blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.95,
      }));
      hot.scale.set(0.14, 0.14, 0.14);
      grp.add(hot);

      // A star-textured glint gives each hub the radiating diffraction spikes
      // of the reference's bright nodes; Bloom then turns it into a light peak.
      const glint = new THREE.Sprite(new THREE.SpriteMaterial({
        map: starTex, color: new THREE.Color(hub.color).lerp(new THREE.Color(0xffffff), 0.65),
        transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.9,
      }));
      glint.scale.set(0.62, 0.62, 0.62);
      grp.add(glint);

      const core = new THREE.Mesh(new THREE.SphereGeometry(0.055, 16, 16), new THREE.MeshBasicMaterial({ color: hub.color }));
      grp.add(core);

      const hit = new THREE.Mesh(new THREE.SphereGeometry(0.62, 8, 8), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 }));
      hit.userData.hub = hub;
      grp.add(hit);
      hitMeshes.push(hit);

      hub._phase = Math.random() * Math.PI * 2;
      hub._glowSprite = glow;
      hub._hotSprite = hot;

      brainGroup.add(grp);
      hub._marker = grp;
    });

    /* ============================== MINI BRAIN ============================== */
    const miniCanvas = q<HTMLCanvasElement>('#mini-brain-canvas');
    const miniRenderer = miniCanvas
      ? new THREE.WebGLRenderer({ canvas: miniCanvas, antialias: true, alpha: true })
      : null;
    const miniScene = new THREE.Scene();
    const miniCamera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    miniCamera.position.set(0, 1.5, 10);
    miniCamera.lookAt(0, 0, 0);
    const miniGroup = new THREE.Group();
    miniScene.add(miniGroup);
    miniGroup.add(new THREE.Points(
      buildBrainGeometry(4200, 26),
      new THREE.PointsMaterial({
        map: starTex, size: 0.07, vertexColors: true, transparent: true, opacity: 0.9,
        sizeAttenuation: true, blending: THREE.AdditiveBlending, depthWrite: false,
      }),
    ));
    function resizeMini() {
      if (!miniCanvas || !miniRenderer) return;
      const w = miniCanvas.clientWidth || 240, h = miniCanvas.clientHeight || 76;
      miniRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      miniRenderer.setSize(w, h, false);
      miniCamera.aspect = w / h;
      miniCamera.updateProjectionMatrix();
    }
    resizeMini();

    /* ============================== LABELS ============================== */
    const labelsLayer = q('#labels')!;
    const leaderSvg = q<SVGSVGElement>('#leader-svg')!;
    const svgDefs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    svgDefs.innerHTML = `<filter id="streakBlur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.6"/></filter>`;
    leaderSvg.appendChild(svgDefs);

    const hubLabelEls: Record<string, HTMLElement> = {};
    const hubLeaderLines: Record<string, { glow: SVGLineElement; core: SVGLineElement }> = {};

    HUBS.forEach(hub => {
      const el = document.createElement('div');
      el.className = 'hub-label';
      el.style.color = '#' + hub.color.toString(16).padStart(6, '0');
      el.innerHTML = `<span class="dot" style="background:currentColor"></span><span><span style="color:var(--text)">${hub.name}</span><span class="sub" data-hub-sub="${hub.id}">${hub.count} memories</span></span>`;
      el.addEventListener('click', () => zoomToHub(hub));
      labelsLayer.appendChild(el);
      hubLabelEls[hub.id] = el;

      const hex = '#' + hub.color.toString(16).padStart(6, '0');
      const glowLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      glowLine.setAttribute('stroke', hex);
      glowLine.setAttribute('stroke-width', '3.5');
      glowLine.setAttribute('stroke-linecap', 'round');
      glowLine.setAttribute('opacity', '0.5');
      glowLine.setAttribute('filter', 'url(#streakBlur)');
      leaderSvg.appendChild(glowLine);

      const coreLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      coreLine.setAttribute('stroke', hex);
      coreLine.setAttribute('stroke-width', '1.3');
      coreLine.setAttribute('stroke-linecap', 'round');
      coreLine.setAttribute('opacity', '0.85');
      leaderSvg.appendChild(coreLine);

      hubLeaderLines[hub.id] = { glow: glowLine, core: coreLine };
    });

    function toScreen(vec3: THREE.Vector3) {
      const { w, h } = viewSize();
      const p = vec3.clone().project(camera);
      if (p.z > 1) return null;
      return { x: (p.x * 0.5 + 0.5) * w, y: (-p.y * 0.5 + 0.5) * h };
    }

    /* ============================== CAMERA ORBIT ============================== */
    // Sagittal view. A three-quarter angle foreshortens the front-to-back axis,
    // which is exactly the axis the lobe structure lives on — side-on is what
    // makes it read as a brain rather than a mass. Camera sits on -x so the
    // frontal pole (+z) falls on screen-left, matching the reference.
    const VIEW = { azimuth: -Math.PI / 2, elevation: 0.06, distance: 11.2 };
    const state = { ...VIEW, target: new THREE.Vector3(0, 0, 0) };
    const goal = { ...VIEW, target: new THREE.Vector3(0, 0, 0) };
    let dragEnabled = true;
    let autoRotate = true;
    let activeHub: (typeof HUBS)[number] | null = null;
    let currentDepth = 1;

    function updateCameraFromState() {
      camera.position.set(
        state.target.x + state.distance * Math.cos(state.elevation) * Math.sin(state.azimuth),
        state.target.y + state.distance * Math.sin(state.elevation),
        state.target.z + state.distance * Math.cos(state.elevation) * Math.cos(state.azimuth),
      );
      camera.lookAt(state.target);
    }
    updateCameraFromState();

    /* ============================== POINTER ============================== */
    let isDown = false, moved = 0, lastX = 0, lastY = 0;
    const onPointerDown = (e: PointerEvent) => {
      isDown = true; lastX = e.clientX; lastY = e.clientY; moved = 0;
      canvas.classList.add('dragging');
    };
    canvas.addEventListener('pointerdown', onPointerDown);

    function onPointerMove(e: PointerEvent) {
      if (!isDown) return;
      const dx = e.clientX - lastX, dy = e.clientY - lastY;
      lastX = e.clientX; lastY = e.clientY;
      moved += Math.abs(dx) + Math.abs(dy);
      if (!dragEnabled) return;
      goal.azimuth -= dx * 0.005;
      goal.elevation = THREE.MathUtils.clamp(goal.elevation + dy * 0.005, -1.3, 1.3);
      state.azimuth = goal.azimuth;
      state.elevation = goal.elevation;
    }
    window.addEventListener('pointermove', onPointerMove);

    function onPointerUp(e: PointerEvent) {
      if (!isDown) return;
      isDown = false;
      canvas.classList.remove('dragging');
      if (moved < 6) handleClick(e.clientX, e.clientY);
    }
    window.addEventListener('pointerup', onPointerUp);

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const min = activeHub ? 1.8 : 3.5, max = activeHub ? 9 : 22;
      goal.distance = THREE.MathUtils.clamp(goal.distance + e.deltaY * 0.012, min, max);
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });

    const raycaster = new THREE.Raycaster();
    function handleClick(clientX: number, clientY: number) {
      // Client coords are viewport-relative; convert against the container's
      // box, not the window, or hit-testing drifts when the view is contained.
      const r = root.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((clientX - r.left) / r.width) * 2 - 1,
        -((clientY - r.top) / r.height) * 2 + 1,
      );
      raycaster.setFromCamera(ndc, camera);
      const hits = raycaster.intersectObjects(hitMeshes);
      if (hits.length) zoomToHub(hits[0].object.userData.hub);
    }

    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') zoomToGlobal(); };
    window.addEventListener('keydown', onKeyDown);

    /* ============================== HUB ZOOM / TREE ============================== */
    type TreeNode = { el: HTMLElement; pos: THREE.Vector3; level: number; parentLine?: THREE.Line; parentMesh?: THREE.Mesh };
    let treeData: { group: THREE.Group; nodes: TreeNode[] } | null = null;

    function buildTree(hub: (typeof HUBS)[number]) {
      const group = new THREE.Group();
      const hubPos = new THREE.Vector3(hub.pos[0], hub.pos[1], hub.pos[2]);
      const { outward, t1, t2 } = outwardBasis(hub.pos);
      const branches = TREE_DATA[hub.id];
      const nodes: TreeNode[] = [];
      const lineMat = new THREE.LineBasicMaterial({ color: hub.color, transparent: true, opacity: 0.55 });

      // Ambient nebula fill, so the tree feels immersed in a dense particle
      // field around the hub instead of floating in empty space once zoomed in.
      (function nebula() {
        const N = 2600;
        const positions = new Float32Array(N * 3);
        const colors = new Float32Array(N * 3);
        const phases = new Float32Array(N);
        const sizes = new Float32Array(N);
        const hc = new THREE.Color(hub.color);
        for (let i = 0; i < N; i++) {
          const rr = 0.3 + Math.pow(Math.random(), 0.6) * 3.6;
          const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
          const bias = outward.clone().multiplyScalar(-0.4);
          const p = hubPos.clone().add(dir.multiplyScalar(rr)).add(bias.multiplyScalar(rr / 3.9));
          const t = THREE.MathUtils.clamp(rr / 3.9, 0, 1);
          const col = hc.clone().multiplyScalar(1.5 - t * 0.9);
          positions[i * 3] = p.x; positions[i * 3 + 1] = p.y; positions[i * 3 + 2] = p.z;
          colors[i * 3] = col.r; colors[i * 3 + 1] = col.g; colors[i * 3 + 2] = col.b;
          phases[i] = Math.random() * Math.PI * 2;
          sizes[i] = 0.022 + Math.random() * 0.03;
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        g.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
        g.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
        const mat = new THREE.ShaderMaterial({
          uniforms: brainUniforms, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
          vertexShader: `
            attribute vec3 color; attribute float aPhase; attribute float aSize;
            varying vec3 vColor; varying float vTwinkle; uniform float uTime;
            void main(){
              vColor = color;
              vTwinkle = 0.6 + 0.4*sin(uTime*1.0 + aPhase);
              vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
              gl_PointSize = aSize * vTwinkle * (800.0 / -mvPosition.z);
              gl_Position = projectionMatrix * mvPosition;
            }
          `,
          fragmentShader: `
            varying vec3 vColor; varying float vTwinkle;
            uniform sampler2D uTex;
            void main(){
              vec4 tex = texture2D(uTex, gl_PointCoord);
              float a = tex.a * 0.8 * (0.5+0.5*vTwinkle);
              if(a < 0.008) discard;
              gl_FragColor = vec4(vColor * (1.0 + tex.r * 0.7), a);
            }
          `,
        });
        group.add(new THREE.Points(g, mat));
      })();

      branches.forEach((branch, bi) => {
        const angle = (bi / branches.length) * Math.PI * 2;
        const dir = outward.clone().multiplyScalar(-1.5)
          .add(t1.clone().multiplyScalar(Math.cos(angle) * 1.35))
          .add(t2.clone().multiplyScalar(Math.sin(angle) * 1.35));
        const bPos = hubPos.clone().add(dir);

        const lineGeo = new THREE.BufferGeometry().setFromPoints([hubPos, bPos]);
        group.add(new THREE.Line(lineGeo, lineMat));

        const bMesh = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 12), new THREE.MeshBasicMaterial({ color: hub.color }));
        bMesh.position.copy(bPos);
        group.add(bMesh);

        const bLabel = document.createElement('div');
        bLabel.className = 'node-label';
        bLabel.style.color = '#' + hub.color.toString(16).padStart(6, '0');
        bLabel.textContent = branch.name;
        labelsLayer.appendChild(bLabel);
        nodes.push({ el: bLabel, pos: bPos, level: 1 });

        branch.leaves.forEach((leaf, li) => {
          const leafAngle = angle + (li - 0.5) * 0.55;
          const leafDir = dir.clone().normalize().multiplyScalar(1.15)
            .add(t1.clone().multiplyScalar(Math.cos(leafAngle) * 0.65))
            .add(t2.clone().multiplyScalar(Math.sin(leafAngle) * 0.65));
          const lPos = bPos.clone().add(leafDir);

          const lGeo = new THREE.BufferGeometry().setFromPoints([bPos, lPos]);
          const lLine = new THREE.Line(lGeo, lineMat);
          group.add(lLine);

          const lMesh = new THREE.Mesh(new THREE.SphereGeometry(0.065, 10, 10), new THREE.MeshBasicMaterial({ color: hub.color }));
          lMesh.position.copy(lPos);
          group.add(lMesh);

          const lLabel = document.createElement('div');
          lLabel.className = 'node-label leaf';
          lLabel.style.color = '#' + hub.color.toString(16).padStart(6, '0');
          lLabel.textContent = leaf;
          labelsLayer.appendChild(lLabel);
          nodes.push({ el: lLabel, pos: lPos, level: 2, parentLine: lLine, parentMesh: lMesh });
        });
      });

      brainGroup.add(group);
      return { group, nodes };
    }

    function clearTree() {
      if (!treeData) return;
      treeData.nodes.forEach(n => n.el.remove());
      brainGroup.remove(treeData.group);
      treeData.group.traverse(o => {
        const mesh = o as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        if (mesh.material) {
          const m = mesh.material as THREE.Material | THREE.Material[];
          if (Array.isArray(m)) m.forEach(mm => mm.dispose());
          else m.dispose();
        }
      });
      treeData = null;
    }

    function applyDepth() {
      root.querySelectorAll<HTMLElement>('.depth-btn').forEach(b => {
        b.classList.toggle('active', Number(b.dataset.d) === currentDepth);
      });
      if (!treeData) return;
      const leafVisible = currentDepth >= 2;
      treeData.nodes.filter(n => n.level === 2).forEach(n => {
        if (n.parentLine) n.parentLine.visible = leafVisible;
        if (n.parentMesh) n.parentMesh.visible = leafVisible;
      });
    }

    function zoomToHub(hub: (typeof HUBS)[number]) {
      if (activeHub && activeHub.id === hub.id) return;
      clearTree();
      activeHub = hub;
      treeData = buildTree(hub);
      applyDepth();

      const { outward } = outwardBasis(hub.pos);
      const focusPoint = new THREE.Vector3(hub.pos[0], hub.pos[1], hub.pos[2]).add(outward.clone().multiplyScalar(-0.9));
      goal.target.copy(focusPoint);
      goal.distance = 5.4;
      goal.azimuth = Math.atan2(outward.x, outward.z);
      goal.elevation = THREE.MathUtils.clamp(Math.asin(THREE.MathUtils.clamp(outward.y, -1, 1)) * 0.55, -1.2, 1.2);

      const backBtn = q('#back-btn'); if (backBtn) backBtn.style.display = 'flex';
      const hubInfo = q('#hub-info'); if (hubInfo) hubInfo.style.display = 'block';
      const set = (sel: string, txt: string) => { const el = q(sel); if (el) el.textContent = txt; };
      set('#hi-crumb', hub.name);
      set('#hi-title', hub.name);
      set('#hi-desc', hub.desc);
      set('#hi-count', hub.count + ' memories in deze hub');
      set('#about-text', hub.desc);

      root.querySelectorAll<HTMLElement>('.hub-row').forEach(r => r.classList.toggle('active', r.dataset.id === hub.id));
      Object.values(hubLabelEls).forEach(el => { el.style.opacity = '0'; });
      Object.values(hubLeaderLines).forEach(l => { l.glow.style.opacity = '0'; l.core.style.opacity = '0'; });
    }

    function zoomToGlobal() {
      if (!activeHub) return;
      activeHub = null;
      clearTree();
      goal.target.set(0, 0, 0);
      goal.distance = 14.5;
      const backBtn = q('#back-btn'); if (backBtn) backBtn.style.display = 'none';
      const hubInfo = q('#hub-info'); if (hubInfo) hubInfo.style.display = 'none';
      const about = q('#about-text');
      if (about) about.textContent = 'Dit is jouw Global Memory. Het bevat alles wat AXE weet, onthoudt en leert over jou en onze gesprekken. Klik op een hub om dieper te verkennen.';
      root.querySelectorAll('.hub-row').forEach(r => r.classList.remove('active'));
      Object.values(hubLabelEls).forEach(el => { el.style.opacity = '1'; });
    }

    /* ============================== UI ============================== */
    const hubList = q('#hub-list');
    HUBS.forEach(hub => {
      const row = document.createElement('div');
      row.className = 'hub-row';
      row.dataset.id = hub.id;
      row.style.color = '#' + hub.color.toString(16).padStart(6, '0');
      row.innerHTML = `<span class="avatar-badge" style="color:currentColor"></span><span class="name">${hub.name}</span><span class="count" data-hub-count="${hub.id}">${hub.count}</span>`;
      row.addEventListener('click', () => zoomToHub(hub));
      hubList?.appendChild(row);
    });

    /**
     * Pushes live counts into the already-built DOM. Kept imperative on purpose:
     * re-rendering this view through React would tear down the WebGL scene.
     */
    function applyStats(s: GlobalMemoryStats) {
      const nf = new Intl.NumberFormat('nl-NL');
      HUBS.forEach(hub => {
        const n = s.hubCounts[hub.id as HubId] ?? 0;
        hub.count = nf.format(n);
        const row = root.querySelector(`[data-hub-count="${hub.id}"]`);
        if (row) row.textContent = hub.count;
        const sub = root.querySelector(`[data-hub-sub="${hub.id}"]`);
        if (sub) sub.textContent = `${hub.count} memories`;
      });

      const set = (sel: string, txt: string) => {
        const el = root.querySelector(sel);
        if (el) el.textContent = txt;
      };
      set('#stat-total', s.loading ? '…' : nf.format(s.total));
      set('#stat-connections', s.loading ? '…' : nf.format(s.connections));
      set('#stat-updated', s.lastUpdatedAt ? timeAgo(new Date(s.lastUpdatedAt).getTime()) : '—');
      set('#stat-integrity', s.integrityPct == null ? '—' : `${s.integrityPct}%`);
      const bar = root.querySelector<HTMLElement>('#stat-bar');
      if (bar) bar.style.width = `${s.integrityPct ?? 0}%`;

      const list = q('#stream-list');
      if (list) {
        list.innerHTML = '';
        if (!s.stream.length) {
          const empty = document.createElement('div');
          empty.className = 'stream-empty';
          empty.textContent = s.loading ? 'Loading activity…' : 'No activity yet';
          list.appendChild(empty);
        }
        s.stream.slice(0, 8).forEach(item => {
          const d = document.createElement('div');
          d.className = 'stream-item';
          const hex = '#' + item.color.toString(16).padStart(6, '0');
          d.innerHTML = `<span class="sd" style="background:${hex}; color:${hex};"></span><div class="body"><div class="t">${timeAgo(item.ts)}</div><div class="l1">${item.title}</div><div class="l2">${item.subtitle}</div></div>`;
          list.appendChild(d);
        });
      }
    }
    applyStatsRef.current = applyStats;
    applyStats(statsRef.current);

    const depthRow = q('#depth-row');
    [1, 2, 3, 4, 5].forEach(d => {
      const b = document.createElement('div');
      b.className = 'depth-btn' + (d === 2 ? ' active' : '') + (d === 5 ? ' locked' : '');
      b.dataset.d = String(d);
      b.innerHTML = d === 5
        ? '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>'
        : String(d);
      b.addEventListener('click', () => { if (d === 5) return; currentDepth = d; applyDepth(); });
      depthRow?.appendChild(b);
    });

    const LEGEND_ICONS = {
      navigate: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="6" y="3" width="12" height="18" rx="6"/><path d="M12 7v4"/></svg>',
      scroll: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="6" y="3" width="12" height="18" rx="6"/><path d="M9 9l3-3 3 3M9 15l3 3 3-3"/></svg>',
      click: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M9 3v9M9 3l6 5-3 1 2 5-2 1-2-5-1 3-3-9z"/></svg>',
      zoom: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="10" cy="10" r="6"/><path d="M20 20l-5-5"/></svg>',
      back: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>',
    };
    const legend = q('#legend');
    if (legend) {
      legend.innerHTML = `
        <div class="row"><span class="ic-wrap">${LEGEND_ICONS.navigate}</span>Navigate</div>
        <div class="row"><span class="ic-wrap">${LEGEND_ICONS.scroll}</span>Scroll</div>
        <div class="row"><span class="ic-wrap">${LEGEND_ICONS.click}</span>Click</div>
        <div class="row"><span class="ic-wrap">${LEGEND_ICONS.zoom}</span>Zoom</div>
        <div class="row"><span class="ic-wrap">${LEGEND_ICONS.back}</span>Back</div>
      `;
    }

    const swRotate = q('#sw-rotate');
    const swAuto = q('#sw-auto');
    const onRotate = () => { dragEnabled = !dragEnabled; swRotate?.classList.toggle('on', dragEnabled); };
    const onAuto = () => { autoRotate = !autoRotate; swAuto?.classList.toggle('on', autoRotate); };
    const backBtnEl = q('#back-btn');
    backBtnEl?.addEventListener('click', zoomToGlobal);
    swRotate?.addEventListener('click', onRotate);
    swAuto?.addEventListener('click', onAuto);

    /* ============================== COMPOSER ============================== */
    function handleNeuralQuery(qs: string) {
      const query = qs.toLowerCase();
      const hub = HUBS.find(h => query.includes(h.name.toLowerCase()) || query.includes(h.id));
      if (hub) { zoomToHub(hub); return `Ik zoom in op ${hub.name} — ${hub.count} memories. ${hub.desc}`; }
      for (const h of HUBS) {
        for (const b of TREE_DATA[h.id]) {
          if (query.includes(b.name.toLowerCase())) { zoomToHub(h); return `Gevonden onder ${h.name} → ${b.name}.`; }
          for (const leaf of b.leaves) {
            if (query.includes(leaf.toLowerCase())) { zoomToHub(h); return `"${leaf}" leeft in ${h.name} → ${b.name}.`; }
          }
        }
      }
      return `Doorzoeken van 24.892 memories voor "${qs}"… (koppel dit veld aan je AXE Core / Memory agent API voor live antwoorden)`;
    }
    const neuralInput = q<HTMLInputElement>('#neural-input');
    const neuralReply = q('#neural-reply');
    const onInputKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && neuralInput && neuralInput.value.trim() && neuralReply) {
        neuralReply.textContent = handleNeuralQuery(neuralInput.value.trim());
        neuralReply.style.display = 'block';
        neuralInput.value = '';
      }
    };
    neuralInput?.addEventListener('keydown', onInputKey);

    /* ============================== RESIZE ============================== */
    // The container can resize without the window ever firing resize (sidebar
    // collapse, panel toggle), so observe the element itself.
    const ro = new ResizeObserver(() => { resize(); resizeMini(); });
    ro.observe(root);
    window.addEventListener('resize', resize);

    /* ============================== ANIMATE ============================== */
    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

    let rafId = 0;
    let lastNow = performance.now() * 0.001;
    function animate() {
      rafId = requestAnimationFrame(animate);
      const t = performance.now() * 0.001;
      const dt = Math.min(0.05, Math.max(0, t - lastNow));
      lastNow = t;

      // Advance the living pulses: each travels outward along its hub's strands
      // and fades as it goes; a slow ambient cadence keeps one breathing.
      for (let i = 0; i < HUB_N; i++) {
        if (pulseStr[i] > 0.001) {
          pulsePos[i] += dt * 1.5;
          pulseStr[i] *= Math.exp(-dt * 2.1);
          if (pulsePos[i] > 1.35 || pulseStr[i] < 0.02) { pulseStr[i] = 0; pulsePos[i] = -1; }
        }
      }
      if (!activeHub && t - ambientPulseAt > 2.6) {
        ambientPulseAt = t;
        const i = Math.floor(Math.random() * HUB_N);
        if (pulseStr[i] < 0.05) firePulse(i, 0.7);
      }

      // Was a continuous spin (+= per frame) — the camera's sagittal azimuth
      // (see VIEW above, "side-on is what makes it read as a brain rather
      // than a mass") only holds for as long as the brain isn't ALSO turning
      // on its own axis; a full rotation drifts through the same front/back
      // angles the camera was deliberately placed to avoid, which is when
      // it reads as a smooth mass instead of a brain. A bounded oscillation
      // keeps the "alive" motion without ever leaving the good angle range.
      // Hold the sagittal (side-profile) silhouette much more strictly: a
      // small, slow bob (±~7°) keeps the view "alive" without ever drifting
      // toward the front/back angles that flatten the brain into a mass.
      if (autoRotate && !activeHub) brainGroup.rotation.y = Math.sin(t * 0.09) * 0.12;
      // Same fix as brainGroup below: bounded oscillation, not a full spin.
      miniGroup.rotation.y = Math.sin(t * 0.12) * 0.16;

      if (!isDown) {
        state.azimuth = lerp(state.azimuth, goal.azimuth, 0.06);
        state.elevation = lerp(state.elevation, goal.elevation, 0.06);
      }
      state.distance = lerp(state.distance, goal.distance, 0.07);
      state.target.lerp(goal.target, 0.07);
      updateCameraFromState();

      brainUniforms.uTime.value = t;
      brainUniforms.uOpacity.value = lerp(brainUniforms.uOpacity.value, activeHub ? 0.22 : 0.94, 0.08);

      HUBS.forEach((hub, hi) => {
        const pulse = 1 + 0.14 * Math.sin(t * 0.9 + (hub._phase ?? 0));
        const fade = (activeHub && activeHub.id === hub.id) ? 0.15 : 1;
        const pb = Math.min(pulseStr[hi], 1);            // living-pulse swell
        hub._glowSprite?.scale.setScalar(0.5 * pulse * fade * (1 + pb * 0.7));
        hub._hotSprite?.scale.setScalar(0.14 * (0.85 + 0.3 * Math.sin(t * 1.4 + (hub._phase ?? 0))) * fade * (1 + pb * 1.4));
      });

      const { w, h } = viewSize();
      const cc = { x: w / 2, y: h / 2 };
      HUBS.forEach(hub => {
        const wp = new THREE.Vector3();
        hub._marker?.getWorldPosition(wp);
        const s = toScreen(wp);
        const el = hubLabelEls[hub.id];
        const line = hubLeaderLines[hub.id];
        if (!s) {
          el.style.display = 'none';
          line.glow.style.opacity = '0';
          line.core.style.opacity = '0';
          return;
        }
        el.style.display = activeHub ? 'none' : 'flex';
        if (!activeHub) {
          const dx = s.x - cc.x, dy = s.y - cc.y, len = Math.hypot(dx, dy) || 1;
          const ux = dx / len, uy = dy / len;
          const lx = s.x + ux * 58, ly = s.y + uy * 58;
          el.style.left = lx + 'px';
          el.style.top = ly + 'px';
          const x1 = lx - ux * 20, y1 = ly - uy * 20;
          [line.glow, line.core].forEach(el2 => {
            el2.setAttribute('x1', String(x1));
            el2.setAttribute('y1', String(y1));
            el2.setAttribute('x2', String(s.x));
            el2.setAttribute('y2', String(s.y));
          });
          line.glow.style.opacity = '0.5';
          line.core.style.opacity = '0.85';
        } else {
          line.glow.style.opacity = '0';
          line.core.style.opacity = '0';
        }
      });

      if (treeData) {
        treeData.nodes.forEach(n => {
          const wp = n.pos.clone().applyMatrix4(brainGroup.matrixWorld);
          const s = toScreen(wp);
          if (!s) { n.el.style.display = 'none'; return; }
          n.el.style.display = n.level <= Math.min(currentDepth, 2) ? 'block' : 'none';
          n.el.style.left = s.x + 'px';
          n.el.style.top = s.y + 'px';
        });
      }

      composer.render();
      miniRenderer?.render(miniScene, miniCamera);
    }
    animate();

    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('keydown', onKeyDown);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('wheel', onWheel);
      neuralInput?.removeEventListener('keydown', onInputKey);
      clearTree();
      composer.dispose();
      renderer.dispose();
      miniRenderer?.dispose();
    };
  }, []);

  // Counts refresh on their own cadence; hand them to the scene's DOM without
  // touching the WebGL context. Real memory activity (a hub whose count grew)
  // also fires a living pulse along that hub's connections.
  useEffect(() => {
    applyStatsRef.current?.(stats);
    const prev = prevHubCountsRef.current;
    if (prev) {
      (Object.keys(stats.hubCounts) as HubId[]).forEach(id => {
        if ((stats.hubCounts[id] ?? 0) > (prev[id] ?? 0)) {
          triggerHubPulseRef.current?.(id, 1.0);
        }
      });
    }
    prevHubCountsRef.current = { ...stats.hubCounts };
  }, [stats]);

  return <NeuralShell rootRef={rootRef} />;
}
