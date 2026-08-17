/**
 * Nuclear sites — static reference data (IAEA / public sources). Ported
 * from Trading OS's intelGlobeExtras.ts NUCLEAR_SITES. Static because these
 * are physical facilities, not something with a live feed to poll — real
 * locations, not an estimate.
 */
export interface NuclearSite {
  name: string;
  lat: number;
  lon: number;
  country: string;
  type: string;
}

export const NUCLEAR_SITES: NuclearSite[] = [
  { name: 'Natanz Enrichment (IR)', lat: 33.7, lon: 51.7, country: 'Iran', type: 'enrichment' },
  { name: 'Fordow (IR)', lat: 34.9, lon: 50.9, country: 'Iran', type: 'enrichment' },
  { name: 'Arak Heavy Water (IR)', lat: 34.1, lon: 49.2, country: 'Iran', type: 'reactor' },
  { name: 'Yongbyon (DPRK)', lat: 39.8, lon: 125.7, country: 'North Korea', type: 'weapons' },
  { name: 'Punggye-ri Test Site (DPRK)', lat: 41.3, lon: 129.1, country: 'North Korea', type: 'test site' },
  { name: 'Dimona (IL)', lat: 31.0, lon: 35.1, country: 'Israel', type: 'weapons research' },
  { name: 'Zaporozhye NPP (UA/RU)', lat: 47.5, lon: 34.6, country: 'Ukraine (RU-held)', type: 'power plant' },
  { name: 'Kursk NPP (RU)', lat: 51.7, lon: 35.6, country: 'Russia', type: 'power plant' },
  { name: 'Balakovo NPP (RU)', lat: 52.0, lon: 47.9, country: 'Russia', type: 'power plant' },
  { name: 'Kalinin NPP (RU)', lat: 57.9, lon: 35.2, country: 'Russia', type: 'power plant' },
  { name: 'Hanford Site (US)', lat: 46.5, lon: -119.5, country: 'USA', type: 'cleanup/weapons legacy' },
  { name: 'Oak Ridge (US)', lat: 36.0, lon: -84.2, country: 'USA', type: 'research' },
  { name: 'Savannah River (US)', lat: 33.3, lon: -81.7, country: 'USA', type: 'tritium/weapons' },
  { name: 'Los Alamos (US)', lat: 35.9, lon: -106.3, country: 'USA', type: 'weapons lab' },
  { name: 'Jiuquan Satellite/Nuclear (CN)', lat: 40.6, lon: 100.0, country: 'China', type: 'weapons complex' },
  { name: 'Lop Nur Test Site (CN)', lat: 40.5, lon: 88.3, country: 'China', type: 'test site' },
  { name: 'Guangdong NPP (CN)', lat: 22.5, lon: 114.5, country: 'China', type: 'power plant' },
  { name: 'Flamanville (FR)', lat: 49.5, lon: -1.9, country: 'France', type: 'power plant' },
  { name: 'Cattenom (FR)', lat: 49.4, lon: 6.2, country: 'France', type: 'power plant' },
  { name: 'Sellafield (GB)', lat: 54.4, lon: -3.5, country: 'UK', type: 'reprocessing' },
  { name: 'Hinkley Point C (GB)', lat: 51.2, lon: -3.1, country: 'UK', type: 'power plant' },
  { name: 'Grohnde (DE)', lat: 52.0, lon: 9.4, country: 'Germany', type: 'decommissioning' },
  { name: 'Bushehr NPP (IR)', lat: 28.8, lon: 50.9, country: 'Iran', type: 'power plant' },
  { name: 'Barakah NPP (UAE)', lat: 23.9, lon: 52.2, country: 'UAE', type: 'power plant' },
  { name: 'Kudankulam (IN)', lat: 8.2, lon: 77.7, country: 'India', type: 'power plant' },
  { name: 'Karachi KANUPP (PK)', lat: 24.8, lon: 66.8, country: 'Pakistan', type: 'power plant' },
  { name: 'Kakrapar (IN)', lat: 21.2, lon: 73.4, country: 'India', type: 'power plant' },
  { name: 'Fukushima Daiichi (JP)', lat: 37.4, lon: 141.0, country: 'Japan', type: 'decommissioning' },
];
