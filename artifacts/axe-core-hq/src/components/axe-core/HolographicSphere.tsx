import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

/*
 * AXE CORE — Cinematic Holographic 3D Core (Krater.ai v5.0)
 *   white-hot nucleus · layered energy shells · wireframe containment sphere
 *   lens-flare halos · 4 segmented rings · 2 gyroscope rings
 *   90 orbiting sparks · 12k morphing particle cloud · auto-orbit camera
 */

const PARTICLE_COUNT = 12000;
const rand = (a: number, b: number) => a + Math.random() * (b - a);

function makeGlowTexture(): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const ctx = cv.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0,    'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  g.addColorStop(1,    'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(cv);
}

type ShapeKey = 'core' | 'galaxy' | 'dna' | 'saturn' | 'heart' | 'sphere' | 'cube' | 'torus' | 'pyramid';

const generators: Record<ShapeKey, () => number[]> = {
  core() {
    const p: number[] = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const v = new THREE.Vector3().randomDirection()
        .multiplyScalar(1.5 * (0.55 + 0.45 * Math.pow(Math.random(), 0.4)));
      p.push(v.x, v.y, v.z);
    }
    return p;
  },
  galaxy() {
    const p: number[] = [], arms = 3;
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const arm = i % arms, t = Math.pow(Math.random(), 0.6), r = t * 2.8;
      const a = arm * (Math.PI * 2 / arms) + t * 4.5 + rand(-0.25, 0.25);
      p.push(Math.cos(a) * r + rand(-0.05, 0.05), rand(-0.12, 0.12) * (1 - t) * 2, Math.sin(a) * r + rand(-0.05, 0.05));
    }
    return p;
  },
  dna() {
    const p: number[] = [], turns = 3.2, h = 4;
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const t = i / PARTICLE_COUNT, ang = t * Math.PI * 2 * turns, y = -h / 2 + t * h;
      const s = i % 3;
      if (s === 2) { const k = rand(-1, 1); p.push(Math.cos(ang) * 1.1 * k, y, Math.sin(ang) * 1.1 * k); }
      else { const off = s === 0 ? 0 : Math.PI; p.push(Math.cos(ang + off) * 1.1, y, Math.sin(ang + off) * 1.1); }
    }
    return p;
  },
  saturn() {
    const p: number[] = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      if (i % 3 === 0) { const a = rand(0, Math.PI * 2), r = rand(1.6, 2.6); p.push(Math.cos(a) * r, rand(-0.04, 0.04), Math.sin(a) * r * 0.9); }
      else { const v = new THREE.Vector3().randomDirection().multiplyScalar(1.1); p.push(v.x, v.y, v.z); }
    }
    return p;
  },
  heart() {
    const p: number[] = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const t = rand(0, Math.PI * 2);
      const x = 16 * Math.pow(Math.sin(t), 3);
      const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
      p.push(x * 0.11 + rand(-0.06, 0.06), y * 0.11 + rand(-0.06, 0.06), rand(-0.35, 0.35));
    }
    return p;
  },
  sphere() {
    const p: number[] = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) { const v = new THREE.Vector3().randomDirection().multiplyScalar(1.8); p.push(v.x, v.y, v.z); }
    return p;
  },
  cube() {
    const p: number[] = [], s = 1.6;
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
      p.push((1.5 + 0.55 * Math.cos(v)) * Math.cos(u), 0.55 * Math.sin(v), (1.5 + 0.55 * Math.cos(v)) * Math.sin(u));
    }
    return p;
  },
  pyramid() {
    const p: number[] = [], s = 1.9, h = 2.6;
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const t = Math.sqrt(Math.random()), y = -h / 2 + (1 - t) * h, half = s * t;
      const e = (Math.random() * 4) | 0, a = rand(-half, half);
      if (e === 0) p.push(half, y, a); else if (e === 1) p.push(-half, y, a);
      else if (e === 2) p.push(a, y, half); else p.push(a, y, -half);
    }
    return p;
  },
};

const PRESETS: { key: ShapeKey; label: string }[] = [
  { key: 'core',    label: '3D Maps' }, // TODO: replace morph with real Google Maps 3D view on click
  { key: 'galaxy',  label: 'Galaxy'   },
  { key: 'dna',     label: 'DNA'      },
  { key: 'saturn',  label: 'Saturn'   },
  { key: 'heart',   label: 'Heart'    },
  { key: 'sphere',  label: 'Sphere'   },
  { key: 'cube',    label: 'Cube'     },
  { key: 'torus',   label: 'Torus'    },
];

