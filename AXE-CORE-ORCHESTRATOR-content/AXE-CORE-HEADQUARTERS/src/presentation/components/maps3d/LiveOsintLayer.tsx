import { useEffect, useState } from 'react';
import { AdvancedMarker } from '@vis.gl/react-google-maps';
import { fetchUnifiedOsint, type LiveOsintPoint } from '@/infrastructure/gateways/osint';

/**
 * Live OSINT layer for the 3D map: real vessels (AIS), corporate jets (ADS-B),
 * earthquakes (USGS) and other geolocated intel from axe_api /osint/all,
 * plotted as markers styled per type. Refreshes on an interval. Capped so a
 * few hundred vessels can't tank the map — high-value points first.
 */

const MAX_MARKERS = 180;

type Style = { emoji: string; color: string; z: number };

function styleFor(p: LiveOsintPoint): Style {
  const src = (p.source || '').toLowerCase();
  if (src.includes('aisstream') || src.includes('vessel')) return { emoji: '🚢', color: 'var(--accent-cyan)', z: 3 };
  if (p.kind === 'flight' || src.includes('adsb')) return { emoji: '✈️', color: 'var(--warning)', z: 4 };
  if (p.kind === 'quake') return { emoji: '🔴', color: 'var(--error)', z: 5 };
  if (p.kind === 'disaster') return { emoji: '🔥', color: '#f97316', z: 2 };
  if (p.kind === 'threat') return { emoji: '⚠️', color: '#eab308', z: 2 };
  if (p.kind === 'news') return { emoji: '📰', color: '#94a3b8', z: 1 };
  return { emoji: '◆', color: '#8b5cf6', z: 1 };
}

/** Rank by importance so the cap keeps the interesting stuff (quakes, jets,
 *  vessels) over generic news dots. */
function rank(p: LiveOsintPoint): number {
  const s = styleFor(p);
  const mag = typeof p.magnitude === 'number' ? p.magnitude : 0;
  return s.z * 10 + mag;
}

export function LiveOsintLayer({ enabled, refreshMs = 60_000 }: { enabled: boolean; refreshMs?: number }) {
  const [points, setPoints] = useState<LiveOsintPoint[]>([]);

  useEffect(() => {
    // When disabled we simply render nothing (below) — no need to clear state
    // synchronously here (and doing so trips react-hooks/set-state-in-effect).
    if (!enabled) return;
    let cancelled = false;
    const load = () => {
      fetchUnifiedOsint().then(r => {
        if (cancelled) return;
        const top = [...(r.points ?? [])]
          .filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lon))
          .sort((a, b) => rank(b) - rank(a))
          .slice(0, MAX_MARKERS);
        setPoints(top);
      }).catch(() => { /* never let a fetch error bubble into the map render */ });
    };
    load();
    const t = setInterval(load, refreshMs);
    return () => { cancelled = true; clearInterval(t); };
  }, [enabled, refreshMs]);

  if (!enabled) return null;

  return (
    <>
      {points.map(p => {
        const s = styleFor(p);
        const isQuake = p.kind === 'quake';
        const size = isQuake ? Math.max(18, Math.min(40, 12 + (p.magnitude ?? 3) * 4)) : 22;
        return (
          <AdvancedMarker
            key={p.id}
            position={{ lat: p.lat, lng: p.lon }}
            title={`${p.title}${p.magnitude != null ? ` · M${p.magnitude}` : ''} · ${p.source}`}
            zIndex={s.z}
          >
            <div
              className="flex items-center justify-center rounded-full"
              style={{
                width: size,
                height: size,
                fontSize: size * 0.6,
                lineHeight: 1,
                background: isQuake ? `${s.color}33` : 'rgba(3,4,6,0.75)',
                border: `1.5px solid ${s.color}`,
                boxShadow: `0 0 8px ${s.color}88`,
              }}
            >
              {s.emoji}
            </div>
          </AdvancedMarker>
        );
      })}
    </>
  );
}
