/**
 * WAAR de browser-agent draait.
 *
 * ## Waarom dit een keuze moet zijn
 *
 * De browser-agent is een HTTP-dienst (Playwright, `/browser/agent/...`) en
 * die stond vast op de VPS in Duitsland. Dat is één machine, en als die
 * onderuit gaat -- geheugen op, poorten dicht -- kan AXE niet meer browsen,
 * terwijl er twee Macs staan die het ook kunnen en die dichterbij zijn.
 *
 * Met een keuze werkt er altijd wel één. Dat is de hele reden: niet snelheid,
 * maar dat het ophoudt af te hangen van de zwakste schakel.
 *
 * ## Waarom de VPS de standaard blijft
 *
 * Hij is er, hij is ingericht, en hij draait ook als beide Macs uit staan. Wie
 * nooit iets kiest merkt dus geen verschil -- de keuze voegt toe, hij vervangt
 * niet.
 *
 * ## Waarom een URL en geen naam
 *
 * "Mac Mini" zegt de app niets. Een adres wel, en dat mag een tailnet-naam
 * zijn (`http://mac-mini.tailXXXX.ts.net:8099`) zodat het ook werkt als hij
 * niet op hetzelfde wifi zit. De naam ernaast is puur voor de leesbaarheid.
 */

export interface BrowserHost {
  /** Stabiel, want de keuze verwijst ernaar. */
  id: string;
  /** Wat er op de knop staat. */
  naam: string;
  /**
   * De basis waar `/browser/agent/...` op geplakt wordt. Leeg = de VPS, want
   * die loopt via de gewone API-basis en heeft hier geen eigen adres nodig.
   */
  url: string;
}

/** De VPS. Altijd aanwezig, niet te verwijderen, en de terugval. */
export const VPS_HOST: BrowserHost = { id: 'vps', naam: 'VPS', url: '' };

/**
 * Een adres dat we durven aan te roepen.
 *
 * Alleen http/https, en geen pad of query -- er wordt `/browser/agent/...`
 * achter geplakt, dus een basis met een pad geeft stilletjes een verkeerde
 * URL. Liever hier weigeren dan straks een 404 die op iets anders lijkt.
 */
export function geldigeHostUrl(ruw: string): string | null {
  const s = ruw.trim();
  if (!s) return null;
  let u: URL;
  try { u = new URL(s); } catch { return null; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  if (u.search || u.hash) return null;
  if (u.pathname !== '/' && u.pathname !== '') return null;
  return `${u.protocol}//${u.host}`;
}

/**
 * De gekozen host, of de VPS.
 *
 * Een keuze die naar een verwijderde host wijst valt terug in plaats van te
 * falen: een lijst opschonen mag nooit de browser stilzetten.
 */
export function gekozenHost(hosts: readonly BrowserHost[], keuze: string | null): BrowserHost {
  if (!keuze || keuze === VPS_HOST.id) return VPS_HOST;
  return hosts.find(h => h.id === keuze) ?? VPS_HOST;
}

/** De VPS vooraan, daarna de toegevoegde hosts in hun eigen volgorde. */
export function alleHosts(eigen: readonly BrowserHost[]): BrowserHost[] {
  return [VPS_HOST, ...eigen.filter(h => h.id !== VPS_HOST.id)];
}
