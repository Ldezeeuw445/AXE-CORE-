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
import { applySceneBackdrop } from '@/presentation/components/axe-core/sceneBackdrop';
import { memo, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { EffectComposer, RenderPass, EffectPass, BloomEffect, KernelSize } from 'postprocessing';
import { useGlobalMemoryStats, timeAgo, type GlobalMemoryStats, type HubId } from './useGlobalMemoryStats';
import './NeuralBrain.css';
import { MEMORY_HUBS } from '@/domain/memory/memoryHubs';
import { AGENT_SEEDS } from '@/domain/agents/agentRegistry';

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
    <h2>LIVE PULSES <span class="live-tag"><span class="d"></span>LIVE</span></h2>
    <div id="pulse-log-list"><div class="stream-empty">Wachten op activiteit…</div></div>
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

  /**
   * The build waits for real counts. statsRef above already carries them into
   * the effect; this only says whether they have arrived. Without the wait the
   * scene would be built from zeros and, on an empty dep list, never correct
   * itself -- which is exactly what it did.
   */
  const countsReady = stats.total > 0;

  useEffect(() => {
    const maybeRoot = rootRef.current;
    if (!maybeRoot) return;
    // Nothing is drawn until the real counts are in. One extra build at
    // startup, in exchange for a brain that is never a picture of zeros.
    if (!countsReady) return;

    const hubCountFor = (id: string) =>
      statsRef.current.hubCounts[id as HubId] ?? 0;
    const HUB_COUNT_MAX = Math.max(
      1, ...Object.values(statsRef.current.hubCounts).map(n => n ?? 0),
    );
    const root: HTMLDivElement = maybeRoot;

    /** All lookups scoped to this component — never the whole document. */
    const q = <T extends Element = HTMLElement>(sel: string): T | null =>
      root.querySelector<T>(sel);

    /* ============================== DATA ============================== */
    // Identity, name and colour come from the shared hub definition so Neural
    // and Terrain cannot drift apart; only the 3D placement is this view's
    // business. Authored in the plane the lateral camera sees — height and
    // front/back — with a small +x bias to sit on the near hemisphere.
    const HUB_POS: Record<HubId, [number, number, number]> = {
      knowledge:     [0.8, 2.9, 0.2],
      conversations: [0.8, 2.2, 2.4],
      tasksgoals:    [0.8, 2.2, -2.4],
      projects:      [0.8, 0.4, -4.2],
      insights:      [0.8, 0.3, 4.2],
      resources:     [0.9, -1.9, 2.2],
      preferences:   [0.9, -1.6, -3.0],
      events:        [0.9, -2.6, 0.3],
      agents:        [-0.9, 1.0, -0.3],
      // Trading split out of events (see memoryHubs). Placed low and forward,
      // near events because that is where it was stored, but on its own spot
      // because it is by far the largest single body of memory in the app.
      trading:       [0.9, -1.2, 3.4],
    };

    const HUBS = MEMORY_HUBS.map(h => ({
      id: h.id,
      name: h.name,
      color: h.color,
      count: '0',
      pos: [...HUB_POS[h.id]] as number[],
      desc: h.desc,
    })) as Array<{
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
      // Real, not decorative: built from the same AGENT_SEEDS the agents
      // registry table is seeded from, grouped exactly as they'll appear in
      // the Agents tab. Statue agents are labelled as such rather than
      // hidden, so the gap between "named" and "actually running" stays
      // visible here too.
      agents: Object.entries(
        AGENT_SEEDS.reduce<Record<string, string[]>>((acc, a) => {
          (acc[a.groupLabel] ??= []).push(a.status === 'active' ? a.name : `${a.name} (nog te bouwen)`);
          return acc;
        }, {}),
      ).map(([name, leaves]) => ({ name, leaves })),
    };

    /* ============================== SETUP ============================== */
    const maybeCanvas = q<HTMLCanvasElement>('#brain');
    if (!maybeCanvas) return;
    const canvas: HTMLCanvasElement = maybeCanvas;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    const scene = new THREE.Scene();
    // Wat er gewist wordt hangt af van de stand; alpha moest daarvoor aan
    // blijven staan, want dat is een aanmaakvlag die later niet meer kan.
    applySceneBackdrop(renderer, scene, 0x020203);
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
    const brainGroup = new THREE.Group();
    scene.add(brainGroup);

    // Post-processing: a Bloom pass makes the bright vertex cores and hub peaks
    // radiate light, exactly like the reference image. Runs through an
    // EffectComposer instead of renderer.render() straight to the canvas.
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    // A 0.08 threshold with a HUGE kernel meant almost every lit vertex fed
    // the bloom, and the resulting haze lifted the background off black —
    // the reference's depth comes from the mass glowing against true black,
    // not from a glow spread over the whole frame. Raising the threshold
    // keeps the effect on hub cores and pulses, where it belongs.
    const bloom = new BloomEffect({
      intensity: 1.15,
      luminanceThreshold: 0.42,
      luminanceSmoothing: 0.25,
      mipmapBlur: true,
      kernelSize: KernelSize.LARGE,
      radius: 0.62,
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
      // Squared inverse distance, not plain inverse.
      //
      // With 1/(d+1.1) the two nearest hubs stayed close in weight across most
      // of the cortex, so every point came out a blend of two hues and the
      // whole brain read as one wash. Luka's reference is the opposite: each
      // region is its own colour, and they meet at a seam rather than
      // dissolving into each other. Squaring makes the nearer hub win quickly
      // while still blending in the band where they actually meet.
      const a0 = 1 / (d0 + 0.35), a1 = 1 / (d1 + 0.35);
      const w0 = a0 * a0, w1 = a1 * a1, wsum = w0 + w1;
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
    type Blob = { c: [number, number, number]; r: [number, number, number] };

    /**
     * Lobes as ellipsoids, blended with a smooth minimum.
     *
     * The first attempt summed metaball fields, which looked right on paper
     * but rendered far too small: with a (1-d^2)^3 kernel a lone blob's
     * surface sits at only ~45% of its stated radius, and anywhere lobes did
     * not overlap the surface collapsed inward — downward it reached 0.68
     * against a nominal 2.7. The result read as a shrunken peanut, not a brain.
     *
     * Signed distance fields do not have that problem: each ellipsoid renders
     * at exactly its stated size, and smin() blends the seams organically.
     * Measured silhouette is now 4.7 front-to-back, 3.1 tall, 3.3 wide.
     *
     * Axes: +x right, +y up, +z anterior. Authored as one hemisphere and
     * mirrored, so the longitudinal fissure lands on x = 0 for free.
     */
    const BRAIN_BLOBS: Blob[] = (() => {
      const half: Blob[] = [
        { c: [0.95, 0.35, 0.00], r: [2.35, 2.75, 4.15] },  // cerebrum body
        { c: [0.90, 0.55, 2.30], r: [2.15, 2.35, 2.45] },  // frontal pole
        { c: [0.90, 0.30, -2.55], r: [2.00, 2.15, 2.10] }, // occipital pole
        { c: [1.70, -1.75, 0.75], r: [1.35, 1.45, 2.75] }, // temporal lobe
        { c: [1.05, -2.10, -2.70], r: [1.65, 1.30, 1.55] },// cerebellum
      ];
      const mirrored = half.map(b => ({ ...b, c: [-b.c[0], b.c[1], b.c[2]] as [number, number, number] }));
      return [...half, ...mirrored, { c: [0, -2.60, -1.05], r: [0.70, 1.70, 0.80] }]; // brain stem
    })();

    /** How softly lobes merge. Higher fuses them into a blob; lower shows seams. */
    const BLEND_K = 0.45;

    function sdEllipsoid(px: number, py: number, pz: number, b: Blob): number {
      const qx = (px - b.c[0]) / b.r[0];
      const qy = (py - b.c[1]) / b.r[1];
      const qz = (pz - b.c[2]) / b.r[2];
      const k0 = Math.hypot(qx, qy, qz);
      if (k0 === 0) return -Math.min(b.r[0], b.r[1], b.r[2]);
      const k1 = Math.hypot(qx / b.r[0], qy / b.r[1], qz / b.r[2]);
      return (k0 * (k0 - 1)) / k1;
    }

    function smin(a: number, b: number, k: number): number {
      const h = THREE.MathUtils.clamp(0.5 + (0.5 * (b - a)) / k, 0, 1);
      return b * (1 - h) + a * h - k * h * (1 - h);
    }

    /** Negative inside the brain, positive outside. */
    function brainSDF(x: number, y: number, z: number): number {
      let d = 1e9;
      for (let i = 0; i < BRAIN_BLOBS.length; i++) {
        d = smin(d, sdEllipsoid(x, y, z, BRAIN_BLOBS[i]), BLEND_K);
      }
      return d;
    }

    /**
     * Distance from the origin to the surface along a direction.
     *
     * Takes the outermost crossing, not the first: the temporal lobe
     * overhangs, so a ray can leave and re-enter, and stopping at the first
     * crossing would slice the lobe off.
     */
    function marchRadius(dx: number, dy: number, dz: number): number {
      const MAX = 8, STEP = 0.05;
      let lastInside = -1;
      for (let r = 0.1; r <= MAX; r += STEP) {
        if (brainSDF(dx * r, dy * r, dz * r) <= 0) lastInside = r;
      }
      if (lastInside < 0) return 1.2;
      let lo = lastInside, hi = lastInside + STEP;
      for (let i = 0; i < 20; i++) {
        const mid = (lo + hi) / 2;
        if (brainSDF(dx * mid, dy * mid, dz * mid) <= 0) lo = mid; else hi = mid;
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
      const t = ((theta % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
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

    function buildBrainGeometry(surfaceCount = 108000, coreBurstCount = 380, strandsPerHub = 260, strandLen = 46) {
      /**
       * Density per hub, from how much that hub actually holds.
       *
       * Every hub used to get exactly `strandsPerHub` filaments and
       * `coreBurstCount` motes, so Conversations (21 memories) and Trading
       * (15,478) grew identical thickets. The brain was a picture of the
       * taxonomy, not of the memory in it -- which is the whole of what M4
       * asks for: density is how much is there.
       *
       * Log-weighted, then clamped to 0.35-1.9. Linear would have made
       * Trading a solid mass and left everything else as a few threads; the
       * point is that all ten stay legible while the differences read.
       */
      const hubWeights = HUBS.map(h => {
        const n = hubCountFor(h.id);
        if (n <= 0) return 0.35;
        const w = Math.log10(n + 1) / Math.log10(HUB_COUNT_MAX + 1);
        return Math.max(0.35, Math.min(1.9, 0.35 + w * 1.55));
      });
      const hubStrands = hubWeights.map(w => Math.max(24, Math.round(strandsPerHub * w)));
      const hubBursts = hubWeights.map(w => Math.max(40, Math.round(coreBurstCount * w)));

      const burstTotal = hubBursts.reduce((a, b) => a + b, 0);
      const filamentTotal = hubStrands.reduce((a, b) => a + b, 0) * strandLen;
      const total = surfaceCount + filamentTotal + burstTotal;
      const positions = new Float32Array(total * 3);
      const colors = new Float32Array(total * 3);
      const phases = new Float32Array(total);
      const sizes = new Float32Array(total);
      // Tracts are also emitted as real line segments. Points alone can only
      // suggest a filament; drawing the segment is what lets the eye follow a
      // single thread across the cortex, which is the thing the reference has
      // and a pure point cloud never will.
      const segMax = hubStrands.reduce((a, b) => a + b, 0) * (strandLen - 1) * 2;
      const linePos = new Float32Array(segMax * 3);
      const lineCol = new Float32Array(segMax * 3);
      let lineIdx = 0;
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
      // How far inside the skin still counts as "surface", in world units.
      const SHELL_DEPTH = 2.0;
      let guard = 0;
      while (idx < surfaceCount && guard < surfaceCount * 60) {
        guard++;
        const px = (Math.random() * 2 - 1) * BB.x;
        const py = BB.yLo + Math.random() * (BB.yHi - BB.yLo);
        const pz = (Math.random() * 2 - 1) * BB.z;
        const d = brainSDF(px, py, pz);
        if (d > 0) continue; // outside the brain

        // Gyral texture: bias which shell depth survives, so the surface gains
        // ridges and sulci instead of reading as a uniform fog.
        // Higher-frequency folding than a smooth blob needs: the reference's
        // surface reads as convolutions, which takes a ridged pattern rather
        // than a gentle wave.
        const fold = Math.sin(px * 3.4 + py * 2.2) * 0.5 + Math.sin(pz * 4.0 - py * 2.9) * 0.35
          + Math.sin(px * 6.9 + pz * 5.4) * 0.22 + Math.sin(py * 8.2 + px * 3.1) * 0.12;
        const depth = -d / SHELL_DEPTH;                          // 0 at the skin, up inside
        // A soft falloff spread the mass through the whole volume and read as
        // fog. Concentrating hard on the shell is what makes the silhouette
        // legible; the small remaining interior keeps it from looking hollow.
        const skin = Math.exp(-Math.max(0, depth) * 4.0);
        const gyri = 0.45 + 0.55 * Math.abs(Math.sin(fold * 2.6 + depth * 4.0));
        if (Math.random() > skin * gyri) continue;

        const pv = new THREE.Vector3(px, py, pz);
        const { col, nearDist } = nearestHubBlend(pv, hubColors, hubVecs);
        // Falloff gentler and with a higher floor. At 0.22 per unit down to
        // 0.14, tissue between hubs went nearly black, so the colour only
        // existed as a halo around each node and everything in between was the
        // same dark blue -- which is what made it read as fireworks on a void
        // rather than as a brain with coloured regions.
        const bright = THREE.MathUtils.clamp(1.18 - nearDist * 0.13, 0.34, 1.05);
        col.multiplyScalar(bright);
        // Less wash toward near-black, so hue survives depth.
        col.lerp(baseColor, 0.03 + 0.18 * (1 - skin));
        // Longitudinal fissure — a real gap down the midline of the top surface.
        const fissure = Math.exp(-Math.pow(px * 1.5, 2)) * Math.max(0, py * 0.32);
        col.multiplyScalar(1 - Math.min(0.85, fissure));

        positions[idx * 3] = px; positions[idx * 3 + 1] = py; positions[idx * 3 + 2] = pz;
        colors[idx * 3] = col.r; colors[idx * 3 + 1] = col.g; colors[idx * 3 + 2] = col.b;
        phases[idx] = Math.random() * Math.PI * 2;
        // Smaller and less variable. Big bright motes at every depth are the
        // "fireworks" -- the eye reads sparkle instead of surface.
        sizes[idx] = (0.027 + Math.random() * 0.014) * (0.42 + 0.58 * skin);
        idx++;
      }
      // Whatever the guard cut short stays as zeroed, fully transparent points.
      idx = surfaceCount;

      // Fibre tracts.
      //
      // Third attempt at this, and the reference settles it.
      //
      // v1 walked long straight rays out of each hub -> fireworks. v2 replaced
      // that with long tangential arcs sweeping ALONG the cortex, on the
      // reasoning that real tracts braid into a mesh. At 60 steps of 0.10 a
      // strand travels 6 units across a brain about 10 wide, so every strand
      // crossed several regions and the whole thing read as a tangle -- which
      // is what Luka is looking at when he says it is not the reference.
      //
      // The reference is neither: each node has a dense tuft of SHORT, curling,
      // branching threads that stay inside its own territory and fade into the
      // tissue. So: radial start, strong curl, short life, many of them. The
      // tangential snap stays -- it is what keeps threads lying on the cortex
      // instead of floating off it.
      //
      // Snapping uses the SDF: after a step, `d` is how far the point drifted
      // off the shell, and the gradient points straight off the surface, so
      // stepping back along it returns the strand to the skin without any
      // assumption about the shape.
      const sdfGrad = (x: number, y: number, z: number) => {
        const e = 0.05;
        return new THREE.Vector3(
          brainSDF(x + e, y, z) - brainSDF(x - e, y, z),
          brainSDF(x, y + e, z) - brainSDF(x, y - e, z),
          brainSDF(x, y, z + e) - brainSDF(x, y, z - e),
        ).normalize();
      };

      HUBS.forEach((hub, hi) => {
        const hc = hubColors[hi];
        const origin = new THREE.Vector3(hub.pos[0], hub.pos[1], hub.pos[2]);
        for (let st = 0; st < hubStrands[hi]; st++) {
          // Start scattered around the hub rather than exactly on it, so the
          // tracts read as a field the hub sits in, not spokes on a wheel.
          const jitter = new THREE.Vector3(
            Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5,
          ).multiplyScalar(0.9);
          const pos = origin.clone().add(jitter);

          let n = sdfGrad(pos.x, pos.y, pos.z);
          // Tangent = any direction with the normal component removed.
          // Outward from the hub, flattened onto the surface. The jitter that
          // placed the start already spreads the tuft, so this gives each
          // thread a direction that belongs to its own node rather than a
          // random heading that could walk it into the neighbours.
          const dir = pos.clone().sub(origin);
          if (dir.lengthSq() < 1e-6) dir.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5);
          dir.addScaledVector(n, -dir.dot(n)).normalize();

          // Curl hard enough that a thread bends within its own tuft instead of
          // leaving in a straight line -- a straight ray is the firework, the
          // bend is what makes it read as a dendrite.
          const turn = (Math.random() - 0.5) * 0.42;
          const shellDepth = 0.15 + Math.random() * 1.5;
          let alive = true;
          let prevX = 0, prevY = 0, prevZ = 0, prevR = 0, prevG = 0, prevB = 0;

          for (let k = 0; k < strandLen; k++) {
            if (alive) {
              n = sdfGrad(pos.x, pos.y, pos.z);
              // Rotate the heading within the tangent plane.
              const side = new THREE.Vector3().crossVectors(n, dir).normalize();
              dir.addScaledVector(side, turn).normalize();
              dir.addScaledVector(n, -dir.dot(n)).normalize();

              pos.addScaledVector(dir, 0.10);

              // Snap back to a shallow depth under the skin.
              const d = brainSDF(pos.x, pos.y, pos.z);
              pos.addScaledVector(n, -(d + shellDepth));

              if (Math.abs(brainSDF(pos.x, pos.y, pos.z) + shellDepth) > 0.6) alive = false;
            }
            const t = k / strandLen;
            // Fade along the strand so tracts dissolve into the tissue instead
            // of ending abruptly; dead strands write zero-size points so the
            // buffer stays packed without a second pass.
            const col = hc.clone().multiplyScalar(alive ? 1.25 - t * 0.85 : 0);

            // Join to the previous point as a drawn segment. Only while the
            // strand is alive — a dead strand's points sit stacked on its last
            // position, and joining those would streak a line to nowhere.
            if (alive && k > 0 && lineIdx + 2 <= segMax) {
              linePos[lineIdx * 3] = prevX; linePos[lineIdx * 3 + 1] = prevY; linePos[lineIdx * 3 + 2] = prevZ;
              lineCol[lineIdx * 3] = prevR; lineCol[lineIdx * 3 + 1] = prevG; lineCol[lineIdx * 3 + 2] = prevB;
              lineIdx++;
              linePos[lineIdx * 3] = pos.x; linePos[lineIdx * 3 + 1] = pos.y; linePos[lineIdx * 3 + 2] = pos.z;
              lineCol[lineIdx * 3] = col.r; lineCol[lineIdx * 3 + 1] = col.g; lineCol[lineIdx * 3 + 2] = col.b;
              lineIdx++;
            }
            prevX = pos.x; prevY = pos.y; prevZ = pos.z;
            prevR = col.r; prevG = col.g; prevB = col.b;
            positions[idx * 3] = pos.x; positions[idx * 3 + 1] = pos.y; positions[idx * 3 + 2] = pos.z;
            colors[idx * 3] = col.r; colors[idx * 3 + 1] = col.g; colors[idx * 3 + 2] = col.b;
            phases[idx] = Math.random() * Math.PI * 2;
            sizes[idx] = alive ? (0.022 - t * 0.008) + Math.random() * 0.006 : 0;
            idx++;
          }
        }
      });

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      geo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
      geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));

      // Trim to what was actually written: the strand budget is an upper
      // bound and most strands die before using it.
      const lineGeo = new THREE.BufferGeometry();
      lineGeo.setAttribute('position', new THREE.BufferAttribute(linePos.subarray(0, lineIdx * 3), 3));
      lineGeo.setAttribute('color', new THREE.BufferAttribute(lineCol.subarray(0, lineIdx * 3), 3));

      return { points: geo, lines: lineGeo };
    }

    // The travelling "living pulse" is gone. Bands of light running out along
    // every hub's connections, plus a self-firing timer per hub, was the
    // single biggest source of the fireworks feel: something was always
    // flashing somewhere. The reference is still — its detail comes from
    // density, not motion — so activity is now reported in the log panel
    // rather than staged on the mesh.
    const HUB_N = HUBS.length;
    const brainUniforms = {
      uTime: { value: 0 },
      uOpacity: { value: 1.0 },
      uTex: { value: starTex },
    };
    const brainMat = new THREE.ShaderMaterial({
      uniforms: brainUniforms, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
      vertexShader: `
        attribute vec3 color;
        attribute float aPhase;
        attribute float aSize;
        varying vec3 vColor;
        varying float vTwinkle;
        uniform float uTime;
        void main(){
          vColor = color;
          // A slow, shallow shimmer. Deep enough to feel alive, far too small
          // to read as flashing.
          vTwinkle = 0.86 + 0.14*sin(uTime*0.5 + aPhase);
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * vTwinkle * (1150.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        varying float vTwinkle;
        uniform float uOpacity;
        uniform sampler2D uTex;
        void main(){
          vec4 tex = texture2D(uTex, gl_PointCoord);
          float a = min(tex.a * uOpacity * (0.62 + 0.38*vTwinkle), 1.0);
          if(a < 0.008) discard;
          // Only a modest lift above 1.0: enough for bloom to catch the hot
          // centres, not enough to turn every particle into a spark.
          vec3 col = vColor * (0.92 + tex.r * 0.45);
          gl_FragColor = vec4(col, a);
        }
      `,
    });
    // Tracts get their own material: same pulse maths as the points so a
    // travelling light runs along a thread rather than jumping between the
    // dots on it, but no point-sprite texture — a segment is already a shape.
    const lineMat = new THREE.ShaderMaterial({
      uniforms: brainUniforms,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      vertexShader: `
        attribute vec3 color;
        varying vec3 vColor;
        void main(){
          vColor = color;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        uniform float uOpacity;
        void main(){
          // Kept faint on purpose: hundreds of overlapping additive threads
          // blow out to white long before they read as structure.
          gl_FragColor = vec4(vColor * 0.95, uOpacity * 0.085);
        }
      `,
    });

    // strandLen 60 -> 20: at 0.10 per step a strand now reaches ~2 units, so
    // it stays inside its region instead of crossing three. Count raised to
    // keep the same total thread mass, spent on many short tufts rather than
    // a few long sweeps.
    const brainGeo = buildBrainGeometry(122000, 820, 430, 20);
    const brainPoints = new THREE.Points(brainGeo.points, brainMat);
    brainGroup.add(brainPoints);
    const brainTracts = new THREE.LineSegments(brainGeo.lines, lineMat);
    brainGroup.add(brainTracts);

    /* ============================== LIVING PULSE ============================== */
    // A pulse is a bright band that starts at a hub (aDist 0) and travels
    // outward along that hub's strands. Real memory activity fires them via
    // triggerHubPulseRef; a gentle ambient cadence keeps a connection breathing
    // while the app is idle so the brain always feels alive.
    // Small live legend of which hub pulsed most recently, shown beside the
    // brain. Newest first, capped so the panel never grows.
    const pulseLog: Array<{ name: string; hex: string; ts: number }> = [];
    function renderPulseLog() {
      const list = q('#pulse-log-list');
      if (!list) return;
      if (!pulseLog.length) {
        list.innerHTML = '<div class="stream-empty">Wachten op activiteit…</div>';
        return;
      }
      list.innerHTML = pulseLog.map(p =>
        `<div class="stream-item"><span class="sd" style="background:${p.hex}; color:${p.hex};"></span>`
        + `<div class="body"><div class="t">${timeAgo(p.ts)}</div>`
        + `<div class="l1" style="color:${p.hex}">${p.name}</div>`
        + `<div class="l2">pulse langs connecties</div></div></div>`,
      ).join('');
    }
    /**
     * Records real memory activity in the log panel.
     *
     * This used to also launch a light down the hub's connections and flash
     * its sprite. The travelling band was the fireworks; the information —
     * "this hub just grew" — is worth keeping, so it stays as a log line.
     */
    function firePulse(i: number) {
      if (i < 0 || i >= HUB_N) return;
      const hub = HUBS[i];
      pulseLog.unshift({
        name: hub.name,
        hex: '#' + hub.color.toString(16).padStart(6, '0'),
        ts: Date.now(),
      });
      if (pulseLog.length > 6) pulseLog.pop();
      renderPulseLog();
    }
    triggerHubPulseRef.current = (hubId: string) => {
      firePulse(HUBS.findIndex(h => h.id === hubId));
    };
    // Keep the "x seconds ago" labels fresh without touching the WebGL context.
    const pulseLogTimer = window.setInterval(renderPulseLog, 5000);

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
      buildBrainGeometry(4200, 26).points,
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
    const VIEW = { azimuth: Math.PI / 2, elevation: 0.06, distance: 13.0 };
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
      // Opening a hub is real activity, so it still gets a log line — it just
      // no longer fires a light down the connections.
      firePulse(HUBS.indexOf(hub));
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
        // A slow, shallow breath. The old version swelled with each pulse and
        // throbbed at 1.4Hz on top, which is what made the hubs read as
        // fireworks going off rather than as steady sources.
        const breath = 1 + 0.05 * Math.sin(t * 0.35 + (hub._phase ?? 0));
        const fade = (activeHub && activeHub.id === hub.id) ? 0.15 : 1;
        hub._glowSprite?.scale.setScalar(0.26 * breath * fade);
        hub._hotSprite?.scale.setScalar(0.12 * breath * fade);
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

      applySceneBackdrop(renderer, scene, 0x020203);
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
      window.clearInterval(pulseLogTimer);
      composer.dispose();
      // dispose() frees three.js's own objects but does NOT release the WebGL
      // context -- only forceContextLoss() does. Without it every mount of
      // this view leaked a context, and browsers cap how many may exist, so
      // after enough tab switches the oldest were killed: "THREE.WebGLRenderer:
      // Context Lost" in the console, and a terrain whose 3D content silently
      // stopped rendering while its DOM chrome stayed put.
      renderer.forceContextLoss();
      renderer.dispose();
      miniRenderer?.forceContextLoss();
      miniRenderer?.dispose();
    };
  }, [countsReady]);

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
