/**
 * Plaatsen in de buurt: "zoek de dichtstbijzijnde elektronicawinkel", "een restaurant bij de Dam".
 *
 * De bron is OpenStreetMap (Overpass): gratis, geen sleutel, en met adres, telefoon, website en
 * openingstijden waar iemand die heeft ingevuld. Dit bestand is het rekenwerk eromheen -- welke vraag
 * welke soort winkel is, de query, het lezen van het antwoord, afstanden -- zodat het zonder netwerk
 * te testen is. Het ophalen staat in application/places/findPlaces.ts.
 */

export interface Plaats {
  id: string;
  naam: string;
  lat: number;
  lng: number;
  /** "restaurant", "electronics" ... zoals OSM het noemt. */
  soort: string;
  adres?: string;
  telefoon?: string;
  website?: string;
  openingstijden?: string;
  keuken?: string;
  /** Hemelsbreed, in meters; gezet als er een middelpunt was. */
  afstandM?: number;
}

/** Een filter zoals Overpass het wil: [key="value"] of [key~"a|b"]. */
export interface SoortFilter { label: string; filters: string[] }

/**
 * Welke woorden in een vraag bij welke soort horen. De eerste die past wint; de volgorde zet het
 * specifieke vóór het algemene ("fastfood" voor "food"). Nederlands en Engels, want Luka praat het ene
 * en typt het andere.
 */
const SOORTEN: ReadonlyArray<{ woorden: RegExp; soort: SoortFilter }> = [
  { woorden: /\b(fast\s*food|snackbar|burgers?|frie[dt]|mcdonald|kfc)/i, soort: { label: 'fast food', filters: ['amenity=fast_food'] } },
  { woorden: /\b(koffie|coffee|caf[eé]|espresso|lunchroom)\b/i, soort: { label: 'café', filters: ['amenity=cafe'] } },
  { woorden: /\b(bar|caf[eé]\s*bar|pub|caf[eé]tje|kroeg|borrel|cocktail)\b/i, soort: { label: 'bar', filters: ['amenity=bar', 'amenity=pub'] } },
  { woorden: /\b(restaurant|eten|dineren|diner|lunch|ontbijt|brunch|pizza|sushi|italiaan|indiaas|thai|chinees|tafel|reserveer|boek)/i, soort: { label: 'restaurant', filters: ['amenity=restaurant'] } },
  { woorden: /\b(elektronica|electronic|computer\s*winkel|computer\s*shop|mediamarkt|coolblue|bcc|telefoonwinkel|mobiel|gsm|laptop|kabel|oplader|charger)/i, soort: { label: 'electronics', filters: ['shop=electronics', 'shop=computer', 'shop=mobile_phone'] } },
  { woorden: /\b(supermarkt|supermarket|albert\s*heijn|jumbo|lidl|boodschappen|groceries)\b/i, soort: { label: 'supermarket', filters: ['shop=supermarket'] } },
  { woorden: /\b(apotheek|pharmacy|drogist|drogisterij)\b/i, soort: { label: 'pharmacy', filters: ['amenity=pharmacy'] } },
  { woorden: /\b(huisarts|dokter|doctor|ziekenhuis|hospital|spoedeisende|eerste\s*hulp)\b/i, soort: { label: 'doctor', filters: ['amenity=doctors', 'amenity=hospital', 'amenity=clinic'] } },
  { woorden: /\b(pinautomaat|geldautomaat|atm|pinnen)\b/i, soort: { label: 'ATM', filters: ['amenity=atm'] } },
  { woorden: /\b(tanken|benzine|tankstation|fuel|gas\s*station|petrol|laadpaal|opladen)\b/i, soort: { label: 'fuel', filters: ['amenity=fuel', 'amenity=charging_station'] } },
  { woorden: /\b(hotel|slapen|overnachten|b&b|hostel)\b/i, soort: { label: 'hotel', filters: ['tourism=hotel', 'tourism=hostel', 'tourism=guest_house'] } },
  { woorden: /\b(parkeren|parking|parkeergarage)\b/i, soort: { label: 'parking', filters: ['amenity=parking'] } },
  { woorden: /\b(bakker|bakery|brood|banketbakker)\b/i, soort: { label: 'bakery', filters: ['shop=bakery'] } },
  { woorden: /\b(sportschool|gym|fitness)\b/i, soort: { label: 'gym', filters: ['leisure=fitness_centre'] } },
  { woorden: /\b(kapper|barber|hairdresser|kapsalon)\b/i, soort: { label: 'barber', filters: ['shop=hairdresser', 'shop=barber'] } },
  { woorden: /\b(bouwmarkt|hardware|gamma|praxis|karwei|ijzerwaren)\b/i, soort: { label: 'hardware', filters: ['shop=doityourself', 'shop=hardware'] } },
  { woorden: /\b(kleding|clothes|kledingwinkel|schoenen|shoes)\b/i, soort: { label: 'clothes', filters: ['shop=clothes', 'shop=shoes'] } },
  { woorden: /\b(bioscoop|cinema|movie|film)\b/i, soort: { label: 'cinema', filters: ['amenity=cinema'] } },
  { woorden: /\b(station|treinstation|metro|halte|ov)\b/i, soort: { label: 'station', filters: ['railway=station', 'railway=halt'] } },
];

