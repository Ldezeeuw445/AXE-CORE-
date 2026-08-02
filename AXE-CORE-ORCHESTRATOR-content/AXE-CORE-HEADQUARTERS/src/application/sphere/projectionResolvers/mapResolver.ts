/**
 * mapResolver — application layer.
 * 1) coords in text
 * 2) known city list (featured + world hubs + aliases)
 * 3) Nominatim geocode (no API key) for any other place
 * 4) Amsterdam fallback
 */
import type { ProjectionPayload } from '@/domain/sphere/projectionTypes';
import { FEATURED_CITIES } from '@/domain/maps3d/constants';

const EXTRA: Array<{ name: string; lat: number; lng: number; label?: string }> = [
  { name: 'Rotterdam', lat: 51.9244, lng: 4.4777 },
  { name: 'Utrecht', lat: 52.0907, lng: 5.1214 },
  { name: 'Den Haag', lat: 52.0705, lng: 4.3007 },
  { name: 'New York', lat: 40.7128, lng: -74.006 },
  { name: 'Los Angeles', lat: 34.0522, lng: -118.2437 },
  { name: 'Chicago', lat: 41.8781, lng: -87.6298 },
  { name: 'Miami', lat: 25.7617, lng: -80.1918 },
  { name: 'Toronto', lat: 43.6532, lng: -79.3832 },
  { name: 'Tokyo', lat: 35.6762, lng: 139.6503 },
  { name: 'Seoul', lat: 37.5665, lng: 126.978 },
  { name: 'Shanghai', lat: 31.2304, lng: 121.4737 },
  { name: 'Hong Kong', lat: 22.3193, lng: 114.1694 },
  { name: 'Singapore', lat: 1.3521, lng: 103.8198 },
  { name: 'Sydney', lat: -33.8688, lng: 151.2093 },
  { name: 'Melbourne', lat: -37.8136, lng: 144.9631 },
  { name: 'Berlin', lat: 52.52, lng: 13.405 },
  { name: 'Munich', lat: 48.1351, lng: 11.582 },
  { name: 'Madrid', lat: 40.4168, lng: -3.7038 },
  { name: 'Barcelona', lat: 41.3874, lng: 2.1686 },
  { name: 'Rome', lat: 41.9028, lng: 12.4964 },
  { name: 'Milan', lat: 45.4642, lng: 9.19 },
  { name: 'Lisbon', lat: 38.7223, lng: -9.1393 },
  { name: 'Stockholm', lat: 59.3293, lng: 18.0686 },
  { name: 'Oslo', lat: 59.9139, lng: 10.7522 },
  { name: 'Copenhagen', lat: 55.6761, lng: 12.5683 },
  { name: 'Vienna', lat: 48.2082, lng: 16.3738 },
  { name: 'Zurich', lat: 47.3769, lng: 8.5417 },
  { name: 'Brussels', lat: 50.8503, lng: 4.3517 },
  { name: 'Istanbul', lat: 41.0082, lng: 28.9784 },
  { name: 'Moscow', lat: 55.7558, lng: 37.6173 },
  { name: 'Dubai', lat: 25.2048, lng: 55.2708 },
  { name: 'Abu Dhabi', lat: 24.4539, lng: 54.3773 },
  { name: 'Tel Aviv', lat: 32.0853, lng: 34.7818 },
  { name: 'Cairo', lat: 30.0444, lng: 31.2357 },
  { name: 'Lagos', lat: 6.5244, lng: 3.3792 },
  { name: 'Nairobi', lat: -1.2921, lng: 36.8219 },
  { name: 'Johannesburg', lat: -26.2041, lng: 28.0473 },
  { name: 'São Paulo', lat: -23.5505, lng: -46.6333 },
  { name: 'Buenos Aires', lat: -34.6037, lng: -58.3816 },
  { name: 'Mexico City', lat: 19.4326, lng: -99.1332 },
  { name: 'Mumbai', lat: 19.076, lng: 72.8777 },
  { name: 'Delhi', lat: 28.6139, lng: 77.209 },
  { name: 'Bangkok', lat: 13.7563, lng: 100.5018 },
  { name: 'Jakarta', lat: -6.2088, lng: 106.8456 },
  { name: 'Auckland', lat: -36.8485, lng: 174.7633 },
];

