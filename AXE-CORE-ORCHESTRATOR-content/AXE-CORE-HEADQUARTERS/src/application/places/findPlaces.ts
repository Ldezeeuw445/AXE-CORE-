/**
 * Plaatsen zoeken: een soort ("elektronicawinkel", "restaurant") bij een plek ("bij de Dam") of bij Luka zelf.
 * De regels staan in domain/plaatsen; dit haalt het op (Nominatim voor de plek, Overpass voor de zaken, via de VPS: die zet de User-Agent die ze eisen) en
 * zegt eerlijk waar het middelpunt vandaan komt.
 */
import { overpassQuery, plaatsenUitOverpass, soortVanVraag, type Plaats } from '@/domain/plaatsen/plaatsen';
import { huidigeLocatie } from '@/infrastructure/gateways/locatieService';
import { placesGeocode, placesNearby, placesOverpass } from '@/infrastructure/gateways/axeCoreApiService';

export interface ZoekResultaat {
  plaatsen: Plaats[];
  midden: { lat: number; lng: number; label: string; bron: string };
  soort: string;
  straalM: number;
}

const STRALEN = [1500, 4000, 10000];

async function geocode(q: string): Promise<{ lat: number; lng: number; label: string } | null> {
  try {
    const d = await placesGeocode(q);
    if (!d[0]) return null;
    return { lat: Number(d[0].lat), lng: Number(d[0].lon), label: (d[0].display_name ?? q).split(',').slice(0, 2).join(',') };
  } catch { return null; }
}

/**
 * Eerst Nominatim (±1 s, met uren en telefoon), dan Overpass (completer maar de gedeelde publieke servers
 * zijn vaak overbelast: 9 okt gaven alle spiegels 504). Geeft null als geen van beide antwoordt, en een
 * leeg antwoord als ze antwoordden maar niets vonden.
 */
async function haalOp(filters: readonly string[], lat: number, lng: number, straalM: number): Promise<unknown | null> {
  let leeg: unknown | null = null;
  try {
    const snel = await placesNearby(filters, lat, lng, straalM);
    if (plaatsenUitOverpass(snel).length > 0) return snel;
    leeg = snel;   // het antwoordde, er is daar niets: dat is geen storing
  } catch { /* terugval */ }
  try { return await placesOverpass(overpassQuery(filters, lat, lng, straalM)); } catch { return leeg; }
}

export async function zoekPlaatsen(opts: { wat: string; nabij?: string; straalM?: number }): Promise<ZoekResultaat | { fout: string }> {
  const soort = soortVanVraag(opts.wat);
  if (!soort) {
    return { fout: `I don't know what kind of place "${opts.wat}" is. Try restaurant, café, electronics store, pharmacy, supermarket, hotel, fuel…` };
  }

  let midden: ZoekResultaat['midden'];
  if (opts.nabij?.trim()) {
    const g = await geocode(opts.nabij.trim());
    if (!g) return { fout: `I could not find "${opts.nabij}" on the map.` };
    midden = { ...g, bron: 'the place you named' };
  } else {
    const l = await huidigeLocatie();
    midden = {
      lat: l.lat, lng: l.lng,
      label: l.naam ?? 'your position',
      bron: l.bron === 'toestel' ? 'your device location' : l.bron === 'ip' ? 'your internet connection (city level, not exact)' : 'Amsterdam (no location available)',
    };
  }

  const stralen = opts.straalM ? [opts.straalM] : STRALEN;
  let plaatsen: Plaats[] = [];
  let gebruikt = stralen[0];
  for (const r of stralen) {
    gebruikt = r;
    const json = await haalOp(soort.filters, midden.lat, midden.lng, r);
    if (json === null) return { fout: 'The map service did not answer. Try again in a moment.' };
    plaatsen = plaatsenUitOverpass(json, midden, soort.label);
    if (plaatsen.length >= 3) break;
  }
  return { plaatsen: plaatsen.slice(0, 12), midden, soort: soort.label, straalM: gebruikt };
}