/** De soort plaats waar de vraag over gaat; leeg als geen woord past. */
export function soortVanVraag(vraag: string): SoortFilter | null {
  for (const s of SOORTEN) if (s.woorden.test(vraag)) return s.soort;
  return null;
}

/** Hemelsbrede afstand in meters (haversine). */
export function afstandMeter(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6_371_000;
  const rad = (g: number) => (g * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

/** "350 m" onder een kilometer, daarna "1,2 km". */
export function formatAfstand(m: number): string {
  return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1).replace('.', ',')} km`;
}

/** De Overpass-query: knopen én vlakken (gebouwen) binnen de straal, met het midden van een vlak. */
export function overpassQuery(filters: readonly string[], lat: number, lng: number, straalM: number, max = 40): string {
  const stukken = filters.flatMap(f => {
    const [k, v] = f.split('=');
    const tag = `["${k}"="${v}"]["name"]`;
    return [`node${tag}(around:${straalM},${lat},${lng});`, `way${tag}(around:${straalM},${lat},${lng});`];
  });
  return `[out:json][timeout:20];(${stukken.join('')});out center ${max};`;
}

interface OsmElement {
  type: string; id: number; lat?: number; lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

function adresVan(t: Record<string, string>): string | undefined {
  const straat = [t['addr:street'], t['addr:housenumber']].filter(Boolean).join(' ');
  const plaats = [t['addr:postcode'], t['addr:city']].filter(Boolean).join(' ');
  const geheel = [straat, plaats].filter(Boolean).join(', ');
  return geheel || undefined;
}

/** Het Overpass-antwoord als plaatsen, op afstand gesorteerd als er een middelpunt is. */
export function plaatsenUitOverpass(json: unknown, midden?: { lat: number; lng: number }, soort = ''): Plaats[] {
  const els = ((json as { elements?: OsmElement[] } | null)?.elements ?? []).filter(e => e.tags?.name);
  const uit: Plaats[] = [];
  const gezien = new Set<string>();
  for (const e of els) {
    const lat = e.lat ?? e.center?.lat;
    const lng = e.lon ?? e.center?.lon;
    if (typeof lat !== 'number' || typeof lng !== 'number') continue;
    const t = e.tags!;
    // Dezelfde zaak als knoop én als gebouw telt één keer.
    const dubbel = `${t.name!.toLowerCase()}|${lat.toFixed(3)}|${lng.toFixed(3)}`;
    if (gezien.has(dubbel)) continue;
    gezien.add(dubbel);
    uit.push({
      id: `${e.type}/${e.id}`,
      naam: t.name!, lat, lng,
      soort: soort || t.amenity || t.shop || t.tourism || 'place',
      adres: adresVan(t),
      telefoon: t.phone ?? t['contact:phone'],
      website: t.website ?? t['contact:website'],
      openingstijden: t.opening_hours,
      keuken: t.cuisine?.replace(/;/g, ', ').replace(/_/g, ' '),
      ...(midden ? { afstandM: afstandMeter(midden, { lat, lng }) } : {}),
    });
  }
  return midden ? uit.sort((a, b) => (a.afstandM ?? 0) - (b.afstandM ?? 0)) : uit;
}

/** Eén plaats als zin die AXE kan uitspreken: naam, afstand, waar, hoe laat. */
export function plaatsRegel(p: Plaats): string {
  return [
    p.naam,
    p.afstandM != null ? formatAfstand(p.afstandM) : '',
    p.keuken ?? '',
    p.adres ?? '',
    p.openingstijden ? `open ${p.openingstijden}` : '',
    p.telefoon ? `tel ${p.telefoon}` : '',
  ].filter(Boolean).join(' · ');
}
