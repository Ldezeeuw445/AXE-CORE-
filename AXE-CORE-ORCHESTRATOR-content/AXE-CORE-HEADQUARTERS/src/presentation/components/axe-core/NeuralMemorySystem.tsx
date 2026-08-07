/**
 * NeuralMemorySystem — Terrain volumetric memory map (Home → Terrain).
 * Matches AXON Memory reference: denser mesh, AXE Core as tallest center peak,
 * real hub icons + counts, zoom into peak with sub-hub mountains around it.
 */
import { useCallback, useEffect, useMemo, useRef, useState, Suspense, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { AnimatePresence, motion } from 'framer-motion';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { OrbitControls, Html, QuadraticBezierLine } from '@react-three/drei';
import * as THREE from 'three';
import {
  Search, Send, Move, MousePointerClick, Mouse, ZoomIn, Crosshair, CornerUpLeft,
  RotateCw, Sparkles, Database, Link2, Clock, ShieldCheck, Lock, X,
  MessageSquare, Settings2, Zap, Lightbulb, BookOpen, FileText, Users, Brain,
  Activity, Layers,
} from 'lucide-react';
import { listRecentObsidianNotes, type ObsidianNote } from '@/infrastructure/persistence/obsidianMemoryService';
import { loadRagMemories, type RagMemory } from '@/infrastructure/persistence/ragMemoryService';
import { loadGlobalMemories } from '@/infrastructure/persistence/globalMemoryService';
import { loadMemoryGrowthStats } from '@/infrastructure/persistence/memoryStatsService';
import { AXE_USER_ID } from '@/infrastructure/persistence/chatPersistence';
import { axeBus, subscribeAxeEvent } from '@/infrastructure/events/eventBus';
import { useVoiceStore } from '@/presentation/store/voiceStore';
import './NeuralMemorySystem.css';

const CREAM = '#F5F0E6';
const BG = '#000000';

/* Colors tuned to AXON reference: cool cyan/navy only (no gold side-light) */
const GLOBAL_CATS = {
  user_preference: { color: '#4DB8D4', label: 'Preferences', Icon: Settings2 },
  conversation_context: { color: '#3AA0D8', label: 'Conversations', Icon: MessageSquare },
  system_event: { color: '#C9A23A', label: 'Events', Icon: Zap },
  agent_performance: { color: '#5BA8D4', label: 'Insights', Icon: Lightbulb },
  provider_performance: { color: '#C9A23A', label: 'Resources', Icon: Database },
  specialist_match: { color: '#D4B04A', label: 'Specialists', Icon: Users },
} as const;

type GlobalCat = keyof typeof GLOBAL_CATS;

const RAG_COLOR = '#2B8FCB';
const OBSIDIAN_COLOR = '#1FA8C4';
const CORE_COLOR = '#2a7aad';

export interface BrainLeaf {
  id: string;
  label: string;
  detail: string;
  href?: string;
}

export interface BrainHub {
  id: string;
  label: string;
  color: string;
  layer: 'global' | 'rag' | 'obsidian' | 'core';
  href?: string;
  leaves: BrainLeaf[];
  pos: [number, number, number];
  /** Real memory count driving peak height */
  memoryCount: number;
  iconKey: string;
}

interface MemEntry {
  id?: string;
  category: string;
  key: string;
  value: string;
}

interface StreamItem {
  id: string;
  ts: number;
  color: string;
  title: string;
  subtitle: string;
}

function folderOf(path: string): string {
  const parts = path.replace(/^AXE\//, '').split('/');
  return parts.length > 1 ? parts[0] : 'AXE';
}

function timeAgo(ts: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/* ── terrain geometry ───────────────────────────────────────────────────── */

const TERRAIN_HALF = 3.25;
const TERRAIN_SEGMENTS = 220; // denser mesh → premium wire density like AXON ref
const CORE_PEAK_HEIGHT = 1.72;
const CORE_PEAK_SPREAD = 0.58;
const HUB_RING_RADIUS = 1.95;

interface Peak { x: number; z: number; h: number; spread: number; color: THREE.Color; }

function hubPeakAmplitude(count: number, isCore = false): number {
  if (isCore) return CORE_PEAK_HEIGHT;
  // volumetric: more memory → taller mountain (sqrt curve keeps scale readable)
  return 0.42 + Math.min(Math.sqrt(Math.max(count, 1)) * 0.095, 1.05);
}

function hubPeaksFrom(hubs: BrainHub[]): Peak[] {
  return hubs.map((h) => ({
    x: h.pos[0],
    z: h.pos[2],
    h: hubPeakAmplitude(h.memoryCount, h.layer === 'core'),
    spread: h.layer === 'core' ? CORE_PEAK_SPREAD : 0.38 + Math.min(h.memoryCount, 50) * 0.005,
    color: new THREE.Color(h.color),
  }));
}

/** Multi-octave ridge noise — matches AXON reference density & realism */
function multiNoise(x: number, z: number): number {
  return (
    0.055 * Math.sin(x * 3.4 + z * 2.7) +
    0.040 * Math.cos(x * 6.8 - z * 4.9) +
    0.028 * Math.sin(x * 11.2 + z * 8.6) +
    0.018 * Math.cos(x * 17.5 - z * 13.8) +
    0.012 * Math.sin(x * 26.0 + z * 21.0) +
    0.007 * Math.cos(x * 38.0 - z * 31.0) +
    0.004 * Math.sin(x * 52.0 + z * 44.0)
  );
}

function terrainHeight(x: number, z: number, peaks: Peak[]): number {
  let y = 0;
  for (const p of peaks) {
    const dx = x - p.x;
    const dz = z - p.z;
    const dist2 = dx * dx + dz * dz;
    // primary gaussian peak
    y += p.h * Math.exp(-dist2 / (2 * p.spread * p.spread));
    // secondary ridge lobe (wider foothills)
    y += p.h * 0.22 * Math.exp(-dist2 / (2 * (p.spread * 1.95) * (p.spread * 1.95)));
    // tertiary sharp crest for premium mountain silhouette
    y += p.h * 0.08 * Math.exp(-dist2 / (2 * (p.spread * 0.55) * (p.spread * 0.55)));
  }
  y += multiNoise(x, z);
  return Math.max(0.008, y);
}

function placeHubsOnTerrain(hubs: Omit<BrainHub, 'pos'>[]): BrainHub[] {
  const nonCore = hubs.filter((h) => h.layer !== 'core');
  const core = hubs.find((h) => h.layer === 'core');
  const n = Math.max(nonCore.length, 1);

  const ground = nonCore.map((h, i) => {
    const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
    const jitter = ((i * 53) % 7) / 7 - 0.5;
    const r = HUB_RING_RADIUS * (0.88 + jitter * 0.16);
    return { hub: h, x: Math.cos(angle) * r, z: Math.sin(angle) * r };
  });

  const peaks: Peak[] = [
    ...(core
      ? [{ x: 0, z: 0, h: hubPeakAmplitude(core.memoryCount, true), spread: CORE_PEAK_SPREAD, color: new THREE.Color(CORE_COLOR) }]
      : [{ x: 0, z: 0, h: CORE_PEAK_HEIGHT, spread: CORE_PEAK_SPREAD, color: new THREE.Color(CORE_COLOR) }]),
    ...ground.map((g) => ({
      x: g.x,
      z: g.z,
      h: hubPeakAmplitude(g.hub.memoryCount),
      spread: 0.42 + Math.min(g.hub.memoryCount, 40) * 0.004,
      color: new THREE.Color(g.hub.color),
    })),
  ];

  const placed: BrainHub[] = [];
  if (core) {
    placed.push({
      ...core,
      pos: [0, terrainHeight(0, 0, peaks), 0],
    });
  }
  for (const g of ground) {
    placed.push({
      ...g.hub,
      pos: [g.x, terrainHeight(g.x, g.z, peaks), g.z],
    });
  }
  return placed;
}

function buildTerrainMesh(hubs: BrainHub[], focusId: string | null, focusLeaves: BrainLeaf[] = []) {
  const peaks = hubPeaksFrom(hubs);
  // When focused: sub-hubs become smaller mountains ON/AROUND the focused peak (not buried)
  if (focusId) {
    const hub = hubs.find((h) => h.id === focusId);
    if (hub) {
      const n = Math.min(focusLeaves.length, 10);
      for (let i = 0; i < n; i++) {
        const angle = (i / Math.max(n, 1)) * Math.PI * 2 - Math.PI / 2;
        const r = 0.32 + (i % 3) * 0.10;
        const x = hub.pos[0] + Math.cos(angle) * r;
        const z = hub.pos[2] + Math.sin(angle) * r;
        peaks.push({
          x,
          z,
          h: 0.34 + (i % 5) * 0.08, // clearly above parent slope
          spread: 0.11,
          color: new THREE.Color(hub.color).lerp(new THREE.Color('#ffffff'), 0.3),
        });
      }
    }
  }

  const seg = TERRAIN_SEGMENTS;
  const size = TERRAIN_HALF * 2;
  const perRow = seg + 1;
  const positions = new Float32Array(perRow * perRow * 3);
  const colors = new Float32Array(perRow * perRow * 3);
  // AXON-reference palette: deep black-navy valleys → soft blue slopes → gently lit crests
  // Dark calm AXON vibe: near-black valleys, deep navy ridges, soft cool peak tips
  // (low contrast — peaks readable but never neon)
  const deep = new THREE.Color('#010308');
  const mid = new THREE.Color('#050d1a');
  const high = new THREE.Color('#0a1f3a');
  const peakCyan = new THREE.Color('#154d78');
  const peakBright = new THREE.Color('#2f7eae');
  // no gold — one-sided yellow was from gold peak mix + gold light
  const tmp = new THREE.Color();

  let vi = 0;
  for (let iz = 0; iz < perRow; iz++) {
    for (let ix = 0; ix < perRow; ix++) {
      const x = (ix / seg - 0.5) * size;
      const z = (iz / seg - 0.5) * size;
      const y = terrainHeight(x, z, peaks);
      positions[vi * 3] = x;
      positions[vi * 3 + 1] = y;
      positions[vi * 3 + 2] = z;

      let nearest = high;
      let best = Infinity;
      for (const p of peaks) {
        const d = (x - p.x) ** 2 + (z - p.z) ** 2;
        if (d < best) {
          best = d;
          nearest = p.color;
        }
      }
      const elev = Math.min(1, y / 1.45);
      const coreDist = Math.hypot(x, z);
      // base elevation gradient — dark calm valleys, soft blue slopes
      tmp.copy(deep).lerp(mid, elev * 0.9).lerp(high, Math.max(0, elev - 0.22) * 1.1);
      // gentle blend toward nearest hub color (keep overall dark)
      if (nearest) tmp.lerp(nearest, 0.10 * elev);
      tmp.lerp(peakCyan, Math.max(0, 1 - coreDist / (CORE_PEAK_SPREAD * 1.45)) * 0.32);
      // peak tips only lightly brightened (visible but low contrast, like reference)
      tmp.lerp(peakBright, Math.max(0, elev - 0.62) * Math.max(0, 1 - coreDist / 1.1) * 0.22);
      if (nearest && elev > 0.55) {
        // only cool tint toward hub, never gold
        tmp.lerp(nearest, 0.05);
        tmp.lerp(peakBright, Math.max(0, elev - 0.65) * 0.18);
      }
      colors[vi * 3] = tmp.r;
      colors[vi * 3 + 1] = tmp.g;
      colors[vi * 3 + 2] = tmp.b;
      vi++;
    }
  }

  const indices: number[] = [];
  for (let iz = 0; iz < seg; iz++) {
    for (let ix = 0; ix < seg; ix++) {
      const a = iz * perRow + ix;
      const b = a + 1;
      const c = a + perRow;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  return { positions, colors, indices: new Uint32Array(indices) };
}

function buildTerrainDust(hubs: BrainHub[], count: number) {
  const peaks = hubPeaksFrom(hubs);
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const base = new THREE.Color('#0e2438');
  const cool = new THREE.Color('#1a5070');
  const tmp = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const x = (Math.random() - 0.5) * TERRAIN_HALF * 2;
    const z = (Math.random() - 0.5) * TERRAIN_HALF * 2;
    const y = terrainHeight(x, z, peaks) + 0.008 + Math.random() * 0.09;
    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;

    let nearest = base;
    let best = Infinity;
    for (const p of peaks) {
      const d = (x - p.x) ** 2 + (z - p.z) ** 2;
      if (d < best) {
        best = d;
        nearest = p.color;
      }
    }
    tmp.copy(base).lerp(nearest, Math.min(1, 0.5 / (0.15 + best)));
    if (Math.random() > 0.82) tmp.lerp(cool, 0.35);
    colors[i * 3] = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;
  }
  return { positions, colors };
}

function TerrainMesh({ hubs, focusId, focusLeaves }: { hubs: BrainHub[]; focusId: string | null; focusLeaves: BrainLeaf[] }) {
  const mesh = useMemo(() => buildTerrainMesh(hubs, focusId, focusLeaves), [hubs, focusId, focusLeaves]);
  const dust = useMemo(() => buildTerrainDust(hubs, 5800), [hubs]);
  const dustRef = useRef<THREE.Points>(null);

  useFrame(({ clock }) => {
    if (!dustRef.current) return;
    dustRef.current.position.y = Math.sin(clock.getElapsedTime() * 0.55) * 0.005;
  });

  return (
    <group>
      {/* solid fill — gives dark calm body like AXON reference */}
      <mesh position={[0, -0.004, 0]}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[mesh.positions, 3]} />
          <bufferAttribute attach="attributes-color" args={[mesh.colors, 3]} />
          <bufferAttribute attach="index" args={[mesh.indices, 1]} />
        </bufferGeometry>
        <meshBasicMaterial vertexColors transparent opacity={0.55} depthWrite={false} />
      </mesh>
      {/* dense wireframe — slightly softer so peaks read as gentle light, not neon */}
      <mesh>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[mesh.positions, 3]} />
          <bufferAttribute attach="attributes-color" args={[mesh.colors, 3]} />
          <bufferAttribute attach="index" args={[mesh.indices, 1]} />
        </bufferGeometry>
        <meshBasicMaterial vertexColors wireframe transparent opacity={0.38} />
      </mesh>
      <points ref={dustRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[dust.positions, 3]} />
          <bufferAttribute attach="attributes-color" args={[dust.colors, 3]} />
        </bufferGeometry>
        <pointsMaterial size={0.01} vertexColors transparent opacity={0.55} sizeAttenuation depthWrite={false} blending={THREE.AdditiveBlending} />
      </points>
    </group>
  );
}

function ConnectionLines({ hubs, visible }: { hubs: BrainHub[]; visible: boolean }) {
  if (!visible) return null;
  const peaks = hubPeaksFrom(hubs);
  const coreY = terrainHeight(0, 0, peaks);
  const corePos: [number, number, number] = [0, coreY, 0];
  return (
    <>
      {hubs.filter((h) => h.layer !== 'core').map((hub, i) => {
        const start = new THREE.Vector3(...corePos);
        const end = new THREE.Vector3(...hub.pos);
        const mid = start.clone().lerp(end, 0.5);
        mid.y += 0.22 + (i % 3) * 0.05;
        return (
          <QuadraticBezierLine
            key={`link-${hub.id}`}
            start={corePos}
            end={hub.pos}
            mid={[mid.x, mid.y, mid.z]}
            color={hub.color}
            lineWidth={0.7}
            transparent
            opacity={0.28}
          />
        );
      })}
    </>
  );
}

const HUB_ICONS: Record<string, typeof Brain> = {
  core: Brain,
  preferences: Settings2,
  conversations: MessageSquare,
  events: Zap,
  insights: Lightbulb,
  resources: Database,
  specialists: Users,
  knowledge: BookOpen,
  obsidian: FileText,
  default: Layers,
};

function HubMarker({
  hub,
  focused,
  dimmed,
  onSelect,
}: {
  hub: BrainHub;
  focused: boolean;
  dimmed: boolean;
  onSelect: (id: string) => void;
}) {
  const Icon = HUB_ICONS[hub.iconKey] || HUB_ICONS.default;
  const isCore = hub.layer === 'core';
  const beaconH = focused || isCore ? 0.42 : 0.26;

  return (
    <group position={hub.pos}>
      {/* invisible hit target */}
      <mesh
        position={[0, 0.1, 0]}
        onClick={(e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation();
          if (!isCore) onSelect(hub.id);
        }}
        onPointerOver={() => {
          if (!isCore) document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          document.body.style.cursor = 'default';
        }}
      >
        <sphereGeometry args={[0.16, 12, 12]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      {/* glowing peak beacon (vertical light shaft like AXON) */}
      <mesh position={[0, beaconH * 0.5, 0]}>
        <cylinderGeometry args={[0.01, 0.014, beaconH, 8]} />
        <meshBasicMaterial color={hub.color} transparent opacity={0.95} />
      </mesh>
      {/* soft glow disk at tip */}
      <mesh position={[0, beaconH + 0.02, 0]}>
        <sphereGeometry args={[0.035, 10, 10]} />
        <meshBasicMaterial color={hub.color} transparent opacity={0.9} />
      </mesh>
      {/* Core uses DOM center-title only — no 3D label so nothing sits under the composer */}
      {!isCore && (
        <Html
          position={[0, 0.42, 0]}
          center
          style={{ pointerEvents: 'none' }}
          zIndexRange={[20, 0]}
          distanceFactor={5.5}
        >
          <div
            className="nm-hub-marker"
            style={{
              opacity: dimmed ? 0.22 : 1,
              transform: focused ? 'scale(1.14)' : 'scale(1)',
            }}
          >
            <div
              className="nm-hub-icon"
              style={{
                background: `linear-gradient(145deg, ${hub.color}33, ${hub.color}11)`,
                color: hub.color,
                borderColor: `${hub.color}88`,
                boxShadow: focused
                  ? `0 0 22px ${hub.color}77, 0 0 8px ${hub.color}44 inset`
                  : `0 0 12px ${hub.color}44`,
              }}
            >
              <Icon size={15} strokeWidth={2.1} />
            </div>
            <div className="nm-hub-text">
              <div className="nm-hub-name" style={{ color: focused ? CREAM : 'rgba(245,240,230,0.92)' }}>
                {hub.label}
              </div>
              <div className="nm-hub-count" style={{ color: hub.color }}>
                {hub.memoryCount.toLocaleString()} memories
              </div>
            </div>
          </div>
        </Html>
      )}
    </group>
  );
}

function SubHubMarkers({ hub, leaves, onSelect }: { hub: BrainHub; leaves: BrainLeaf[]; onSelect: (leaf: BrainLeaf) => void }) {
  const n = Math.min(leaves.length, 10);
  // Build peak set including parent + all sub-peaks so height is accurate
  const subPeaks: Peak[] = [];
  for (let i = 0; i < n; i++) {
    const angle = (i / Math.max(n, 1)) * Math.PI * 2 - Math.PI / 2;
    const r = 0.32 + (i % 3) * 0.10;
    subPeaks.push({
      x: hub.pos[0] + Math.cos(angle) * r,
      z: hub.pos[2] + Math.sin(angle) * r,
      h: 0.34 + (i % 5) * 0.08,
      spread: 0.11,
      color: new THREE.Color(hub.color),
    });
  }
  const allPeaks = [...hubPeaksFrom([{ ...hub }]), ...subPeaks];

  return (
    <>
      {leaves.slice(0, n).map((leaf, i) => {
        const sp = subPeaks[i];
        const y = terrainHeight(sp.x, sp.z, allPeaks);
        return (
          <group key={leaf.id} position={[sp.x, y, sp.z]}>
            <mesh
              position={[0, 0.08, 0]}
              onClick={(e: ThreeEvent<MouseEvent>) => {
                e.stopPropagation();
                onSelect(leaf);
              }}
              onPointerOver={() => {
                document.body.style.cursor = 'pointer';
              }}
              onPointerOut={() => {
                document.body.style.cursor = 'default';
              }}
            >
              <sphereGeometry args={[0.09, 10, 10]} />
              <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            </mesh>
            {/* beacon on sub-peak */}
            <mesh position={[0, 0.09, 0]}>
              <cylinderGeometry args={[0.007, 0.01, 0.18, 6]} />
              <meshBasicMaterial color={hub.color} transparent opacity={0.95} />
            </mesh>
            <mesh position={[0, 0.2, 0]}>
              <sphereGeometry args={[0.022, 8, 8]} />
              <meshBasicMaterial color={hub.color} transparent opacity={0.9} />
            </mesh>
            <Html position={[0, 0.32, 0]} center style={{ pointerEvents: 'none' }} zIndexRange={[25, 0]} distanceFactor={4.0}>
              <div className="nm-subhub-marker">
                <div className="nm-subhub-icon" style={{ borderColor: hub.color, color: hub.color, boxShadow: `0 0 10px ${hub.color}55` }}>
                  <Layers size={11} strokeWidth={2.2} />
                </div>
                <div className="nm-subhub-label" style={{ borderColor: `${hub.color}77` }}>
                  {leaf.label.length > 20 ? `${leaf.label.slice(0, 20)}…` : leaf.label}
                </div>
              </div>
            </Html>
          </group>
        );
      })}
    </>
  );
}

function CameraRig({
  depthLevel,
  focusHub,
}: {
  depthLevel: number;
  focusHub: BrainHub | null;
}) {
  const { camera } = useThree();
  const targetPos = useRef(new THREE.Vector3(0, 2.5, 4.5));
  const lookAt = useRef(new THREE.Vector3(0, 0.75, 0));
  const transitionEnd = useRef(0);

  useEffect(() => {
    if (focusHub) {
      // Pull back to show the whole hub mountain + ridge so sub-hubs on/around it are visible
      const [hx, hy, hz] = focusHub.pos;
      targetPos.current.set(hx + 0.15, hy + 1.35, hz + 2.15);
      lookAt.current.set(hx, hy + 0.35, hz);
    } else {
      const baseZ = 4.6 - (depthLevel - 1) * 0.32;
      const baseY = 2.65 - (depthLevel - 1) * 0.18;
      targetPos.current.set(0, Math.max(1.5, baseY), Math.max(2.15, baseZ));
      lookAt.current.set(0, 0.8, 0);
    }
    transitionEnd.current = performance.now() + 900;
  }, [depthLevel, focusHub]);

  useFrame(() => {
    if (performance.now() > transitionEnd.current) return;
    camera.position.lerp(targetPos.current, 0.07);
  });

  return null;
}

function BrainScene({
  hubs,
  focusHubId,
  depthLevel,
  onFocusHub,
  onSelectLeaf,
  onBackground,
}: {
  hubs: BrainHub[];
  focusHubId: string | null;
  depthLevel: number;
  onFocusHub: (id: string | null) => void;
  onSelectLeaf: (leaf: BrainLeaf) => void;
  onBackground: () => void;
}) {
  const focusHub = hubs.find((h) => h.id === focusHubId) ?? null;
  const showLinks = depthLevel >= 3 && !focusHub;
  const focusLeaves = focusHub?.leaves ?? [];

  return (
    <>
      <color attach="background" args={[BG]} />
      <fog attach="fog" args={[BG, 4.2, 9.5]} />
      <ambientLight intensity={0.22} />
      <hemisphereLight args={['#0a1628', '#000000', 0.55]} />
      <pointLight position={[0, 3.5, 0]} intensity={0.35} color="#1a6a9a" />
      <pointLight position={[2.5, 1.5, 2]} intensity={0.2} color="#0d3a5c" />
      <pointLight position={[-2.5, 1.5, -2]} intensity={0.2} color="#0d3a5c" />

      <CameraRig depthLevel={depthLevel} focusHub={focusHub} />

      <group
        onClick={(e) => {
          if (e.object.type === 'Points' || e.object.type === 'Mesh') onBackground();
        }}
      >
        <TerrainMesh hubs={hubs} focusId={focusHubId} focusLeaves={focusLeaves} />
        <ConnectionLines hubs={hubs} visible={showLinks} />

        {hubs.map((hub) => (
          <HubMarker
            key={hub.id}
            hub={hub}
            focused={focusHubId === hub.id}
            dimmed={!!focusHubId && focusHubId !== hub.id && hub.layer !== 'core'}
            onSelect={(id) => onFocusHub(id)}
          />
        ))}

        {focusHub && (
          <SubHubMarkers hub={focusHub} leaves={focusLeaves} onSelect={onSelectLeaf} />
        )}
      </group>

      <OrbitControls
        enablePan={false}
        target={focusHub ? [focusHub.pos[0], focusHub.pos[1] + 0.22, focusHub.pos[2]] : [0, 0.8, 0]}
        minDistance={0.9}
        maxDistance={6.8}
        maxPolarAngle={Math.PI / 2.08}
        autoRotate={!focusHub}
        autoRotateSpeed={0.22}
        makeDefault
      />

      {/* Bloom off — was washing peaks into one-sided gold glow */}
      {/* <EffectComposer>...</EffectComposer> */}
    </>
  );
}

function MiniTerrainScene({ hubs, spinning }: { hubs: BrainHub[]; spinning: boolean }) {
  const ref = useRef<THREE.Group>(null);
  useFrame((_, delta) => {
    if (ref.current && spinning) ref.current.rotation.y += delta * 0.28;
  });
  return (
    <group ref={ref} scale={0.55} position={[0, -0.35, 0]}>
      <TerrainMesh hubs={hubs} focusId={null} focusLeaves={[]} />
    </group>
  );
}

function MiniTerrainPreview({ hubs, spinning }: { hubs: BrainHub[]; spinning: boolean }) {
  return (
    <Canvas camera={{ position: [0, 1.0, 2.2], fov: 42 }} dpr={[1, 1.5]} gl={{ antialias: true, alpha: false }}>
      <color attach="background" args={['#010205']} />
      <ambientLight intensity={0.2} />
      <MiniTerrainScene hubs={hubs} spinning={spinning} />
    </Canvas>
  );
}

/* ── real memory data ───────────────────────────────────────────────────── */

function useNeuralBrainData() {
  const [hubs, setHubs] = useState<BrainHub[]>([]);
  const [counts, setCounts] = useState({ global: 0, rag: 0, notes: 0, total: 0 });
  const [wikilinkCount, setWikilinkCount] = useState(0);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [integrityPct, setIntegrityPct] = useState(100);
  const [loading, setLoading] = useState(true);
  const [stream, setStream] = useState<StreamItem[]>([]);
  const notesRef = useRef<ObsidianNote[]>([]);
  const ragRef = useRef<RagMemory[]>([]);
  const globalRef = useRef<MemEntry[]>([]);
  const seenStreamIds = useRef<Set<string>>(new Set());

  const pushStream = useCallback((item: StreamItem) => {
    if (seenStreamIds.current.has(item.id)) return;
    seenStreamIds.current.add(item.id);
    setStream((prev) => [item, ...prev].slice(0, 24));
  }, []);

  const rebuild = useCallback(() => {
    const mems = globalRef.current;
    const rag = ragRef.current;
    const notes = notesRef.current;
    const total = mems.length + rag.length + notes.length;

    setCounts({ global: mems.length, rag: rag.length, notes: notes.length, total });
    setWikilinkCount(notes.reduce((n, note) => n + (note.wikilinks?.length || 0), 0));

    const raw: Omit<BrainHub, 'pos'>[] = [];

    // AXE Core — always center, always tallest, holds ALL memory
    raw.push({
      id: 'hub-core',
      label: 'AXE Core',
      color: CORE_COLOR,
      layer: 'core',
      href: '/ai-core',
      memoryCount: Math.max(total, 1),
      iconKey: 'core',
      leaves: [],
    });

    (Object.keys(GLOBAL_CATS) as GlobalCat[]).forEach((cat) => {
      const meta = GLOBAL_CATS[cat];
      const catMems = mems.filter((m) => m.category === cat);
      if (catMems.length === 0 && cat !== 'user_preference' && cat !== 'system_event' && cat !== 'conversation_context') return;
      raw.push({
        id: `hub-g-${cat}`,
        label: meta.label,
        color: meta.color,
        layer: 'global',
        href: '/memory/explore',
        memoryCount: catMems.length,
        iconKey: cat.replace('user_', '').replace('_context', 's').replace('system_', '').replace('agent_performance', 'insights').replace('provider_performance', 'resources').replace('specialist_match', 'specialists') || 'default',
        leaves: catMems.slice(0, 12).map((mem, j) => {
          let detail: string;
          try {
            detail = JSON.stringify(JSON.parse(mem.value)).slice(0, 160);
          } catch {
            detail = String(mem.value ?? '').slice(0, 160);
          }
          return {
            id: `leaf-g-${mem.id ?? `${cat}-${j}`}`,
            label: mem.key.length > 24 ? `${mem.key.slice(0, 24)}…` : mem.key,
            detail,
            href: '/memory/explore',
          };
        }),
      });
    });

    // fix icon keys properly
    for (const h of raw) {
      if (h.id === 'hub-g-user_preference') h.iconKey = 'preferences';
      if (h.id === 'hub-g-conversation_context') h.iconKey = 'conversations';
      if (h.id === 'hub-g-system_event') h.iconKey = 'events';
      if (h.id === 'hub-g-agent_performance') h.iconKey = 'insights';
      if (h.id === 'hub-g-provider_performance') h.iconKey = 'resources';
      if (h.id === 'hub-g-specialist_match') h.iconKey = 'specialists';
    }

    raw.push({
      id: 'hub-rag',
      label: 'Knowledge',
      color: RAG_COLOR,
      layer: 'rag',
      href: '/memory/explore',
      memoryCount: rag.length,
      iconKey: 'knowledge',
      leaves: rag.slice(0, 14).map((m, j) => ({
        id: `leaf-rag-${m.id ?? j}`,
        label: (m.content || '').slice(0, 24) + ((m.content || '').length > 24 ? '…' : ''),
        detail: `[${m.category} · i${m.importance}] ${(m.content || '').slice(0, 160)}`,
        href: '/memory/explore',
      })),
    });

    raw.push({
      id: 'hub-obsidian',
      label: 'Obsidian',
      color: OBSIDIAN_COLOR,
      layer: 'obsidian',
      href: '/obsidian',
      memoryCount: notes.length,
      iconKey: 'obsidian',
      leaves: notes.slice(0, 16).map((n) => ({
        id: `leaf-note-${n.path}`,
        label: n.title.length > 24 ? `${n.title.slice(0, 24)}…` : n.title,
        detail: `${folderOf(n.path)} · ${(n.content || '').replace(/\s+/g, ' ').slice(0, 140)}`,
        href: `/obsidian?note=${encodeURIComponent(n.path)}`,
      })),
    });

    setHubs(placeHubsOnTerrain(raw));
  }, []);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      let ragFailed = false;
      let notesFailed = false;
      let globalFailed = false;
      try {
        const [notes, rag, globals, growth] = await Promise.all([
          listRecentObsidianNotes(50).catch(() => {
            notesFailed = true;
            return [] as ObsidianNote[];
          }),
          loadRagMemories(undefined, 1, 80).catch(() => {
            ragFailed = true;
            return [] as RagMemory[];
          }),
          loadGlobalMemories(AXE_USER_ID, undefined, 500).catch(() => {
            globalFailed = true;
            return [] as MemEntry[];
          }),
          loadMemoryGrowthStats().catch(() => null),
        ]);
        if (!alive) return;
        notesRef.current = notes;
        ragRef.current = rag;
        globalRef.current = globals;
        rebuild();
        setIntegrityPct(Math.round(((notesFailed ? 0 : 1) + (ragFailed ? 0 : 1) + (globalFailed ? 0 : 1)) / 3 * 100));
        if (growth?.lastManagerAt) {
          setLastUpdated(growth.lastManagerAt);
        } else {
          const newest = notes.reduce<string | null>((acc, n) => {
            const at = n.updated_at || n.created_at;
            if (!at) return acc;
            return !acc || at > acc ? at : acc;
          }, null);
          setLastUpdated(newest);
        }
        if (growth?.lastManagerMessage) {
          pushStream({
            id: `manager-${growth.lastManagerAt || 'run'}`,
            ts: growth.lastManagerAt ? new Date(growth.lastManagerAt).getTime() : Date.now(),
            color: '#2a7aad',
            title: 'Memory manager ran',
            subtitle: growth.lastManagerMessage,
          });
        }
        setLoading(false);
      } catch {
        rebuild();
        setLoading(false);
      }
    };
    void load();
    const t = window.setInterval(() => void load(), 45_000);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, [rebuild, pushStream]);

  useEffect(() => {
    const labelFor = (name: string, payload: unknown): { color: string; title: string; subtitle: string } | null => {
      switch (name) {
        case 'axe:chat-message': {
          const p = payload as { role: string; preview: string };
          return { color: GLOBAL_CATS.conversation_context.color, title: p.role === 'user' ? 'New message' : 'AXE replied', subtitle: p.preview };
        }
        case 'axe:memory-changed': {
          const p = payload as { kind?: string };
          return { color: RAG_COLOR, title: 'Memory updated', subtitle: p.kind ? `${p.kind} store changed` : 'Store changed' };
        }
        case 'axe:files-attached': {
          const p = payload as { names: string[]; count: number };
          return { color: GLOBAL_CATS.provider_performance.color, title: 'Files attached', subtitle: p.names.slice(0, 2).join(', ') || `${p.count} file(s)` };
        }
        case 'axe:crew-status': {
          const p = payload as { status: string; task?: string };
          return { color: GLOBAL_CATS.specialist_match.color, title: `Crew ${p.status}`, subtitle: p.task || 'background task' };
        }
        case 'axe:health-ping': {
          const p = payload as { service: string; ok: boolean };
          return { color: GLOBAL_CATS.system_event.color, title: p.ok ? `${p.service} healthy` : `${p.service} issue`, subtitle: p.ok ? 'health check passed' : 'health check failed' };
        }
        default:
          return null;
      }
    };

    for (const evt of axeBus.getHistory()) {
      const info = labelFor(evt.name, evt.payload);
      if (!info) continue;
      pushStream({ id: `${evt.name}-${evt.ts}`, ts: evt.ts, ...info });
    }

    const names: Array<keyof import('@/domain/events/axeEvents').AxeEventMap> = [
      'axe:chat-message', 'axe:memory-changed', 'axe:files-attached', 'axe:crew-status', 'axe:health-ping',
    ];
    const unsubs = names.map((name) =>
      subscribeAxeEvent(name, (payload) => {
        const info = labelFor(name, payload);
        if (!info) return;
        pushStream({ id: `${name}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, ts: Date.now(), ...info });
      }),
    );
    return () => unsubs.forEach((u) => u());
  }, [pushStream]);

  const connections = wikilinkCount + hubs.reduce((n, h) => n + h.leaves.length, 0);

  return { hubs, counts, connections, lastUpdated, integrityPct, loading, stream };
}

/* ── chrome ─────────────────────────────────────────────────────────────── */

function fmtWhen(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return timeAgo(d.getTime());
}

function LeftSidebar({
  hubs, counts, connections, lastUpdated, integrityPct, depthLevel, focusHubId, onFocusHub, onNavigate,
}: {
  hubs: BrainHub[];
  counts: { global: number; rag: number; notes: number; total: number };
  connections: number;
  lastUpdated: string | null;
  integrityPct: number;
  depthLevel: number;
  focusHubId: string | null;
  onFocusHub: (id: string | null) => void;
  onNavigate: (href?: string) => void;
}) {
  return (
    <div className="nm-sidebar nm-sidebar-left">
      <div className="nm-panel">
        <div className="nm-title">GLOBAL MEMORY</div>
        <div className="nm-status"><span className="nm-dot" />ACTIVE</div>
      </div>

      <div className="nm-search">
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Search size={12} /> Search memories…</span>
        <span style={{ fontSize: 9, opacity: 0.6 }}>⌘K</span>
      </div>

      <div className="nm-panel">
        <h2>Memory Overview</h2>
        <div className="nm-stat-row"><span className="k">Total Memories</span><span className="v">{counts.total}</span></div>
        <div className="nm-stat-row"><span className="k">Connections</span><span className="v">{connections}</span></div>
        <div className="nm-stat-row"><span className="k">Last Updated</span><span className="v">{fmtWhen(lastUpdated)}</span></div>
        <div className="nm-stat-row"><span className="k">Depth Level</span><span className="v">{depthLevel}</span></div>
        <div className="nm-stat-row"><span className="k">Integrity</span><span className="v">{integrityPct}%</span></div>
        <div className="nm-bar"><i style={{ width: `${integrityPct}%` }} /></div>
      </div>

      <div className="nm-panel" style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        <h2>Memory Hubs</h2>
        {hubs.filter((h) => h.layer !== 'core').map((hub) => {
          const Icon = HUB_ICONS[hub.iconKey] || HUB_ICONS.default;
          return (
            <div
              key={hub.id}
              className={`nm-hub-row${focusHubId === hub.id ? ' active' : ''}`}
              onClick={() => onFocusHub(focusHubId === hub.id ? null : hub.id)}
              onDoubleClick={() => onNavigate(hub.href)}
              title="Click to zoom into peak · double-click to open"
            >
              <span className="nm-hub-row-icon" style={{ color: hub.color, borderColor: `${hub.color}55`, background: `${hub.color}18` }}>
                <Icon size={12} />
              </span>
              <span className="name">{hub.label}</span>
              <span className="count">{hub.memoryCount}</span>
            </div>
          );
        })}
        {hubs.length <= 1 && <div className="nm-about">No memories yet — chat with AXE to grow the terrain.</div>}
      </div>
    </div>
  );
}

function RightSidebar({
  hubs, stream, integrityPct, loading, autoRotate, onToggleAutoRotate, onNavigate, counts,
}: {
  hubs: BrainHub[];
  stream: StreamItem[];
  integrityPct: number;
  loading: boolean;
  autoRotate: boolean;
  onToggleAutoRotate: () => void;
  onNavigate: () => void;
  counts: { global: number; rag: number; notes: number; total: number };
}) {
  return (
    <div className="nm-sidebar nm-sidebar-right">
      <div className="nm-panel">
        <h2>About this view <span className="nm-live-tag"><span className="nm-dot" />LIVE</span></h2>
        <p className="nm-about">
          Volumetric memory map of AXE Core. Peak height = memory volume. AXE Core is always the tallest center summit.
          Click a hub to zoom into its peak and explore sub-hubs as smaller mountains.
        </p>
      </div>

      <div className="nm-panel" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <h2>Memory Stream</h2>
        <div style={{ overflowY: 'auto', minHeight: 0 }}>
          {stream.slice(0, 6).map((item) => (
            <div className="nm-stream-item" key={item.id}>
              <span className="sd" style={{ color: item.color }} />
              <div className="body">
                <div className="t">{timeAgo(item.ts)}</div>
                <div className="l1">{item.title}</div>
                <div className="l2">{item.subtitle}</div>
              </div>
            </div>
          ))}
          {stream.length === 0 && (
            <div className="nm-about">{loading ? 'Loading activity…' : 'No activity yet this session.'}</div>
          )}
        </div>
        <button type="button" className="nm-viewall-btn" onClick={onNavigate}>View all</button>
      </div>

      <div className="nm-panel">
        <h2>Terrain Overview</h2>
        <div id="nm-mini-brain">
          <MiniTerrainPreview hubs={hubs} spinning={autoRotate} />
        </div>
        <div className="nm-toggle-row">
          <span>Auto Rotate</span>
          <button type="button" className={`nm-switch${autoRotate ? ' on' : ''}`} onClick={onToggleAutoRotate}><i /></button>
        </div>
      </div>

      <div className="nm-panel">
        <div className="nm-sync">
          {integrityPct >= 90 ? <ShieldCheck size={16} className="ok" /> : <ShieldCheck size={16} className="warn" />}
          <div>
            <b>{integrityPct >= 90 ? 'Memory synchronized' : 'Sync degraded'}</b>
            {integrityPct >= 90 ? 'All systems up to date' : 'Some sources offline'}
          </div>
        </div>
        <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          <div className="nm-mini-stat"><span>Global</span><b>{counts.global}</b></div>
          <div className="nm-mini-stat"><span>RAG</span><b>{counts.rag}</b></div>
          <div className="nm-mini-stat"><span>Obsidian</span><b>{counts.notes}</b></div>
          <div className="nm-mini-stat"><span>Total</span><b>{counts.total}</b></div>
        </div>
      </div>
    </div>
  );
}

function Legend() {
  const rows: Array<{ icon: ReactNode; label: string; key: string }> = [
    { icon: <Move size={13} />, label: 'Navigate', key: 'drag' },
    { icon: <Mouse size={13} />, label: 'Scroll', key: '⇅' },
    { icon: <MousePointerClick size={13} />, label: 'Click hub', key: '•' },
    { icon: <ZoomIn size={13} />, label: 'Zoom peak', key: '+/−' },
    { icon: <Crosshair size={13} />, label: 'Focus', key: 'F' },
    { icon: <CornerUpLeft size={13} />, label: 'Back', key: 'Esc' },
  ];
  return (
    <div className="nm-panel nm-legend" style={{ position: 'absolute', bottom: 14, left: 246, zIndex: 15 }}>
      {rows.map((r) => (
        <div className="row" key={r.label}>
          <span className="ic-wrap">{r.icon}</span>
          <span style={{ flex: 1 }}>{r.label}</span>
          <kbd>{r.key}</kbd>
        </div>
      ))}
    </div>
  );
}

function Composer({ onSend, lastReply }: { onSend: (text: string) => void; lastReply: string | null }) {
  const [text, setText] = useState('');
  return (
    <div className="nm-composer">
      <div className="box">
        <Sparkles size={14} color="#a78bfa" />
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && text.trim()) {
              onSend(text.trim());
              setText('');
            }
          }}
          placeholder="Ask AXE Core anything…"
        />
        <button
          type="button"
          onClick={() => {
            if (text.trim()) {
              onSend(text.trim());
              setText('');
            }
          }}
          style={{ background: 'none', border: 'none', color: '#a78bfa', cursor: 'pointer', display: 'flex' }}
        >
          <Send size={14} />
        </button>
      </div>
      {lastReply && <div className="reply">{lastReply}</div>}
    </div>
  );
}

function DepthBar({ depthLevel, unlockedFive, onSet }: { depthLevel: number; unlockedFive: boolean; onSet: (n: number) => void }) {
  return (
    <div className="nm-depthbar">
      <div className="label">EXPLORE DEPTH LEVEL</div>
      <div className="row">
        {[1, 2, 3, 4, 5, 6, 7].map((n) => {
          const locked = n >= 5 && !unlockedFive;
          return (
            <button
              key={n}
              type="button"
              className={`nm-depth-btn${depthLevel === n ? ' active' : ''}${locked ? ' locked' : ''}`}
              disabled={locked}
              onClick={() => onSet(n)}
              title={locked ? 'Focus a hub first to unlock deeper levels' : `Depth ${n}`}
            >
              {locked ? <Lock size={11} /> : n}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ── main ───────────────────────────────────────────────────────────────── */

export function NeuralMemorySystem() {
  const navigate = useNavigate();
  const voice = useVoiceStore();
  const { hubs, counts, connections, lastUpdated, integrityPct, loading, stream } = useNeuralBrainData();
  const [focusHubId, setFocusHubId] = useState<string | null>(null);
  const [selectedLeaf, setSelectedLeaf] = useState<BrainLeaf | null>(null);
  const [depthLevel, setDepthLevel] = useState(5);
  const [autoRotate, setAutoRotate] = useState(true);
  const [everFocused, setEverFocused] = useState(false);
  const [lastReply, setLastReply] = useState<string | null>(null);

  const focusHub = hubs.find((h) => h.id === focusHubId) ?? null;

  const handleFocusHub = useCallback((id: string | null) => {
    setFocusHubId(id);
    setSelectedLeaf(null);
    if (id) setEverFocused(true);
  }, []);

  const openLeaf = (leaf: BrainLeaf) => setSelectedLeaf(leaf);

  const handleSend = useCallback(
    (text: string) => {
      setLastReply(null);
      void voice.sendMessage(text).then(() => {
        const fresh = useVoiceStore.getState().conversation;
        const last = [...fresh].reverse().find((m) => m.role === 'axe');
        if (last?.text) setLastReply(last.text.slice(0, 220));
      });
    },
    [voice],
  );

  return (
    <div className="axe-neural-embed">
      <div className="nm-canvas-wrap">
        <Canvas
          camera={{ position: [0, 2.5, 4.4], fov: 42 }}
          dpr={[1, 2]}
          gl={{ antialias: true, alpha: false }}
          onCreated={({ gl }) => gl.setClearColor('#000000', 1)}
        >
          <Suspense fallback={null}>
            <BrainScene
              hubs={hubs}
              focusHubId={focusHubId}
              depthLevel={depthLevel}
              onFocusHub={handleFocusHub}
              onSelectLeaf={openLeaf}
              onBackground={() => {
                setFocusHubId(null);
                setSelectedLeaf(null);
              }}
            />
          </Suspense>
        </Canvas>
      </div>

      {/* Center title — AXE Core like AXON Memory reference (hide when zoomed into a hub) */}
      <div className="nm-center-title" style={{ opacity: focusHubId ? 0 : 1 }}>
        <div className="nm-center-name">AXE Core</div>
        <div className="nm-center-sub">{counts.total.toLocaleString()} memories</div>
        <div className="nm-terrain-build" style={{ fontSize: 9, letterSpacing: '0.14em', marginTop: 4, color: 'rgba(58,160,216,0.55)', textTransform: 'uppercase' }}>
          terrain dark · v3
        </div>
      </div>

      <AnimatePresence>
        <motion.div key="composer" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
          <Composer onSend={handleSend} lastReply={lastReply} />
        </motion.div>
      </AnimatePresence>

      {focusHubId && (
        <button type="button" className="nm-back-btn" onClick={() => handleFocusHub(null)}>
          <CornerUpLeft size={13} /> All hubs
        </button>
      )}

      {focusHub && (
        <div className="nm-hub-info">
          <div className="breadcrumb">AXE Core / {focusHub.layer}</div>
          <h3 style={{ color: focusHub.color }}>{focusHub.label}</h3>
          <div className="cnt">{focusHub.memoryCount} memories · {focusHub.leaves.length} on peak</div>
        </div>
      )}

      <LeftSidebar
        hubs={hubs}
        counts={counts}
        connections={connections}
        lastUpdated={lastUpdated}
        integrityPct={integrityPct}
        depthLevel={depthLevel}
        focusHubId={focusHubId}
        onFocusHub={handleFocusHub}
        onNavigate={(href) => navigate(href || '/memory')}
      />

      <RightSidebar
        hubs={hubs}
        stream={stream}
        integrityPct={integrityPct}
        loading={loading}
        autoRotate={autoRotate}
        onToggleAutoRotate={() => setAutoRotate((v) => !v)}
        onNavigate={() => navigate('/memory')}
        counts={counts}
      />

      <Legend />
      <DepthBar depthLevel={depthLevel} unlockedFive={everFocused} onSet={setDepthLevel} />

      {/* Bottom stats like reference */}
      <div className="nm-bottom-stats">
        <div className="nm-stat-card"><span className="k">CONVERSATIONS</span><b>{counts.global}</b><span className="s">memories</span></div>
        <div className="nm-stat-card"><span className="k">KNOWLEDGE</span><b>{counts.rag}</b><span className="s">memories</span></div>
        <div className="nm-stat-card"><span className="k">OBSIDIAN</span><b>{counts.notes}</b><span className="s">notes</span></div>
      </div>

      {counts.total === 0 && !loading && (
        <div className="nm-empty">
          <div>
            <div className="nm-title" style={{ color: 'rgba(232,197,71,0.6)' }}>Terrain is empty</div>
            <div className="nm-about">Chat with AXE, save memories, or sync Obsidian notes.</div>
          </div>
        </div>
      )}

      {selectedLeaf && (
        <div className="nm-leaf-card">
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: CREAM }}>{selectedLeaf.label}</div>
            <button type="button" onClick={() => setSelectedLeaf(null)} style={{ background: 'none', border: 'none', color: 'var(--nm-dim)', cursor: 'pointer' }}>
              <X size={13} />
            </button>
          </div>
          <p style={{ fontSize: 11, lineHeight: 1.5, color: 'var(--nm-dim)', marginBottom: 10 }}>{selectedLeaf.detail || 'No detail'}</p>
          <div style={{ display: 'flex', gap: 12, fontSize: 10, color: 'var(--nm-dim)', marginBottom: 8 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Database size={11} /> {counts.total} nodes</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Link2 size={11} /> {connections} links</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Clock size={11} /> {fmtWhen(lastUpdated)}</span>
          </div>
          {selectedLeaf.href && (
            <button
              type="button"
              className="nm-viewall-btn"
              style={{ background: 'rgba(34,211,238,0.12)', color: '#67e8f9', border: '1px solid rgba(34,211,238,0.3)' }}
              onClick={() => navigate(selectedLeaf.href!)}
            >
              Open full view
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default NeuralMemorySystem;
