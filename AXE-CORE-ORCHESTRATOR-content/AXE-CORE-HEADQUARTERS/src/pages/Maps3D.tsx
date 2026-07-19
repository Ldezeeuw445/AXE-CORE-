import { Suspense, lazy, useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import SimpleFallbackMap from './SimpleFallbackMap';

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

// Error boundary wrapper
function MapsErrorBoundary({ children }: { children: React.ReactNode }) {
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    const handler = (e: ErrorEvent) => {
      if (e.message?.includes('Google') || e.message?.includes('map') || e.message?.includes('Map')) {
        setHasError(true);
      }
    };
    window.addEventListener('error', handler);
    return () => window.removeEventListener('error', handler);
  }, []);

  if (hasError) {
    return <SimpleFallbackMap />;
  }

  return <>{children}</>;
}

export default function Maps3D() {
  return (
    <motion.div className="h-full overflow-hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <MapsErrorBoundary>
        <Suspense fallback={<MapsFallback />}>
          <OSINTPanel />
        </Suspense>
      </MapsErrorBoundary>
    </motion.div>
  );
}