/** Alias → canonical city name (matched against places list). */
const ALIASES: Array<{ alias: RegExp; name: string }> = [
  { alias: /\b(nyc|new\s*york(\s*city)?)\b/i, name: 'New York' },
  { alias: /\b(la|los\s*angeles)\b/i, name: 'Los Angeles' },
  { alias: /\b(sf|san\s*francisco)\b/i, name: 'San Francisco' },
  { alias: /\b(the\s*hague|den\s*haag|'s-gravenhage)\b/i, name: 'Den Haag' },
  { alias: /\b(rio(\s*de\s*janeiro)?)\b/i, name: 'Rio de Janeiro' },
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

/** Strip command words so geocode gets a clean place name. */
function extractPlaceQuery(text: string): string {
  return text
    .replace(
      /\b(laat\s+(me\s+)?zien|toon(\s+me)?|show(\s+me)?|display|open|projecteer|project|bekijk|view|de|het|een|the|a|an|map|kaart|maps|locatie|location|on\s+the\s+sphere|op\s+de\s+sphere|sphere|please|alsjeblieft|even)\b/gi,
      ' ',
    )
    .replace(/\s+/g, ' ')
    .trim();
}

async function geocodeNominatim(
  q: string,
): Promise<{ lat: number; lng: number; label: string } | null> {
  if (!q || q.length < 2) return null;
  try {
    const url =
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`;
    const res = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'AXE-CORE-Headquarters/1.0 (sphere-map; local-desktop)',
      },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Array<{ lat: string; lon: string; display_name?: string }>;
    if (!Array.isArray(data) || !data[0]) return null;
    const lat = Number(data[0].lat);
    const lng = Number(data[0].lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return {
      lat,
      lng,
      label: data[0].display_name || q,
    };
  } catch {
    return null;
  }
}

export async function resolveMap(query?: string): Promise<ProjectionPayload> {
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
        nearby: places.slice(0, 8).map(p => ({ name: p.name, lat: p.lat, lng: p.lng })),
        source: 'coords',
      },
      source: 'director',
    });
  }

  // Alias hit first (NYC → New York, etc.)
  for (const a of ALIASES) {
    if (a.alias.test(text)) {
      const hit = places.find(p => p.name.toLowerCase() === a.name.toLowerCase());
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
              .slice(0, 8)
              .map(p => ({ name: p.name, lat: p.lat, lng: p.lng })),
            source: 'alias',
          },
          source: 'director',
        });
      }
    }
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
          .slice(0, 8)
          .map(p => ({ name: p.name, lat: p.lat, lng: p.lng })),
        source: 'catalog',
      },
      source: 'director',
    });
  }

  const placeQ = extractPlaceQuery(text);
  if (placeQ) {
    const geo = await geocodeNominatim(placeQ);
    if (geo) {
      const short = geo.label.split(',').slice(0, 2).join(',').trim();
      return pack({
        mode: 'map',
        title: short || placeQ,
        subtitle: geo.label.slice(0, 80),
        text,
        data: {
          lat: geo.lat,
          lng: geo.lng,
          label: geo.label,
          nearby: places.slice(0, 8).map(p => ({ name: p.name, lat: p.lat, lng: p.lng })),
          source: 'nominatim',
        },
        source: 'director',
      });
    }
  }

  const amsterdam = places.find(p => p.name === 'Amsterdam') ?? places[0];
  return pack({
    mode: 'map',
    title: placeQ || 'Map',
    subtitle: amsterdam.label,
    text: text || undefined,
    data: {
      lat: amsterdam.lat,
      lng: amsterdam.lng,
      label: amsterdam.label,
      nearby: places.slice(0, 8).map(p => ({ name: p.name, lat: p.lat, lng: p.lng })),
      source: 'fallback',
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
    data: { lat, lng, label: label || 'Location', source: 'coords' },
    source: 'tool',
  });
}
