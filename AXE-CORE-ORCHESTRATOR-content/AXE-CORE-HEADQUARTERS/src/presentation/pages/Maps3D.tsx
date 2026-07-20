import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import SimpleFallbackMap from '@/presentation/components/maps3d/SimpleFallbackMap';

function MapsContent() {
  const [useFallback, setUseFallback] = useState(false);

  useEffect(() => {
    // Check if Google Maps 3D is available
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
    const mapId = import.meta.env.VITE_GOOGLE_MAPS_MAP_ID;
    
    if (!apiKey || apiKey === 'your_api_key_here' || !mapId || mapId === 'your_map_id_here') {
      setUseFallback(true);
      return;
    }

    // Try to load Google Maps script
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=marker&v=beta`;
    script.async = true;
    script.onerror = () => setUseFallback(true);
    
    // Timeout after 5 seconds
    const timeout = setTimeout(() => setUseFallback(true), 5000);
    
    document.head.appendChild(script);
    
    return () => {
      clearTimeout(timeout);
      document.head.removeChild(script);
    };
  }, []);

  if (useFallback) {
    return <SimpleFallbackMap />;
  }

  // Try to load OSINTPanel (lazy)
  const OSINTPanel = React.lazy(() => import('@/presentation/components/maps3d/OSINTPanel'));
  
  return (
    <React.Suspense fallback={
      <div className="h-full flex items-center justify-center" style={{ background: '#02060d' }}>
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: 'rgba(34,211,238,0.3)', borderTopColor: 'transparent' }} />
          <span className="text-xs-custom font-mono" style={{ color: 'var(--accent-cyan)' }}>Loading 3D Maps…</span>
        </div>
      </div>
    }>
      <OSINTPanel />
    </React.Suspense>
  );
}

import React from 'react';

export default function Maps3D() {
  return (
    <motion.div className="h-full overflow-hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <MapsContent />
    </motion.div>
  );
}
