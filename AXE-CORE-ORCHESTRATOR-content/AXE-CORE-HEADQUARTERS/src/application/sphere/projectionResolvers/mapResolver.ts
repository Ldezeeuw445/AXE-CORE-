/**
 * mapResolver — application layer.
 * Resolves geo from FEATURED_CITIES + free-text intent.
 */
import type { ProjectionPayload } from '@/domain/sphere/projectionTypes';
import { FEATURED_CITIES } from '@/domain/maps3d/constants';

const EXTRA: Array<{ name: string; lat: number; lng: number; label?: string }> = [
  { name: 'Rotterdam', lat: 51.9244, lng: 4.4777 },
  { name: 'Utrecht', lat: 52.0907, lng: 5.1214 },
  { name: 'Den Haag', lat: 52.0705, lng: 4.3007 },
  { name: 'New York', lat: 40.7128, lng: -74.006 },
  { name: 'Tokyo', lat: 35.6762, lng: 139.6503 },
  { name: 'Berlin', lat: 52.52, lng: 13.405 },
  { name: 'London', lat: 51.5074, lng: -0.1278 },
  { name: 'Paris', lat: 48.8566, lng: 2.3522 },
  { name: 'Dubai', lat: 25.2048, lng: 55.2708 },
  { name: 'Singapore', lat: 1.3521, lng: 103.8198 },
];

function id(): string {
  return `proj_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function pack(
  partial: Omit<ProjectionPayload, 'id' | 'createdAt'>,
): ProjectionPayload {
  return { ...partial, id: id(), createdAt: Date.now() };
}

function allPlaces() {
  return [
    ...FEATURED_CITIES.map(c => ({
      name: c.name,
      lat: c.lat,
      lng: c.lng,
      label: `${c.name}, ${c.country}`,
    })),
    ...EXTRA.map(e => ({ ...e, label: e.label ?? e.name })),
  ];
}

export function resolveMap(query?: string): ProjectionPayload {
  const text = (query || '').trim();
  const places = allPlaces();

  const coord = text.match(/(-?\d{1,3}\.\d+)\s*[,\s]\s*(-?\d{1,3}\.\d+)/);
  if (coord) {
    const lat = Number(coord[1]);
    const lng = Number(coord[2]);
    return pack({
      mode: 'map',
      title: 'Map',
      subtitle: `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
      text,
      data: {
        lat,
        lng,
        label: text.slice(0, 80) || 'Pinned location',
        nearby: places.slice(0, 6).map(p => ({ name: p.name, lat: p.lat, lng: p.lng })),
      },
      source: 'director',
    });
  }

  const lower = text.toLowerCase();
  const hit = places.find(p => lower.includes(p.name.toLowerCase()));
  if (hit) {
    return pack({
      mode: 'map',
      title: hit.name,
      subtitle: hit.label,
      text,
      data: {
        lat: hit.lat,
        lng: hit.lng,
        label: hit.label,
        nearby: places
          .filter(p => p.name !== hit.name)
          .slice(0, 6)
          .map(p => ({ name: p.name, lat: p.lat, lng: p.lng })),
      },
      source: 'director',
    });
  }

  const amsterdam = places.find(p => p.name === 'Amsterdam') ?? places[0];
  return pack({
    mode: 'map',
    title: 'Map',
    subtitle: amsterdam.label,
    text: text || undefined,
    data: {
      lat: amsterdam.lat,
      lng: amsterdam.lng,
      label: amsterdam.label,
      nearby: places.slice(0, 6).map(p => ({ name: p.name, lat: p.lat, lng: p.lng })),
    },
    source: 'director',
  });
}

export function resolveMapFromCoords(
  lat: number,
  lng: number,
  label?: string,
): ProjectionPayload {
  return pack({
    mode: 'map',
    title: label || 'Map',
    subtitle: `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
    data: { lat, lng, label: label || 'Location' },
    source: 'tool',
  });
}
