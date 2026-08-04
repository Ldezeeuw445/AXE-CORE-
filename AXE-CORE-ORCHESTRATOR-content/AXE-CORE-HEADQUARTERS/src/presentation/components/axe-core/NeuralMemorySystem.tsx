/**
 * NeuralMemorySystem — "Global Memory" brain view.
 * Home → Neural: a photoreal 3D particle brain wired to AXE's real memory
 * (global preference/event/agent/provider/specialist cache, RAG facts,
 * Obsidian notes) with the same left/right memory-hub chrome as the rest
 * of the app's Memory pages. Lives inside Home's card — between the app's
 * real Sidebar/RightPanel, not a full-viewport takeover.
 */
import { useCallback, useEffect, useMemo, useRef, useState, Suspense, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { AnimatePresence, motion } from 'framer-motion';
import { Canvas, useFrame, type ThreeEvent } from '@react-three/fiber';
import { OrbitControls, Html, Line } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import * as THREE from 'three';
import {
  Search, Send, Move, MousePointerClick, Mouse, ZoomIn, Crosshair, CornerUpLeft,
  RotateCw, Sparkles, Database, Link2, Clock, ShieldCheck, Lock, X,
} from 'lucide-react';
import { listRecentObsidianNotes, type ObsidianNote } from '@/infrastructure/persistence/obsidianMemoryService';
import { loadRagMemories, type RagMemory } from '@/infrastructure/persistence/ragMemoryService';
import { loadMemoryGrowthStats } from '@/infrastructure/persistence/memoryStatsService';
import { axeBus, subscribeAxeEvent } from '@/infrastructure/events/eventBus';
import { useVoiceStore } from '@/presentation/store/voiceStore';
import './NeuralMemorySystem.css';

/* ── palette ─────────────────────────────────────────────────────────────── */
const GOLD = '#E8C547';
const CREAM = '#F5F0E6';
const BG = '#000000';

/** Real AXE memory categories → hub identity (color / label / where "open" goes). */
const GLOBAL_CATS = {
  user_preference: { color: '#F0ABFC', label: 'Preferences' },
  conversation_context: { color: '#A78BFA', label: 'Conversations' },
  system_event: { color: '#FB7185', label: 'Events' },
  agent_performance: { color: '#67E8F9', label: 'Insights' },
  provider_performance: { color: '#FDBA74', label: 'Resources' },
  specialist_match: { color: '#6EE7B7', label: 'Specialists' },
} as const;

type GlobalCat = keyof typeof GLOBAL_CATS;

const RAG_COLOR = '#5C8FC2';
const OBSIDIAN_COLOR = '#22D3EE';

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
  layer: 'global' | 'rag' | 'obsidian';
  href?: string;
  leaves: BrainLeaf[];
  /** Unit-ish position on brain surface before scale */
  pos: [number, number, number];
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

/* ── brain geometry ──────────────────────────────────────────────────────── */

/** Approximate two-hemisphere brain surface point */
function brainSurfacePoint(u: number, v: number, hemisphere: -1 | 1): THREE.Vector3 {
  const theta = u * Math.PI * 2;
  const phi = v * Math.PI;
  let x = 0.55 * Math.sin(phi) * Math.cos(theta);
  const y = 0.72 * Math.cos(phi);
  const z = 0.48 * Math.sin(phi) * Math.sin(theta);
  x = hemisphere * (Math.abs(x) + 0.08 + 0.04 * Math.sin(phi * 3));
  const fold =
    0.04 * Math.sin(theta * 6 + phi * 4) +
    0.03 * Math.sin(theta * 11 - phi * 5) +
    0.02 * Math.cos(theta * 3 + phi * 8);
  const n = new THREE.Vector3(x, y, z).normalize();
  return new THREE.Vector3(x, y, z).addScaledVector(n, fold);
}

function placeHubsOnBrain(hubs: Omit<BrainHub, 'pos'>[]): BrainHub[] {
  const n = Math.max(hubs.length, 1);
  return hubs.map((h, i) => {
    const t = i / n;
    const hemi: -1 | 1 = i % 2 === 0 ? -1 : 1;
    const p = brainSurfacePoint(t, 0.32 + (i % 5) * 0.09, hemi);
    const scale = 1.05;
    return { ...h, pos: [p.x * scale, p.y * scale, p.z * scale] as [number, number, number] };
  });
}

/** Particle cloud tinted per-particle by the nearest hub's color — the "lobes" look. */
function buildBrainAttributes(count: number, hubs: BrainHub[]) {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const base = new THREE.Color('#7dd3fc');
  const hubColors = hubs.map((h) => new THREE.Color(h.color));
  const hubPos = hubs.map((h) => new THREE.Vector3(...h.pos));
  const tmp = new THREE.Vector3();

  for (let i = 0; i < count; i++) {
    const hemi: -1 | 1 = i % 2 === 0 ? -1 : 1;
    const u = Math.random();
    const v = Math.random();
    const p = brainSurfacePoint(u, v, hemi);
    const shell = 0.9 + Math.random() * 0.14;
    tmp.set(p.x * shell, p.y * shell, p.z * shell);
    positions[i * 3] = tmp.x;
    positions[i * 3 + 1] = tmp.y;
    positions[i * 3 + 2] = tmp.z;

    let nearest = base;
    let best = Infinity;
    for (let h = 0; h < hubPos.length; h++) {
      const d = tmp.distanceToSquared(hubPos[h]);
      if (d < best) {
        best = d;
        nearest = hubColors[h];
      }
    }
    const blend = Math.min(1, 0.55 / (0.35 + best));
    const c = base.clone().lerp(nearest, blend);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
    sizes[i] = 0.014 + Math.random() * 0.012;
  }
  return { positions, colors, sizes };
}

function BrainParticleCloud({ hubs, count = 7200 }: { hubs: BrainHub[]; count?: number }) {
  const ref = useRef<THREE.Points>(null);
  const attrs = useMemo(() => buildBrainAttributes(count, hubs), [count, hubs]);

  useFrame(({ clock }) => {
    if (!ref.current) return;
    ref.current.rotation.y = clock.getElapsedTime() * 0.045;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[attrs.positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[attrs.colors, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={0.017}
        vertexColors
        transparent
        opacity={0.72}
        sizeAttenuation
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

/** Faint neural links from the core to every hub — gives the "alive network" read. */
function ConnectionLines({ hubs, visible }: { hubs: BrainHub[]; visible: boolean }) {
  if (!visible) return null;
  return (
    <>
      {hubs.map((hub) => (
        <Line
          key={`link-${hub.id}`}
          points={[[0, 0, 0], hub.pos]}
          color={hub.color}
          lineWidth={0.6}
          transparent
          opacity={0.16}
        />
      ))}
    </>
  );
}

function HubNode({
  hub,
  active,
  focused,
  onSelect,
}: {
  hub: BrainHub;
  active: boolean;
  focused: boolean;
  onSelect: (id: string) => void;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const scale = focused ? 1.35 : active ? 1.15 : 1;

  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    const pulse = 1 + Math.sin(clock.getElapsedTime() * 2.2 + hub.pos[0] * 4) * 0.06;
    meshRef.current.scale.setScalar(scale * pulse);
  });

  return (
    <group position={hub.pos}>
      <mesh
        ref={meshRef}
        onClick={(e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation();
          onSelect(hub.id);
        }}
        onPointerOver={() => { document.body.style.cursor = 'pointer'; }}
        onPointerOut={() => { document.body.style.cursor = 'default'; }}
      >
        <sphereGeometry args={[0.09, 24, 24]} />
        <meshStandardMaterial
          color={hub.color}
          emissive={hub.color}
          emissiveIntensity={focused || active ? 1 : 0.45}
          roughness={0.3}
          metalness={0.25}
        />
      </mesh>
      <Html position={[0, 0.16, 0]} center style={{ pointerEvents: 'none' }} zIndexRange={[10, 0]}>
        <div className="nm-3d-label" style={{ color: focused ? GOLD : CREAM, borderColor: `${hub.color}66` }}>
          <span className="dot" style={{ background: hub.color }} />
          {hub.label}
          <span className="cnt">{hub.leaves.length}</span>
        </div>
      </Html>
    </group>
  );
}

function LeafNode({
  leaf, index, total, color, onSelect,
}: {
  leaf: BrainLeaf; index: number; total: number; color: string; onSelect: (leaf: BrainLeaf) => void;
}) {
  const angle = (index / Math.max(total, 1)) * Math.PI * 2 - Math.PI / 2;
  const r = 0.42 + (index % 3) * 0.06;
  const y = ((index % 5) - 2) * 0.05;
  const pos: [number, number, number] = [Math.cos(angle) * r, y, Math.sin(angle) * r];

  return (
    <group position={pos}>
      <mesh
        onClick={(e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); onSelect(leaf); }}
        onPointerOver={() => { document.body.style.cursor = 'pointer'; }}
        onPointerOut={() => { document.body.style.cursor = 'default'; }}
      >
        <sphereGeometry args={[0.045, 16, 16]} />
        <meshStandardMaterial color={CREAM} emissive={color} emissiveIntensity={0.28} />
      </mesh>
      <Html position={[0, 0.08, 0]} center style={{ pointerEvents: 'none' }} zIndexRange={[10, 0]}>
        <div className="nm-3d-leaf-label">{leaf.label.length > 18 ? `${leaf.label.slice(0, 18)}…` : leaf.label}</div>
      </Html>
    </group>
  );
}

/**
 * Drives camera distance from the depth-level slider + focus state.
 * Only nudges the camera for a short transition window after a change —
 * OrbitControls re-derives its orbit radius from the live camera position
 * every frame, so fighting it continuously would cancel the user's own
 * scroll-to-zoom. We dolly once, then hand control back.
 */
function CameraRig({ depthLevel, focused }: { depthLevel: number; focused: boolean }) {
  const targetZ = useRef(2.6);
  const transitionEnd = useRef(0);

  useEffect(() => {
    const base = 2.9 - (depthLevel - 1) * 0.32;
    targetZ.current = focused ? 1.7 : base;
    transitionEnd.current = performance.now() + 650;
  }, [depthLevel, focused]);

  useFrame(({ camera }) => {
    if (performance.now() > transitionEnd.current) return;
    camera.position.z += (targetZ.current - camera.position.z) * 0.09;
  });
  return null;
}

function BrainScene({
  hubs, focusHubId, depthLevel, onFocusHub, onSelectLeaf, onBackground,
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

  return (
    <>
      <color attach="background" args={[BG]} />
      <fog attach="fog" args={[BG, 4.2, 9]} />
      <ambientLight intensity={0.3} />
      <pointLight position={[2, 2, 3]} intensity={1.15} color="#67e8f9" />
      <pointLight position={[-2, -1, -2]} intensity={0.5} color={GOLD} />
      <pointLight position={[0, 2.4, -1]} intensity={0.35} color="#a78bfa" />

      <CameraRig depthLevel={depthLevel} focused={!!focusHub} />

      <group
        scale={focusHub ? 0.55 : 1}
        position={focusHub ? [0, -0.15, 0] : [0, 0, 0]}
        onClick={(e) => { if (e.object.type === 'Points') onBackground(); }}
      >
        <BrainParticleCloud hubs={hubs} count={7200} />
        <ConnectionLines hubs={hubs} visible={showLinks} />
        {!focusHub && hubs.map((hub) => (
          <HubNode key={hub.id} hub={hub} active={false} focused={false} onSelect={(id) => onFocusHub(id)} />
        ))}
      </group>

      {focusHub && (
        <group>
          <HubNode hub={{ ...focusHub, pos: [0, 0.15, 0] }} active focused onSelect={() => onFocusHub(null)} />
          {focusHub.leaves.slice(0, 14).map((leaf, i) => (
            <LeafNode key={leaf.id} leaf={leaf} index={i} total={Math.min(focusHub.leaves.length, 14)} color={focusHub.color} onSelect={onSelectLeaf} />
          ))}
        </group>
      )}

      <OrbitControls enablePan={false} minDistance={1.4} maxDistance={4.5} autoRotate={!focusHub} autoRotateSpeed={0.35} makeDefault />

      <EffectComposer multisampling={0}>
        <Bloom intensity={0.85} luminanceThreshold={0.15} luminanceSmoothing={0.35} mipmapBlur radius={0.7} />
      </EffectComposer>
    </>
  );
}

/** Rendered *inside* the mini Canvas — useFrame/useMemo only work as R3F-tree descendants. */
function MiniBrainPoints({ hubs, spinning }: { hubs: BrainHub[]; spinning: boolean }) {
  const attrs = useMemo(() => buildBrainAttributes(1400, hubs), [hubs]);
  const ref = useRef<THREE.Points>(null);
  useFrame((_, delta) => {
    if (ref.current && spinning) ref.current.rotation.y += delta * 0.35;
  });
  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[attrs.positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[attrs.colors, 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.02} vertexColors transparent opacity={0.85} sizeAttenuation depthWrite={false} blending={THREE.AdditiveBlending} />
    </points>
  );
}

/** Tiny always-rotating preview for the "Brain Overview" card — no interaction. */
function MiniBrainPreview({ hubs, spinning }: { hubs: BrainHub[]; spinning: boolean }) {
  return (
    <Canvas camera={{ position: [0, 0.1, 2.3], fov: 42 }} dpr={[1, 1.5]} gl={{ antialias: true, alpha: false }}>
      <color attach="background" args={['#050507']} />
      <ambientLight intensity={0.4} />
      <MiniBrainPoints hubs={hubs} spinning={spinning} />
    </Canvas>
  );
}

/* ── real memory data hook ───────────────────────────────────────────────── */

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
  const seenStreamIds = useRef<Set<string>>(new Set());

  const pushStream = useCallback((item: StreamItem) => {
    if (seenStreamIds.current.has(item.id)) return;
    seenStreamIds.current.add(item.id);
    setStream((prev) => [item, ...prev].slice(0, 24));
  }, []);

  const rebuild = useCallback(() => {
    let mems: MemEntry[] = [];
    try { mems = JSON.parse(localStorage.getItem('axe_global_memory_cache') || '[]'); } catch { /* */ }

    const rag = ragRef.current;
    const notes = notesRef.current;

    setCounts({ global: mems.length, rag: rag.length, notes: notes.length, total: mems.length + rag.length + notes.length });
    setWikilinkCount(notes.reduce((n, note) => n + (note.wikilinks?.length || 0), 0));

    const raw: Omit<BrainHub, 'pos'>[] = [];

    (Object.keys(GLOBAL_CATS) as GlobalCat[]).forEach((cat) => {
      const meta = GLOBAL_CATS[cat];
      const catMems = mems.filter((m) => m.category === cat);
      if (catMems.length === 0 && cat !== 'user_preference' && cat !== 'system_event') return;
      raw.push({
        id: `hub-g-${cat}`,
        label: meta.label,
        color: meta.color,
        layer: 'global',
        href: '/memory/explore',
        leaves: catMems.slice(0, 12).map((mem, j) => {
          let detail: string;
          try { detail = JSON.stringify(JSON.parse(mem.value)).slice(0, 160); }
          catch { detail = String(mem.value ?? '').slice(0, 160); }
          return {
            id: `leaf-g-${mem.id ?? `${cat}-${j}`}`,
            label: mem.key.length > 24 ? `${mem.key.slice(0, 24)}…` : mem.key,
            detail,
            href: '/memory/explore',
          };
        }),
      });
    });

    raw.push({
      id: 'hub-rag',
      label: 'Knowledge',
      color: RAG_COLOR,
      layer: 'rag',
      href: '/memory/explore',
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
      leaves: notes.slice(0, 16).map((n) => ({
        id: `leaf-note-${n.path}`,
        label: n.title.length > 24 ? `${n.title.slice(0, 24)}…` : n.title,
        detail: `${folderOf(n.path)} · ${(n.content || '').replace(/\s+/g, ' ').slice(0, 140)}`,
        href: `/obsidian?note=${encodeURIComponent(n.path)}`,
      })),
    });

    setHubs(placeHubsOnBrain(raw));
  }, []);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      let ragFailed = false;
      let notesFailed = false;
      try {
        const [notes, rag, growth] = await Promise.all([
          listRecentObsidianNotes(50).catch(() => { notesFailed = true; return [] as ObsidianNote[]; }),
          loadRagMemories(undefined, 1, 80).catch(() => { ragFailed = true; return [] as RagMemory[]; }),
          loadMemoryGrowthStats().catch(() => null),
        ]);
        if (!alive) return;
        notesRef.current = notes;
        ragRef.current = rag;
        rebuild();
        setIntegrityPct(Math.round(((notesFailed ? 0 : 1) + (ragFailed ? 0 : 1)) / 2 * 100));
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
            color: GOLD,
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
    return () => { alive = false; window.clearInterval(t); };
  }, [rebuild, pushStream]);

  // Seed the stream from whatever already ran through the app-wide event bus,
  // then keep listening for new activity — a real live feed, not canned copy.
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
    const unsubs = names.map((name) => subscribeAxeEvent(name, (payload) => {
      const info = labelFor(name, payload);
      if (!info) return;
      pushStream({ id: `${name}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, ts: Date.now(), ...info });
    }));
    return () => unsubs.forEach((u) => u());
  }, [pushStream]);

  const connections = wikilinkCount + hubs.reduce((n, h) => n + h.leaves.length, 0);

  return { hubs, counts, connections, lastUpdated, integrityPct, loading, stream };
}

/* ── layout pieces ───────────────────────────────────────────────────────── */

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
        {hubs.map((hub) => (
          <div
            key={hub.id}
            className={`nm-hub-row${focusHubId === hub.id ? ' active' : ''}`}
            onClick={() => onFocusHub(focusHubId === hub.id ? null : hub.id)}
            onDoubleClick={() => onNavigate(hub.href)}
            title="Click to focus in the brain · double-click to open"
          >
            <span className="nm-avatar" style={{ color: hub.color }} />
            <span className="name">{hub.label}</span>
            <span className="count">{hub.leaves.length}</span>
          </div>
        ))}
        {hubs.length === 0 && <div className="nm-about">No memories yet — chat with AXE to grow the brain.</div>}
      </div>
    </div>
  );
}

function RightSidebar({
  hubs, stream, integrityPct, loading, autoRotate, onToggleAutoRotate, onNavigate,
}: {
  hubs: BrainHub[];
  stream: StreamItem[];
  integrityPct: number;
  loading: boolean;
  autoRotate: boolean;
  onToggleAutoRotate: () => void;
  onNavigate: () => void;
}) {
  return (
    <div className="nm-sidebar nm-sidebar-right">
      <div className="nm-panel">
        <h2>About this view <span className="nm-live-tag"><span className="nm-dot" />LIVE</span></h2>
        <p className="nm-about">
          This is AXE's Global Memory. It holds everything AXE knows, remembers and learns about you
          and your conversations — preferences, events, agent insights, resources, specialists,
          knowledge facts and Obsidian notes. Click any hub to explore it, drag to rotate.
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
        <h2>Brain Overview</h2>
        <div id="nm-mini-brain">
          <MiniBrainPreview hubs={hubs} spinning={autoRotate} />
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
      </div>
    </div>
  );
}

function Legend() {
  const rows: Array<{ icon: ReactNode; label: string; key: string }> = [
    { icon: <Move size={13} />, label: 'Navigate', key: 'drag' },
    { icon: <Mouse size={13} />, label: 'Scroll', key: '⇅' },
    { icon: <MousePointerClick size={13} />, label: 'Click', key: '•' },
    { icon: <ZoomIn size={13} />, label: 'Zoom', key: '+/−' },
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
          placeholder="Ask anything…"
        />
        <button
          type="button"
          onClick={() => { if (text.trim()) { onSend(text.trim()); setText(''); } }}
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
      <div className="label">DEPTH LEVEL</div>
      <div className="row">
        {[1, 2, 3, 4, 5].map((n) => {
          const locked = n === 5 && !unlockedFive;
          return (
            <button
              key={n}
              type="button"
              className={`nm-depth-btn${depthLevel === n ? ' active' : ''}${locked ? ' locked' : ''}`}
              disabled={locked}
              onClick={() => onSet(n)}
              title={locked ? 'Focus a hub first to unlock depth 5' : `Depth ${n}`}
            >
              {locked ? <Lock size={11} /> : n}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ── main component ──────────────────────────────────────────────────────── */

export function NeuralMemorySystem() {
  const navigate = useNavigate();
  const voice = useVoiceStore();
  const { hubs, counts, connections, lastUpdated, integrityPct, loading, stream } = useNeuralBrainData();
  const [focusHubId, setFocusHubId] = useState<string | null>(null);
  const [selectedLeaf, setSelectedLeaf] = useState<BrainLeaf | null>(null);
  const [depthLevel, setDepthLevel] = useState(1);
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

  const handleSend = useCallback((text: string) => {
    setLastReply(null);
    void voice.sendMessage(text).then(() => {
      const fresh = useVoiceStore.getState().conversation;
      const last = [...fresh].reverse().find((m) => m.role === 'axe');
      if (last?.text) setLastReply(last.text.slice(0, 220));
    });
  }, [voice]);

  return (
    <div className="axe-neural-embed">
      <div className="nm-canvas-wrap">
        <Canvas
          camera={{ position: [0, 0.2, 2.6], fov: 42 }}
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
              onBackground={() => { setFocusHubId(null); setSelectedLeaf(null); }}
            />
          </Suspense>
        </Canvas>
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
          <div className="breadcrumb">Global Memory / {focusHub.layer}</div>
          <h3 style={{ color: focusHub.color }}>{focusHub.label}</h3>
          <div className="cnt">{focusHub.leaves.length} memories in this hub</div>
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
      />

      <Legend />
      <DepthBar depthLevel={depthLevel} unlockedFive={everFocused} onSet={setDepthLevel} />

      {counts.total === 0 && !loading && (
        <div className="nm-empty">
          <div>
            <div className="nm-title" style={{ color: 'rgba(232,197,71,0.6)' }}>Brain is empty</div>
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

      <div style={{ position: 'absolute', bottom: 14, right: 246, zIndex: 10, pointerEvents: 'none' }}>
        <div style={{ fontSize: 9, fontFamily: 'monospace', letterSpacing: '0.08em', color: 'rgba(255,255,255,0.28)' }}>
          {counts.total} nodes · {counts.global} global · {counts.rag} rag · {counts.notes} notes
        </div>
      </div>
      <div style={{ position: 'absolute', top: 14, left: 246, zIndex: 15, pointerEvents: 'none' }}>
        <div style={{ fontSize: 9, fontFamily: 'monospace', letterSpacing: '0.14em', color: 'rgba(103,232,249,0.7)', textTransform: 'uppercase' }}>
          <RotateCw size={9} style={{ display: 'inline', marginRight: 4, verticalAlign: '-1px' }} />
          Drag to rotate · click hub to focus
        </div>
      </div>
    </div>
  );
}

export default NeuralMemorySystem;
