/**
 * NeuralMemorySystem — complete 3D particle brain for AXE memory.
 * Home → Neural: rotate like the sphere, click hubs to drill deeper,
 * every node backed by real global / RAG / Obsidian / core memory.
 */
import { useCallback, useEffect, useMemo, useRef, useState, Suspense } from 'react';
import { useNavigate } from 'react-router';
import { Canvas, useFrame, ThreeEvent } from '@react-three/fiber';
import { OrbitControls, Text, Billboard } from '@react-three/drei';
import * as THREE from 'three';
import { listRecentObsidianNotes, type ObsidianNote } from '@/infrastructure/persistence/obsidianMemoryService';
import { loadRagMemories, type RagMemory } from '@/infrastructure/persistence/ragMemoryService';

/* ── palette ─────────────────────────────────────────────────────────────── */
const GOLD = '#E8C547';
const CREAM = '#F5F0E6';
/** Pure black — crisp, matches Core / sphere home */
const BG = '#000000';

const GLOBAL_CATS = {
  user_preference: { color: '#F0ABFC', label: 'Preferences' },
  agent_performance: { color: '#67E8F9', label: 'Agents' },
  conversation_context: { color: '#FDBA74', label: 'Conversations' },
  system_event: { color: '#FDE68A', label: 'Events' },
  provider_performance: { color: '#C4B5FD', label: 'Providers' },
  specialist_match: { color: '#6EE7B7', label: 'Specialists' },
} as const;

type GlobalCat = keyof typeof GLOBAL_CATS;

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
  /** Unit-ish position on brain surface before scale */
  pos: [number, number, number];
}

interface MemEntry {
  id?: string;
  category: string;
  key: string;
  value: string;
}

function folderOf(path: string): string {
  const parts = path.replace(/^AXE\//, '').split('/');
  return parts.length > 1 ? parts[0] : 'AXE';
}

/** Approximate two-hemisphere brain surface point */
function brainSurfacePoint(u: number, v: number, hemisphere: -1 | 1): THREE.Vector3 {
  const theta = u * Math.PI * 2;
  const phi = v * Math.PI;
  let x = 0.55 * Math.sin(phi) * Math.cos(theta);
  let y = 0.72 * Math.cos(phi);
  let z = 0.48 * Math.sin(phi) * Math.sin(theta);
  x = hemisphere * (Math.abs(x) + 0.08 + 0.04 * Math.sin(phi * 3));
  const fold =
    0.04 * Math.sin(theta * 6 + phi * 4) +
    0.03 * Math.sin(theta * 11 - phi * 5) +
    0.02 * Math.cos(theta * 3 + phi * 8);
  const n = new THREE.Vector3(x, y, z).normalize();
  return new THREE.Vector3(x, y, z).addScaledVector(n, fold);
}

function buildBrainParticles(count: number): Float32Array {
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const hemi: -1 | 1 = i % 2 === 0 ? -1 : 1;
    const u = Math.random();
    const v = Math.random();
    const p = brainSurfacePoint(u, v, hemi);
    const shell = 0.92 + Math.random() * 0.12;
    positions[i * 3] = p.x * shell;
    positions[i * 3 + 1] = p.y * shell;
    positions[i * 3 + 2] = p.z * shell;
  }
  return positions;
}

