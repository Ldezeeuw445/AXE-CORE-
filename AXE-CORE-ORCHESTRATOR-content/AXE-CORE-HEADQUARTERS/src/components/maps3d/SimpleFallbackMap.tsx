import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

export default function SimpleFallbackMap() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!mapContainer.current) return;

    try {
      const map = new maplibregl.Map({
        container: mapContainer.current,
        style: 'https://demotiles.maplibre.org/style.json',
        center: [4.9, 52.4], // Amsterdam
        zoom: 3,
        attributionControl: false,
      });

      map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

      return () => map.remove();
    } catch (e) {
      setError('Map failed to load. Please check your connection.');
      return undefined;
    }
  }, []);

  if (error) {
    return (
      <div className="h-full flex items-center justify-center bg-black">
        <div className="text-center space-y-2">
          <div className="text-sm text-amber-400">Map Unavailable</div>
          <div className="text-xs text-slate-500">{error}</div>
        </div>
      </div>
    );
  }

  return <div ref={mapContainer} className="h-full w-full" />;
}
