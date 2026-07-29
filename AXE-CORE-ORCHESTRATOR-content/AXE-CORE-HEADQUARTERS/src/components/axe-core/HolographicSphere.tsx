import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer, RenderPass, EffectPass, BloomEffect, ChromaticAberrationEffect, BlendFunction, KernelSize } from 'postprocessing';

export type CoreStatus = 'idle' | 'listening' | 'processing' | 'thinking' | 'speaking' | 'executing';
export type ShapeKey = 'core' | 'galaxy' | 'dna' | 'saturn' | 'heart' | 'sphere' | 'cube' | 'torus';

const PARTICLE_COUNT = 12000;
const STAR_COUNT = 4000;
const rand = (a: number, b: number) => a + Math.random() * (b - a);

function makeGlowTexture(): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const ctx = cv.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0,    'rgba(255,255,255,1)');
  g.addColorStop(0.2,  'rgba(103,232,249,0.8)');
  g.addColorStop(0.55, 'rgba(79,70,229,0.35)');
  g.addColorStop(1,    'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(cv);
}

const generators: Record<ShapeKey, () => number[]> = {
  core() {
    const p: number[] = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const v = new THREE.Vector3().randomDirection()
        .multiplyScalar(1.6 * (0.5 + 0.5 * Math.pow(Math.random(), 0.35)));
      p.push(v.x, v.y, v.z);
    }
    return p;
  },
  galaxy() {
    const p: number[] = [], arms = 3;
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const arm = i % arms, t = Math.pow(Math.random(), 0.55), r = t * 3.2;
      const a = arm * (Math.PI * 2 / arms) + t * 4.8 + rand(-0.2, 0.2);
      p.push(Math.cos(a) * r + rand(-0.06, 0.06), rand(-0.15, 0.15) * (1 - t) * 2.2, Math.sin(a) * r + rand(-0.06, 0.06));
    }
    return p;
  },
  dna() {
    const p: number[] = [], turns = 3.5, h = 4.2;
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const t = i / PARTICLE_COUNT, ang = t * Math.PI * 2 * turns, y = -h / 2 + t * h;
      const s = i % 3;
      if (s === 2) { const k = rand(-1, 1); p.push(Math.cos(ang) * 1.15 * k, y, Math.sin(ang) * 1.15 * k); }
      else { const off = s === 0 ? 0 : Math.PI; p.push(Math.cos(ang + off) * 1.15, y, Math.sin(ang + off) * 1.15); }
    }
    return p;
  },
  saturn() {
    const p: number[] = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      if (i % 3 === 0) { const a = rand(0, Math.PI * 2), r = rand(1.7, 2.9); p.push(Math.cos(a) * r, rand(-0.05, 0.05), Math.sin(a) * r * 0.88); }
      else { const v = new THREE.Vector3().randomDirection().multiplyScalar(1.15); p.push(v.x, v.y, v.z); }
    }
    return p;
  },
  heart() {
    const p: number[] = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const t = rand(0, Math.PI * 2);
      const x = 16 * Math.pow(Math.sin(t), 3);
      const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
      p.push(x * 0.12 + rand(-0.06, 0.06), y * 0.12 + rand(-0.06, 0.06), rand(-0.35, 0.35));
    }
    return p;
  },
  sphere() {
    const p: number[] = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) { const v = new THREE.Vector3().randomDirection().multiplyScalar(1.9); p.push(v.x, v.y, v.z); }
    return p;
  },
  cube() {
    const p: number[] = [], s = 1.65;
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const f = (Math.random() * 6) | 0, a = rand(-s, s), b = rand(-s, s);
      if (f === 0) p.push(s, a, b); else if (f === 1) p.push(-s, a, b);
      else if (f === 2) p.push(a, s, b); else if (f === 3) p.push(a, -s, b);
      else if (f === 4) p.push(a, b, s); else p.push(a, b, -s);
    }
    return p;
  },
  torus() {
    const p: number[] = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const u = rand(0, Math.PI * 2), v = rand(0, Math.PI * 2);
      p.push((1.6 + 0.6 * Math.cos(v)) * Math.cos(u), 0.6 * Math.sin(v), (1.6 + 0.6 * Math.cos(v)) * Math.sin(u));
    }
    return p;
  },
};

