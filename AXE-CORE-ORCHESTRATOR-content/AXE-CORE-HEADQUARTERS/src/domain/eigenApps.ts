/**
 * Luka's eigen apps, elk in een eigen shell, vanuit AXE Core.
 *
 * Luka, 29 okt: "zorgen dat in de radial button rechts onder echt alle apps
 * openen in hun eigen shell die van mij zijn ... Trading OS, AXE Companion (in
 * telefoon of iPad formaat, dat houdt het realistisch), AXON Memory, AXE
 * Developer en Northsea Desk ... en aan AXE kunnen vragen: open Trading OS op
 * dit scherm, AXON op me andere scherm, Northsea Desk op me iMac."
 *
 * Dit bestand weet WELKE app, WAAR en HOE GROOT. Het openen zelf (Tauri,
 * monitoren, een ander toestel) staat in infrastructure/gateways/eigenAppShell.
 * Hier staat geen window, geen fetch en geen Date.now(): alles is te testen.
 */

export type EigenAppId = 'trading-os' | 'companion' | 'axon' | 'developer' | 'northsea';
export type ShellVorm = 'bureaublad' | 'telefoon' | 'tablet';
export type SchermKeuze = 'dit' | 'ander' | number;
export type ToestelKeuze = 'hier' | 'imac' | 'macmini';

export interface EigenApp {
  id: EigenAppId;
  naam: string;
  /** Naam in registered_apps, als die er staat (die wint voor de URL). */
  registerNaam?: string;
  /** Een AXE-pagina (eigen venster van deze app) ... */
  pagina?: string;
  /** ... of een eigen site. */
  url?: string;
  vorm: ShellVorm;
  /** Waar AXE op let als Luka hem noemt. Langste treffer wint. */
  trefwoorden: string[];
}

export const EIGEN_APPS: readonly EigenApp[] = [
  {
    id: 'trading-os', naam: 'Trading OS', registerNaam: 'Trading OS', url: 'https://tradingosapp.com',
    vorm: 'bureaublad', trefwoorden: ['trading os', 'tradingos', 'trading-os', 'trading terminal'],
  },
  {
    id: 'companion', naam: 'AXE Companion', registerNaam: 'AXE Companion', url: 'https://www.axecompanion.com',
    vorm: 'telefoon', trefwoorden: ['axe companion', 'companion', 'axecompanion'],
  },
  {
    id: 'axon', naam: 'AXON Memory', registerNaam: 'Axon Memory', url: 'https://app.axon-memory.com',
    vorm: 'bureaublad', trefwoorden: ['axon memory', 'axon'],
  },
  {
    id: 'developer', naam: 'AXE Developer', pagina: 'code-editor',
    vorm: 'bureaublad', trefwoorden: ['axe developer', 'developer', 'code editor', 'code studio', 'code-editor'],
  },
  {
    id: 'northsea', naam: 'NorthSea Desk', pagina: 'maps-3d',
    vorm: 'bureaublad', trefwoorden: ['northsea desk', 'north sea desk', 'northsea', 'north sea', 'deal desk'],
  },
];

export function eigenApp(id: string): EigenApp | null {
  return EIGEN_APPS.find(a => a.id === id) ?? null;
}

const klein = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

/** Welke app bedoelt de tekst? Het langste trefwoord wint, zodat "axon memory" niet "memory" iets anders laat zijn. */
export function vindEigenApp(tekst: string): EigenApp | null {
  const t = klein(tekst);
  let beste: { app: EigenApp; lengte: number } | null = null;
  for (const app of EIGEN_APPS) {
    for (const w of app.trefwoorden) {
      if (t.includes(w) && (!beste || w.length > beste.lengte)) beste = { app, lengte: w.length };
    }
  }
  return beste?.app ?? null;
}

export interface Plek {
  scherm: SchermKeuze;
  toestel: ToestelKeuze;
  /** Alleen als hij er expliciet om vraagt: "als iPad", "in telefoonformaat". */
  vorm?: ShellVorm;
}

/** Waar en hoe, uit een zin als "open AXON op mijn andere scherm" of "op de iMac als iPad". */
export function plekUit(tekst: string): Plek {
  const t = klein(tekst);
  const plek: Plek = { scherm: 'dit', toestel: 'hier' };
  if (/\bimac\b/.test(t)) plek.toestel = 'imac';
  else if (/mac ?mini\b|\bde mini\b|\bmy mini\b/.test(t)) plek.toestel = 'macmini';
  const nummer = /(?:scherm|screen|monitor|display)\s*(\d)\b/.exec(t);
  if (nummer) plek.scherm = Math.max(0, Number(nummer[1]) - 1);
  else if (/(ander|andere|tweede|other|second|2nd)\s+(scherm|screen|monitor|display)/.test(t)) plek.scherm = 'ander';
  if (/\b(ipad|tablet)\b/.test(t)) plek.vorm = 'tablet';
  else if (/\b(telefoon|phone|iphone|mobiel|mobile)\b/.test(t)) plek.vorm = 'telefoon';
  else if (/\b(groot|desktop|bureaublad|full ?screen|volledig)\b/.test(t)) plek.vorm = 'bureaublad';
  return plek;
}

