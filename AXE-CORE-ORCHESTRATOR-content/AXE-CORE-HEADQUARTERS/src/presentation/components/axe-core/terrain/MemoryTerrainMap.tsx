/**
 * MemoryTerrainMap - drop-in volumetric memory terrain (controlled component).
 *
 * Feeds on the app's REAL memory data (BrainHub[] from useNeuralBrainData) and
 * plugs into the existing NeuralMemorySystem focus flow:
 *   - click gold summit  -> onFocusHub(hub.id)  (camera flies in, leaf ring appears)
 *   - click leaf node    -> onSelectLeaf(leaf)  (opens the existing memory card)
 *   - click empty / ESC  -> onBackground()      (camera returns to overview)
 *
 * Visuals: realistic lit rock mountains with shadows; ONLY hub summits carry
 * gold glowing mesh caps + snow particles. Cinematic rise-in on mount,
 * adaptive quality on mobile and auto-recovery from WebGL context loss.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Stars } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import * as THREE from 'three';
import {
  buildTerrainEngine,
  TERRAIN_GOLD,
  type TerrainConfig,
  type TerrainHubConfig,
  type EngineHub,
} from './terrainEngine';
import TerrainSceneMesh from './TerrainSceneMesh';
import TerrainMarkers, { TerrainCameraRig, computeLeafRing, type LeafNodeData } from './TerrainMarkers';
import type { BrainHub, BrainLeaf } from '../NeuralMemorySystem';

/** Convert the app's live BrainHub data into a terrain config (gold caps). */
function configFromBrainHubs(hubs: BrainHub[]): TerrainConfig {
  const core = hubs.find((h) => h.layer === 'core') ?? null;
  const rest = hubs.filter((h) => h.layer !== 'core');
  const n = Math.max(rest.length, 1);

  /**
   * Height on a log scale, not a linear share of the largest.
   *
   * This was `t = memoryCount / maxCount`. With Trading at ~15,000 and the
   * next hub at 8,000 and most of them under 700, t rounded to nearly zero
   * for almost every region -- so nine mountains of genuinely different size
   * were drawn at very nearly the same height, and the one number the terrain
   * is supposed to show was the one it flattened away.
   *
   * Log against the largest keeps the whole range readable: 21 -> 0.30,
   * 289 -> 0.58, 609 -> 0.66, 8,061 -> 0.93, 15,037 -> 1.00.
   */
  const maxCount = Math.max(1, ...rest.map((h) => h.memoryCount));
  const logMax = Math.log10(maxCount + 1);
  const heightShare = (count: number) =>
    logMax <= 0 ? 0 : Math.min(1, Math.log10(Math.max(count, 0) + 1) / logMax);

  const cfgHubs: TerrainHubConfig[] = [];
  if (core) {
    cfgHubs.push({
      id: core.id,
      name: core.label,
      memories: core.memoryCount,
      color: TERRAIN_GOLD,
      position: [0, -2],
      height: 5.8,
      radius: 8,
      hideLabel: true, // the center-title overlay already announces AXE Core
      source: core,
    });
  }
  rest.forEach((h, i) => {
    const angle = (i / n) * Math.PI * 2 - Math.PI / 2 + ((i * 17) % 5) * 0.05;
    const ring = i % 2 === 0 ? 15 : 21;
    const jitter = (((i * 53) % 7) / 7 - 0.5) * 2.4;
    const r = ring + jitter;
    const t = heightShare(h.memoryCount);
    cfgHubs.push({
      id: h.id,
      name: h.label,
      memories: h.memoryCount,
      color: TERRAIN_GOLD,
      position: [Math.cos(angle) * r, Math.sin(angle) * r * 0.82],
      height: 2.1 + 1.4 * t,
      radius: 3.8 + 1.8 * t,
      source: h,
    });
  });
  // decorative rock mountains (no caps) for a fuller range
  cfgHubs.push(
    { id: 'deco-1', name: null, memories: 0, position: [26, 12], height: 1.8, radius: 3.5 },
    { id: 'deco-2', name: null, memories: 0, position: [-25, 14], height: 1.7, radius: 3.5 },
    { id: 'deco-3', name: null, memories: 0, position: [6, 24], height: 1.6, radius: 3.2 },
    { id: 'deco-4', name: null, memories: 0, position: [-24, -16], height: 1.5, radius: 3.2 },
    { id: 'deco-5', name: null, memories: 0, position: [27, -14], height: 1.6, radius: 3.4 },
  );
  return { seed: 7, size: 64, baseHeight: 1.1, hubs: cfgHubs };
}

