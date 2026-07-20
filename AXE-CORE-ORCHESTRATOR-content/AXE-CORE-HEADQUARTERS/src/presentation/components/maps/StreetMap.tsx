import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

type OSINTMarker = {
  id: string;
  lat: number;
  lon: number;
  type: 'aircraft' | 'vessel' | 'jet' | 'tsunami' | 'earthquake' | 'mudslide' | 'seismic' | 'warzone' | 'drone' | 'submarine';
  label: string;
  severity?: 'low' | 'medium' | 'high' | 'critical';
};

/* Demo OSINT data — later from Supabase */
const DEMO_MARKERS: OSINTMarker[] = [
  { id: '1', lat: 52.3676, lon: 4.9041, type: 'aircraft', label: 'AXE-001', severity: 'medium' },
  { id: '2', lat: 51.9244, lon: 4.4777, type: 'vessel', label: 'MV-Rotterdam', severity: 'low' },
  { id: '3', lat: 37.7749, lon: -122.4194, type: 'jet', label: 'F-35', severity: 'high' },
  { id: '4', lat: 35.6762, lon: 139.6503, type: 'earthquake', label: 'M5.2 Tokyo', severity: 'medium' },
  { id: '5', lat: -33.8688, lon: 151.2093, type: 'vessel', label: 'HMAS Sydney', severity: 'low' },
  { id: '6', lat: 40.7128, lon: -74.0060, type: 'aircraft', label: 'UAL-247', severity: 'low' },
  { id: '7', lat: 51.5074, lon: -0.1278, type: 'drone', label: 'MQ-9', severity: 'high' },
  { id: '8', lat: 55.7558, lon: 37.6173, type: 'submarine', label: 'K-329', severity: 'critical' },
  { id: '9', lat: 19.4326, lon: -99.1332, type: 'seismic', label: 'Seismic Alert', severity: 'medium' },
  { id: '10', lat: 28.6139, lon: 77.2090, type: 'warzone', label: 'Conflict Zone', severity: 'critical' },
  { id: '11', lat: 1.3521, lon: 103.8198, type: 'vessel', label: 'MV-Pacific', severity: 'low' },
  { id: '12', lat: -23.5505, lon: -46.6333, type: 'aircraft', label: 'GOL-888', severity: 'low' },
];

const SEVERITY_COLORS = {
  low: '#10b981',
  medium: '#f59e0b',
  high: '#ef4444',
  critical: '#dc2626',
};

const TYPE_EMOJI: Record<string, string> = {
  aircraft: '✈️',
  vessel: '🚢',
  jet: '🛩️',
  tsunami: '🌊',
  earthquake: '🌋',
  mudslide: '⛰️',
  seismic: '📡',
  warzone: '⚠️',
  drone: '🚁',
  submarine: '🔱',
};

function createPulsingMarker(type: string, severity: string) {
  const el = document.createElement('div');
  el.className = 'osint-marker';
  const color = SEVERITY_COLORS[severity as keyof typeof SEVERITY_COLORS] || '#22d3ee';
  const emoji = TYPE_EMOJI[type] || '📍';

  el.innerHTML = `
    <div style="
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      font-size: 16px;
      cursor: pointer;
      filter: drop-shadow(0 0 6px ${color});
      animation: osintPulse 2s ease-in-out infinite;
    ">
      <div style="
        position: absolute;
        width: 100%;
        height: 100%;
        border-radius: 50%;
        border: 2px solid ${color};
        opacity: 0.6;
        animation: osintRing 2s ease-out infinite;
      "></div>
      ${emoji}
    </div>
    <style>
      @keyframes osintPulse {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.15); }
      }
      @keyframes osintRing {
        0% { transform: scale(0.8); opacity: 0.8; }
        100% { transform: scale(2); opacity: 0; }
      }
    </style>
  `;

  return el;
}

export default function StreetMap() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    /* Use a dark vector tile style — free CartoDB Dark Matter via XYZ */
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
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
          },
        },
        layers: [
          {
            id: 'carto-dark-layer',
            type: 'raster',
            source: 'carto-dark',
            minzoom: 0,
            maxzoom: 22,
          },
        ],
      },
      center: [4.9041, 52.3676],
      zoom: 2,
      pitch: 60,
      bearing: -20,
      attributionControl: false,
    });

    mapRef.current = map;

    // Add navigation controls
    map.addControl(
      new maplibregl.NavigationControl({
        visualizePitch: true,
      }),
      'bottom-right'
    );

    // Add scale
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');

    // Add OSINT markers when map loads
    map.on('load', () => {
      // Add 3D building layer if we have OSM building data available
      // For now we add a simple extrusion effect using the dark style's building data
      // Note: Carto tiles don't include building vector data, so we add decorative 3D blocks manually

      DEMO_MARKERS.forEach((marker) => {
        const el = createPulsingMarker(marker.type, marker.severity || 'low');

        const popup = new maplibregl.Popup({
          offset: 25,
          closeButton: false,
          className: 'osint-popup',
        }).setHTML(`
          <div style="
            background: rgba(2,6,13,0.95);
            border: 1px solid rgba(34,211,238,0.3);
            border-radius: 8px;
            padding: 8px 12px;
            color: #22d3ee;
            font-family: monospace;
            font-size: 11px;
            min-width: 120px;
          ">
            <div style="font-weight: bold; margin-bottom: 4px; color: #fff;">${marker.label}</div>
            <div>Type: ${marker.type}</div>
            <div>Severity: <span style="color: ${SEVERITY_COLORS[marker.severity as keyof typeof SEVERITY_COLORS]}">${marker.severity?.toUpperCase()}</span></div>
            <div style="margin-top: 4px; opacity: 0.6;">${marker.lat.toFixed(4)}, ${marker.lon.toFixed(4)}</div>
          </div>
        `);

        new maplibregl.Marker({ element: el, anchor: 'center' })
          .setLngLat([marker.lon, marker.lat])
          .setPopup(popup)
          .addTo(map);
      });

      // Add a rotating camera animation
      let bearing = -20;
      const rotateCamera = () => {
        bearing = (bearing + 0.1) % 360;
        if (mapRef.current) {
          mapRef.current.setBearing(bearing);
        }
        requestAnimationFrame(rotateCamera);
      };
      // Start slow rotation after 3 seconds
      setTimeout(() => {
        rotateCamera();
      }, 3000);
    });

    return () => {
      map.remove();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        borderRadius: '12px',
        overflow: 'hidden',
      }}
    />
  );
}
