import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

/*
 * AXE CORE — Cinematic Holographic 3D Core (Krater.ai v5.0)
 *   white-hot nucleus · layered energy shells · wireframe containment sphere
 *   lens-flare halos · 4 segmented rings · 2 gyroscope rings
 *   90 orbiting sparks · morphing 12k particle cloud · auto-orbit camera
 *
 * Props: snapshot (legacy live-data prop, kept for API compat)
 */

const PARTICLE_COUNT = 12000;
const rand = (a, b) => a + Math.random() * (b - a);

function makeGlowTexture() {
  const cv = document.createElement("canvas");
  cv.width = cv.height = 128;
  const ctx = cv.getContext("2d");
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.25, "rgba(255,255,255,0.55)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(cv);
}

const generators = {
  core() {
    const p = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const v = new THREE.Vector3().randomDirection()
        .multiplyScalar(1.5 * (0.55 + 0.45 * Math.pow(Math.random(), 0.4)));
      p.push(v.x, v.y, v.z);
    }
    return p;
  },
  galaxy() {
    const p = [], arms = 3;
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const arm = i % arms, t = Math.pow(Math.random(), 0.6), r = t * 2.8;
      const a = arm * (Math.PI * 2 / arms) + t * 4.5 + rand(-0.25, 0.25);
      p.push(Math.cos(a) * r + rand(-0.05, 0.05), rand(-0.12, 0.12) * (1 - t) * 2, Math.sin(a) * r + rand(-0.05, 0.05));
    }
    return p;
  },
  dna() {
    const p = [], turns = 3.2, h = 4;
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const t = i / PARTICLE_COUNT, ang = t * Math.PI * 2 * turns, y = -h / 2 + t * h;
      const s = i % 3;
      if (s === 2) { const k = rand(-1, 1); p.push(Math.cos(ang) * 1.1 * k, y, Math.sin(ang) * 1.1 * k); }
      else { const off = s === 0 ? 0 : Math.PI; p.push(Math.cos(ang + off) * 1.1, y, Math.sin(ang + off) * 1.1); }
    }
    return p;
  },
  sphere() {
    const p = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(1.8);
      p.push(v.x, v.y, v.z);
    }
    return p;
  },
  saturn() {
    const p = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      if (i % 3 === 0) {
        const a = rand(0, Math.PI * 2), r = rand(1.6, 2.6);
        p.push(Math.cos(a) * r, rand(-0.04, 0.04), Math.sin(a) * r * 0.9);
      } else {
        const v = new THREE.Vector3().randomDirection().multiplyScalar(1.1);
        p.push(v.x, v.y, v.z);
      }
    }
    return p;
  },
  heart() {
    const p = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const t = rand(0, Math.PI * 2);
      const x = 16 * Math.pow(Math.sin(t), 3);
      const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
      p.push(x * 0.11 + rand(-0.06, 0.06), y * 0.11 + rand(-0.06, 0.06), rand(-0.35, 0.35));
    }
    return p;
  },
};

const PRESETS = [
  { key: "core",   label: "AXE Core" },
  { key: "galaxy", label: "Galaxy"   },
  { key: "dna",    label: "DNA"      },
  { key: "saturn", label: "Saturn"   },
  { key: "heart",  label: "Heart"    },
  { key: "sphere", label: "Sphere"   },
];

