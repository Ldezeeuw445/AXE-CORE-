import { Suspense, lazy } from 'react';
import { motion } from 'framer-motion';

// Lazy-load the rich OSINTPanel — it bundles Google Maps 3D, Leaflet fallback,
// sector toggles, fleet tracking, live OSINT feeds, etc.
const OSINTPanel = lazy(() => import('@/components/maps3d/OSINTPanel'));

// Lightweight fallback while the heavy panel chunk loads
function MapsFallback() {
  return (
    <div className="h-full flex items-center justify-center" style={{ background: '#02060d' }}>
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: 'rgba(34,211,238,0.3)', borderTopColor: 'transparent' }} />
        <span className="text-xs-custom font-mono" style={{ color: 'var(--accent-cyan)' }}>Loading 3D Maps…</span>
      </div>
    </div>
  );
}

export default function Maps3D() {
  return (
    <motion.div className="h-full overflow-hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <Suspense fallback={<MapsFallback />}>
        <OSINTPanel />
      </Suspense>
    </motion.div>
  );
}
