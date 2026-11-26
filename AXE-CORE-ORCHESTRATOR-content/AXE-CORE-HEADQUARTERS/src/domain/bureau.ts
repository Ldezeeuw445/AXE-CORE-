/**
 * Bureau (BOUWLIJST, 26 nov): mappen met links -- sites, tools, methodes --
 * elk met één regel waarom hij ertoe doet. Gedeeld tussen de apparaten via
 * global_memory (category luka_bureau, key `link:<id>`). Weghalen = archiveren
 * (de rij blijft, met `weg`), nooit wissen. Geen I/O hier.
 *
 *   "bewaar https://x.com in Tools: waarom"     -> link in map Tools
 *   "zet x.com op mijn bureau: waarom"           -> map Algemeen
 *   "wat staat er op mijn bureau"                -> de mappen met tellingen
 */

export const BUREAU_CATEGORIE = 'luka_bureau';
export const BUREAU_PREFIX = 'link:';
export const STANDAARD_MAP = 'Algemeen';

export interface BureauLink {
  id: string;
  url: string;
  titel: string;
  map: string;
  waarom: string;
  /** ms sinds epoch */
  op: number;
  weg?: boolean;
}

/** "x.com/pad" -> "https://x.com/pad"; null als het geen web-adres is. */
export function normUrl(ruw: string): string | null {
  const t = (ruw ?? '').trim().replace(/[),.;]+$/, '');
  if (!t || /\s/.test(t)) return null;
  const metSchema = /^https?:\/\//i.test(t) ? t : `https://${t}`;
  try {
    const u = new URL(metSchema);
    if (!/^https?:$/.test(u.protocol) || !u.hostname.includes('.')) return null;
    return u.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

export function domein(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

/** Vast id per adres: dezelfde link twee keer bewaren werkt hem bij. */
export function linkId(url: string): string {
  let h = 2166136261;
  for (const c of url.toLowerCase()) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return h.toString(36);
}

export function mapNaam(ruw: string | undefined): string {
  const t = (ruw ?? '').trim().replace(/^(?:de|het|map|folder)\s+/i, '').replace(/\s+/g, ' ').slice(0, 40);
  if (!t) return STANDAARD_MAP;
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export type BureauOpdracht =
  | { soort: 'bewaar'; url: string; map: string; waarom: string }
  | { soort: 'lijst' };

const URL_DEEL = '((?:https?:\\/\\/)?[^\\s]+\\.[^\\s]+)';
const BEWAAR = new RegExp(`^(?:axe[,\\s]+)?(?:bewaar|zet|save|add|leg)\\s+(?:de\\s+link\\s+|link\\s+)?${URL_DEEL}(?:\\s+(?:in|onder|bij|op|to|under)\\s+(?:de\\s+map\\s+|map\\s+|mijn\\s+|het\\s+|the\\s+|my\\s+)?([^:–-]+?))?\\s*(?:[:–-]\\s*([\\s\\S]+))?$`, 'i');
const LIJST = /^(?:axe[,\s]+)?(?:wat\s+(?:staat|ligt)\s+(?:er\s+)?op\s+(?:mijn|het)\s+bureau|toon\s+(?:mijn\s+|het\s+)?bureau|mijn\s+bureau|what(?:'s|\s+is)\s+on\s+my\s+desk)\s*[?.!]*$/i;

export function bureauOpdracht(tekst: string): BureauOpdracht | null {
  const t = (tekst ?? '').trim();
  if (!t) return null;
  if (t.length <= 50 && LIJST.test(t)) return { soort: 'lijst' };
  const m = BEWAAR.exec(t);
  if (!m) return null;
  const url = normUrl(m[1]);
  if (!url) return null;
  let map = (m[2] ?? '').trim();
  // "op mijn bureau" / "on my desk" is geen map.
  if (/^(?:bureau|desk)$/i.test(map)) map = '';
  return { soort: 'bewaar', url, map: mapNaam(map), waarom: (m[3] ?? '').trim().replace(/\s+/g, ' ').slice(0, 200) };
}

/** Zichtbare links per map, mappen op naam, links nieuwste eerst. */
export function perMap(links: readonly BureauLink[], zoek = ''): { map: string; links: BureauLink[] }[] {
  const z = zoek.trim().toLowerCase();
  const zicht = links.filter((l) => !l.weg && (!z || `${l.titel} ${l.url} ${l.waarom} ${l.map}`.toLowerCase().includes(z)));
  const groepen = new Map<string, BureauLink[]>();
  for (const l of zicht) groepen.set(l.map, [...(groepen.get(l.map) ?? []), l]);
  return [...groepen.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'nl'))
    .map(([map, ls]) => ({ map, links: ls.sort((a, b) => b.op - a.op) }));
}

export function leesLink(key: string, value: string): BureauLink | null {
  if (!key.startsWith(BUREAU_PREFIX)) return null;
  try {
    const o = JSON.parse(value) as Partial<BureauLink>;
    if (typeof o.url !== 'string' || !o.url) return null;
    return {
      id: key.slice(BUREAU_PREFIX.length),
      url: o.url,
      titel: typeof o.titel === 'string' && o.titel ? o.titel : domein(o.url),
      map: mapNaam(o.map),
      waarom: typeof o.waarom === 'string' ? o.waarom : '',
      op: typeof o.op === 'number' ? o.op : 0,
      ...(o.weg ? { weg: true } : {}),
    };
  } catch {
    return null;
  }
}

export function bewaardAntwoord(l: BureauLink): string {
  const waarom = l.waarom ? '' : ' Zet er nog één regel bij waarom hij ertoe doet, op de Bureau-pagina of met "bewaar <link> in <map>: waarom".';
  return `Op je bureau gezet: ${domein(l.url)} in ${l.map}.${waarom}`;
}

export function lijstAntwoord(links: readonly BureauLink[]): string {
  const groepen = perMap(links);
  if (!groepen.length) return 'Je bureau is nog leeg. Zeg "bewaar <link> in <map>: waarom", of open Bureau onder More > Work.';
  const regels = groepen.map((g) => `- ${g.map} (${g.links.length}): ${g.links.slice(0, 3).map((l) => domein(l.url)).join(', ')}${g.links.length > 3 ? ', …' : ''}`);
  return `Op je bureau:\n${regels.join('\n')}\nAlles staat onder More > Work > Bureau.`;
}

const WIL_BUREAU = /\b(?:bureau|mijn\s+links|my\s+links|bladwijzers|bookmarks)\b/i;

/** Het bureau in de prompt, alleen als het bericht erover gaat. */
export function bureauBlok(links: readonly BureauLink[], bericht: string): string {
  if (!WIL_BUREAU.test(bericht ?? '')) return '';
  const groepen = perMap(links);
  if (!groepen.length) return '\n\n## Luka\'s desk (Bureau)\nEmpty so far.';
  const delen = groepen.map((g) => `### ${g.map}\n${g.links.slice(0, 15).map((l) => `- ${l.titel} <${l.url}>${l.waarom ? ` -- ${l.waarom}` : ''}`).join('\n')}`);
  return `\n\n## Luka's desk (Bureau): his saved links with why they matter\n${delen.join('\n')}`;
}