/** Monitorindex (links naar rechts) voor een keuze, gegeven waar dit venster nu staat. */
export function monitorIndexVoor(keuze: SchermKeuze, huidig: number, aantal: number): number {
  if (aantal <= 0) return 0;
  const hier = Math.min(Math.max(0, huidig), aantal - 1);
  if (keuze === 'dit') return hier;
  if (keuze === 'ander') return aantal === 1 ? hier : (hier + 1) % aantal;
  return Math.min(Math.max(0, keuze), aantal - 1);
}

export const SHELL_MAAT: Record<ShellVorm, { breedte: number; hoogte: number }> = {
  bureaublad: { breedte: 1440, hoogte: 920 },
  // iPhone 15 Pro Max en iPad Pro 11" in punten: wat Companion echt ziet.
  telefoon: { breedte: 430, hoogte: 932 },
  tablet: { breedte: 834, hoogte: 1194 },
};

const MARGE = 36;

/**
 * Venstermaat en plek op een monitor (logische punten).
 *
 * Een telefoon of iPad schaalt mee als het scherm te laag is, met dezelfde
 * verhouding: een geplette telefoon is geen telefoon meer. Bureaublad vult het
 * scherm tot 1440x920, zoals de andere AXE-vensters.
 */
export function shellRechthoek(
  vorm: ShellVorm,
  monitor: { x: number; y: number; breedte: number; hoogte: number },
): { x: number; y: number; breedte: number; hoogte: number } {
  const ruimte = { breedte: Math.max(320, monitor.breedte - 2 * MARGE), hoogte: Math.max(320, monitor.hoogte - 2 * MARGE) };
  const doel = SHELL_MAAT[vorm];
  let breedte: number;
  let hoogte: number;
  if (vorm === 'bureaublad') {
    breedte = Math.min(doel.breedte, ruimte.breedte);
    hoogte = Math.min(doel.hoogte, ruimte.hoogte);
    return { x: monitor.x + MARGE, y: monitor.y + MARGE, breedte, hoogte };
  }
  const schaal = Math.min(1, ruimte.breedte / doel.breedte, ruimte.hoogte / doel.hoogte);
  breedte = Math.round(doel.breedte * schaal);
  hoogte = Math.round(doel.hoogte * schaal);
  return {
    x: Math.round(monitor.x + (monitor.breedte - breedte) / 2),
    y: Math.round(monitor.y + (monitor.hoogte - hoogte) / 2),
    breedte,
    hoogte,
  };
}

export interface ToestelRij {
  device_id: string;
  device_name: string | null;
  platform: string | null;
  last_seen: string | null;
}

/**
 * Welk toestel is "de iMac" of "de Mac mini"?
 *
 * Op naam als die het zegt ("main-imac-luka", "Lukas-Mac-mini"). Tot 29 okt
 * heetten beide Macs gewoon "Mac", dus: is er precies één andere Mac online
 * naast een herkende iMac, dan is dat de Mac mini, en omgekeerd.
 */
export function toestelVoor(keuze: ToestelKeuze, rijen: ToestelRij[], nu: number, versMs = 120_000): ToestelRij | null {
  if (keuze === 'hier') return null;
  const online = rijen.filter(r => r.platform === 'macos' && r.last_seen && nu - Date.parse(r.last_seen) <= versMs);
  const naam = (r: ToestelRij) => klein(`${r.device_name ?? ''} ${r.device_id}`);
  const isImac = (r: ToestelRij) => /imac/.test(naam(r));
  const isMini = (r: ToestelRij) => /mac ?-?mini|\bmini\b/.test(naam(r));
  const direct = online.find(keuze === 'imac' ? isImac : isMini);
  if (direct) return direct;
  const wel = online.filter(keuze === 'imac' ? isMini : isImac);
  const rest = online.filter(r => !isImac(r) && !isMini(r));
  return wel.length === 1 && rest.length === 1 ? rest[0] : null;
}

export const SHELL_CAPABILITY = 'axe_shell';

/** De core_tasks-rij die een ander toestel een app laat openen. `pending`, dus de VPS-worker claimt hem niet. */
export function shellOpdracht(app: EigenApp, plek: Plek, doel: ToestelRij, requestedBy: string | undefined) {
  return {
    capability: SHELL_CAPABILITY,
    status: 'pending',
    source_app: 'axe_core',
    requested_by: requestedBy,
    title: `Open ${app.naam} on ${doel.device_name ?? doel.device_id}`,
    goal: `open ${app.id}`,
    execution_mode: 'read',
    target_device: doel.device_id,
    payload: { app: app.id, scherm: plek.scherm, vorm: plek.vorm ?? null },
  };
}
