import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Stars, Sphere, Html, Line } from '@react-three/drei';
import { WidgetCard } from '@/components/widgets/WidgetCard';
import { loadMaps3D } from '@/lib/googleMaps3DLoader';
import { fetchOsintData, type OsintKind, type OsintPoint } from '@/services/osintService';
import { AlertTriangle, Radar, Layers, X } from 'lucide-react';

type MapNode = {
  name: string;
  lat: number;
  lon: number;
  color: string;
  label: string;
};

const MAP_NODES: MapNode[] = [
  { name: 'AXE Core HQ', lat: 52.3676, lon: 4.9041, color: '#22d3ee', label: 'Orchestrator' },
  { name: 'Trading OS', lat: 51.9244, lon: 4.4777, color: '#f59e0b', label: 'Execution' },
  { name: 'AXE Companion', lat: 52.0907, lon: 5.1214, color: '#10b981', label: 'Mobile' },
  { name: 'CrewAI Bridge', lat: 37.7749, lon: -122.4194, color: '#8b5cf6', label: 'Launch Crew' },
  { name: 'OpenHands', lat: 40.7128, lon: -74.0060, color: '#06b6d4', label: 'Agent Bridge' },
];

const LAYER_META: Record<OsintKind, { label: string; color: string }> = {
  quake: { label: 'Earthquakes', color: '#ef4444' },
  flight: { label: 'Live flights', color: '#22d3ee' },
  news: { label: 'News / conflict', color: '#f59e0b' },
  disaster: { label: 'Disasters', color: '#eab308' },
};

const GOOGLE_MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? '';

function toVector(lat: number, lon: number, radius = 2.02) {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  const x = -(radius * Math.sin(phi) * Math.cos(theta));
  const z = radius * Math.sin(phi) * Math.sin(theta);
  const y = radius * Math.cos(phi);
  return [x, y, z] as [number, number, number];
}

function Globe() {
  const nodes = useMemo(() => MAP_NODES.map(node => ({ ...node, position: toVector(node.lat, node.lon) })), []);

  return (
    <group>
      <Sphere args={[2, 64, 64]} rotation={[0, -0.6, 0]}>
        <meshStandardMaterial color="#04111f" roughness={0.85} metalness={0.18} emissive="#091b2e" emissiveIntensity={0.25} />
      </Sphere>
      {nodes.map((node) => (
        <group key={node.name} position={node.position}>
          <mesh>
            <sphereGeometry args={[0.05, 16, 16]} />
            <meshStandardMaterial color={node.color} emissive={node.color} emissiveIntensity={0.9} />
          </mesh>
          <Html distanceFactor={8} position={[0.08, 0.08, 0]} center>
            <div className="pointer-events-none rounded-full px-2 py-0.5 text-[9px] font-mono" style={{ background: 'rgba(0,0,0,0.65)', color: node.color, border: `1px solid ${node.color}40` }}>
              {node.name}
            </div>
          </Html>
        </group>
      ))}
      <Line points={[toVector(52.3676, 4.9041), toVector(51.9244, 4.4777)]} color="#22d3ee" lineWidth={1} dashed />
      <Line points={[toVector(52.0907, 5.1214), toVector(37.7749, -122.4194)]} color="#10b981" lineWidth={1} dashed />
      <Line points={[toVector(40.7128, -74.0060), toVector(37.7749, -122.4194)]} color="#8b5cf6" lineWidth={1} dashed />
    </group>
  );
}

function FallbackGlobe({ reason }: { reason: string | null }) {
  return (
    <div className="h-full flex flex-col">
      {reason && (
        <div className="flex items-start gap-2 px-3 py-2 text-[10px] flex-shrink-0" style={{ background: 'rgba(245,158,11,0.08)', color: '#f59e0b', borderBottom: '1px solid rgba(245,158,11,0.18)' }}>
          <AlertTriangle size={12} className="flex-shrink-0 mt-0.5" />
          <span>{reason}</span>
        </div>
      )}
      <div className="flex-1 min-h-0" style={{ background: 'radial-gradient(circle at top, rgba(34,211,238,0.1), transparent 50%), #02060d' }}>
        <Canvas camera={{ position: [0, 0, 5.7], fov: 45 }}>
          <Suspense fallback={null}>
            <ambientLight intensity={0.45} />
            <directionalLight position={[4, 3, 5]} intensity={1.2} />
            <pointLight position={[-4, -3, -5]} intensity={0.5} color="#22d3ee" />
            <Stars radius={80} depth={20} count={2000} factor={3} saturation={0} fade speed={1} />
            <Globe />
            <OrbitControls enablePan={false} minDistance={3.8} maxDistance={8} autoRotate autoRotateSpeed={0.45} />
          </Suspense>
        </Canvas>
      </div>
    </div>
  );
}

