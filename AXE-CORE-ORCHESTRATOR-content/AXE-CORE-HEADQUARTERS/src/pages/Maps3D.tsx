import { Suspense, useMemo, useRef, useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Stars, Sphere, Html, Line } from '@react-three/drei';
import { WidgetCard } from '@/components/widgets/WidgetCard';
import * as THREE from 'three';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { fetchUnifiedOsint, type LiveOsintPoint } from '@/services/osint';

type MapMode = 'satellite' | 'dark' | 'streets';

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

function toVector(lat: number, lon: number, radius = 2.02) {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  const x = -(radius * Math.sin(phi) * Math.cos(theta));
  const z = radius * Math.sin(phi) * Math.sin(theta);
  const y = radius * Math.cos(phi);
  return [x, y, z] as [number, number, number];
}

/* ─── CONTINENT DATA ─── */
const CONTINENTS = [
  [[70,-165],[75,-140],[72,-100],[60,-80],[50,-60],[45,-55],[40,-50],[35,-60],[30,-80],[25,-95],[30,-105],[35,-120],[40,-125],[45,-130],[50,-130],[55,-135],[60,-140],[65,-150],[70,-165]],
  [[10,-80],[5,-60],[0,-50],[-5,-35],[-10,-35],[-15,-40],[-20,-45],[-25,-50],[-30,-55],[-35,-55],[-40,-65],[-45,-70],[-50,-75],[-55,-70],[-50,-60],[-45,-65],[-40,-60],[-35,-55],[-30,-50],[-20,-40],[-10,-50],[0,-60],[5,-70],[10,-80]],
  [[70,-25],[75,10],[70,30],[65,40],[60,30],[55,20],[50,0],[45,-5],[40,0],[35,10],[40,20],[45,30],[50,40],[55,50],[60,60],[65,70],[70,80],[75,60],[70,-25]],
  [[35,-10],[30,0],[25,10],[20,15],[15,15],[10,10],[5,10],[0,10],[-5,10],[-10,15],[-15,20],[-20,25],[-25,30],[-30,30],[-35,25],[-30,15],[-25,15],[-20,10],[-15,10],[-10,0],[-5,-10],[0,-15],[5,-10],[10,-15],[15,-10],[20,-15],[25,-10],[30,-5],[35,-10]],
  [[70,60],[75,100],[70,140],[65,170],[60,180],[55,170],[50,160],[45,150],[40,140],[35,130],[30,120],[25,110],[20,105],[15,100],[10,95],[5,100],[0,105],[5,110],[10,115],[15,120],[20,115],[25,120],[30,115],[35,120],[40,125],[45,130],[50,135],[55,140],[60,145],[65,150],[70,140],[75,100],[70,60]],
  [[-10,110],[-15,120],[-20,130],[-25,140],[-30,145],[-35,140],[-40,145],[-45,140],[-40,130],[-35,125],[-30,120],[-25,115],[-20,110],[-15,115],[-10,110]],
];

function latLonToXY(lat: number, lon: number): [number, number] {
  const x = ((lon + 180) / 360) * 2048;
  const y = ((-lat + 90) / 180) * 1024;
  return [x, y];
}

