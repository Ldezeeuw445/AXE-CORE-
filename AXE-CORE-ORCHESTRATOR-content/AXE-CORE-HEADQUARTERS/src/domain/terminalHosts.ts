/**
 * De machines waarop AXE Core een shell kan openen.
 *
 * ## Waarom dit een lijst is en geen vast adres
 *
 * `terminalWsUrl.ts` had één adres hardgecodeerd: de VPS. Alles wat je op je
 * Mac mini moest doen -- een lokale API herstarten, een poort vrijmaken, een
 * bouw draaien -- deed je dus in Terminal.app naast de app, met het heen en weer
 * dat daarbij hoort. Terwijl `terminal-server.cjs` gewoon een Node-script is dat
 * overal draait.
 *
 * ## Waarom elke host een "waarvoor" heeft
 *
 * Vier shells die er identiek uitzien zijn vier kansen om het verkeerde
 * commando op de verkeerde machine te plakken -- en dat is precies het soort
 * fout dat je pas merkt als er iets stuk is. De naam zegt WELKE machine, het
 * waarvoor zegt WANNEER je hem nodig hebt. Beide staan op het scherm.
 *
 * ## Ingebouwd versus zelf toegevoegd
 *
 * De twee die er altijd zijn staan hier. De rest (een iMac, een tweede VPS)
 * voegt de gebruiker toe; die worden lokaal bewaard, want een adres in je eigen
 * netwerk hoort niet in een gedeelde bundel.
 */

export interface TerminalHost {
  id: string;
  /** Welke machine. Kort genoeg voor een knop. */
  naam: string;
  /** Waarvoor je hem nodig hebt. Eén regel, in gewone taal. */
  waarvoor: string;
  /** ws:// of wss://, inclusief pad. De token wordt er later aan geplakt. */
  wsUrl: string;
  /** Of hij uit deze lijst komt of door de gebruiker is toegevoegd. */
  ingebouwd?: boolean;
}

/** De poort waarop terminal-server.cjs standaard luistert. */
export const TERMINAL_POORT = 4022;

export const INGEBOUWDE_HOSTS: readonly TerminalHost[] = [
  {
    id: 'deze-mac',
    naam: 'Deze Mac',
    waarvoor: 'Waar AXE Core nu draait — bouwen, lokale API, poorten',
    // Zonder tls: het verkeer verlaat de machine niet. Een certificaat voor
    // 127.0.0.1 bestaat niet zinnig en zou alleen een waarschuwing opleveren.
    wsUrl: `ws://127.0.0.1:${TERMINAL_POORT}/terminal`,
    ingebouwd: true,
  },
  {
    id: 'imac',
    naam: 'iMac',
    waarvoor: 'De andere Mac',
    // Leeg: het adres staat hier niet en mag niet verzonnen worden. Het scherm
    // toont dan een invulveld in plaats van een knop die stil faalt.
    wsUrl: '',
    ingebouwd: true,
  },
  {
    id: 'vps-strato',
    naam: 'VPS Strato',
    waarvoor: 'axe-core-api, de terminal-server, de cron — de hoofdserver',
    wsUrl: 'wss://api.axecompanion.com/terminal',
    ingebouwd: true,
  },
  {
    id: 'vps-hetzner',
    naam: 'VPS Hetzner',
    waarvoor: 'De tweede server',
    wsUrl: '',
    ingebouwd: true,
  },
] as const;

/**
 * Adressen die de gebruiker zelf invulde voor een INGEBOUWDE host.
 *
 * Apart van de zelf toegevoegde machines: een ingebouwde host heeft al een naam
 * en een rol, alleen zijn adres ontbreekt. Hem als "eigen host" laten toevoegen
 * zou een tweede regel met dezelfde naam opleveren.
 */
export const ADRESSEN_SLEUTEL = 'axe_terminal_adressen';

/** De host met een ingevuld adres, als dat er is. */
export function metAdres(
  host: TerminalHost,
  adressen: Record<string, string> | null | undefined,
): TerminalHost {
  const eigen = adressen?.[host.id];
  return eigen && geldigWsAdres(eigen) ? { ...host, wsUrl: eigen } : host;
}

/** Of deze host klaar is om verbinding te maken. */
export function isKlaar(host: TerminalHost): boolean {
  return geldigWsAdres(host.wsUrl);
}

export const HOSTS_SLEUTEL = 'axe_terminal_hosts';
export const LAATSTE_HOST_SLEUTEL = 'axe_terminal_laatste';

/**
 * Of dit adres bruikbaar is als terminal-verbinding.
 *
 * Streng op het schema: een `http://` hier levert een verbinding op die stil
 * mislukt, en dan zoek je bij de server terwijl het adres fout was.
 */
export function geldigWsAdres(url: string): boolean {
  const t = (url || '').trim();
  if (!/^wss?:\/\//i.test(t)) return false;
  try {
    // eslint-disable-next-line no-new
    new URL(t);
    return true;
  } catch {
    return false;
  }
}

/** Een door de gebruiker toegevoegde host opschonen. Null als hij niet deugt. */
export function maakHost(naam: string, waarvoor: string, wsUrl: string): TerminalHost | null {
  const n = (naam || '').trim();
  const w = (wsUrl || '').trim();
  if (!n || !geldigWsAdres(w)) return null;
  return {
    // Uit de naam, zodat twee keer dezelfde naam niet twee regels oplevert die
    // je niet uit elkaar houdt.
    id: n.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `host-${Date.now()}`,
    naam: n,
    waarvoor: (waarvoor || '').trim() || 'Geen omschrijving',
    wsUrl: w,
  };
}

/**
 * De volledige lijst: ingebouwd eerst, daarna wat de gebruiker toevoegde.
 *
 * Een zelf toegevoegde host met een id dat al bestaat wordt genegeerd in plaats
 * van te overschrijven -- anders kun je per ongeluk het adres van de VPS
 * vervangen en merk je dat pas als je commando ergens anders landt.
 */
export function alleHosts(eigen: TerminalHost[] | null | undefined): TerminalHost[] {
  // Ingebouwde hosts komen er ALTIJD in, ook zonder adres -- die tonen een
  // invulveld. Ze weglaten zou betekenen dat een machine die je hebt pas
  // bestaat als je hem hebt ingesteld, en dan weet je niet dat hij kan.
  const uit = [...INGEBOUWDE_HOSTS];
  const bekend = new Set(uit.map(h => h.id));
  for (const h of eigen ?? []) {
    if (!h || bekend.has(h.id) || !geldigWsAdres(h.wsUrl)) continue;
    bekend.add(h.id);
    uit.push(h);
  }
  return uit;
}

/** Welke host geselecteerd moet zijn. Valt terug op de eerste als de bewaarde
 *  keuze niet meer bestaat -- een verwijderde host hoort geen leeg scherm te
 *  geven. */
export function kiesHost(bewaardId: string | null | undefined, hosts: TerminalHost[]): TerminalHost {
  return hosts.find(h => h.id === bewaardId) ?? hosts[0];
}
