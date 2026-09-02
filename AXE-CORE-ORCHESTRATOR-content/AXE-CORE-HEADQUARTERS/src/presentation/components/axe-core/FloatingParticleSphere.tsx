import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { CoreStatus } from '@/presentation/components/axe-core/HolographicSphere';

const FLOATING_PARTICLE_COUNT = 2800;

const STATUS_TINT: Record<CoreStatus, number> = {
  idle: 0x22d3ee,
  listening: 0x9bf6ff,
  thinking: 0xa78bfa,
  speaking: 0x67e8f9,
  'awaiting-approval': 0xfb923c,
};

function makeGlowTexture(): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const ctx = cv.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.4)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(cv);
}

function spherePoints(count: number): Float32Array {
  const pts = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const v = new THREE.Vector3().randomDirection().multiplyScalar(1.75);
    pts[i * 3] = v.x;
    pts[i * 3 + 1] = v.y;
    pts[i * 3 + 2] = v.z;
  }
  return pts;
}

/** Browser overlay — particles only, transparent canvas, no post-processing. */
export function FloatingParticleSphere({ status = 'idle' }: { status?: CoreStatus }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const statusRef = useRef(status);
  useEffect(() => { statusRef.current = status; }, [status]);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    let disposed = false;
    let started = false;
    let teardown: (() => void) | null = null;
    let deferId = 0;

    const boot = () => {
      if (disposed || started) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w < 8 || h < 8) return;
      started = true;

      let renderer: THREE.WebGLRenderer;
      try {
        renderer = new THREE.WebGLRenderer({
          canvas,
          antialias: true,
          alpha: true,
          premultipliedAlpha: false,
          powerPreference: 'low-power',
        });
      } catch {
        console.warn('[FloatingParticleSphere] WebGL unavailable');
        started = false;
        return;
      }

      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
      renderer.setClearColor(0x000000, 0);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(52, w / h, 0.1, 50);
      camera.position.set(0, 0, 4.2);

      const glowTex = makeGlowTexture();
      const targets = spherePoints(FLOATING_PARTICLE_COUNT);
      const positions = targets.slice();
      const pColors = new Float32Array(FLOATING_PARTICLE_COUNT * 3);
      const seeds = new Float32Array(FLOATING_PARTICLE_COUNT);
      for (let i = 0; i < FLOATING_PARTICLE_COUNT; i++) seeds[i] = Math.random();

      const colorTop = new THREE.Color('#d4fc34');
      const colorMid = new THREE.Color('#06b6d4');
      const colorBottom = new THREE.Color('#4f46e5');

      const particleGeo = new THREE.BufferGeometry();
      particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      particleGeo.setAttribute('color', new THREE.BufferAttribute(pColors, 3));

      let lastStatus: CoreStatus = statusRef.current;

      function paintColors() {
        const tint = new THREE.Color(STATUS_TINT[statusRef.current]);
        const c = new THREE.Color();
        for (let i = 0; i < FLOATING_PARTICLE_COUNT; i++) {
          const yv = targets[i * 3 + 1];
          const tv = THREE.MathUtils.clamp((yv + 2) / 4, 0, 1);
          if (tv > 0.5) c.copy(colorMid).lerp(colorTop, (tv - 0.5) * 2);
          else c.copy(colorBottom).lerp(colorMid, tv * 2);
          c.lerp(tint, 0.12);
          c.offsetHSL(0, 0, (seeds[i] - 0.5) * 0.12);
          pColors[i * 3] = c.r;
          pColors[i * 3 + 1] = c.g;
          pColors[i * 3 + 2] = c.b;
        }
        particleGeo.attributes.color.needsUpdate = true;
      }
      paintColors();

      const particleMat = new THREE.PointsMaterial({
        size: 0.06,
        map: glowTex,
        vertexColors: true,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const cloud = new THREE.Points(particleGeo, particleMat);
      scene.add(cloud);

      function resize() {
        if (disposed || !container) return;
        const rw = container.clientWidth;
        const rh = container.clientHeight;
        if (rw < 8 || rh < 8) return;
        renderer.setSize(rw, rh, false);
        camera.aspect = rw / rh;
        camera.updateProjectionMatrix();
      }

      const ro = new ResizeObserver(resize);
      ro.observe(container);
      resize();

      const startTime = performance.now();
      let rafId = 0;
      let pageVisible = !document.hidden;

      const onVis = () => { pageVisible = !document.hidden; };
      document.addEventListener('visibilitychange', onVis);

      function animate() {
        if (disposed) return;
        rafId = requestAnimationFrame(animate);
        if (!pageVisible) return;

        const t = (performance.now() - startTime) / 1000;
        if (statusRef.current !== lastStatus) {
          lastStatus = statusRef.current;
          paintColors();
        }

        const pos = particleGeo.attributes.position.array as Float32Array;
        for (let i = 0; i < FLOATING_PARTICLE_COUNT; i++) {
          const k = 0.04 + seeds[i] * 0.02;
          const j = i * 3;
          pos[j] += (targets[j] - pos[j]) * k;
          pos[j + 1] += (targets[j + 1] - pos[j + 1]) * k;
          pos[j + 2] += (targets[j + 2] - pos[j + 2]) * k;
        }
        particleGeo.attributes.position.needsUpdate = true;

        cloud.rotation.y = t * 0.2;
        cloud.rotation.x = Math.sin(t * 0.3) * 0.06;

        renderer.render(scene, camera);
      }
      animate();

      teardown = () => {
        document.removeEventListener('visibilitychange', onVis);
        cancelAnimationFrame(rafId);
        ro.disconnect();
        particleGeo.dispose();
        particleMat.dispose();
        glowTex.dispose();
        renderer.dispose();
        const gl = renderer.getContext();
        const ext = gl.getExtension('WEBGL_lose_context');
        ext?.loseContext();
      };
    };

    deferId = window.setTimeout(boot, 150);
    const roWait = new ResizeObserver(() => boot());
    roWait.observe(container);

    return () => {
      disposed = true;
      window.clearTimeout(deferId);
      roWait.disconnect();
      teardown?.();
    };
  }, []);

  return (
    <div ref={containerRef} className="absolute inset-0 bg-transparent pointer-events-none overflow-visible">
      <canvas
        ref={canvasRef}
        className="bg-transparent"
        style={{ display: 'block', width: '100%', height: '100%', background: 'transparent' }}
      />
    </div>
  );
}