/**
 * Real photorealistic 3D earth (Google's `maps3d` alpha library) with live
 * OSINT markers layered on top. Falls back to the free Three.js globe if the
 * Google Cloud project behind the API key doesn't have the Maps JavaScript
 * API + Map Tiles API enabled with billing.
 */
function PhotorealisticEarth({ points, activeLayers }: { points: OsintPoint[]; activeLayers: Set<OsintKind> }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapElRef = useRef<(HTMLElement & Record<string, unknown>) | null>(null);
  const markerElsRef = useRef<HTMLElement[]>([]);
  const [MarkerCtor, setMarkerCtor] = useState<(new (opts?: Record<string, unknown>) => HTMLElement) | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { Map3DElement, Marker3DElement } = await loadMaps3D(GOOGLE_MAPS_KEY);
        if (cancelled || !containerRef.current) return;
        const mapEl = new Map3DElement({
          center: { lat: 30, lng: 10, altitude: 0 },
          range: 18_000_000,
          tilt: 35,
        });
        containerRef.current.innerHTML = '';
        containerRef.current.appendChild(mapEl);
        mapElRef.current = mapEl;
        setMarkerCtor(() => Marker3DElement as new (opts?: Record<string, unknown>) => HTMLElement);
      } catch {
        // Parent handles the fallback banner via the `failed` callback below.
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-render markers whenever the point set or active layers change.
  useEffect(() => {
    const mapEl = mapElRef.current;
    if (!mapEl || !MarkerCtor) return;

    markerElsRef.current.forEach(el => el.remove());
    markerElsRef.current = [];

    const visible = points.filter(p => activeLayers.has(p.kind));
    // Cap flight markers — hundreds of live DOM 3D markers is a real perf cost.
    const flights = visible.filter(p => p.kind === 'flight').slice(0, 150);
    const rest = visible.filter(p => p.kind !== 'flight');

    for (const p of [...rest, ...flights]) {
      try {
        const marker = new MarkerCtor({
          position: { lat: p.lat, lng: p.lon, altitude: 0 },
          label: p.title,
        });
        mapEl.appendChild(marker);
        markerElsRef.current.push(marker);
      } catch { /* skip malformed point */ }
    }

    for (const node of MAP_NODES) {
      try {
        const marker = new MarkerCtor({ position: { lat: node.lat, lng: node.lon, altitude: 0 }, label: node.name });
        mapEl.appendChild(marker);
        markerElsRef.current.push(marker);
      } catch { /* ignore */ }
    }
  }, [points, activeLayers, MarkerCtor]);

  return <div ref={containerRef} className="h-full w-full" />;
}

