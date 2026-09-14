/**
 * Waar een plaatsnaam uit de NorthSea-data op de wereld ligt.
 *
 * ## Waarom een eigen lijst
 *
 * AXE Commodities bewaart geen coördinaten. Er staat tekst: een laadhaven,
 * een bestemming, de stad en het land van een bedrijf. Om daar een punt op de
 * kaart van te maken moet die tekst ergens aan gekoppeld worden.
 *
 * Landen hoeven hier niet in: hun middelpunt komt uit de landvormen zelf (zie
 * presentation/pages/northsea/kaartGeo.ts). Hier staan alleen de havens en
 * steden die ECHT in de data voorkomen, gemeten op 14 september 2026 -- geen
 * wereldatlas, want een naam die nergens in de data staat kan ook niet
 * geplaatst hoeven worden, en een grote lijst verbergt dat een nieuwe haven
 * ontbreekt.
 *
 * Komt er een haven bij die hier niet in staat, dan valt de deal terug op het
 * land (als dat eenduidig is) en telt hij als "benaderd". Hij verdwijnt niet
 * stilletjes.
 *
 * Coördinaten als [lengtegraad, breedtegraad], zoals d3-geo ze wil.
 */

export type PlaatsSoort = 'haven' | 'stad';

export interface Plaats {
  naam: string;
  soort: PlaatsSoort;
  /** De naam zoals de landvormen hem kennen, voor de tooltip en het land eromheen. */
  land: string;
  lonlat: [number, number];
}

const P = (naam: string, soort: PlaatsSoort, land: string, lon: number, lat: number): Plaats =>
  ({ naam, soort, land, lonlat: [lon, lat] });

/** Genormaliseerde naam → plaats. Meerdere schrijfwijzen wijzen naar hetzelfde. */
export const PLAATSEN: ReadonlyMap<string, Plaats> = new Map(
  ([
    // Havens en terminals (laadhaven en bestemming)
    [['hamburg'], P('Hamburg', 'haven', 'Germany', 9.99, 53.55)],
    [['rotterdam'], P('Rotterdam', 'haven', 'Netherlands', 4.48, 51.92)],
    [['jebel ali'], P('Jebel Ali', 'haven', 'United Arab Emirates', 55.06, 25.01)],
    [['fujairah'], P('Fujairah', 'haven', 'United Arab Emirates', 56.33, 25.12)],
    [['sohar'], P('Sohar', 'haven', 'Oman', 56.74, 24.36)],
    [['mersin'], P('Mersin', 'haven', 'Turkey', 34.64, 36.80)],
    [['novorossiysk'], P('Novorossiysk', 'haven', 'Russia', 37.77, 44.72)],
    [['durban'], P('Durban', 'haven', 'South Africa', 31.02, -29.87)],
    [['dar es salaam'], P('Dar es Salaam', 'haven', 'Tanzania', 39.28, -6.82)],
    [['houston'], P('Houston', 'haven', 'United States of America', -95.37, 29.76)],
    [['qinzhou'], P('Qinzhou', 'haven', 'China', 108.62, 21.95)],
    [['shanghai'], P('Shanghai', 'haven', 'China', 121.47, 31.23)],
    [['guangzhou'], P('Guangzhou', 'haven', 'China', 113.26, 23.13)],
    [['huelva'], P('Huelva', 'haven', 'Spain', -6.95, 37.26)],
    // Steden van bedrijven
    [['dubai'], P('Dubai', 'stad', 'United Arab Emirates', 55.27, 25.20)],
    [['bangkok'], P('Bangkok', 'stad', 'Thailand', 100.50, 13.76)],
    [['phichit'], P('Phichit', 'stad', 'Thailand', 100.35, 16.44)],
    [['lampang'], P('Lampang', 'stad', 'Thailand', 99.49, 18.29)],
    [['breda'], P('Breda', 'stad', 'Netherlands', 4.78, 51.59)],
    [['london'], P('London', 'stad', 'United Kingdom', -0.13, 51.51)],
    [['berlin'], P('Berlin', 'stad', 'Germany', 13.40, 52.52)],
    [['ulm'], P('Ulm', 'stad', 'Germany', 9.99, 48.40)],
    [['buchholz i.d. nordheide', 'buchholz in der nordheide', 'buchholz'], P('Buchholz', 'stad', 'Germany', 9.87, 53.33)],
    [['istanbul'], P('Istanbul', 'stad', 'Turkey', 28.98, 41.01)],
    [['darıca', 'darica', 'gebze', 'darıca / gebze'], P('Darıca / Gebze', 'stad', 'Turkey', 29.41, 40.78)],
    [['ronneby'], P('Ronneby', 'stad', 'Sweden', 15.28, 56.21)],
    [['rome', 'roma'], P('Rome', 'stad', 'Italy', 12.50, 41.90)],
    [['bor'], P('Bor', 'stad', 'Serbia', 22.10, 44.08)],
    [['warsaw', 'warszawa'], P('Warsaw', 'stad', 'Poland', 21.01, 52.23)],
    [['al wakra', 'al wakrah'], P('Al Wakra', 'stad', 'Qatar', 51.60, 25.17)],
  ] as Array<[string[], Plaats]>).flatMap(([namen, plaats]) => namen.map(n => [n, plaats] as [string, Plaats])),
);

/**
 * Schrijfwijzen van landen → de naam in de landvormen (world-atlas).
 *
 * Alleen wat afwijkt. "Germany" en "Italy" staan er zo al in en hoeven hier
 * niet; die vindt de lookup rechtstreeks.
 */
export const LAND_ALIAS: ReadonlyMap<string, string> = new Map([
  ['turkey', 'Turkey'], ['türkiye', 'Turkey'], ['turkiye', 'Turkey'], ['republic of türkiye', 'Turkey'],
  ['united states', 'United States of America'], ['usa', 'United States of America'], ['us', 'United States of America'],
  ['uae', 'United Arab Emirates'],
  ['drc', 'Dem. Rep. Congo'], ['dr congo', 'Dem. Rep. Congo'], ['democratic republic of congo', 'Dem. Rep. Congo'],
  ['democratic republic of the congo', 'Dem. Rep. Congo'],
  ['uk', 'United Kingdom'], ['great britain', 'United Kingdom'],
  ['korea', 'South Korea'], ['republic of korea', 'South Korea'],
]);

/**
 * Woorden die een GEBIED noemen en geen plaats.
 *
 * "Central African copper belt" of "Africa" is waar, maar geen punt: een
 * stip midden in Afrika zegt iets wat de data niet zegt. Zo'n deal telt als
 * "regio" en komt niet als lijn op de kaart.
 */
export const REGIO_WOORDEN: readonly string[] = [
  'africa', 'african', 'copper belt', 'worldwide', 'europe', 'asia', 'middle east', 'latin america',
  'south america', 'north america', 'unknown', 'global', 'various',
];
