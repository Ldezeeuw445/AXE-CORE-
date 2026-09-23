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
import { SLOT_ID, useSlotAdoptie } from '@/presentation/components/layout/PlaatSlots';
import { useHeeftPlaat } from '@/presentation/components/axe-core/sceneBackdrop';
import { createElement, memo, useEffect, useRef, useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as THREE from 'three';
import { EffectComposer, RenderPass, EffectPass, BloomEffect, KernelSize } from 'postprocessing';
import { useGlobalMemoryStats, timeAgo, type GlobalMemoryStats, type HubId } from './useGlobalMemoryStats';
import './NeuralBrain.css';
import { MEMORY_HUBS } from '@/domain/memory/memoryHubs';
import { AGENT_SEEDS } from '@/domain/agents/agentRegistry';
import { hubIcon } from '@/presentation/components/axe-core/hubIcons';
import { MemoryDock, type MemoryDockColumn } from '@/presentation/components/axe-core/MemoryDock';

/**
 * Renders a shared `hubIcons.ts` glyph to an inline SVG string.
 *
 * This view is built imperatively (see the module doc comment above) — hub
 * rows and 3D labels are `innerHTML`, not JSX — so the lucide icon component
 * cannot be mounted directly. `renderToStaticMarkup` is the same trick every
 * SSR pipeline uses to turn a React element into markup without a DOM; here
 * it turns one lucide icon into a string once per hub, at scene-build time,
 * not per frame. This is what wires this view to the same icon set Terrain
 * already uses (`TerrainMarkers.tsx`, `NeuralMemorySystem.tsx`) instead of
 * the plain colour dot it drew before.
 */
function hubIconSvg(hubId: string, size: number): string {
  const Icon = hubIcon(hubId);
  return renderToStaticMarkup(createElement(Icon, { size, strokeWidth: 2.2 }));
}

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
    <input id="neural-input" type="text" placeholder="Search memories or ask AXE Core..." />
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
  <!-- Fix E: real distribution across hubs, from the same hubCounts the list
       above already renders -- the list says WHICH hubs exist and their raw
       count, this says how the total actually splits between them, sorted so
       the biggest hub is always legible at a glance. -->
  <div class="panel">
    <h2>DISTRIBUTION</h2>
    <div id="hub-dist-list"></div>
  </div>
  <!-- Corrective round 6, Part 5: dit was panel-plain (kale tekst, geen
       kader) -- Luka wil dit nu als hetzelfde soort widget-blok als de
       panelen erboven, zelfde omkering als Terrain's Legend
       (NeuralMemorySystem.tsx). Gewoon panel met een h2, net als de
       rest van deze kolom. -->
  <div class="panel">
    <h2>Controls</h2>
    <div class="legend" id="legend"></div>
  </div>
</div>

<div class="sidebar" id="sidebar-right">
  <div class="panel">
    <h2>ABOUT THIS VIEW</h2>
    <p class="about-text" id="about-text">This is your Global Memory. It holds everything AXE knows, remembers and learns about you and our conversations. Click a hub to explore deeper.</p>
  </div>
  <div class="panel" style="flex:1; min-height:0; overflow-y:auto;">
    <h2>MEMORY STREAM <span class="live-tag"><span class="d"></span>LIVE</span></h2>
    <div id="stream-list"></div>
    <button class="viewall-btn" type="button">View all</button>
  </div>
  <!-- Fix E: "Live Pulses" removed (Luka: not necessary) and replaced with a
       panel that actually explains the memory, not just that something moved
       recently -- where the total is actually stored, split by source
       (global_memory / RAG / Obsidian), the same three stores
       useGlobalMemoryStats already loads and MemoryDock already surfaces. -->
  <div class="panel">
    <h2>MEMORY SOURCES</h2>
    <div id="source-list"></div>
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
</div>`;

/**
 * Fix 7's four columns, built from `useGlobalMemoryStats` -- the same source
 * the sidebar's own numbers already come from, so the fold-out never
 * disagrees with the panels above it. No invented "Active Sessions" or
 * "System Performance" (CPU/network) fields: this app does not track either,
 * so the closest honest equivalents are used instead (see the brief).
 */
function buildNeuralDockColumns(stats: GlobalMemoryStats): MemoryDockColumn[] {
  const topHubs = [...MEMORY_HUBS]
    .map((h) => ({ label: h.name, value: stats.hubCounts[h.id] ?? 0 }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 4);
  return [
    {
      title: 'Memory Capacity',
      rows: [
        { label: 'Total', value: stats.total.toLocaleString() },
        { label: 'Knowledge (RAG)', value: (stats.hubCounts.knowledge ?? 0).toLocaleString() },
      ],
    },
    {
      title: 'Top Memory Domains',
      rows: topHubs.map((h) => ({ label: h.label, value: h.value.toLocaleString() })),
    },
    {
      title: 'Recent Activity',
      rows: [
        { label: 'Last updated', value: stats.lastUpdatedAt ? timeAgo(new Date(stats.lastUpdatedAt).getTime()) : '—' },
        { label: 'Connections', value: stats.connections.toLocaleString() },
      ],
    },
    {
      title: 'System Health',
      rows: [
        { label: 'Integrity', value: stats.integrityPct == null ? '—' : `${stats.integrityPct}%`, ok: (stats.integrityPct ?? 0) >= 90 },
      ],
    },
  ];
}

const NeuralShell = memo(function NeuralShell(
  { rootRef }: { rootRef: React.RefObject<HTMLDivElement | null> },
) {
  return (
    <div className="axe-neural-root" ref={rootRef} dangerouslySetInnerHTML={{ __html: SHELL_HTML }} />
  );
});

/* De ene zijbalk-koppel van deze weergave gaat naar de sloten van de schil,
   zodat ze daar dezelfde plek en hetzelfde materiaal krijgen als op elke
   andere tab. Buiten de module, want een nieuw object per render zou de haak
   elke keer opnieuw laten verhuizen.
   Het dock (dieptebalk) is geen adoptie meer -- Fix 7 vervangt de vanilla
   `#depthbar` door de gedeelde React `<MemoryDock>`, dus die hoeft niet meer
   verhuisd te worden. */
const NEURAL_SIDE_SLOTS = { links: '#sidebar-left', rechts: '#sidebar-right' } as const;

export default function NeuralBrain() {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const stats = useGlobalMemoryStats();
  /* Alleen op de plaat: zonder data-look bestaan de sloten niet en hoort deze
     weergave zich te gedragen zoals hij altijd deed. */
  const opPlaat = useHeeftPlaat();
  /* De hoge stand: kolommen naast het beeld, niet de onderband naast de chat. */
  useSlotAdoptie(NEURAL_SIDE_SLOTS, opPlaat, true);
  // The scene build is expensive and must not re-run when counts refresh every
  // 45s, so the effect below stays on an empty dep list and reads stats through
  // a ref; a second effect pushes new numbers into the DOM it already built.
  const statsRef = useRef<GlobalMemoryStats>(stats);
  statsRef.current = stats;
  const applyStatsRef = useRef<((s: GlobalMemoryStats) => void) | null>(null);

  /* Fix 3 + Fix 7: de dieptekiezer leeft nu als React state, gerenderd via
     <MemoryDock> (dezelfde fold-out als Terrain), en niet meer als een los
     stuk vanilla DOM. De imperatieve scene blijft de bron van waarheid voor
     wat er daadwerkelijk verandert (welke sub-hubs zichtbaar zijn); dit is
     alleen de brug ernaartoe, zelfde patroon als applyStatsRef hierboven. */
  const [depthLevel, setDepthLevelState] = useState(2);
  const setDepthImperativeRef = useRef<((n: number) => void) | null>(null);

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

    /**
     * Lookups scoped to this component — but "this component" isn't just
     * `root` any more. `useSlotAdoptie` (below) hands `#sidebar-left` and
     * `#sidebar-right` — and everything inside them: the stat rows, hub list,
     * stream list, legend, both Rotate switches — to the shell's slot hosts
     * via `appendChild`, which removes them from `root`'s subtree entirely.
     * That move happens one `requestAnimationFrame` after mount, so a plain
     * `root.querySelector` finds these elements on the very first frame and
     * then silently finds nothing for the rest of the view's life. Falling
     * back to the known, stable slot hosts (`SLOT_ID`, not hardcoded strings)
     * covers both states without ever searching the whole document, which
     * was the actual thing the original scoping was protecting against. */
    const q = <T extends Element = HTMLElement>(sel: string): T | null =>
      root.querySelector<T>(sel)
      ?? document.getElementById(SLOT_ID.links)?.querySelector<T>(sel)
      ?? document.getElementById(SLOT_ID.rechts)?.querySelector<T>(sel)
      ?? document.getElementById(SLOT_ID.dock)?.querySelector<T>(sel)
      ?? null;

    /** Same fallback as `q`, for call sites that need every match rather than
     *  the first — `.hub-row` lives wholesale inside the adopted sidebar, so
     *  `root.querySelectorAll` goes from "all of them" to "none of them" the
     *  instant adoption runs, same failure mode as `q`. */
    const qAll = <T extends Element = HTMLElement>(sel: string): T[] => {
      const inRoot = root.querySelectorAll<T>(sel);
      if (inRoot.length) return Array.from(inRoot);
      for (const hostId of [SLOT_ID.links, SLOT_ID.rechts, SLOT_ID.dock]) {
        const host = document.getElementById(hostId);
        const found = host?.querySelectorAll<T>(sel);
        if (found && found.length) return Array.from(found);
      }
      return [];
    };

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
    //
    // Corrective round 2, Fix 3: kernel/radius trimmed one notch further as a
    // secondary measure alongside BLEND_K and SHELL_DEPTH above (see those
    // comments for the actual numeric investigation). luminanceThreshold
    // already keeps most of the base-hue cortex out of bloom entirely, so
    // this was never the primary cause of the lobes reading as a featureless
    // blob — but the hot hub cores and markers DO still bloom, and a LARGE
    // kernel at radius 0.62 spreads that glow across a wide enough mip range
    // to soften the crisper silhouette edges the other two changes restore.
    // MEDIUM/0.4 keeps the same glowing-core look at a tighter spread.
    const bloom = new BloomEffect({
      intensity: 1.15,
      luminanceThreshold: 0.42,
      luminanceSmoothing: 0.25,
      mipmapBlur: true,
      kernelSize: KernelSize.MEDIUM,
      radius: 0.4,
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

    /* ============================== HUB COLOR ============================== */
    /**
     * Corrective round 2, Fix 2. This used to be `nearestHubBlend`: find the
     * two nearest hubs, weight them by squared inverse distance, and blend
     * their two hub colours. Its own comment said the goal plainly — "each
     * region is its own colour, and they meet at a seam" — which is exactly
     * the bug. Squared-inverse-distance makes the nearer hub dominate almost
     * immediately, so in practice every particle on the cortex just took on
     * whichever of the ten hub colours owned that patch of surface: a
     * Voronoi diagram of solid purple/green/orange/yellow/pink/cyan regions,
     * not a brain. The original brief (round 1's Fix 6) asked for "1 or 2
     * colours... reference image 12" — image 12 is a single glowing blue/cyan
     * mass with no other hue anywhere on it, core included.
     *
     * Hub identity does not need to live in the particle colour at all — it
     * already works, untouched, via each hub's own marker point and floating
     * label (HUB_POS, hubIcons.ts). So this now does the opposite of the old
     * function: almost every particle is the one base hue, and only
     * particles within a small, fast-decaying radius of a hub's marker gain
     * a second, single shared accent colour — a small warm ember right at
     * the hub, not a hub-coloured region. That keeps the whole field at
     * exactly two colours total, which is what "1 or 2" and image 12 both
     * actually show.
     */
    // The reference's hue, and not a new invention: MEMORY_HUBS' own
    // 'trading' entry is already this exact cyan, and it's the accent this
    // app already calls cyan everywhere else (--accent-cyaan-mat).
    const BASE_HUE = new THREE.Color(0x22d3ee);
    // This app's existing warm accent (--accent-oranje-mat in axe-look.css),
    // reused rather than inventing a third hue just for this glow.
    const HUB_GLOW_ACCENT = new THREE.Color(0xffae3d);
    // Small on purpose. The closest pair of hub markers (resources/trading,
    // from HUB_POS) sit ~1.4 world units apart pre-projection; at sigma=0.42
    // a Gaussian falloff is down to ~1.5% of full strength by 1.0 unit out
    // and ~0.06% by 1.4 units — so two neighbouring hubs' embers don't merge
    // into a band between them the way the old two-hub blend always did.
    const HUB_GLOW_SIGMA = 0.42;

    function hubGlowColor(pv: THREE.Vector3, hubVecs: THREE.Vector3[]) {
      let d0 = 1e9;
      for (let h = 0; h < hubVecs.length; h++) {
        const d = pv.distanceToSquared(hubVecs[h]);
        if (d < d0) d0 = d;
      }
      const nearDist = Math.sqrt(d0);
      // Gaussian, not the old inverse-square: it actually reaches ~0 within a
      // couple of sigma instead of trailing off across the whole cortex.
      const glow = Math.exp(-d0 / (2 * HUB_GLOW_SIGMA * HUB_GLOW_SIGMA));
      const col = BASE_HUE.clone().lerp(HUB_GLOW_ACCENT, glow);
      return { col, nearDist };
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

    /**
     * How softly lobes merge. Higher fuses them into a blob; lower shows seams.
     *
     * Corrective round 2, Fix 3. Numerically probing `brainSDF` (porting this
     * exact function to a standalone script and sampling the ventral
     * silhouette, since the live app can't be rendered here) showed `smin`
     * itself was NOT the main reason the lobes read as invisible: at 0.45,
     * wherever two blobs' SDF values actually differ by more than ~k (true of
     * almost every lobe seam here), `smin` already collapses to a plain
     * `min` — the higher k only added a small outward "fillet" bulge exactly
     * at the few points where two blobs are near-equal (e.g. z≈3.5, the
     * temporal lobe/frontal-pole boundary, where the probe measured the
     * silhouette sitting ~0.32 world units further out at k=0.45 than at
     * k=0.30, with no gaps or cracks introduced by the lower value). Still
     * worth doing — it removes that one falsely-inflated seam — so this
     * drops to 0.30, the top of the brief's suggested 0.25-0.30 range (kept
     * off the bottom of that range since nothing in the probe asked for more
     * aggression, and a harder seam risks visible cracks the probe didn't
     * test every angle for). The dominant cause turned out to be
     * `SHELL_DEPTH` below, not this constant — see its own comment.
     */
    const BLEND_K = 0.30;

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

    /**
     * Fix 6 rebuild.
     *
     * Was a rejection-sampled shell PLUS, per hub, a tuft of short curling
     * fibre-tract filaments (points and drawn line segments both). That tract
     * system was rewritten twice already chasing the same complaint --
     * "shapeless firework explosion" (image 10) -- and each rewrite made the
     * threads shorter and curlier without changing what they fundamentally
     * are: bright, busy, radiating lines. The user's own instruction (image
     * 12, image 14) was explicit that this is allowed to get simpler as long
     * as it reads as more realistic: a dense, glowing shell with a bright
     * core, coloured per hub region -- not a mesh of visible fibres.
     *
     * So the tracts are gone. What replaces them is the core-density burst
     * that was already being *sized for* here (`coreBurstCount` computed a
     * `hubBursts`/`burstTotal` budget) but never actually placed -- the old
     * code allocated that many buffer slots and then never wrote into them,
     * so they sat at the origin with zero size, fully invisible. That silent
     * gap is fixed below: it is now what gives the brain "denser fill toward
     * the core" (image 12), with each hub's burst warm near the centre and
     * fading to that hub's own colour as it nears the hub's own patch of
     * surface.
     */
    function buildBrainGeometry(surfaceCount = 108000, coreBurstCount = 380) {
      /**
       * Density per hub, from how much that hub actually holds.
       *
       * Every hub used to get exactly `coreBurstCount` motes, so Conversations
       * (21 memories) and Trading (15,478) grew identical thickets. The brain
       * was a picture of the taxonomy, not of the memory in it.
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
      const hubBursts = hubWeights.map(w => Math.max(40, Math.round(coreBurstCount * w)));
      const burstTotal = hubBursts.reduce((a, b) => a + b, 0);
      const total = surfaceCount + burstTotal;
      const positions = new Float32Array(total * 3);
      const colors = new Float32Array(total * 3);
      const phases = new Float32Array(total);
      const sizes = new Float32Array(total);
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
      //
      // Corrective round 2, Fix 3: this — not BLEND_K above — is the actual
      // reason the lobes rendered as a featureless oval. `skin` decays as
      // `exp(-(-d)/SHELL_DEPTH * 4)`, so its 1/e falloff length is
      // SHELL_DEPTH/4 world units: at 2.0 that is 0.5 units, and a particle
      // a full unit inside the true surface (-d = 1.0) still had an 13.5%
      // chance to be kept. Probing `brainSDF` numerically (same standalone
      // port as BLEND_K's comment) against the actual anatomy here: the
      // ventral silhouette's cerebellum/brain-stem saddle is only ~0.13
      // units deep and the temporal lobe sits only ~0.05-0.15 units proud of
      // its neighbours at most front-to-back positions. Both are smaller
      // than the old 0.5-unit falloff length, so the soft shell buried them
      // in its own thickness before they ever reached the screen — a real
      // geometric feature a fraction of a unit tall cannot survive a
      // fringe several times taller than it is.
      //
      // Halved (to 1.15, giving a ~0.29-unit falloff length): still keeps
      // the "something behind the outline" fill the comment below explains
      // (this is not back to the pre-fix hollow-bowl surface-only sampling),
      // but a particle 1 unit inside the true surface now survives at only
      // ~3%, so density drops away fast enough for the lobe-scale bumps
      // above to actually read as a silhouette change instead of a uniform
      // haze at this shell's own thickness.
      const SHELL_DEPTH = 1.15;
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
        const { col, nearDist } = hubGlowColor(pv, hubVecs);
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

      /* The dense, warm core (image 12). Each hub gets a short "root" of
       * points running from near the centre out toward its own patch of
       * surface — biased hard toward the centre (t is raised to a power > 1,
       * so most samples land near t=0) so the interior is where density
       * piles up, and coloured white-hot near the middle, fading to that
       * hub's own colour as it nears the hub's own territory. That is what
       * makes the core read as a bright source the colour regions grow out
       * of, rather than a second, dimmer copy of the surface shell. */
      const hot = new THREE.Color(0xeaf3ff);
      HUBS.forEach((hub, hi) => {
        const hc = hubColors[hi];
        const target = hubVecs[hi];
        for (let i = 0; i < hubBursts[hi]; i++) {
          const t = Math.pow(Math.random(), 1.8); // biased toward 0 = the core
          const jitter = new THREE.Vector3(
            Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5,
          ).multiplyScalar(0.5 * (0.3 + t));
          const p = target.clone().multiplyScalar(t * 0.82).add(jitter);
          const col = hot.clone().lerp(hc, Math.min(1, t * 1.3 + 0.15));

          positions[idx * 3] = p.x; positions[idx * 3 + 1] = p.y; positions[idx * 3 + 2] = p.z;
          colors[idx * 3] = col.r; colors[idx * 3 + 1] = col.g; colors[idx * 3 + 2] = col.b;
          phases[idx] = Math.random() * Math.PI * 2;
          sizes[idx] = (0.02 + Math.random() * 0.012) * (1.0 - t * 0.5);
          idx++;
        }
      });

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      geo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
      geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));

      return { points: geo };
    }

    // The travelling "living pulse" is gone. Bands of light running out along
    // every hub's connections, plus a self-firing timer per hub, was the
    // single biggest source of the fireworks feel: something was always
    // flashing somewhere. The reference is still — its detail comes from
    // density, not motion.
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
    // Fix 6: no more fibre-tract LineSegments/material — see buildBrainGeometry's
    // doc comment for why (image 10's "firework explosion" complaint traces to
    // this system across three prior rewrites; it is removed rather than
    // rewritten a fourth time).
    const brainGeo = buildBrainGeometry(122000, 2600);
    const brainPoints = new THREE.Points(brainGeo.points, brainMat);
    brainGroup.add(brainPoints);

    // Fix 6: the "sparkles" layer -- 1700 extra bright, full-opacity
    // star-sprites scattered back over the whole shell, on top of
    // buildBrainGeometry's own surface points -- is gone. It was a second,
    // brighter copy of the same shell with no anatomical or per-hub meaning,
    // and its bright four-spike star texture at this scale is exactly what
    // read as "fireworks" rather than as surface texture. The shell's own
    // 122,000 points (smaller, dimmer, per-hub coloured) already carry the
    // gyral texture; this was pure extra glare on top of it.

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

      // Fix 6: the four-spike diffraction "glint" sprite is gone -- ten of
      // those firing at once, on top of the glow+hot halo already here, is
      // what a lens-flare/firework look actually is. The soft glow + bright
      // core below already reads as "realistic, glowing rim" (image 12)
      // without the added spikes.
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
      const hex = '#' + hub.color.toString(16).padStart(6, '0');
      const el = document.createElement('div');
      el.className = 'hub-label';
      el.style.color = hex;
      // Fix 6: the floating label now carries the same hub glyph as the
      // sidebar row and Terrain's own summit markers instead of a bare dot --
      // "gebruik dezelfde icons als op terrain, het is tenslotte dezelfde
      // memory" (Luka).
      el.innerHTML = `<span class="hub-label-icon" style="color:${hex}; background:${hex}1a; border-color:${hex}aa;">${hubIconSvg(hub.id, 11)}</span><span><span style="color:var(--text)">${hub.name}</span><span class="sub" data-hub-sub="${hub.id}">${hub.count} memories</span></span>`;
      el.addEventListener('click', () => zoomToHub(hub));
      labelsLayer.appendChild(el);
      hubLabelEls[hub.id] = el;
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
    // Matches <MemoryDock>'s initial depthLevel React state (see setDepthLevelState above).
    let currentDepth = 2;

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
      // The active/locked styling used to live on `.depth-btn` DOM nodes built
      // here; those buttons are now React state rendered by <MemoryDock> (Fix
      // 3 + Fix 7), so this only has to drive the 3D consequence of depth.
      if (!treeData) return;
      const leafVisible = currentDepth >= 2;
      treeData.nodes.filter(n => n.level === 2).forEach(n => {
        if (n.parentLine) n.parentLine.visible = leafVisible;
        if (n.parentMesh) n.parentMesh.visible = leafVisible;
      });
    }
    setDepthImperativeRef.current = (d: number) => {
      if (d === 5) return;
      currentDepth = d;
      applyDepth();
    };

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

      qAll<HTMLElement>('.hub-row').forEach(r => r.classList.toggle('active', r.dataset.id === hub.id));
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
      if (about) about.textContent = 'This is your Global Memory. It holds everything AXE knows, remembers and learns about you and our conversations. Click a hub to explore deeper.';
      qAll('.hub-row').forEach(r => r.classList.remove('active'));
      Object.values(hubLabelEls).forEach(el => { el.style.opacity = '1'; });
    }

    /* ============================== UI ============================== */
    const hubList = q('#hub-list');
    HUBS.forEach(hub => {
      const row = document.createElement('div');
      row.className = 'hub-row';
      row.dataset.id = hub.id;
      const hex = '#' + hub.color.toString(16).padStart(6, '0');
      row.style.color = hex;
      // `avatar-badge` had no matching CSS rule at all -- an invisible span,
      // which is why this list read as name+count with no glyph. Fix 6: the
      // same shared icon set Terrain already uses (hubIcons.ts), tinted per
      // hub exactly like `.nm-hub-row-icon` on Terrain's own hub list.
      row.innerHTML = `<span class="hub-row-icon" style="color:${hex}; background:${hex}18; border-color:${hex}55;">${hubIconSvg(hub.id, 12)}</span><span class="name">${hub.name}</span><span class="count" data-hub-count="${hub.id}">${hub.count}</span>`;
      row.addEventListener('click', () => zoomToHub(hub));
      hubList?.appendChild(row);
    });

    /**
     * Pushes live counts into the already-built DOM. Kept imperative on purpose:
     * re-rendering this view through React would tear down the WebGL scene.
     */
    function applyStats(s: GlobalMemoryStats) {
      const nf = new Intl.NumberFormat('en-US');
      HUBS.forEach(hub => {
        const n = s.hubCounts[hub.id as HubId] ?? 0;
        hub.count = nf.format(n);
        const row = q(`[data-hub-count="${hub.id}"]`);
        if (row) row.textContent = hub.count;
        const sub = q(`[data-hub-sub="${hub.id}"]`);
        if (sub) sub.textContent = `${hub.count} memories`;
      });

      const set = (sel: string, txt: string) => {
        const el = q(sel);
        if (el) el.textContent = txt;
      };
      set('#stat-total', s.loading ? '…' : nf.format(s.total));
      set('#stat-connections', s.loading ? '…' : nf.format(s.connections));
      set('#stat-updated', s.lastUpdatedAt ? timeAgo(new Date(s.lastUpdatedAt).getTime()) : '—');
      set('#stat-integrity', s.integrityPct == null ? '—' : `${s.integrityPct}%`);
      const bar = q<HTMLElement>('#stat-bar');
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

      /* Fix E: real distribution, sorted so the biggest slice always reads
       * first -- against the running total, not each hub's own max, so the
       * bars actually sum to something meaningful. */
      const distList = q('#hub-dist-list');
      if (distList) {
        const totalAll = Math.max(1, s.total);
        const sorted = [...HUBS].sort((a, b) =>
          (s.hubCounts[b.id as HubId] ?? 0) - (s.hubCounts[a.id as HubId] ?? 0));
        distList.innerHTML = sorted.map(hub => {
          const n = s.hubCounts[hub.id as HubId] ?? 0;
          const pct = Math.round((n / totalAll) * 100);
          const hex = '#' + hub.color.toString(16).padStart(6, '0');
          return `<div class="mini-bar-row">`
            + `<span class="mini-bar-label" style="color:${hex}">${hub.name}</span>`
            + `<span class="mini-bar-pct">${pct}%</span>`
            + `<div class="mini-bar-track"><i style="width:${pct}%; background:${hex};"></i></div>`
            + `</div>`;
        }).join('');
      }

      /* Fix E: replaces "Live Pulses" -- where the total is actually stored,
       * not just that something moved. Same three stores useGlobalMemoryStats
       * already loads (global_memory, RAG, Obsidian notes); MemoryDock shows
       * the same split under "Memory Capacity", this is not a new number. */
      const sourceList = q('#source-list');
      if (sourceList) {
        const totalSources = Math.max(1, s.sourceCounts.global + s.sourceCounts.rag + s.sourceCounts.notes);
        const rows: Array<[string, number, string]> = [
          ['Global', s.sourceCounts.global, '#5C8FC2'],
          ['RAG (Knowledge)', s.sourceCounts.rag, '#4CAF7D'],
          ['Obsidian', s.sourceCounts.notes, '#C96B92'],
        ];
        sourceList.innerHTML = rows.map(([label, n, hex]) => {
          const pct = Math.round((n / totalSources) * 100);
          return `<div class="mini-bar-row">`
            + `<span class="mini-bar-label" style="color:${hex}">${label}</span>`
            + `<span class="mini-bar-pct">${nf.format(n)}</span>`
            + `<div class="mini-bar-track"><i style="width:${pct}%; background:${hex};"></i></div>`
            + `</div>`;
        }).join('');
      }
    }
    applyStatsRef.current = applyStats;
    applyStats(statsRef.current);
    // Depth buttons are React now (<MemoryDock>, Fix 3 + Fix 7) -- no DOM row
    // to build here any more. See setDepthImperativeRef above for the bridge.

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
      return `Searching 24,892 memories for "${qs}"… (wire this field to your AXE Core / Memory agent API for live answers)`;
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

      /* Niets tekenen als het venster niet vooraan staat.
       *
       * Dit is een Bloom-pass over een particle-brain op 60 fps; met het
       * venster weggeklikt liep dat gewoon door. De lus blijft draaien zodat de
       * scene intact blijft (herbouwen geeft een hapering), maar composer.render
       * is het dure deel en dat slaan we over.
       *
       * lastNow wordt wél bijgewerkt: anders is dt bij terugkomst de hele tijd
       * dat je weg was, en springt de animatie vooruit. */
      if (document.hidden) { lastNow = performance.now() * 0.001; return; }

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
  // touching the WebGL context.
  useEffect(() => {
    applyStatsRef.current?.(stats);
  }, [stats]);

  return (
    <>
      <NeuralShell rootRef={rootRef} />
      {/* Fix 7: dezelfde fold-out als Terrain, met de dieptekiezer in de
          koprij (Fix 3). Op echte data uit useGlobalMemoryStats -- geen
          sessies of CPU-cijfers die deze app niet bijhoudt. */}
      <MemoryDock
        depthLevel={depthLevel}
        depthLevels={[1, 2, 3, 4, 5]}
        isDepthLocked={(n) => n === 5}
        onSetDepth={(n) => {
          if (n === 5) return;
          setDepthLevelState(n);
          setDepthImperativeRef.current?.(n);
        }}
        columns={buildNeuralDockColumns(stats)}
      />
    </>
  );
}
