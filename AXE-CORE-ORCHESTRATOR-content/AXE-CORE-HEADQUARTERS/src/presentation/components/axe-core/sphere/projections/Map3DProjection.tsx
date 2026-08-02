import { useEffect, useRef, useState } from 'react';
import { APIProvider, useMapsLibrary } from '@vis.gl/react-google-maps';
import type { ProjectionPayload } from '@/domain/sphere/projectionTypes';

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? '';
const MAP_ID = import.meta.env.VITE_GOOGLE_MAPS_MAP_ID ?? '';

// 2026-08-02: key + Map ID are both present, but Photorealistic 3D Tiles
// still fails to render — same failure on the pre-existing standalone
// /maps-3d page's own 3D toggle, confirming this isn't specific to this
// component. Most likely cause per Google's own docs: 3D Tiles need
// active billing on the Cloud project, not just the two credentials.
// Key+Map-ID presence is therefore not a reliable "3D will actually work"
// signal — auto-switching Home's sphere portal to it broke the one thing
// that has to stay reliable (AXE actually showing something when asked).
// Hard-disabled until 3D is confirmed working on /maps-3d first; flip
// back to `Boolean(API_KEY) && Boolean(MAP_ID)` once it is.
export function hasGoogle3DMaps(): boolean {
  return false;
}

function Maps3DInitializer({ onReady }: { onReady: () => void }) {
  const lib = useMapsLibrary('maps3d');
  useEffect(() => { if (lib) onReady(); }, [lib, onReady]);
  return null;
}

/**
 * Real Google Photorealistic 3D Tiles inside the sphere portal — same
 * <gmp-map-3d> web component the standalone Maps3D page uses (see
 * MapsViewer.tsx), but stripped down to just camera + label: no heatmap/
 * OSINT/city-config baggage, since this only ever shows one place at a
 * time inside a small circular portal.
 *
 * A new payload.id remounts this (SphereStage keys the portal on it), so
 * "move to the Empire State Building" after "show me New York" is a fresh
 * fly-in rather than a continuous pan — correct location either way, just
 * not a smoothed camera move between them.
 */
export function Map3DProjection({ payload }: { payload: ProjectionPayload }) {
  const lat = Number(payload.data?.lat ?? 52.3676);
  const lng = Number(payload.data?.lng ?? 4.9041);
  const label = String(payload.data?.label ?? payload.title ?? 'Location');
  const [ready, setReady] = useState(false);
  const elRef = useRef<google.maps.maps3d.Map3DElement | null>(null);

  useEffect(() => {
    customElements.whenDefined('gmp-map-3d').then(() => setReady(true)).catch(() => {});
    const t = setTimeout(() => setReady(true), 3000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const el = elRef.current;
    if (!el || !ready) return;
    try {
      el.center = { lat, lng, altitude: 120 };
      // A tighter range + steep tilt reads as "looking down at a real
      // place" rather than a flat top-down map — matches the ask for a
      // genuinely 3D, not just zoomed-in, view.
      el.range = 900;
      el.tilt = 62;
      el.heading = 15;
    } catch { /* element not fully upgraded yet — next render retries */ }
  }, [lat, lng, ready]);

  return (
    <div className="h-full w-full relative overflow-hidden bg-black">
      {ready ? (
        <gmp-map-3d
          ref={elRef}
          center={`${lat},${lng},120`}
          range={900}
          tilt={62}
          heading={15}
          mode="HYBRID"
          style={{ width: '100%', height: '100%' }}
        />
      ) : (
        <div className="h-full w-full flex items-center justify-center">
          <div className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: 'rgba(167,139,250,0.6)', borderTopColor: 'transparent' }} />
        </div>
      )}

      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.55), transparent 30%)' }}
      />
      <div className="absolute bottom-[10%] left-1/2 -translate-x-1/2 text-center px-3 pointer-events-none">
        <div className="text-[18px] font-semibold tracking-wide" style={{ color: '#f5f0e6', textShadow: '0 1px 8px rgba(0,0,0,0.8)' }}>
          {payload.title}
        </div>
        <div className="text-[10px] mt-1 truncate max-w-[320px]" style={{ color: 'rgba(255,255,255,0.55)' }}>
          {label}
        </div>
      </div>
    </div>
  );
}

/** Wraps Map3DProjection with the API provider it needs — SphereStage
 *  renders this instead of the plain component so <APIProvider> only
 *  ever mounts when a map is actually being shown. */
export function Map3DProjectionRoot({ payload }: { payload: ProjectionPayload }) {
  const [libReady, setLibReady] = useState(false);
  return (
    <APIProvider apiKey={API_KEY} version="weekly" libraries={['maps3d']}>
      <Maps3DInitializer onReady={() => setLibReady(true)} />
      {libReady ? <Map3DProjection payload={payload} /> : (
        <div className="h-full w-full flex items-center justify-center bg-black">
          <div className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: 'rgba(167,139,250,0.6)', borderTopColor: 'transparent' }} />
        </div>
      )}
    </APIProvider>
  );
}
