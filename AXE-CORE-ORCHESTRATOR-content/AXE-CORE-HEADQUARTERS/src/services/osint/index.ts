/**
 * Unified OSINT data aggregator — fetches from ALL real APIs
 * and merges them into a single LiveOsintPoint array.
 */
import { fetchOpenSkyAircraft } from './openskyService';
import { fetchNasaDisasters } from './nasaService';
import { fetchAviationStackFlights } from './aviationstackService';
import { fetchExaNews } from './exaService';
import { fetchZenserpNews } from './zenserpService';
import { fetchGreynoiseThreats } from './greynoiseService';
import type { LiveOsintPoint, UnifiedOsintResult } from './types';

export * from './types';

export async function fetchUnifiedOsint(cityName?: string): Promise<UnifiedOsintResult> {
  const errors: Record<string, string> = {};
  const allPoints: LiveOsintPoint[] = [];

  // 1. OpenSky (flights) – fastest, most reliable
  try {
    const flights = await fetchOpenSkyAircraft();
    allPoints.push(...flights);
  } catch (e) {
    errors.opensky = e instanceof Error ? e.message : String(e);
  }

  // 2. NASA EONET (disasters) – free, unlimited
  try {
    const disasters = await fetchNasaDisasters();
    allPoints.push(...disasters);
  } catch (e) {
    errors.nasa = e instanceof Error ? e.message : String(e);
  }

  // 3. AviationStack (flights backup) – only if no OpenSky results
  const hasFlights = allPoints.some(p => p.kind === 'flight');
  if (!hasFlights) {
    try {
      const backupFlights = await fetchAviationStackFlights();
      allPoints.push(...backupFlights);
    } catch (e) {
      errors.aviationstack = e instanceof Error ? e.message : String(e);
    }
  }

  // 4. Exa (news)
  try {
    const exaNews = await fetchExaNews(cityName);
    // Assign random jitter around selected city for news without geo
    exaNews.forEach(n => {
      if (n.lat === 0 && n.lon === 0 && cityName) {
        // caller will re-assign via city center — keep as-is here
      }
    });
    allPoints.push(...exaNews);
  } catch (e) {
    errors.exa = e instanceof Error ? e.message : String(e);
  }

  // 5. Zenserp (news backup)
  try {
    const zenserpNews = await fetchZenserpNews(cityName);
    allPoints.push(...zenserpNews);
  } catch (e) {
    errors.zenserp = e instanceof Error ? e.message : String(e);
  }

  // 6. GreyNoise (threats)
  try {
    const threats = await fetchGreynoiseThreats();
    allPoints.push(...threats);
  } catch (e) {
    errors.greynoise = e instanceof Error ? e.message : String(e);
  }

  return {
    points: allPoints,
    errors,
    lastUpdated: new Date().toISOString(),
  };
}

/** Convenience: get points by source */
export function filterBySource(points: LiveOsintPoint[], source: LiveOsintPoint['source']): LiveOsintPoint[] {
  return points.filter(p => p.source === source);
}

/** Convenience: get points by kind */
export function filterByKind(points: LiveOsintPoint[], kind: LiveOsintPoint['kind']): LiveOsintPoint[] {
  return points.filter(p => p.kind === kind);
}