/* ─── TEXTURE GENERATORS ─── */
function createSatelliteTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 2048; canvas.height = 1024;
  const ctx = canvas.getContext('2d')!;

  const oceanGrad = ctx.createLinearGradient(0, 0, 0, 1024);
  oceanGrad.addColorStop(0, '#0a1628');
  oceanGrad.addColorStop(0.5, '#081220');
  oceanGrad.addColorStop(1, '#0d1e33');
  ctx.fillStyle = oceanGrad;
  ctx.fillRect(0, 0, 2048, 1024);

  for (let i = 0; i < 8000; i++) {
    ctx.fillStyle = `rgba(20, 80, 120, ${Math.random() * 0.15})`;
    ctx.fillRect(Math.random() * 2048, Math.random() * 1024, 2, 1);
  }

  const landColors = [
    'rgba(34, 90, 40, 0.65)', 'rgba(28, 110, 35, 0.65)', 'rgba(100, 95, 50, 0.55)',
    'rgba(180, 140, 60, 0.6)', 'rgba(30, 85, 35, 0.65)', 'rgba(140, 120, 50, 0.55)',
  ];

  CONTINENTS.forEach((continent, idx) => {
    ctx.beginPath();
    continent.forEach(([lat, lon], i) => {
      const [x, y] = latLonToXY(lat, lon);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fillStyle = landColors[idx] || 'rgba(34, 90, 40, 0.65)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(80, 160, 100, 0.7)';
    ctx.lineWidth = 2;
    ctx.stroke();
  });

  // Clouds
  for (let i = 0; i < 150; i++) {
    const cx = Math.random() * 2048, cy = Math.random() * 1024, r = 20 + Math.random() * 60;
    const cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    cg.addColorStop(0, 'rgba(255, 255, 255, 0.12)');
    cg.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = cg;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  }

  // City lights
  const cities = [[52.3676,4.9041],[51.9244,4.4777],[52.0907,5.1214],[37.7749,-122.4194],[40.7128,-74.0060],[51.5074,-0.1278],[48.8566,2.3522],[35.6762,139.6503],[55.7558,37.6173],[39.9042,116.4074],[28.6139,77.2090],[1.3521,103.8198],[-33.8688,151.2093],[19.4326,-99.1332],[-23.5505,-46.6333]];
  cities.forEach(([lat, lon]) => {
    const [x, y] = latLonToXY(lat, lon);
    ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 200, 100, 0.9)'; ctx.fill();
    ctx.beginPath(); ctx.arc(x, y, 10, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 200, 100, 0.2)'; ctx.fill();
  });

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

function createDarkTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 2048; canvas.height = 1024;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#02060d';
  ctx.fillRect(0, 0, 2048, 1024);
  const grad = ctx.createLinearGradient(0, 0, 0, 1024);
  grad.addColorStop(0, '#04111f'); grad.addColorStop(0.5, '#02060d'); grad.addColorStop(1, '#061526');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 2048, 1024);

  ctx.strokeStyle = 'rgba(34, 211, 238, 0.04)'; ctx.lineWidth = 1;
  for (let i = 0; i <= 36; i++) { ctx.beginPath(); ctx.moveTo(i * (2048 / 36), 0); ctx.lineTo(i * (2048 / 36), 1024); ctx.stroke(); }
  for (let i = 0; i <= 18; i++) { ctx.beginPath(); ctx.moveTo(0, i * (1024 / 18)); ctx.lineTo(2048, i * (1024 / 18)); ctx.stroke(); }

  CONTINENTS.forEach(c => {
    ctx.beginPath();
    c.forEach(([lat, lon], i) => { const [x, y] = latLonToXY(lat, lon); if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
    ctx.closePath();
    ctx.fillStyle = 'rgba(6, 182, 212, 0.35)'; ctx.fill();
    ctx.strokeStyle = 'rgba(34, 211, 238, 0.6)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.shadowColor = 'rgba(34, 211, 238, 0.3)'; ctx.shadowBlur = 20; ctx.stroke(); ctx.shadowBlur = 0;
  });

  const cities = [[52.3676,4.9041],[51.9244,4.4777],[52.0907,5.1214],[37.7749,-122.4194],[40.7128,-74.0060],[51.5074,-0.1278],[48.8566,2.3522],[35.6762,139.6503],[55.7558,37.6173],[39.9042,116.4074],[28.6139,77.2090],[1.3521,103.8198],[-33.8688,151.2093],[19.4326,-99.1332],[-23.5505,-46.6333]];
  cities.forEach(([lat, lon]) => {
    const [x, y] = latLonToXY(lat, lon);
    ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(34, 211, 238, 0.8)'; ctx.fill();
    ctx.beginPath(); ctx.arc(x, y, 12, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(34, 211, 238, 0.15)'; ctx.fill();
  });

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

/* ─── OSINT MARKER HELPERS ─── */
const SEVERITY_COLORS: Record<string, string> = {
  critical: '#ef4444', warning: '#f59e0b', info: '#22d3ee',
};

const KIND_EMOJI: Record<string, string> = {
  quake: '🌋', flight: '✈️', news: '📰', disaster: '🔥', threat: '⚠️', intel: '📡',
};

function createOSINTMarkerEl(point: LiveOsintPoint): HTMLDivElement {
  const el = document.createElement('div');
  const color = SEVERITY_COLORS[point.severity] || '#22d3ee';
  const emoji = KIND_EMOJI[point.kind] || '📍';

  el.innerHTML = `
    <div style="position:relative;display:flex;align-items:center;justify-content:center;width:32px;height:32px;font-size:16px;cursor:pointer;filter:drop-shadow(0 0 6px ${color});animation:osintPulse 2s ease-in-out infinite;">
      <div style="position:absolute;width:100%;height:100%;border-radius:50%;border:2px solid ${color};opacity:0.6;animation:osintRing 2s ease-out infinite;"></div>
      ${emoji}
    </div>
    <style>
      @keyframes osintPulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.15)} }
      @keyframes osintRing { 0%{transform:scale(0.8);opacity:0.8} 100%{transform:scale(2);opacity:0} }
    </style>
  `;
  return el;
}

/* ─── GLOBE COMPONENT ─── */
function Atmosphere({ mode }: { mode: MapMode }) {
  const color = mode === 'satellite' ? '#67e8f9' : '#22d3ee';
  const opacity = mode === 'satellite' ? 0.12 : 0.08;
  return (
    <Sphere args={[2.15, 64, 64]}>
      <meshBasicMaterial color={color} transparent opacity={opacity} side={THREE.BackSide} blending={THREE.AdditiveBlending} depthWrite={false} />
    </Sphere>
  );
}

function Globe({ mode, osintPoints }: { mode: MapMode; osintPoints: LiveOsintPoint[] }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const texture = useMemo(() => mode === 'satellite' ? createSatelliteTexture() : createDarkTexture(), [mode]);

  useFrame((state) => {
    if (meshRef.current) meshRef.current.rotation.y = state.clock.elapsedTime * 0.05;
  });

  const nodes = useMemo(() => MAP_NODES.map(n => ({ ...n, position: toVector(n.lat, n.lon) })), []);

  const nodeColor = mode === 'satellite' ? '#fbbf24' : undefined;
  const lineColor = mode === 'satellite' ? '#67e8f9' : undefined;

  return (
    <group>
      <Sphere ref={meshRef} args={[2, 128, 128]} rotation={[0, -0.6, 0]}>
        <meshStandardMaterial map={texture} roughness={0.75} metalness={0.15} emissive={mode === 'satellite' ? '#0a1628' : '#091b2e'} emissiveIntensity={0.15} />
      </Sphere>
      <Atmosphere mode={mode} />
      <Sphere args={[2.08, 32, 32]}>
        <meshBasicMaterial color={mode === 'satellite' ? '#4f8a9e' : '#06b6d4'} wireframe transparent opacity={0.04} blending={THREE.AdditiveBlending} depthWrite={false} />
      </Sphere>

      {/* AXE Nodes */}
      {nodes.map(node => (
        <group key={node.name} position={node.position}>
          <mesh><sphereGeometry args={[0.06, 16, 16]} /><meshStandardMaterial color={nodeColor || node.color} emissive={nodeColor || node.color} emissiveIntensity={0.9} /></mesh>
          <mesh rotation={[Math.PI / 2, 0, 0]}><ringGeometry args={[0.08, 0.12, 32]} /><meshBasicMaterial color={nodeColor || node.color} transparent opacity={0.4} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} depthWrite={false} /></mesh>
          <Html distanceFactor={8} position={[0.08, 0.08, 0]} center>
            <div className="pointer-events-none rounded-full px-2 py-0.5 text-[9px] font-mono" style={{ background: mode === 'satellite' ? 'rgba(0,0,0,0.75)' : 'rgba(0,0,0,0.65)', color: nodeColor || node.color, border: `1px solid ${(nodeColor || node.color)}40` }}>{node.name}</div>
          </Html>
        </group>
      ))}

      {/* OSINT Points on Globe */}
      {osintPoints.slice(0, 20).map(pt => (
        <group key={pt.id} position={toVector(pt.lat, pt.lon, 2.05)}>
          <mesh><sphereGeometry args={[0.04, 8, 8]} />
            <meshStandardMaterial color={SEVERITY_COLORS[pt.severity] || '#22d3ee'} emissive={SEVERITY_COLORS[pt.severity] || '#22d3ee'} emissiveIntensity={1.2} />
          </mesh>
          <Html distanceFactor={10} position={[0.05, 0.05, 0]} center>
            <div className="pointer-events-none rounded px-1.5 py-0.5 text-[7px] font-mono" style={{ background: 'rgba(0,0,0,0.7)', color: SEVERITY_COLORS[pt.severity] || '#22d3ee', border: `1px solid ${SEVERITY_COLORS[pt.severity] || '#22d3ee'}30` }}>
              {KIND_EMOJI[pt.kind] || '●'} {pt.title.slice(0, 12)}
            </div>
          </Html>
        </group>
      ))}

      {/* Connection lines */}
      <Line points={[toVector(52.3676, 4.9041), toVector(51.9244, 4.4777)]} color={lineColor || '#22d3ee'} lineWidth={1} dashed />
      <Line points={[toVector(52.0907, 5.1214), toVector(37.7749, -122.4194)]} color={lineColor || '#10b981'} lineWidth={1} dashed />
      <Line points={[toVector(40.7128, -74.0060), toVector(37.7749, -122.4194)]} color={lineColor || '#8b5cf6'} lineWidth={1} dashed />
    </group>
  );
}

/* ─── STREET MAP COMPONENT ─── */
function StreetMap({ osintPoints }: { osintPoints: LiveOsintPoint[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const map = new maplibregl.Map({
      container,
      style: {
        version: 8,
        sources: {
          'carto-dark': {
            type: 'raster',
            tiles: [
              'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
              'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
              'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
            ],
            tileSize: 256,
            attribution: '&copy; OSM & CARTO',
          },
        },
        layers: [{ id: 'carto-dark-layer', type: 'raster', source: 'carto-dark', minzoom: 0, maxzoom: 22 }],
      },
      center: [4.9041, 52.3676],
      zoom: 2,
      pitch: 55,
      bearing: -20,
      attributionControl: false,
    });

    mapRef.current = map;

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');

    map.on('load', () => {
      let bearing = -20;
      const rotateCamera = () => {
        bearing = (bearing + 0.08) % 360;
        if (mapRef.current) mapRef.current.setBearing(bearing);
        requestAnimationFrame(rotateCamera);
      };
      setTimeout(() => rotateCamera(), 3000);
    });

    return () => { map.remove(); };
  }, []);

  // Update OSINT markers when points change
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;

    // Clear old markers
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    osintPoints.forEach(pt => {
      const el = createOSINTMarkerEl(pt);

      const popup = new maplibregl.Popup({ offset: 25, closeButton: false, className: 'osint-popup' }).setHTML(`
        <div style="background:rgba(2,6,13,0.95);border:1px solid rgba(34,211,238,0.3);border-radius:8px;padding:8px 12px;color:#22d3ee;font-family:monospace;font-size:11px;min-width:120px;">
          <div style="font-weight:bold;margin-bottom:4px;color:#fff;">${pt.title}</div>
          <div>Type: ${pt.kind}</div>
          <div>Severity: <span style="color:${SEVERITY_COLORS[pt.severity] || '#22d3ee'}">${pt.severity.toUpperCase()}</span></div>
          <div style="margin-top:4px;opacity:0.6;">${pt.lat.toFixed(4)}, ${pt.lon.toFixed(4)}</div>
        </div>
      `);

      const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat([pt.lon, pt.lat])
        .setPopup(popup)
        .addTo(map);

      markersRef.current.push(marker);
    });
  }, [osintPoints]);

  return <div ref={containerRef} style={{ width: '100%', height: '100%', borderRadius: '12px', overflow: 'hidden' }} />;
}

