/**
 * De donkere ondergrond van elke kaart in de app, op één plek.
 *
 * Tot 9 okt stond hier CARTO's `dark_all`. Die geeft sinds kort voor iedereen zonder sleutel dezelfde
 * tegel terug -- een donkere tegel met "API KEY REQUIRED" schuin erover, ook voor andere coördinaten
 * (gemeten: dezelfde 2513 bytes voor twee verschillende tegels). De kaart op Home was dus een grijs vlak
 * met een waarschuwing erin, in de app en op de telefoon.
 *
 * Esri's Dark Gray Canvas is gratis, zonder sleutel, en past bij het donkere scherm: een grondlaag zonder
 * namen en een referentielaag erboven met plaatsnamen. De canvas gaat tot zoom 16.
 */
export const BASEMAP_DARK_TILES = [
  'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
];
export const BASEMAP_DARK_LABELS = [
  'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}',
];
export const BASEMAP_MAX_ZOOM = 16;
export const BASEMAP_ATTRIBUTION = 'Tiles © Esri — Esri, HERE, Garmin, OpenStreetMap contributors';
