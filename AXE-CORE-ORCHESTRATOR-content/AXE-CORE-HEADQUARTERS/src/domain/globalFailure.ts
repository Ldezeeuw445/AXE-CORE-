/**
 * Wat een niet-afgevangen fout op het scherm mag zeggen, en hoe vaak.
 *
 * Toen de API-host wegviel kreeg je twaalf meldingen tegelijk, allemaal met de
 * tekst "Request failed: Load failed". Twaalf keer dezelfde ruis, en geen van
 * de twaalf noemde de werkelijke oorzaak: de server antwoordde niet. Eén
 * melding die zegt wat er is, is meer waard dan twaalf die dat niet doen.
 *
 * De tweede reden dat dit bestaat: de vorige versie gaf "Something unexpected
 * went wrong." zodra de reden geen echte Error was -- en dat is juist het
 * normale geval. Een mislukte fetch levert een Response op, Supabase geeft een
 * object met `message`, onze eigen gateways gooien `{ error }` of `{ detail }`.
 * Al die gevallen vielen door naar die ene nietszeggende zin.
 *
 * Dit blijft opzettelijk domeinlogica zonder timers of toasts, zodat het
 * testbaar is los van de browser.
 */

export type FailureKind =
  /** Het netwerk of de server antwoordde niet. Niets aan de app zelf mankeert. */
  | 'onbereikbaar'
  /** De server antwoordde wél, maar met een fout. */
  | 'server'
  /** Iets in de app zelf ging stuk. */
  | 'app'
  /**
   * De pagina vraagt een stuk code op dat bij deze build niet meer bestaat.
   *
   * Dit is geen storing en geen bug in de pagina zelf: de service worker heeft
   * een nieuwe build binnengehaald en de oude brokken weggegooid terwijl het
   * tabblad nog op de oude draaide. Pas als je een scherm opent dat je in deze
   * sessie nog niet had geopend, valt het op -- vandaar dat het altijd de
   * minder vaak bezochte pagina's lijkt te treffen. Herladen is de oplossing,
   * en de enige.
   */
  | 'verouderd';

export interface Failure {
  kind: FailureKind;
  message: string;
}

/** De teksten die een browser geeft als er niets terugkwam. Ze verschillen per
 *  motor — WebKit zegt "Load failed", Chromium "Failed to fetch" — en geen van
 *  beide zegt de gebruiker iets. */
const STILTE = [
  'load failed',
  'failed to fetch',
  'networkerror',
  'network request failed',
  'the network connection was lost',
  'connection refused',
  'err_connection',
  'err_network',
  'timeout',
  'aborted',
  'signal is aborted',
];

/**
 * Hoe de motoren zeggen dat een dynamische import niet ophaalbaar was.
 *
 * Deze MOETEN voor STILTE worden gecontroleerd: Chromium schrijft "Failed to
 * fetch dynamically imported module", en dat bevat "failed to fetch". Zonder
 * deze stap leest een verouderde build als "AXE API antwoordt niet -- de
 * server is even weg", ga je de VPS controleren, staat daar niets mis, en blijf
 * je zoeken op de verkeerde plek. WebKit zegt iets heel anders
 * ("Importing a module script failed"), dus beide staan erin.
 */
const VEROUDERD = [
  'failed to fetch dynamically imported module',
  'error loading dynamically imported module',
  'importing a module script failed',
  'unable to preload css',
  'module script failed to load',
  "expected a javascript module script but the server responded with a mime type",
];

/** De sleutels waar een fouttekst in kan zitten, op volgorde van bruikbaarheid.
 *  `detail` komt van de Python-API, `statusText` van fetch zelf. */
const SLEUTELS = ['message', 'error', 'detail', 'statusText'] as const;

function tekstVan(reason: unknown): string {
  if (typeof reason === 'string') return reason.trim();
  if (reason instanceof Error && reason.message) return reason.message;

  if (reason && typeof reason === 'object') {
    const o = reason as Record<string, unknown>;
    for (const sleutel of SLEUTELS) {
      const waarde = o[sleutel];
      if (typeof waarde === 'string' && waarde.trim()) return waarde;
      // Supabase nest de echte fout soms een niveau dieper; zonder deze stap
      // eindig je met "[object Object]" terwijl de oorzaak gewoon bekend was.
      if (waarde && typeof waarde === 'object') {
        const binnen = (waarde as Record<string, unknown>).message;
        if (typeof binnen === 'string' && binnen.trim()) return binnen;
      }
    }
    if (typeof o.status === 'number') return `HTTP ${o.status}`;
  }
  return '';
}

/**
 * Bepaalt wat er werkelijk misging. Een stille fetch krijgt een naam in plaats
 * van de motorspecifieke tekst, want "Load failed" laat de lezer raden of het
 * aan hemzelf, aan zijn wifi of aan de server ligt.
 */
export function describeFailure(reason: unknown): Failure {
  const ruw = tekstVan(reason).trim();
  const laag = ruw.toLowerCase();

  // Eerst, en met opzet nog voor de offline-controle: ook zonder netwerk is
  // een ontbrekende brok een verouderde build en geen wifi-probleem, en de
  // melding hoort te zeggen wat er te doen valt.
  if (ruw && VEROUDERD.some((v) => laag.includes(v))) {
    return {
      kind: 'verouderd',
      message: 'AXE is bijgewerkt terwijl dit venster openstond. Herlaad om verder te gaan.',
    };
  }

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { kind: 'onbereikbaar', message: 'Geen internetverbinding.' };
  }

  if (ruw && STILTE.some((s) => laag.includes(s))) {
    return { kind: 'onbereikbaar', message: 'AXE API antwoordt niet — de server is even weg.' };
  }

  const status = laag.match(/^http (\d{3})$/);
  if (status) {
    return { kind: 'server', message: `AXE API gaf een fout (HTTP ${status[1]}).` };
  }

  if (!ruw) return { kind: 'app', message: 'Er ging iets mis.' };
  return { kind: 'app', message: ruw };
}

/**
 * Onthoudt welke tekst wanneer getoond is, zodat dezelfde melding niet
 * herhaald wordt terwijl één storing tien verzoeken tegelijk sloopt.
 *
 * Bewust een fabriek en geen module-variabele: een test moet met een eigen,
 * lege geschiedenis kunnen beginnen.
 */
export function maakMeldingsfilter(vensterMs = 8000) {
  const gezien = new Map<string, number>();

  return function magTonen(message: string, nu: number): boolean {
    const vorige = gezien.get(message);
    if (vorige !== undefined && nu - vorige < vensterMs) return false;
    gezien.set(message, nu);
    // Oude regels opruimen, anders groeit de kaart een sessie lang door.
    for (const [k, t] of gezien) if (nu - t > vensterMs * 4) gezien.delete(k);
    return true;
  };
}
