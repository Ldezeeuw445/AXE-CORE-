/**
 * Submarine cables — a curated set of major, real, named cables with real
 * landing-station coordinates (public knowledge, comparable sourcing to
 * TeleGeography's cable map). Each route is a straight line between two
 * real landing points, NOT the true curved seabed path — labelled as such
 * in the UI rather than claimed to be precise.
 */
export interface SubmarineCable {
  id: string;
  name: string;
  landings: [name: string, lat: number, lon: number][];
  note: string;
}

export const SUBMARINE_CABLES: SubmarineCable[] = [
  { id: 'marea', name: 'MAREA', landings: [['Virginia Beach, US', 36.85, -75.98], ['Bilbao, ES', 43.26, -2.94]], note: 'Microsoft/Meta/Telxius · one of the highest-capacity transatlantic cables' },
  { id: 'grace-hopper', name: 'Grace Hopper', landings: [['New York, US', 40.6, -73.9], ['Bude, UK', 50.83, -4.55]], note: 'Google · transatlantic' },
  { id: 'dunant', name: 'Dunant', landings: [['Virginia Beach, US', 36.85, -75.98], ['Saint-Hilaire-de-Riez, FR', 46.71, -1.95]], note: 'Google · transatlantic' },
  { id: 'faster', name: 'FASTER', landings: [['Bandon, US', 43.12, -124.4], ['Chiba, JP', 35.6, 140.1]], note: 'Google consortium · transpacific' },
  { id: 'jupiter', name: 'JUPITER', landings: [['Los Angeles, US', 33.9, -118.4], ['Chikura, JP', 34.9, 139.9]], note: 'Meta/Amazon/SoftBank/PLDT · transpacific' },
  { id: 'seamewe3', name: 'SEA-ME-WE 3', landings: [['Marseille, FR', 43.3, 5.35], ['Singapore', 1.29, 103.85]], note: 'Legacy East–West backbone, Europe–Asia' },
  { id: 'southern-cross', name: 'Southern Cross NEXT', landings: [['Los Angeles, US', 33.9, -118.4], ['Auckland, NZ', -36.85, 174.76]], note: 'Trans-Pacific, US–Australia/NZ' },
  { id: 'sat3-wasc', name: 'SAT-3/WASC', landings: [['Sesimbra, PT', 38.44, -9.1], ['Melkbosstrand, ZA', -33.72, 18.44]], note: 'West Africa coastal backbone' },
  { id: '2africa-fujairah-mombasa', name: '2Africa', landings: [['Fujairah, AE', 25.12, 56.34], ['Mombasa, KE', -4.04, 39.66]], note: 'Meta consortium · Africa/Middle East ring (segment shown)' },
  { id: 'apg', name: 'Asia Pacific Gateway', landings: [['Chongming, CN', 31.6, 121.4], ['Chikura, JP', 34.9, 139.9]], note: 'China–Japan segment of the broader APG ring' },
];