/** Cinematic entrance: terrain + markers rise smoothly from flat. */
function RiseIn({ children, duration = 2.4 }: { children: ReactNode; duration?: number }) {
  const ref = useRef<THREE.Group>(null);
  const t = useRef(0);
  useFrame((_, dt) => {
    if (t.current < duration && ref.current) {
      t.current += dt;
      const p = Math.min(1, t.current / duration);
      const e = 1 - Math.pow(1 - p, 3);
      ref.current.scale.set(1, Math.max(0.002, e), 1);
    }
  });
  return (
    <group ref={ref} scale={[1, 0.002, 1]}>
      {children}
    </group>
  );
}

export interface MemoryTerrainMapProps {
  hubs: BrainHub[];
  focusHubId: string | null;
  onFocusHub: (id: string | null) => void;
  onSelectLeaf: (leaf: BrainLeaf) => void;
  onBackground: () => void;
  autoRotate?: boolean;
  depthLevel?: number;
}

export default function MemoryTerrainMap({
  hubs,
  focusHubId,
  onFocusHub,
  onSelectLeaf,
  onBackground,
  autoRotate = false,
  depthLevel = 5,
}: MemoryTerrainMapProps) {
  const [canvasKey, setCanvasKey] = useState(0);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const controlsRef = useRef<any>(null);

  const isMobile = useMemo(() => {
    if (typeof navigator === 'undefined') return false;
    const ua = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    const coarse =
      typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    return ua || coarse;
  }, []);

  const config = useMemo(() => configFromBrainHubs(hubs), [hubs]);
  const engine = useMemo(() => buildTerrainEngine(config), [config]);

  const selected: EngineHub | null = useMemo(
    () => engine.hubs.find((h) => h.id === focusHubId) ?? null,
    [engine, focusHubId],
  );

  const leaves = useMemo(() => {
    if (!selected) return [];
    const src = selected.source as BrainHub | undefined;
    const leafData: LeafNodeData[] = (src?.leaves ?? []).map((l) => ({
      id: l.id,
      label: l.label,
      detail: l.detail,
      source: l,
    }));
    return computeLeafRing(selected, leafData, engine);
  }, [selected, engine]);

  const handleSelectHub = useCallback(
    (hub: EngineHub) => {
      onFocusHub(hub.id);
    },
    [onFocusHub],
  );

  const handleSelectLeaf = useCallback(
    (leaf: { source?: unknown }) => {
      if (leaf.source) onSelectLeaf(leaf.source as BrainLeaf);
    },
    [onSelectLeaf],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onBackground();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onBackground]);

  return (
    <div style={{ width: '100%', height: '100%', background: '#020409' }}>
      <Canvas
        key={canvasKey}
        shadows={!isMobile}
        dpr={isMobile ? [1, 1.25] : [1, 1.6]}
        camera={{ position: [0, 18, 31], fov: 48, near: 0.1, far: 500 }}
        gl={{
          antialias: !isMobile,
          powerPreference: 'default',
          alpha: false,
          stencil: false,
          depth: true,
          failIfMajorPerformanceCaveat: false,
        }}
        onCreated={({ gl }) => {
          gl.domElement.addEventListener(
            'webglcontextlost',
            (e) => {
              e.preventDefault();
              setTimeout(() => setCanvasKey((k) => k + 1), 300);
            },
            false,
          );
        }}
        onPointerMissed={() => onBackground()}
      >
        <color attach="background" args={['#020409']} />
        <fog attach="fog" args={['#020409', 55, 130]} />
        <RiseIn>
          <TerrainSceneMesh engine={engine} resolution={isMobile ? 128 : 200} shadowsEnabled={!isMobile} />
          <TerrainMarkers
            engine={engine}
            selected={selected}
            leaves={leaves}
            hoveredId={hoveredId}
            onHover={setHoveredId}
            onSelectHub={handleSelectHub}
            onSelectLeaf={handleSelectLeaf}
            showLeafLabels={depthLevel >= 4}
          />
        </RiseIn>
        <Stars radius={150} depth={70} count={isMobile ? 1200 : 3000} factor={3.2} saturation={0} fade speed={0.5} />
        <TerrainCameraRig engine={engine} selected={selected} controlsRef={controlsRef} />
        <OrbitControls
          ref={controlsRef}
          enablePan={false}
          enableDamping
          dampingFactor={0.08}
          minDistance={5}
          maxDistance={58}
          maxPolarAngle={1.42}
          autoRotate={autoRotate}
          autoRotateSpeed={0.35}
          target={[0, 0.5, 0]}
        />
        <EffectComposer multisampling={0}>
          <Bloom
            intensity={isMobile ? 0.95 : 1.1}
            luminanceThreshold={0.35}
            luminanceSmoothing={0.25}
            mipmapBlur
            radius={0.8}
          />
        </EffectComposer>
      </Canvas>
    </div>
  );
}
