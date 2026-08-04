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
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import './NeuralBrain.css';

export default function NeuralBrain() {
  const rootRef = useRef<HTMLDivElement | null>(null);

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

    const STREAM = [
      { t: '1m ago', l1: 'Updated memory', l2: 'Project Orion', c: 0x5c8fc2 },
      { t: '3m ago', l1: 'New conversation', l2: 'AI strategy discussion', c: 0xa855f7 },
      { t: '7m ago', l1: 'Added knowledge', l2: 'Quantum computing', c: 0x2fb8b0 },
      { t: '12m ago', l1: 'Completed task', l2: 'Market research', c: 0x4caf7d },
      { t: '18m ago', l1: 'Updated preference', l2: 'Communication style', c: 0xc9a23a },
    ];

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

    /** Container size — not the window's, so projection stays correct when contained. */
    const viewSize = () => {
      const r = root.getBoundingClientRect();
      return { w: Math.max(1, r.width), h: Math.max(1, r.height) };
    };

    function resize() {
      const { w, h } = viewSize();
      renderer.setSize(w, h, false);
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

    /* ============================== BRAIN GEOMETRY ============================== */
    function outwardBasis(pos: number[]) {
      const outward = new THREE.Vector3(pos[0], pos[1], pos[2]).normalize();
      const up = Math.abs(outward.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
      const t1 = new THREE.Vector3().crossVectors(outward, up).normalize();
      const t2 = new THREE.Vector3().crossVectors(outward, t1).normalize();
      return { outward, t1, t2 };
    }

    function buildBrainGeometry(strandCount = 3200, pointsPerStrand = 32, radialFraction = 0.55, coreBurstCount = 480) {
      const strandTotal = strandCount * pointsPerStrand;
      const burstTotal = HUBS.length * coreBurstCount;
      const total = strandTotal + burstTotal;
      const positions = new Float32Array(total * 3);
      const colors = new Float32Array(total * 3);
      const phases = new Float32Array(total);
      const sizes = new Float32Array(total);
      const rx = 5.7, ry = 3.9, rz = 4.9;
      const baseColor = new THREE.Color(0x05060f);
      const hubColors = HUBS.map(h => new THREE.Color(h.color));
      const hubVecs = HUBS.map(h => new THREE.Vector3(h.pos[0], h.pos[1], h.pos[2]));
      let idx = 0;

      for (let s = 0; s < strandCount; s++) {
        const isRadial = Math.random() < radialFraction;
        let theta: number, phi: number, dTheta: number, dPhi: number, seedHubIdx = -1;
        if (isRadial) {
          seedHubIdx = Math.floor(Math.random() * HUBS.length);
          const hp = HUBS[seedHubIdx].pos;
          const hv = new THREE.Vector3(hp[0], hp[1], hp[2]).normalize();
          theta = Math.atan2(hv.x, hv.z) + (Math.random() - 0.5) * 0.24;
          phi = THREE.MathUtils.clamp(Math.acos(THREE.MathUtils.clamp(hv.y, -1, 1)) + (Math.random() - 0.5) * 0.24, 0.12, Math.PI - 0.12);
          const outAngle = Math.random() * Math.PI * 2;
          dTheta = Math.cos(outAngle) * 0.065;
          dPhi = Math.sin(outAngle) * 0.05;
        } else {
          theta = Math.random() * Math.PI * 2;
          phi = THREE.MathUtils.clamp(Math.acos(2 * Math.random() - 1), 0.1, Math.PI - 0.1);
          dTheta = (Math.random() < 0.5 ? 1 : -1) * 0.05;
          dPhi = 0;
        }
        const curl = (Math.random() - 0.5) * 0.7;
        const seed = Math.random() * 20;
        for (let p = 0; p < pointsPerStrand; p++) {
          theta += dTheta + Math.sin(p * 0.35 + seed) * 0.011;
          phi += dPhi + curl * 0.011 * Math.sin(p * 0.22 + seed);
          phi = THREE.MathUtils.clamp(phi, 0.08, Math.PI - 0.08);

          const fold = Math.sin(theta * 7 + phi * 3) * 0.09 + Math.sin(theta * 13 - phi * 5) * 0.05
            + Math.sin(phi * 9 + theta * 2) * 0.04 + Math.sin(theta * 21 + phi * 11) * 0.022
            + Math.sin(theta * 34 + phi * 19) * 0.012;
          const taper = 1 - 0.22 * Math.max(0, -Math.cos(phi));
          const rScale = (1 + fold) * taper;
          const x = Math.sin(phi) * Math.cos(theta);
          const y = Math.cos(phi);
          const z = Math.sin(phi) * Math.sin(theta);
          const shellJ = 0.95 + Math.random() * 0.07;
          const px = x * rx * rScale * shellJ, py = y * ry * rScale * shellJ, pz = z * rz * rScale * shellJ;
          const fissure = Math.exp(-Math.pow(x * 7.5, 2)) * Math.max(0, y * 1.15);

          const { col, nearDist } = nearestHubBlend(new THREE.Vector3(px, py, pz), hubColors, hubVecs);
          if (isRadial) {
            const fade = Math.max(0, 1 - (p / pointsPerStrand) * 1.15);
            col.lerp(hubColors[seedHubIdx], 0.6 * fade);
          }
          const bright = THREE.MathUtils.clamp(1.35 - nearDist * 0.11, 0.28, 1.15);
          col.multiplyScalar(bright);
          col.lerp(baseColor, 0.08);
          col.multiplyScalar(1 - fissure * 0.8);

          positions[idx * 3] = px; positions[idx * 3 + 1] = py; positions[idx * 3 + 2] = pz;
          colors[idx * 3] = col.r; colors[idx * 3 + 1] = col.g; colors[idx * 3 + 2] = col.b;
          phases[idx] = Math.random() * Math.PI * 2;
          sizes[idx] = isRadial ? (0.034 + Math.random() * 0.018) : (0.026 + Math.random() * 0.014);
          idx++;
        }
      }

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
          idx++;
        }
      });

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      geo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
      geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
      return geo;
    }

    const brainUniforms = { uTime: { value: 0 }, uOpacity: { value: 0.94 } };
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
          vTwinkle = 0.7 + 0.4*sin(uTime*1.1 + aPhase);
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * vTwinkle * (800.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        varying float vTwinkle;
        uniform float uOpacity;
        void main(){
          vec2 uv = gl_PointCoord - vec2(0.5);
          float d = length(uv);
          if(d>0.5) discard;
          float a = smoothstep(0.5, 0.0, d) * uOpacity * (0.55+0.45*vTwinkle);
          gl_FragColor = vec4(vColor, a);
        }
      `,
    });
    const brainPoints = new THREE.Points(buildBrainGeometry(), brainMat);
    brainGroup.add(brainPoints);

    (function sparkles() {
      const N = 1700;
      const positions = new Float32Array(N * 3), colors = new Float32Array(N * 3);
      const rx = 5.7, ry = 3.9, rz = 4.9;
      const hubColors = HUBS.map(h => new THREE.Color(h.color));
      const hubVecs = HUBS.map(h => new THREE.Vector3(h.pos[0], h.pos[1], h.pos[2]));
      for (let i = 0; i < N; i++) {
        const phi = Math.acos(2 * Math.random() - 1), theta = Math.random() * Math.PI * 2;
        const shellJ = 0.88 + Math.random() * 0.2;
        const px = Math.sin(phi) * Math.cos(theta) * rx * shellJ;
        const py = Math.cos(phi) * ry * shellJ;
        const pz = Math.sin(phi) * Math.sin(theta) * rz * shellJ;
        const { col } = nearestHubBlend(new THREE.Vector3(px, py, pz), hubColors, hubVecs);
        col.lerp(new THREE.Color(0xffffff), 0.55);
        positions[i * 3] = px; positions[i * 3 + 1] = py; positions[i * 3 + 2] = pz;
        colors[i * 3] = col.r; colors[i * 3 + 1] = col.g; colors[i * 3 + 2] = col.b;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      const m = new THREE.PointsMaterial({
        map: dotTex, size: 0.06, vertexColors: true, transparent: true, opacity: 0.85,
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
        blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.4,
      }));
      glow.scale.set(0.45, 0.45, 0.45);
      grp.add(glow);

      const hot = new THREE.Sprite(new THREE.SpriteMaterial({
        map: makeGlowTexture(hub.color, true), transparent: true,
        blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.7,
      }));
      hot.scale.set(0.12, 0.12, 0.12);
      grp.add(hot);

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
      buildBrainGeometry(150, 16, 0.42, 26),
      new THREE.PointsMaterial({
        size: 0.05, vertexColors: true, transparent: true, opacity: 0.9,
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
      el.innerHTML = `<span class="dot" style="background:currentColor"></span><span><span style="color:var(--text)">${hub.name}</span><span class="sub">${hub.count} memories</span></span>`;
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
    const state = { azimuth: 0.42, elevation: 0.36, distance: 14.5, target: new THREE.Vector3(0, 0, 0) };
    const goal = { azimuth: 0.42, elevation: 0.36, distance: 14.5, target: new THREE.Vector3(0, 0, 0) };
    let dragEnabled = true;
    let autoRotate = true;
    let activeHub: (typeof HUBS)[number] | null = null;
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
            void main(){
              vec2 uv = gl_PointCoord - vec2(0.5);
              float d = length(uv);
              if(d>0.5) discard;
              float a = smoothstep(0.5,0.0,d) * 0.8 * (0.5+0.5*vTwinkle);
              gl_FragColor = vec4(vColor, a);
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
      row.innerHTML = `<span class="avatar-badge" style="color:currentColor"></span><span class="name">${hub.name}</span><span class="count">${hub.count}</span>`;
      row.addEventListener('click', () => zoomToHub(hub));
      hubList?.appendChild(row);
    });

    const streamList = q('#stream-list');
    STREAM.forEach(s => {
      const d = document.createElement('div');
      d.className = 'stream-item';
      const hex = '#' + s.c.toString(16).padStart(6, '0');
      d.innerHTML = `<span class="sd" style="background:${hex}; color:${hex};"></span><div class="body"><div class="t">${s.t}</div><div class="l1">${s.l1}</div><div class="l2">${s.l2}</div></div>`;
      streamList?.appendChild(d);
    });

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
    function animate() {
      rafId = requestAnimationFrame(animate);
      const t = performance.now() * 0.001;

      if (autoRotate && !activeHub) brainGroup.rotation.y += 0.0016;
      miniGroup.rotation.y += 0.006;

      if (!isDown) {
        state.azimuth = lerp(state.azimuth, goal.azimuth, 0.06);
        state.elevation = lerp(state.elevation, goal.elevation, 0.06);
      }
      state.distance = lerp(state.distance, goal.distance, 0.07);
      state.target.lerp(goal.target, 0.07);
      updateCameraFromState();

      brainUniforms.uTime.value = t;
      brainUniforms.uOpacity.value = lerp(brainUniforms.uOpacity.value, activeHub ? 0.22 : 0.94, 0.08);

      HUBS.forEach(hub => {
        const pulse = 1 + 0.14 * Math.sin(t * 0.9 + (hub._phase ?? 0));
        const fade = (activeHub && activeHub.id === hub.id) ? 0.15 : 1;
        hub._glowSprite?.scale.setScalar(0.45 * pulse * fade);
        hub._hotSprite?.scale.setScalar(0.12 * (0.85 + 0.3 * Math.sin(t * 1.4 + (hub._phase ?? 0))) * fade);
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

      renderer.render(scene, camera);
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
      renderer.dispose();
      miniRenderer?.dispose();
    };
  }, []);

  return (
    <div
      className="axe-neural-root"
      ref={rootRef}
      dangerouslySetInnerHTML={{
        __html: `<div id="canvas-wrap"><canvas id="brain"></canvas></div>
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
    <div class="stat-row"><span class="k">Total Memories</span><span class="v">24,892</span></div>
    <div class="stat-row"><span class="k">Connections</span><span class="v">178,420</span></div>
    <div class="stat-row"><span class="k">Last Updated</span><span class="v">1m ago</span></div>
    <div class="stat-row"><span class="k">Integrity</span><span class="v">100%</span></div>
    <div class="bar"><i></i></div>
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
</div>`,
      }}
    />
  );
}