export default function WorldGlobe3D({ snapshot: _snapshot }) {
  const containerRef = useRef(null);
  const canvasRef    = useRef(null);
  const [active, setActive] = useState("core");
  const morphFnRef = useRef(() => {});

  useEffect(() => {
    const container = containerRef.current;
    const canvas    = canvasRef.current;
    if (!container || !canvas) return;

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
    const gridVerts = [];
    const gLines = 120, gExt = 100;
    for (let i = -gLines; i <= gLines; i++) {
      const c = (i / gLines) * gExt;
      gridVerts.push(c, -2.5, -gExt, c, -2.5, gExt, -gExt, -2.5, c, gExt, -2.5, c);
    }
    const gridGeo = new THREE.BufferGeometry();
    gridGeo.setAttribute("position", new THREE.Float32BufferAttribute(gridVerts, 3));
    const grid = new THREE.LineSegments(gridGeo, new THREE.LineBasicMaterial({
      color: 0x06b6d4, transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending,
    }));
    scene.add(grid);

    /* AXE Cinematic Core */
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

    const halo1 = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, color: 0x67e8f9, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    halo1.scale.setScalar(2.4);
    coreGroup.add(halo1);

    const halo2 = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, color: 0x4f46e5, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    halo2.scale.setScalar(4.6);
    coreGroup.add(halo2);

    function createSegmentedRing(radius, gapEvery, thickness, color, speed, tiltX = 0, tiltY = 0) {
      const group = new THREE.Group();
      const mesh = new THREE.Mesh(
        new THREE.RingGeometry(radius, radius + thickness, 128),
        new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      mesh.rotation.x = Math.PI / 2 + tiltX;
      mesh.rotation.y = tiltY;
      group.add(mesh);
      const pts = [];
      for (let i = 0; i <= 128; i++) {
        if (i % gapEvery === 0) continue;
        const a = (i / 128) * Math.PI * 2;
        pts.push(new THREE.Vector3(Math.cos(a) * (radius + thickness), 0, Math.sin(a) * (radius + thickness)));
      }
      const dots = new THREE.Points(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.PointsMaterial({ color, size: 0.025, map: glowTex, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      dots.rotation.x = tiltX;
      dots.rotation.y = tiltY;
      group.add(dots);
      return { group, speed };
    }

    const rings = [
      createSegmentedRing(0.8,  9,  0.045, 0x06b6d4,  0.4),
      createSegmentedRing(1.1,  13, 0.02,  0x4f46e5, -0.22, 0.12, 0.1),
      createSegmentedRing(1.45, 7,  0.065, 0xd4fc34,  0.12, -0.15, 0.05),
      createSegmentedRing(1.85, 17, 0.015, 0x06b6d4, -0.06),
    ];
    rings.forEach(r => coreGroup.add(r.group));

    function createGyroRing(radius, tube, color, axis, speed) {
      const mesh = new THREE.Mesh(
        new THREE.TorusGeometry(radius, tube, 8, 100),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      return { mesh, axis, speed };
    }
    const gyros = [
      createGyroRing(0.65, 0.008, 0x67e8f9, "x",  0.9),
      createGyroRing(0.72, 0.006, 0xd4fc34, "z", -0.65),
    ];
    gyros.forEach(g => coreGroup.add(g.mesh));

    const SPARKS = 90;
    const sparkData = Array.from({ length: SPARKS }, () => ({
      r: rand(0.5, 2.1), speed: rand(0.4, 1.6) * (Math.random() < 0.5 ? 1 : -1),
      phase: rand(0, Math.PI * 2), incl: rand(-0.5, 0.5),
    }));
    const sparkPosBuf = new Float32Array(SPARKS * 3);
    const sparkGeo = new THREE.BufferGeometry();
    sparkGeo.setAttribute("position", new THREE.BufferAttribute(sparkPosBuf, 3));
    const sparks = new THREE.Points(sparkGeo, new THREE.PointsMaterial({
      size: 0.06, map: glowTex, color: 0x9bf6ff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    coreGroup.add(sparks);

    /* Morphing particle cloud */
    const colorTop    = new THREE.Color("#d4fc34");
    const colorMid    = new THREE.Color("#06b6d4");
    const colorBottom = new THREE.Color("#4f46e5");

    const positions = new Float32Array(PARTICLE_COUNT * 3);
    const targets   = new Float32Array(PARTICLE_COUNT * 3);
    const pColors   = new Float32Array(PARTICLE_COUNT * 3);
    const seeds     = new Float32Array(PARTICLE_COUNT);
    for (let i = 0; i < PARTICLE_COUNT; i++) seeds[i] = Math.random();

    const particleGeo = new THREE.BufferGeometry();
    particleGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    particleGeo.setAttribute("color",    new THREE.BufferAttribute(pColors, 3));

    function paintColors() {
      const c = new THREE.Color();
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const yVal = targets[i * 3 + 1];
        const tVal = THREE.MathUtils.clamp((yVal + 2) / 4, 0, 1);
        if (tVal > 0.5) c.copy(colorMid).lerp(colorTop, (tVal - 0.5) * 2);
        else c.copy(colorBottom).lerp(colorMid, tVal * 2);
        c.offsetHSL(0, 0, (seeds[i] - 0.5) * 0.15);
        pColors[i * 3] = c.r; pColors[i * 3 + 1] = c.g; pColors[i * 3 + 2] = c.b;
      }
      particleGeo.attributes.color.needsUpdate = true;
    }

    const startPts = generators.core();
    for (let i = 0; i < PARTICLE_COUNT * 3; i++) { positions[i] = startPts[i]; targets[i] = startPts[i]; }
    paintColors();

    const particleMat = new THREE.PointsMaterial({
      size: 0.05, map: glowTex, vertexColors: true, transparent: true,
      opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const cloud = new THREE.Points(particleGeo, particleMat);
    scene.add(cloud);

    /* Ambient star dust */
    const dustPosBuf = new Float32Array(800 * 3);
    for (let i = 0; i < 800; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(rand(7, 25));
      dustPosBuf[i * 3] = v.x; dustPosBuf[i * 3 + 1] = v.y; dustPosBuf[i * 3 + 2] = v.z;
    }
    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute("position", new THREE.BufferAttribute(dustPosBuf, 3));
    const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({
      size: 0.03, color: 0x4f46e5, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    scene.add(dust);

    /* Morph */
    let pulseT = 0;
    morphFnRef.current = (key) => {
      const pts = generators[key]?.();
      if (!pts) return;
      for (let i = 0; i < PARTICLE_COUNT * 3; i++) targets[i] = pts[i];
      paintColors();
      pulseT = 1;
      setActive(key);
    };

    /* Resize */
    function resize() {
      const w = container.clientWidth, h = container.clientHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    const ro = new ResizeObserver(resize);
    ro.observe(container);
    resize();

    /* Animation */
    const clock = new THREE.Clock();
    let rafId = 0;

    function animate() {
      rafId = requestAnimationFrame(animate);
      const t = clock.getElapsedTime();

      const pos = particleGeo.attributes.position.array;
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const k = 0.035 + seeds[i] * 0.03, j = i * 3;
        pos[j]     += (targets[j]     - pos[j])     * k;
        pos[j + 1] += (targets[j + 1] - pos[j + 1]) * k;
        pos[j + 2] += (targets[j + 2] - pos[j + 2]) * k;
      }
      particleGeo.attributes.position.needsUpdate = true;

      cloud.rotation.y = t * 0.1;
      rings.forEach(r => { r.group.rotation.y = t * r.speed; });
      gyros.forEach(g => { g.mesh.rotation[g.axis] = t * g.speed; });
      coreGroup.rotation.x = Math.sin(t * 0.25) * 0.05;
      containment.rotation.y = -t * 0.3;
      containment.rotation.x = Math.sin(t * 0.4) * 0.2;
      dust.rotation.y = t * 0.01;
      grid.position.z = (t * 0.4) % (gExt / gLines * 2);

      const sp = sparkGeo.attributes.position.array;
      for (let i = 0; i < SPARKS; i++) {
        const d = sparkData[i];
        const a = d.phase + t * d.speed;
        sp[i * 3]     = Math.cos(a) * d.r;
        sp[i * 3 + 1] = Math.sin(a * 1.3) * d.r * d.incl;
        sp[i * 3 + 2] = Math.sin(a) * d.r;
      }
      sparkGeo.attributes.position.needsUpdate = true;

      if (pulseT > 0) pulseT = Math.max(0, pulseT - 0.015);
      const breathe = 1 + Math.sin(t * 1.6) * 0.06 + pulseT * 0.8;
      const flicker = 1 + Math.sin(t * 23) * 0.015 + Math.sin(t * 7.3) * 0.02;
      nucleus.scale.setScalar(breathe * flicker);
      energyShell.scale.setScalar(breathe * 1.02);
      energyShell.material.opacity = 0.35 + pulseT * 0.35 + Math.sin(t * 1.6) * 0.08;
      halo1.scale.setScalar(2.4 * breathe * flicker);
      halo1.material.opacity = 0.45 + pulseT * 0.4 + Math.sin(t * 1.6) * 0.08;
      halo2.scale.setScalar(4.6 * (1 + pulseT * 0.5));
      halo2.material.opacity = 0.22 + pulseT * 0.25;
      particleMat.size = 0.05 * (1 + pulseT * 0.6);

      controls.update();
      renderer.render(scene, camera);
    }
    animate();

    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
      glowTex.dispose();
    };
  }, []);

  return (
    <div ref={containerRef} className="absolute inset-0" data-testid="map-3d-container">
      <canvas ref={canvasRef} style={{ display: "block", width: "100%", height: "100%" }} />

      {/* Morph preset strip */}
      <div
        style={{
          position: "absolute", bottom: 0, left: 0, right: 0,
          display: "flex", justifyContent: "center", gap: "0.4rem",
          padding: "0.75rem",
          background: "linear-gradient(to top, rgba(0,0,0,0.72) 0%, transparent 100%)",
          zIndex: 10,
        }}
      >
        {PRESETS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => morphFnRef.current(key)}
            style={{
              fontFamily: "inherit",
              fontSize: "0.62rem",
              fontWeight: 600,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: active === key ? "#ffffff" : "rgba(165,243,252,0.55)",
              background: active === key ? "rgba(6,182,212,0.18)" : "rgba(0,0,0,0.5)",
              border: `1px solid ${active === key ? "#06b6d4" : "rgba(6,182,212,0.2)"}`,
              padding: "0.28rem 0.6rem",
              borderRadius: "6px",
              cursor: "pointer",
              backdropFilter: "blur(8px)",
              transition: "all 0.18s ease",
              boxShadow: active === key ? "0 0 10px rgba(6,182,212,0.35)" : "none",
            }}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