/* ─── MAIN PAGE ─── */
export default function Maps3D() {
  const [mode, setMode] = useState<MapMode>('satellite');
  const [osintPoints, setOsintPoints] = useState<LiveOsintPoint[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchOSINT = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchUnifiedOsint();
      setOsintPoints(result.points);
    } catch (e) {
      console.error('[Maps3D] OSINT fetch failed:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOSINT();
    const id = setInterval(fetchOSINT, 30000);
    return () => clearInterval(id);
  }, [fetchOSINT]);

  return (
    <motion.div className="h-full overflow-hidden p-4 sm:p-5" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
        <div>
          <h1 className="text-page-title font-semibold" style={{ color: 'var(--text-primary)' }}>3D Maps</h1>
          <p className="text-xs-custom" style={{ color: 'var(--text-muted)' }}>
            AXE CORE Global Surveillance — Live OSINT feeds, satellite tracking, and tactical overview.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* 3-Way Mode Toggle */}
          <div className="flex rounded-lg overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
            {[
              { key: 'satellite' as MapMode, label: '🛰️ Satellite', accent: '#67e8f9' },
              { key: 'dark' as MapMode, label: '🔒 Dark', accent: '#22d3ee' },
              { key: 'streets' as MapMode, label: '🗺️ Streets', accent: '#a78bfa' },
            ].map((m, idx) => (
              <button
                key={m.key}
                onClick={() => setMode(m.key)}
                className="px-3 py-1.5 text-[10px] font-mono font-semibold uppercase tracking-wider transition-all cursor-pointer"
                style={{
                  background: mode === m.key ? `${m.accent}30` : 'transparent',
                  color: mode === m.key ? m.accent : 'rgba(165,243,252,0.5)',
                  borderRight: idx < 2 ? '1px solid rgba(255,255,255,0.08)' : 'none',
                }}
              >
                {m.label}
              </button>
            ))}
          </div>

          {/* Live OSINT count badge */}
          <div className="text-[10px] px-2 py-1 rounded-full flex items-center gap-1.5" style={{ background: 'rgba(34,211,238,0.08)', color: 'var(--accent-cyan)', border: '1px solid rgba(34,211,238,0.18)' }}>
            <span className={`w-1.5 h-1.5 rounded-full ${loading ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'}`} />
            {osintPoints.length} LIVE
          </div>

          <button
            onClick={fetchOSINT}
            className="text-[10px] px-2 py-1 rounded-full font-mono uppercase tracking-wider cursor-pointer hover:opacity-80 transition-opacity"
            style={{ background: 'rgba(34,211,238,0.15)', color: '#22d3ee', border: '1px solid rgba(34,211,238,0.3)' }}
          >
            {loading ? '⟳' : '↻'} Refresh
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 xl:grid-cols-[1.6fr_0.8fr] gap-4 xl:h-[calc(100%-64px)] min-h-0">
        {/* Map/Globe Widget */}
        <WidgetCard title={mode === 'satellite' ? '🌍 AXE Satellite' : mode === 'dark' ? '🌑 AXE Dark Ops' : '🗺️ AXE Streets'}>
          <div className="h-[48vh] sm:h-[60vh] md:h-[72vh] min-h-[320px] md:min-h-[520px] rounded-xl overflow-hidden" style={{ background: 'radial-gradient(circle at top, rgba(34,211,238,0.1), transparent 50%), #02060d' }}>
            {mode === 'streets' ? (
              <StreetMap osintPoints={osintPoints} />
            ) : (
              <Canvas camera={{ position: [0, 0, 5.7], fov: 45 }}>
                <Suspense fallback={null}>
                  <ambientLight intensity={0.45} />
                  <directionalLight position={[4, 3, 5]} intensity={1.2} />
                  <pointLight position={[-4, -3, -5]} intensity={0.5} color={mode === 'satellite' ? '#67e8f9' : '#22d3ee'} />
                  <Stars radius={80} depth={20} count={2000} factor={3} saturation={0} fade speed={1} />
                  <Globe mode={mode} osintPoints={osintPoints} />
                  <OrbitControls enablePan={false} minDistance={3.8} maxDistance={8} autoRotate autoRotateSpeed={0.45} />
                </Suspense>
              </Canvas>
            )}
          </div>
        </WidgetCard>

        {/* Right Panel */}
        <div className="space-y-4">
          {/* Live OSINT Feed */}
          <WidgetCard title={`Live OSINT [${osintPoints.length}]`}>
            <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
              {osintPoints.slice(0, 12).map(pt => (
                <div key={pt.id} className="rounded-lg px-2.5 py-1.5 flex items-start gap-2" style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${SEVERITY_COLORS[pt.severity] || '#22d3ee'}18` }}>
                  <span className="text-sm shrink-0">{KIND_EMOJI[pt.kind] || '●'}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] font-mono font-medium truncate" style={{ color: 'var(--text-primary)' }}>{pt.title}</div>
                    <div className="flex items-center gap-1.5 text-[8px] font-mono" style={{ color: 'var(--text-muted)' }}>
                      <span style={{ color: SEVERITY_COLORS[pt.severity] || '#22d3ee' }}>{pt.severity.toUpperCase()}</span>
                      <span>·</span>
                      <span className="uppercase">{pt.source}</span>
                      <span>·</span>
                      <span>{pt.lat.toFixed(1)}°, {pt.lon.toFixed(1)}°</span>
                    </div>
                  </div>
                </div>
              ))}
              {osintPoints.length === 0 && (
                <div className="text-center py-4 text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>No live OSINT data — click Refresh</div>
              )}
            </div>
          </WidgetCard>

          {/* AXE Nodes */}
          <WidgetCard title="AXE Nodes">
            <div className="space-y-2">
              {MAP_NODES.map(node => (
                <div key={node.name} className="rounded-xl px-3 py-2" style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${node.color}22` }}>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-small font-medium" style={{ color: 'var(--text-primary)' }}>{node.name}</div>
                      <div className="text-xs-custom" style={{ color: 'var(--text-muted)' }}>{node.label}</div>
                    </div>
                    <div className="rounded-full" style={{ width: 8, height: 8, background: node.color, boxShadow: `0 0 8px ${node.color}` }} />
                  </div>
                </div>
              ))}
            </div>
          </WidgetCard>

          {/* How to use */}
          <WidgetCard title="Mode Guide">
            <ul className="space-y-1.5 text-xs-custom" style={{ color: 'var(--text-muted)' }}>
              <li>• <b>🛰️ Satellite</b> — Realistic procedural earth with live OSINT overlay.</li>
              <li>• <b>🔒 Dark</b> — Cyan surveillance globe. Tactical night-ops style.</li>
              <li>• <b>🗺️ Streets</b> — CartoDB street map with real roads, cities, OSINT markers.</li>
              <li>• Data auto-refreshes every 30s from live APIs.</li>
            </ul>
          </WidgetCard>
        </div>
      </div>
    </motion.div>
  );
}