function BrainParticleCloud({ count = 4200 }: { count?: number }) {
  const ref = useRef<THREE.Points>(null);
  const positions = useMemo(() => buildBrainParticles(count), [count]);

  useFrame(({ clock }) => {
    if (!ref.current) return;
    ref.current.rotation.y = clock.getElapsedTime() * 0.04;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={0.018}
        color={new THREE.Color('#7dd3fc')}
        transparent
        opacity={0.55}
        sizeAttenuation
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
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
        onPointerOver={() => {
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          document.body.style.cursor = 'default';
        }}
      >
        <sphereGeometry args={[0.09, 24, 24]} />
        <meshStandardMaterial
          color={hub.color}
          emissive={hub.color}
          emissiveIntensity={focused || active ? 0.85 : 0.35}
          roughness={0.35}
          metalness={0.2}
        />
      </mesh>
      <Billboard follow lockX={false} lockY={false} lockZ={false}>
        <Text
          position={[0, 0.16, 0]}
          fontSize={0.055}
          color={focused ? GOLD : CREAM}
          anchorX="center"
          anchorY="bottom"
          outlineWidth={0.004}
          outlineColor="#000"
        >
          {hub.label}
        </Text>
        <Text
          position={[0, 0.11, 0]}
          fontSize={0.038}
          color="rgba(255,255,255,0.45)"
          anchorX="center"
          anchorY="bottom"
        >
          {`${hub.leaves.length}`}
        </Text>
      </Billboard>
    </group>
  );
}

function LeafNode({
  leaf,
  index,
  total,
  color,
  onSelect,
}: {
  leaf: BrainLeaf;
  index: number;
  total: number;
  color: string;
  onSelect: (leaf: BrainLeaf) => void;
}) {
  const angle = (index / Math.max(total, 1)) * Math.PI * 2 - Math.PI / 2;
  const r = 0.42 + (index % 3) * 0.06;
  const y = ((index % 5) - 2) * 0.05;
  const pos: [number, number, number] = [Math.cos(angle) * r, y, Math.sin(angle) * r];

  return (
    <group position={pos}>
      <mesh
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
        <sphereGeometry args={[0.045, 16, 16]} />
        <meshStandardMaterial color={CREAM} emissive={color} emissiveIntensity={0.25} />
      </mesh>
      <Billboard>
        <Text
          position={[0, 0.08, 0]}
          fontSize={0.032}
          color={CREAM}
          anchorX="center"
          maxWidth={0.5}
          outlineWidth={0.003}
          outlineColor="#000"
        >
          {leaf.label.length > 18 ? `${leaf.label.slice(0, 18)}…` : leaf.label}
        </Text>
      </Billboard>
    </group>
  );
}

function BrainScene({
  hubs,
  focusHubId,
  onFocusHub,
  onSelectLeaf,
  onBackground,
}: {
  hubs: BrainHub[];
  focusHubId: string | null;
  onFocusHub: (id: string | null) => void;
  onSelectLeaf: (leaf: BrainLeaf) => void;
  onBackground: () => void;
}) {
  const focusHub = hubs.find((h) => h.id === focusHubId) ?? null;

  return (
    <>
      <color attach="background" args={[BG]} />
      <fog attach="fog" args={[BG, 4.5, 9]} />
      <ambientLight intensity={0.28} />
      <pointLight position={[2, 2, 3]} intensity={1.05} color="#67e8f9" />
      <pointLight position={[-2, -1, -2]} intensity={0.45} color={GOLD} />

      <group
        scale={focusHub ? 0.55 : 1}
        position={focusHub ? [0, -0.15, 0] : [0, 0, 0]}
        onClick={(e) => {
          if (e.object.type === 'Points') onBackground();
        }}
      >
        <BrainParticleCloud count={4800} />
        {!focusHub &&
          hubs.map((hub) => (
            <HubNode
              key={hub.id}
              hub={hub}
              active={false}
              focused={false}
              onSelect={(id) => onFocusHub(id)}
            />
          ))}
      </group>

      {focusHub && (
        <group>
          <HubNode
            hub={{ ...focusHub, pos: [0, 0.15, 0] }}
            active
            focused
            onSelect={() => onFocusHub(null)}
          />
          {focusHub.leaves.slice(0, 14).map((leaf, i) => (
            <LeafNode
              key={leaf.id}
              leaf={leaf}
              index={i}
              total={Math.min(focusHub.leaves.length, 14)}
              color={focusHub.color}
              onSelect={onSelectLeaf}
            />
          ))}
        </group>
      )}

      <OrbitControls
        enablePan={false}
        minDistance={1.4}
        maxDistance={4.5}
        autoRotate={!focusHub}
        autoRotateSpeed={0.35}
        makeDefault
      />
    </>
  );
}

function placeHubsOnBrain(hubs: Omit<BrainHub, 'pos'>[]): BrainHub[] {
  const n = Math.max(hubs.length, 1);
  return hubs.map((h, i) => {
    const t = i / n;
    const hemi: -1 | 1 = i % 2 === 0 ? -1 : 1;
    const p = brainSurfacePoint(t, 0.35 + (i % 5) * 0.08, hemi);
    const scale = 1.05;
    return {
      ...h,
      pos: [p.x * scale, p.y * scale, p.z * scale] as [number, number, number],
    };
  });
}

export function NeuralMemorySystem() {
  const navigate = useNavigate();
  const [hubs, setHubs] = useState<BrainHub[]>([]);
  const [focusHubId, setFocusHubId] = useState<string | null>(null);
  const [selectedLeaf, setSelectedLeaf] = useState<BrainLeaf | null>(null);
  const [counts, setCounts] = useState({ global: 0, rag: 0, notes: 0, total: 0 });
  const notesRef = useRef<ObsidianNote[]>([]);
  const ragRef = useRef<RagMemory[]>([]);

  const rebuild = useCallback(() => {
    let mems: MemEntry[] = [];
    try {
      mems = JSON.parse(localStorage.getItem('axe_global_memory_cache') || '[]');
    } catch {
      /* */
    }

    let rag = ragRef.current;
    let notes = notesRef.current;
    if (!rag.length) {
      try {
        rag = JSON.parse(localStorage.getItem('axe_rag_memory') || '[]');
      } catch {
        /* */
      }
    }
    if (!notes.length) {
      try {
        notes = JSON.parse(localStorage.getItem('axe_obsidian_local_cache') || '[]');
      } catch {
        /* */
      }
    }

    setCounts({
      global: mems.length,
      rag: rag.length,
      notes: notes.length,
      total: mems.length + rag.length + notes.length,
    });

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
          let detail = '';
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

    raw.push({
      id: 'hub-rag',
      label: 'RAG facts',
      color: '#C4B5FD',
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
      color: '#67E8F9',
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
      try {
        const [notes, rag] = await Promise.all([
          listRecentObsidianNotes(50).catch(() => [] as ObsidianNote[]),
          loadRagMemories(undefined, 1, 80).catch(() => [] as RagMemory[]),
        ]);
        if (!alive) return;
        notesRef.current = notes;
        ragRef.current = rag;
        rebuild();
      } catch {
        rebuild();
      }
    };
    void load();
    const t = window.setInterval(() => void load(), 45_000);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, [rebuild]);

  const focusHub = hubs.find((h) => h.id === focusHubId) ?? null;

  const openLeaf = (leaf: BrainLeaf) => {
    setSelectedLeaf(leaf);
  };

  return (
    <div className="absolute inset-0" style={{ background: '#000000' }}>
      <Canvas
        camera={{ position: [0, 0.2, 2.6], fov: 42 }}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: false }}
        onCreated={({ gl }) => {
          gl.setClearColor('#000000', 1);
        }}
      >
        <Suspense fallback={null}>
          <BrainScene
            hubs={hubs}
            focusHubId={focusHubId}
            onFocusHub={(id) => {
              setFocusHubId(id);
              setSelectedLeaf(null);
            }}
            onSelectLeaf={openLeaf}
            onBackground={() => {
              setFocusHubId(null);
              setSelectedLeaf(null);
            }}
          />
        </Suspense>
      </Canvas>

      <div className="absolute top-4 left-4 z-10 pointer-events-none">
        <div className="text-[10px] font-mono tracking-[0.16em] uppercase" style={{ color: 'rgba(103,232,249,0.75)' }}>
          AXE · Global brain
        </div>
        <div className="text-[9px] mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>
          Drag to rotate · click cluster to go deeper
        </div>
      </div>

      {focusHubId && (
        <button
          type="button"
          onClick={() => {
            setFocusHubId(null);
            setSelectedLeaf(null);
          }}
          className="absolute top-4 left-1/2 -translate-x-1/2 z-10 text-[10px] tracking-[0.14em] uppercase px-3 py-1.5 rounded-full"
          style={{
            color: CREAM,
            background: 'rgba(0,0,0,0.7)',
            border: `1px solid ${GOLD}44`,
          }}
        >
          ← All layers
        </button>
      )}

      <div
        className="absolute bottom-3 left-4 text-[9px] font-mono tracking-wide pointer-events-none"
        style={{ color: 'rgba(255,255,255,0.3)' }}
      >
        {counts.total} nodes · {counts.global} global · {counts.rag} rag · {counts.notes} notes
      </div>

      <div
        className="absolute bottom-3 right-4 text-[9px] tracking-[0.12em] pointer-events-none"
        style={{ color: 'rgba(255,255,255,0.28)' }}
      >
        {focusHub ? focusHub.label.toUpperCase() : 'SUPER BRAIN'}
      </div>

      {counts.total === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center px-6">
            <div className="text-[13px] font-medium mb-1" style={{ color: 'rgba(232,197,71,0.55)' }}>
              Brain is empty
            </div>
            <div className="text-[11px]" style={{ color: 'rgba(255,255,255,0.28)' }}>
              Chat with AXE, save memories, or sync Obsidian notes.
            </div>
          </div>
        </div>
      )}

      {selectedLeaf && (
        <div
          className="absolute top-16 right-4 z-20 w-[min(320px,88vw)] rounded-xl p-4"
          style={{
            background: 'rgba(0,0,0,0.92)',
            border: `1px solid ${GOLD}33`,
            boxShadow: '0 12px 40px rgba(0,0,0,0.55)',
          }}
        >
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="text-[12px] font-semibold" style={{ color: CREAM }}>
              {selectedLeaf.label}
            </div>
            <button
              type="button"
              className="text-[10px]"
              style={{ color: 'rgba(255,255,255,0.4)' }}
              onClick={() => setSelectedLeaf(null)}
            >
              Close
            </button>
          </div>
          <p className="text-[11px] leading-relaxed mb-3" style={{ color: 'rgba(255,255,255,0.5)' }}>
            {selectedLeaf.detail || 'No detail'}
          </p>
          {selectedLeaf.href && (
            <button
              type="button"
              className="text-[11px] font-medium px-3 py-1.5 rounded-lg"
              style={{
                background: 'rgba(34,211,238,0.12)',
                color: '#67e8f9',
                border: '1px solid rgba(34,211,238,0.3)',
              }}
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