const PRESETS: { key: ShapeKey; label: string }[] = [
  { key: 'core',    label: 'AXE Core' },
  { key: 'galaxy',  label: 'Galaxy'   },
  { key: 'dna',     label: 'DNA'      },
  { key: 'saturn',  label: 'Saturn'   },
  { key: 'heart',   label: 'Heart'    },
  { key: 'sphere',  label: 'Sphere'   },
  { key: 'cube',    label: 'Cube'     },
  { key: 'torus',   label: 'Torus'    },
];

export function HolographicSphere({ status = 'idle' }: { status?: CoreStatus }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const [active, setActive] = useState<ShapeKey>('core');
  const morphFnRef = useRef<(key: ShapeKey) => void>(() => {});

  useEffect(() => {
    const container = containerRef.current!;
    const canvas    = canvasRef.current!;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x020206, 1);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x020206, 0.024);

    const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 200);
    camera.position.set(0, 1.5, 7.2);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping   = true;
    controls.dampingFactor   = 0.05;
    controls.maxDistance     = 18;
    controls.minDistance     = 2.2;
    controls.enablePan       = false;
    controls.autoRotate      = true;
    controls.autoRotateSpeed = 0.35;

    /* ── Cinematic Post Processing ── */
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));

    const bloomEffect = new BloomEffect({
      blendFunction: BlendFunction.SCREEN,
      kernelSize: KernelSize.LARGE,
      luminanceThreshold: 0.2,
      luminanceSmoothing: 0.15,
      intensity: 1.35,
    });

    const chromaticAberrationEffect = new ChromaticAberrationEffect({
      offset: new THREE.Vector2(0.0012, 0.0012),
      radialModulation: true,
      modulationOffset: 0.45,
    });

    const effectPass = new EffectPass(camera, bloomEffect, chromaticAberrationEffect);
    composer.addPass(effectPass);

    const glowTex = makeGlowTexture();

    /* Floor grid — dots grid matching AXE system theme */
    const gridVerts: number[] = [];
    const gExt = 90, dotStep = gExt / 18;
    for (let x = -gExt; x <= gExt; x += dotStep) {
      for (let z = -gExt; z <= gExt; z += dotStep) {
        gridVerts.push(x, -2.6, z);
      }
    }
    const gridGeo = new THREE.BufferGeometry();
    gridGeo.setAttribute('position', new THREE.Float32BufferAttribute(gridVerts, 3));
    const grid = new THREE.Points(gridGeo, new THREE.PointsMaterial({
      color: 0x06b6d4, size: 0.04, transparent: true, opacity: 0.15, blending: THREE.AdditiveBlending, map: glowTex, depthWrite: false,
    }));
    scene.add(grid);

    /* ── Volumetric Deep Space Starfield ── */
    const starBuf = new Float32Array(STAR_COUNT * 3);
    const starColors = new Float32Array(STAR_COUNT * 3);
    const colIndigo = new THREE.Color(0x4f46e5);
    const colCyan   = new THREE.Color(0x06b6d4);
    const colLime   = new THREE.Color(0xd4fc34);
    const colWhite  = new THREE.Color(0xffffff);

    for (let i = 0; i < STAR_COUNT; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(rand(6, 40));
      starBuf[i * 3]     = v.x;
      starBuf[i * 3 + 1] = v.y;
      starBuf[i * 3 + 2] = v.z;

      const pick = Math.random();
      const c = pick > 0.7 ? colLime : pick > 0.4 ? colCyan : pick > 0.15 ? colIndigo : colWhite;
      starColors[i * 3]     = c.r;
      starColors[i * 3 + 1] = c.g;
      starColors[i * 3 + 2] = c.b;
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starBuf, 3));
    starGeo.setAttribute('color', new THREE.BufferAttribute(starColors, 3));
    const starMat = new THREE.PointsMaterial({
      size: 0.045, map: glowTex, vertexColors: true, transparent: true, opacity: 0.65, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const stars = new THREE.Points(starGeo, starMat);
    scene.add(stars);

    /* ── Cinematic Core Group ── */
    const coreGroup = new THREE.Group();
    scene.add(coreGroup);

    // White-hot inner nucleus
    const nucleus = new THREE.Mesh(
      new THREE.SphereGeometry(0.24, 32, 32),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.98, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    coreGroup.add(nucleus);

    // Cyan plasma shell
    const energyShellMat = new THREE.MeshBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.42, blending: THREE.AdditiveBlending, depthWrite: false });
    const energyShell = new THREE.Mesh(new THREE.SphereGeometry(0.4, 32, 32), energyShellMat);
    coreGroup.add(energyShell);

    // Geodesic wireframe containment lattice
    const containment = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.58, 2),
      new THREE.MeshBasicMaterial({ color: 0x06b6d4, wireframe: true, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    coreGroup.add(containment);

    // Halo lens flares
    const halo1Mat = new THREE.SpriteMaterial({ map: glowTex, color: 0x67e8f9, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
    const halo1 = new THREE.Sprite(halo1Mat);
    halo1.scale.setScalar(2.5);
    coreGroup.add(halo1);

    const halo2Mat = new THREE.SpriteMaterial({ map: glowTex, color: 0x4f46e5, transparent: true, opacity: 0.24, blending: THREE.AdditiveBlending, depthWrite: false });
    const halo2 = new THREE.Sprite(halo2Mat);
    halo2.scale.setScalar(4.2);
    coreGroup.add(halo2);

    // Segmented ring generator
    type RingEntry = { group: THREE.Group; speed: number };
    function createSegmentedRing(radius: number, gapEvery: number, thickness: number, color: number, speed: number, tiltX = 0, tiltY = 0): RingEntry {
      const group = new THREE.Group();
      const mesh = new THREE.Mesh(
        new THREE.RingGeometry(radius, radius + thickness, 128),
        new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      mesh.rotation.x = Math.PI / 2 + tiltX; mesh.rotation.y = tiltY;
      group.add(mesh);
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 128; i++) {
        if (i % gapEvery === 0) continue;
        const a = (i / 128) * Math.PI * 2;
        pts.push(new THREE.Vector3(Math.cos(a) * (radius + thickness), 0, Math.sin(a) * (radius + thickness)));
      }
      const dots = new THREE.Points(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.PointsMaterial({ color, size: 0.028, map: glowTex, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      dots.rotation.x = tiltX; dots.rotation.y = tiltY;
      group.add(dots);
      return { group, speed };
    }

    const rings: RingEntry[] = [
      createSegmentedRing(0.82,  9,  0.045, 0x06b6d4,  0.42),
      createSegmentedRing(1.15, 13,  0.02,  0x4f46e5, -0.24, 0.12, 0.1),
      createSegmentedRing(1.48, 7,   0.065, 0xd4fc34,  0.14, -0.15, 0.05),
      createSegmentedRing(1.88, 17,  0.015, 0x06b6d4, -0.07),
    ];
    rings.forEach(r => coreGroup.add(r.group));

    type GyroEntry = { mesh: THREE.Mesh; axis: 'x' | 'z'; speed: number };
    const gyros: GyroEntry[] = [
      { mesh: new THREE.Mesh(new THREE.TorusGeometry(0.66, 0.008, 8, 100), new THREE.MeshBasicMaterial({ color: 0x67e8f9, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false })), axis: 'x', speed: 0.95 },
      { mesh: new THREE.Mesh(new THREE.TorusGeometry(0.74, 0.006, 8, 100), new THREE.MeshBasicMaterial({ color: 0xd4fc34, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false })), axis: 'z', speed: -0.7 },
    ];
    gyros.forEach(g => coreGroup.add(g.mesh));

    // Orbiting sparks
    const SPARKS = 90;
    const sparkData = Array.from({ length: SPARKS }, () => ({
      r: rand(0.55, 2.2), speed: rand(0.45, 1.8) * (Math.random() < 0.5 ? 1 : -1),
      phase: rand(0, Math.PI * 2), incl: rand(-0.5, 0.5),
    }));
    const sparkPosBuf = new Float32Array(SPARKS * 3);
    const sparkGeo = new THREE.BufferGeometry();
    sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPosBuf, 3));
    coreGroup.add(new THREE.Points(sparkGeo, new THREE.PointsMaterial({
      size: 0.065, map: glowTex, color: 0x9bf6ff, transparent: true, opacity: 0.88, blending: THREE.AdditiveBlending, depthWrite: false,
    })));

    /* ── Particle Morphing Cloud ── */
    const colorTop    = new THREE.Color('#d4fc34');
    const colorMid    = new THREE.Color('#06b6d4');
    const colorBottom = new THREE.Color('#4f46e5');
    const positions   = new Float32Array(PARTICLE_COUNT * 3);
    const targets     = new Float32Array(PARTICLE_COUNT * 3);
    const pColors     = new Float32Array(PARTICLE_COUNT * 3);
    const seeds       = new Float32Array(PARTICLE_COUNT);
    for (let i = 0; i < PARTICLE_COUNT; i++) seeds[i] = Math.random();

    const particleGeo = new THREE.BufferGeometry();
    particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    particleGeo.setAttribute('color', new THREE.BufferAttribute(pColors, 3));

    function paintColors() {
      const c = new THREE.Color();
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const yv = targets[i * 3 + 1], tv = THREE.MathUtils.clamp((yv + 2) / 4, 0, 1);
        if (tv > 0.5) c.copy(colorMid).lerp(colorTop, (tv - 0.5) * 2);
        else c.copy(colorBottom).lerp(colorMid, tv * 2);
        c.offsetHSL(0, 0, (seeds[i] - 0.5) * 0.15);
        pColors[i * 3]     = c.r;
        pColors[i * 3 + 1] = c.g;
        pColors[i * 3 + 2] = c.b;
      }
      particleGeo.attributes.color.needsUpdate = true;
    }

    const startPts = generators.core();
    for (let i = 0; i < PARTICLE_COUNT * 3; i++) { positions[i] = startPts[i]; targets[i] = startPts[i]; }
    paintColors();

    const particleMat = new THREE.PointsMaterial({
      size: 0.052, map: glowTex, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const cloud = new THREE.Points(particleGeo, particleMat);
    scene.add(cloud);

    /* ── Morphing Action ── */
    let pulseT = 0;
    morphFnRef.current = (key: ShapeKey) => {
      const pts = generators[key]();
      for (let i = 0; i < PARTICLE_COUNT * 3; i++) targets[i] = pts[i];
      paintColors();
      pulseT = 1;
      setActive(key);
    };

    const onExternalMorph = (e: Event) => {
      const key = (e as CustomEvent<{ key: ShapeKey }>).detail?.key;
      if (key && key in generators) morphFnRef.current(key);
    };
    window.addEventListener('axe-sphere-morph', onExternalMorph);

    /* ── Mouse Parallax ── */
    let targetMouseX = 0, targetMouseY = 0;
    const onPointerMove = (e: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
      targetMouseX = x * 0.4;
      targetMouseY = y * 0.3;
    };
    window.addEventListener('pointermove', onPointerMove);

    /* ── Resize ── */
    function resize() {
      const w = container.clientWidth, h = container.clientHeight;
      renderer.setSize(w, h, false);
      composer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    const ro = new ResizeObserver(resize);
    ro.observe(container);
    resize();

    /* ── Animation Loop ── */
    const clock = new THREE.Clock();
    let rafId = 0;

    function animate() {
      rafId = requestAnimationFrame(animate);
      const t = clock.getElapsedTime();

      // Smooth mouse parallax
      camera.position.x += (targetMouseX - camera.position.x) * 0.04;
      camera.position.y += (1.5 + targetMouseY - camera.position.y) * 0.04;

      // Status pulse modifier
      const isBusy = status === 'thinking' || status === 'speaking' || status === 'executing';
      const curBreatheHz = isBusy ? 3.5 : 1.6;
      const curRingMul   = isBusy ? 1.8 : 1.0;

      // Particle spring interpolation
      const pos = particleGeo.attributes.position.array as Float32Array;
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const k = 0.038 + seeds[i] * 0.03, j = i * 3;
        pos[j]   += (targets[j]   - pos[j])   * k;
        pos[j+1] += (targets[j+1] - pos[j+1]) * k;
        pos[j+2] += (targets[j+2] - pos[j+2]) * k;
      }
      particleGeo.attributes.position.needsUpdate = true;

      // Rotations
      cloud.rotation.y = t * 0.09;
      rings.forEach(r => { r.group.rotation.y = t * r.speed * curRingMul; });
      gyros.forEach(g => { g.mesh.rotation[g.axis] = t * g.speed * curRingMul; });
      coreGroup.rotation.x = Math.sin(t * 0.25) * 0.05;
      containment.rotation.y = -t * 0.3;
      containment.rotation.x = Math.sin(t * 0.4) * 0.2;

      stars.rotation.y = t * 0.008;
      stars.rotation.x = t * 0.003;
      grid.position.z = (t * 0.4) % (dotStep * 2);

      // Sparks calculation
      const sp = sparkGeo.attributes.position.array as Float32Array;
      for (let i = 0; i < SPARKS; i++) {
        const d = sparkData[i], a = d.phase + t * d.speed;
        sp[i * 3]     = Math.cos(a) * d.r;
        sp[i * 3 + 1] = Math.sin(a * 1.3) * d.r * d.incl;
        sp[i * 3 + 2] = Math.sin(a) * d.r;
      }
      sparkGeo.attributes.position.needsUpdate = true;

      if (pulseT > 0) pulseT = Math.max(0, pulseT - 0.015);
      const breathe = 1 + Math.sin(t * curBreatheHz) * 0.07 + pulseT * 0.75;
      const flicker = 1 + Math.sin(t * 23) * 0.015 + Math.sin(t * 7.3) * 0.02;

      nucleus.scale.setScalar(breathe * flicker);
      energyShell.scale.setScalar(breathe * 1.02);
      energyShellMat.opacity = 0.35 + pulseT * 0.35 + Math.sin(t * curBreatheHz) * 0.08;

      halo1.scale.setScalar(2.5 * breathe * flicker);
      halo1Mat.opacity = 0.48 + pulseT * 0.4 + Math.sin(t * curBreatheHz) * 0.08;
      halo2.scale.setScalar(4.2 * (1 + pulseT * 0.5));
      halo2Mat.opacity = 0.18 + pulseT * 0.25;

      particleMat.size = 0.052 * (1 + pulseT * 0.6);

      controls.update();
      composer.render();
    }
    animate();

    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
      composer.dispose();
      glowTex.dispose();
      window.removeEventListener('axe-sphere-morph', onExternalMorph);
      window.removeEventListener('pointermove', onPointerMove);
    };
  }, [status]);

  return (
    <div ref={containerRef} className="absolute inset-0 select-none">
      <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />

      {/* Sleek preset HUD pill overlay */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 p-1 rounded-full backdrop-blur-md" style={{ background: 'rgba(8,10,18,0.7)', border: '1px solid rgba(255,255,255,0.08)' }}>
        {PRESETS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => morphFnRef.current(key)}
            className="px-2.5 py-1 rounded-full text-[10px] font-mono-data transition-all"
            style={{
              background: active === key ? 'rgba(34,211,238,0.2)' : 'transparent',
              color: active === key ? 'var(--accent-cyan)' : 'var(--text-muted)',
              border: `1px solid ${active === key ? 'rgba(34,211,238,0.4)' : 'transparent'}`,
            }}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