export default function Maps3D() {
  const [mode, setMode] = useState<'loading' | 'photoreal' | 'fallback'>('loading');
  const [fallbackReason, setFallbackReason] = useState<string | null>(null);
  const [points, setPoints] = useState<OsintPoint[]>([]);
  const [feedErrors, setFeedErrors] = useState<Record<string, string | null>>({});
  const [activeLayers, setActiveLayers] = useState<Set<OsintKind>>(new Set(['quake', 'flight', 'news', 'disaster']));

  // Probe whether photorealistic 3D tiles will actually load before committing
  // the whole layout to it.
  useEffect(() => {
    if (!GOOGLE_MAPS_KEY) {
      setMode('fallback');
      setFallbackReason('No Google Maps API key configured — showing the free 3D globe instead.');
      return;
    }
    let cancelled = false;
    void loadMaps3D(GOOGLE_MAPS_KEY)
      .then(() => { if (!cancelled) setMode('photoreal'); })
      .catch((err: Error) => {
        if (cancelled) return;
        setMode('fallback');
        setFallbackReason(
          `Photorealistic 3D Earth unavailable (${err.message}). Enable "Maps JavaScript API" and ` +
          `"Map Tiles API" with billing on the Google Cloud project behind your API key — showing the free 3D globe for now.`
        );
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const { points: pts, errors } = await fetchOsintData();
        if (!cancelled) { setPoints(pts); setFeedErrors(errors); }
      } catch { /* keep last known points on transient failure */ }
    };
    void poll();
    const id = setInterval(poll, 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const toggleLayer = (kind: OsintKind) => {
    setActiveLayers(prev => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind); else next.add(kind);
      return next;
    });
  };

  const counts = useMemo(() => {
    const c: Record<OsintKind, number> = { quake: 0, flight: 0, news: 0, disaster: 0 };
    for (const p of points) c[p.kind]++;
    return c;
  }, [points]);

  const [panelOpen, setPanelOpen] = useState(true);

  return (
    <motion.div className="h-full flex flex-col overflow-hidden p-4 sm:p-5 gap-3" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      {/* Header — fixed height strip at the top */}
      <div className="flex items-center justify-between gap-3 flex-shrink-0 flex-wrap">
        <div>
          <h1 className="text-page-title font-semibold" style={{ color: 'var(--text-primary)' }}>AXE Earth</h1>
          <p className="text-xs-custom" style={{ color: 'var(--text-muted)' }}>
            {mode === 'photoreal' ? 'Live photorealistic 3D globe with OSINT layers.' : 'Free 3D globe with OSINT layers.'}
          </p>
        </div>
        <div className="text-[10px] px-2 py-1 rounded-full flex items-center gap-1" style={{ background: 'rgba(34,211,238,0.08)', color: 'var(--accent-cyan)', border: '1px solid rgba(34,211,238,0.18)' }}>
          <Radar size={10} /> {mode === 'photoreal' ? 'Google Photorealistic 3D Tiles' : 'Three.js fallback'}
        </div>
      </div>

      {/* Globe fills all remaining height; controls float over it */}
      <div className="flex-1 min-h-0 relative rounded-xl overflow-hidden" style={{ background: '#02060d' }}>

        {/* Globe */}
        {mode === 'loading' && (
          <div className="h-full flex items-center justify-center text-[11px]" style={{ color: 'var(--text-muted)' }}>
            Connecting to Google Earth…
          </div>
        )}
        {mode === 'photoreal' && <PhotorealisticEarth points={points} activeLayers={activeLayers} />}
        {mode === 'fallback' && <FallbackGlobe reason={fallbackReason} />}

        {/* Toggle button — always visible, top-right corner */}
        <button
          onClick={() => setPanelOpen(v => !v)}
          className="absolute top-3 right-3 z-20 flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[10px] font-medium transition-all"
          style={{
            background: panelOpen ? 'rgba(34,211,238,0.15)' : 'rgba(0,0,0,0.55)',
            border: `1px solid ${panelOpen ? 'rgba(34,211,238,0.4)' : 'rgba(255,255,255,0.12)'}`,
            color: panelOpen ? 'var(--accent-cyan)' : 'rgba(255,255,255,0.6)',
            backdropFilter: 'blur(6px)',
          }}
          title={panelOpen ? 'Hide controls' : 'Show controls'}
        >
          {panelOpen ? <X size={11} /> : <Layers size={11} />}
          {panelOpen ? 'Hide' : 'Controls'}
        </button>

        {/* Floating controls panel */}
        <AnimatePresence>
          {panelOpen && (
            <motion.div
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 24 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              className="absolute top-12 right-3 z-10 w-56 space-y-3 overflow-y-auto"
              style={{ maxHeight: 'calc(100% - 4rem)' }}
            >
              {/* OSINT Layers */}
              <div className="rounded-xl p-3 space-y-1.5" style={{ background: 'rgba(2,6,13,0.82)', border: '1px solid rgba(34,211,238,0.14)', backdropFilter: 'blur(8px)' }}>
                <p className="text-[9px] font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>OSINT Layers</p>
                {(Object.keys(LAYER_META) as OsintKind[]).map(kind => (
                  <button
                    key={kind}
                    onClick={() => toggleLayer(kind)}
                    className="w-full flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 transition-opacity"
                    style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${LAYER_META[kind].color}33`, opacity: activeLayers.has(kind) ? 1 : 0.4 }}
                  >
                    <div className="flex items-center gap-2">
                      <span className="rounded-full flex-shrink-0" style={{ width: 7, height: 7, background: LAYER_META[kind].color, boxShadow: activeLayers.has(kind) ? `0 0 6px ${LAYER_META[kind].color}` : 'none' }} />
                      <span className="text-[10px] font-medium" style={{ color: 'var(--text-primary)' }}>{LAYER_META[kind].label}</span>
                    </div>
                    <span className="text-[9px] font-mono" style={{ color: 'var(--text-muted)' }}>{counts[kind]}</span>
                  </button>
                ))}
                {Object.values(feedErrors).some(Boolean) && (
                  <p className="text-[8px] mt-1" style={{ color: '#f59e0b' }}>Some feeds unavailable — showing cached data.</p>
                )}
              </div>

              {/* Live Nodes */}
              <div className="rounded-xl p-3 space-y-2" style={{ background: 'rgba(2,6,13,0.82)', border: '1px solid rgba(34,211,238,0.14)', backdropFilter: 'blur(8px)' }}>
                <p className="text-[9px] font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>Live Nodes</p>
                {MAP_NODES.map(node => (
                  <div key={node.name} className="rounded-lg px-2.5 py-1.5" style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${node.color}22` }}>
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="text-[10px] font-medium leading-tight" style={{ color: 'var(--text-primary)' }}>{node.name}</div>
                        <div className="text-[8px]" style={{ color: 'var(--text-muted)' }}>{node.label}</div>
                      </div>
                      <div className="rounded-full flex-shrink-0" style={{ width: 7, height: 7, background: node.color, boxShadow: `0 0 6px ${node.color}` }} />
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