export function HolographicSphere() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const [active, setActive] = useState<ShapeKey>('sphere');
  const morphFnRef = useRef<(key: ShapeKey) => void>(() => {});

  useEffect(() => {
    const container = containerRef.current!;
    const canvas    = canvasRef.current!;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 1);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x000000, 0.028);

    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 200);
    camera.position.set(0, 1.6, 7);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping   = true;
    controls.dampingFactor   = 0.05;
    controls.maxDistance     = 16;
    controls.minDistance     = 2.5;
    controls.enablePan       = false;
    controls.autoRotate      = true;
    controls.autoRotateSpeed = 0.35;

    const glowTex = makeGlowTexture();

    /* Floor grid */
    const gridVerts: number[] = [];
    const gLines = 120, gExt = 100;
    for (let i = -gLines; i <= gLines; i++) {
      const c = (i / gLines) * gExt;
      gridVerts.push(c, -2.5, -gExt, c, -2.5, gExt, -gExt, -2.5, c, gExt, -2.5, c);
    }
    const gridGeo = new THREE.BufferGeometry();
    gridGeo.setAttribute('position', new THREE.Float32BufferAttribute(gridVerts, 3));
    const grid = new THREE.LineSegments(gridGeo, new THREE.LineBasicMaterial({
      color: 0x06b6d4, transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending,
    }));
    scene.add(grid);

    /* ── Cinematic Core ── */
    const coreGroup = new THREE.Group();
    scene.add(coreGroup);

    const nucleus = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 32, 32),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    coreGroup.add(nucleus);

    const energyShell = new THREE.Mesh(
      new THREE.SphereGeometry(0.38, 32, 32),
      new THREE.MeshBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    coreGroup.add(energyShell);

    const containment = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.55, 2),
      new THREE.MeshBasicMaterial({ color: 0x06b6d4, wireframe: true, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    coreGroup.add(containment);

    const halo1 = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0x67e8f9, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
    halo1.scale.setScalar(2.4);
    coreGroup.add(halo1);

    const halo2 = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0x4f46e5, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false }));
    halo2.scale.setScalar(4.6);
    coreGroup.add(halo2);

    type RingEntry = { group: THREE.Group; speed: number };
    function createSegmentedRing(radius: number, gapEvery: number, thickness: number, color: number, speed: number, tiltX = 0, tiltY = 0): RingEntry {
      const group = new THREE.Group();
      const mesh = new THREE.Mesh(
        new THREE.RingGeometry(radius, radius + thickness, 128),
        new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      mesh.rotation.x = Math.PI / 2 + tiltX; mesh.rotation.y = tiltY;
      group.add(mesh);
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 128; i++) {
        if (i % gapEvery === 0) continue;
        const a = (i / 128) * Math.PI * 2;
        pts.push(new THREE.Vector3(Math.cos(a) * (radius + thickness), 0, Math.sin(a) * (radius + thickness)));
      }
      const dots = new THREE.Points(new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.PointsMaterial({ color, size: 0.025, map: glowTex, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
      dots.rotation.x = tiltX; dots.rotation.y = tiltY;
      group.add(dots);
      return { group, speed };
    }
    const rings: RingEntry[] = [
      createSegmentedRing(0.8,  9,  0.045, 0x06b6d4,  0.4),
      createSegmentedRing(1.1,  13, 0.02,  0x4f46e5, -0.22, 0.12, 0.1),
      createSegmentedRing(1.45, 7,  0.065, 0xd4fc34,  0.12, -0.15, 0.05),
      createSegmentedRing(1.85, 17, 0.015, 0x06b6d4, -0.06),
    ];
    rings.forEach(r => coreGroup.add(r.group));

    type GyroEntry = { mesh: THREE.Mesh; axis: 'x' | 'z'; speed: number };
    const gyros: GyroEntry[] = [
      { mesh: new THREE.Mesh(new THREE.TorusGeometry(0.65, 0.008, 8, 100), new THREE.MeshBasicMaterial({ color: 0x67e8f9, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false })), axis: 'x', speed: 0.9 },
      { mesh: new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.006, 8, 100), new THREE.MeshBasicMaterial({ color: 0xd4fc34, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false })), axis: 'z', speed: -0.65 },
    ];
    gyros.forEach(g => coreGroup.add(g.mesh));

    const SPARKS = 90;
    const sparkData = Array.from({ length: SPARKS }, () => ({
      r: rand(0.5, 2.1), speed: rand(0.4, 1.6) * (Math.random() < 0.5 ? 1 : -1),
      phase: rand(0, Math.PI * 2), incl: rand(-0.5, 0.5),
    }));
    const sparkPosBuf = new Float32Array(SPARKS * 3);
    const sparkGeo = new THREE.BufferGeometry();
    sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPosBuf, 3));
    coreGroup.add(new THREE.Points(sparkGeo, new THREE.PointsMaterial({ size: 0.06, map: glowTex, color: 0x9bf6ff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false })));

    /* ── Particle cloud ── */
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
    particleGeo.setAttribute('color',    new THREE.BufferAttribute(pColors, 3));

    function paintColors() {
      const c = new THREE.Color();
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const yv = targets[i * 3 + 1], tv = THREE.MathUtils.clamp((yv + 2) / 4, 0, 1);
        if (tv > 0.5) c.copy(colorMid).lerp(colorTop, (tv - 0.5) * 2);
        else c.copy(colorBottom).lerp(colorMid, tv * 2);
        c.offsetHSL(0, 0, (seeds[i] - 0.5) * 0.15);
        pColors[i * 3] = c.r; pColors[i * 3 + 1] = c.g; pColors[i * 3 + 2] = c.b;
      }
      particleGeo.attributes.color.needsUpdate = true;
    }

    const startPts = generators.sphere();
    for (let i = 0; i < PARTICLE_COUNT * 3; i++) { positions[i] = startPts[i]; targets[i] = startPts[i]; }
    paintColors();

    const particleMat = new THREE.PointsMaterial({ size: 0.05, map: glowTex, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending });
    const cloud = new THREE.Points(particleGeo, particleMat);
    scene.add(cloud);

    /* Star dust */
    const dustBuf = new Float32Array(800 * 3);
    for (let i = 0; i < 800; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(rand(7, 25));
      dustBuf[i * 3] = v.x; dustBuf[i * 3 + 1] = v.y; dustBuf[i * 3 + 2] = v.z;
    }
    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute('position', new THREE.BufferAttribute(dustBuf, 3));
    const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ size: 0.03, color: 0x4f46e5, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
    scene.add(dust);

    /* Morph */
    let pulseT = 0;
    morphFnRef.current = (key: ShapeKey) => {
      const pts = generators[key]();
      for (let i = 0; i < PARTICLE_COUNT * 3; i++) targets[i] = pts[i];
      paintColors(); pulseT = 1; setActive(key);
    };

    /* Listen for external morph events (from BottomBar dropdown) */
    const onExternalMorph = (e: Event) => {
      const key = (e as CustomEvent<{ key: ShapeKey }>).detail?.key;
      if (key && key in generators) morphFnRef.current(key);
    };
    window.addEventListener('axe-sphere-morph', onExternalMorph);

    /* Resize */
    function resize() {
      const w = container.clientWidth, h = container.clientHeight;
      renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    }
    const ro = new ResizeObserver(resize);
    ro.observe(container);
    resize();

    /* Animation — use performance.now() to avoid THREE.Clock deprecation warning */
    const startTime = performance.now();
    let rafId = 0;

    function animate() {
      rafId = requestAnimationFrame(animate);
      const t = (performance.now() - startTime) / 1000;
      const pos = particleGeo.attributes.position.array as Float32Array;
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const k = 0.035 + seeds[i] * 0.03, j = i * 3;
        pos[j]   += (targets[j]   - pos[j])   * k;
        pos[j+1] += (targets[j+1] - pos[j+1]) * k;
        pos[j+2] += (targets[j+2] - pos[j+2]) * k;
      }
      particleGeo.attributes.position.needsUpdate = true;
      cloud.rotation.y = t * 0.1;
      rings.forEach(r => { r.group.rotation.y = t * r.speed; });
      gyros.forEach(g => { g.mesh.rotation[g.axis] = t * g.speed; });
      coreGroup.rotation.x = Math.sin(t * 0.25) * 0.05;
      containment.rotation.y = -t * 0.3; containment.rotation.x = Math.sin(t * 0.4) * 0.2;
      dust.rotation.y = t * 0.01;
      grid.position.z = (t * 0.4) % (gExt / gLines * 2);
      const sp = sparkGeo.attributes.position.array as Float32Array;
      for (let i = 0; i < SPARKS; i++) {
        const d = sparkData[i], a = d.phase + t * d.speed;
        sp[i*3] = Math.cos(a) * d.r; sp[i*3+1] = Math.sin(a * 1.3) * d.r * d.incl; sp[i*3+2] = Math.sin(a) * d.r;
      }
      sparkGeo.attributes.position.needsUpdate = true;
      if (pulseT > 0) pulseT = Math.max(0, pulseT - 0.015);
      const breathe = 1 + Math.sin(t * 1.6) * 0.06 + pulseT * 0.8;
      const flicker = 1 + Math.sin(t * 23) * 0.015 + Math.sin(t * 7.3) * 0.02;
      nucleus.scale.setScalar(breathe * flicker);
      energyShell.scale.setScalar(breathe * 1.02);
      (energyShell.material as THREE.MeshBasicMaterial).opacity = 0.35 + pulseT * 0.35 + Math.sin(t * 1.6) * 0.08;
      halo1.scale.setScalar(2.4 * breathe * flicker);
      (halo1.material as THREE.SpriteMaterial).opacity = 0.45 + pulseT * 0.4 + Math.sin(t * 1.6) * 0.08;
      halo2.scale.setScalar(4.6 * (1 + pulseT * 0.5));
      (halo2.material as THREE.SpriteMaterial).opacity = 0.22 + pulseT * 0.25;
      particleMat.size = 0.05 * (1 + pulseT * 0.6);
      controls.update();
      renderer.render(scene, camera);
    }
    animate();

    return () => { cancelAnimationFrame(rafId); ro.disconnect(); controls.dispose(); renderer.dispose(); glowTex.dispose(); window.removeEventListener('axe-sphere-morph', onExternalMorph); };
  }, []);

  return (
    <div ref={containerRef} className="absolute inset-0">
      <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />
    </div>
  );
}
