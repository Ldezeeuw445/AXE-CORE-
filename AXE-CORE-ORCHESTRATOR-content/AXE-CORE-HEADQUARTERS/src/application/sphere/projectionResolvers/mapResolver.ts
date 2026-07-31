/**
 * mapResolver — application layer.
 * Resolves geo ProjectionPayload from FEATURED_CITIES + free-text intent.
 */
import type { ProjectionPayload } from '@/domain/sphere/projectionTypes';
import { FEATURED_CITIES } from '@/domain/maps3d/constants';
import { projectionFromResolved } from '@/application/sphere/sphereDirector';

const EXTRA: Array<{ name: string; lat: number; lng: number; label?: string }> = [
  { name: 'Rotterdam', lat: 51.9244, lng: 4.4777 },
  { name: 'New York', lat: 40.7128, lng: -74.006 },
  { name: 'Tokyo', lat: 35.6762, lng: 139.6503 },
  { name: 'Berlin', lat: 52.52, lng: 13.405 },
];

function allPlaces() {
  return [
    ...FEATURED_CITIES.map(c => ({ name: c.name, lat: c.lat, lng: c.lng, label: `${c.name}, ${c.country}` })),
    ...EXTRA.map(e => ({ ...e, label: e.label ?? e.name })),
  ];
}

export function resolveMap(query?: string): ProjectionPayload {
  const text = (query || '').trim();
  const places = allPlaces();

  // Explicit coordinates
  const coord = text.match(/(-?\d{1,3}\.\d+)\s*[,\s]\s*(-?\d{1,3}\.\d+)/);
  if (coord) {
    const lat = Number(coord[1]);
    const lng = Number(coord[2]);
    return projectionFromResolved({
      mode: 'map',
      title: 'Map',
      subtitle: `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
      text,
      data: { lat, lng, label: text.slice(0, 80) || 'Pinned location' },
      source: 'director',
    });
  }

  const hit = places.find(p => new RegExp(`\b${p.name.replace(/\s+/g, '\\s+')}\b`, 'i').test(text));
  if (hit) {
    return projectionFromResolved({
      mode: 'map',
      title: hit.name,
      subtitle: hit.label,
      text,
      data: { lat: hit.lat, lng: hit.lng, label: hit.label },
      source: 'director',
    });
  }

  // Default: Amsterdam (AXE home bias from FEATURED_CITIES)
  const amsterdam = places.find(p => p.name === 'Amsterdam')!;
  return projectionFromResolved({
    mode: 'map',
    title: 'Map',
    subtitle: amsterdam.label,
    text: text || undefined,
    data: { lat: amsterdam.lat, lng: amsterdam.lng, label: amsterdam.label },
    source: 'director',
  });
}

export function resolveMapFromCoords(
  lat: number,
  lng: number,
  label?: string,
): ProjectionPayload {
  return projectionFromResolved({
    mode: 'map',
    title: label || 'Map',
    subtitle: `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
    data: { lat, lng, label: label || 'Location' },
    source: 'tool',
  });
}
