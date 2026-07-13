import { Suspense, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Stars, Sphere, Html, Line } from '@react-three/drei';
import { WidgetCard } from '@/components/widgets/WidgetCard';

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

export default function Maps3D() {
  return (
    <motion.div className="h-full overflow-hidden p-4 sm:p-5" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
        <div>
          <h1 className="text-page-title font-semibold" style={{ color: 'var(--text-primary)' }}>3D Maps</h1>
          <p className="text-xs-custom" style={{ color: 'var(--text-muted)' }}>
            Free, interactive 3D globe view for AXE CORE integrations and locations.
          </p>
        </div>
        <div className="text-[10px] px-2 py-1 rounded-full" style={{ background: 'rgba(34,211,238,0.08)', color: 'var(--accent-cyan)', border: '1px solid rgba(34,211,238,0.18)' }}>
          No map API key required
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.6fr_0.8fr] gap-4 xl:h-[calc(100%-64px)] min-h-0">
        <WidgetCard title="AXE Earth">
          <div className="h-[48vh] sm:h-[60vh] md:h-[72vh] min-h-[320px] md:min-h-[520px] rounded-xl overflow-hidden" style={{ background: 'radial-gradient(circle at top, rgba(34,211,238,0.1), transparent 50%), #02060d' }}>
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
        </WidgetCard>

        <div className="space-y-4">
          <WidgetCard title="Live Nodes">
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

          <WidgetCard title="How to use">
            <ul className="space-y-2 text-xs-custom" style={{ color: 'var(--text-muted)' }}>
              <li>• Drag to rotate the globe.</li>
              <li>• This is the free 3D fallback when you do not want a paid Google Maps 3D setup.</li>
              <li>• I can wire live geo-points from Supabase next if you want actual location feeds instead of the fixed control nodes.</li>
            </ul>
          </WidgetCard>
        </div>
      </div>
    </motion.div>
  );
}
