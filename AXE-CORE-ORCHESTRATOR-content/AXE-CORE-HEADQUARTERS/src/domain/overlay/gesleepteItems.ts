/**
 * Wat er in de notch valt, en wat het is.
 *
 * De notch nam tot nu toe alleen `dataTransfer.files`. Sleep je een link uit
 * je browser of een stuk geselecteerde tekst, dan gebeurde er niets — geen
 * foutmelding, geen chip, niets. Dat is de stilste soort kapot: je sleept,
 * je ziet de drop-rand oplichten, en daarna is het weg.
 *
 * Deze module kent geen DOM en geen React, zodat elk geval te toetsen is
 * zonder een browser te starten.
 *
 * De drie dingen die hier stilletjes misgaan als je ze niet apart regelt:
 *
 * 1. **Eén sleep levert vaak twee vormen op.** Sleep je een afbeelding van
 *    een webpagina, dan krijg je én een `text/uri-list` én een `text/plain`
 *    met dezelfde URL, en soms ook nog een bestand. Zonder ontdubbelen staan
 *    er drie chips voor één handeling.
 * 2. **`text/uri-list` mag meerdere regels hebben**, en regels die met `#`
 *    beginnen zijn commentaar — dat staat zo in RFC 2483. Wie de hele blob
 *    als één URL behandelt, krijgt een chip met een commentaarregel erin.
 * 3. **Niet elke tekst met `http` erin is een link.** Sleep je een alinea
 *    waar toevallig een URL in staat, dan is dat een notitie en geen link.
 *    Daarom telt alleen tekst die in zijn geheel één URL is.
 */

export type GesleeptSoort = 'image' | 'doc' | 'sheet' | 'file' | 'link' | 'text';

/** De bakjes waarin de notch sorteert. De volgorde is de volgorde op het scherm. */
export const GROEP_VOLGORDE = ['screenshots', 'fotos', 'documenten', 'downloads', 'links', 'notities'] as const;

export type GesleeptGroep = (typeof GROEP_VOLGORDE)[number];

export const GROEP_LABEL: Record<GesleeptGroep, string> = {
  screenshots: 'Screenshots',
  fotos: "Foto's",
  documenten: 'Documenten',
  downloads: 'Downloads',
  links: 'Links',
  notities: 'Notities',
};

export type GesleeptItem = {
  soort: GesleeptSoort;
  /** Wat de gebruiker in de chip ziet. */
  label: string;
  /** Bytes voor een bestand, anders null. */
  grootte: number | null;
  /** De volledige URL of tekst; null voor een bestand. */
  waarde: string | null;
  groep: GesleeptGroep;
  bestemming: Bestemming;
};

/**
 * Waar iets heen gaat als je het loslaat.
 *
 * `chat` = iets om nu over te praten. `axon` = iets om te onthouden.
 *
 * De scheiding die ertoe doet: een screenshot sleep je erin omdat je er een
 * vraag over hebt, een notitie of een link sleep je erin omdat je hem later
 * terug wilt vinden. Het eerste hoort in het gesprek, het tweede in het
 * geheugen.
 *
 * Dit is één functie met één tabel, zodat het omzetten één regel is als het
 * in de praktijk anders blijkt te liggen.
 */
export type Bestemming = 'chat' | 'axon';

export const BESTEMMING_PER_GROEP: Record<GesleeptGroep, Bestemming> = {
  screenshots: 'chat',
  fotos: 'chat',
  documenten: 'chat',
  downloads: 'chat',
  links: 'axon',
  notities: 'axon',
};

/**
 * Of deze bestandsnaam een schermafbeelding is.
 *
 * Een screenshot en een bewaarde foto zijn allebei een png; het verschil zit
 * in de naam. macOS schrijft "Screenshot 2026-11-05 at 10.23.45", in het
 * Nederlands "Schermafbeelding", oudere versies "Screen Shot", en CleanShot
 * en Shottr hebben hun eigen vorm. Windows gebruikt "Schermopname".
 *
 * Bewust op de naam en niet op het pad: `dataTransfer.files` geeft in een
 * browser geen pad, dus een padregel zou in de helft van de gevallen stil
 * niets doen.
 */
const SCREENSHOT_PATROON =
  /^(screenshot|screen[ _-]?shot|schermafbeelding|schermopname|cleanshot|shottr|sc[r]?-\d)/i;

export function isScreenshot(naam: string): boolean {
  return SCREENSHOT_PATROON.test(naam.trim());
}

/** In welk bakje dit item hoort. */
export function groepVoor(soort: GesleeptSoort, naam: string): GesleeptGroep {
  if (soort === 'link') return 'links';
  if (soort === 'text') return 'notities';
  if (soort === 'image') return isScreenshot(naam) ? 'screenshots' : 'fotos';
  if (soort === 'doc' || soort === 'sheet') return 'documenten';
  // Alles wat we niet thuisbrengen — zips, installers, onbekende extensies.
  return 'downloads';
}

/** Hoeveel er in één keer bij mogen. Een map erin slepen is zo 400 bestanden. */
export const MAX_PER_SLEEP = 8;

export function bestandSoort(naam: string): GesleeptSoort {
  const ext = naam.split('.').pop()?.toLowerCase() || '';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'heic', 'avif'].includes(ext)) return 'image';
  if (['pdf', 'doc', 'docx', 'txt', 'md', 'rtf', 'pages'].includes(ext)) return 'doc';
  if (['csv', 'xlsx', 'xls', 'numbers', 'tsv'].includes(ext)) return 'sheet';
  return 'file';
}

/**
 * Of deze tekst in zijn geheel één URL is.
 *
 * Bewust streng: `new URL()` accepteert van alles, ook `mailto:` en
 * verzonnen schema's. Een link die je sleept is in de praktijk http(s), en
 * alles daarbuiten is beter af als tekst dan als een chip die nergens heen
 * gaat.
 */
export function isLink(tekst: string): boolean {
  const t = tekst.trim();
  if (!t || /\s/.test(t)) return false;
  try {
    const u = new URL(t);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/** De host zonder `www.`, als korte naam voor een link-chip. */
export function linkLabel(url: string): string {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');
    const pad = u.pathname.replace(/\/$/, '');
    return pad && pad !== '' ? `${host}${pad.length > 24 ? `${pad.slice(0, 24)}…` : pad}` : host;
  } catch {
    return url;
  }
}

/** Regels uit een `text/uri-list`, zonder commentaar en lege regels (RFC 2483). */
export function urlsUitUriList(blob: string): string[] {
  return blob
    .split(/\r?\n/)
    .map((r) => r.trim())
    .filter((r) => r !== '' && !r.startsWith('#'))
    .filter(isLink);
}

export type SleepInvoer = {
  bestanden?: { name: string; size: number }[];
  uriList?: string | null;
  tekst?: string | null;
};

/**
 * Sorteer wat er gesleept is tot een nette lijst.
 *
 * Bestanden eerst, dan links, dan tekst — dat is de volgorde waarin ze
 * meestal bedoeld zijn, en hij ligt vast zodat de chips niet per sleep
 * verspringen.
 */
function maak(soort: GesleeptSoort, label: string, grootte: number | null, waarde: string | null): GesleeptItem {
  const groep = groepVoor(soort, label);
  return { soort, label, grootte, waarde, groep, bestemming: BESTEMMING_PER_GROEP[groep] };
}

export function sorteerSleep(invoer: SleepInvoer): GesleeptItem[] {
  const uit: GesleeptItem[] = [];
  const gezien = new Set<string>();

  for (const f of invoer.bestanden ?? []) {
    uit.push(maak(bestandSoort(f.name), f.name, f.size, null));
  }

  for (const url of urlsUitUriList(invoer.uriList ?? '')) {
    if (gezien.has(url)) continue;
    gezien.add(url);
    uit.push(maak('link', linkLabel(url), null, url));
  }

  const tekst = (invoer.tekst ?? '').trim();
  if (tekst) {
    if (isLink(tekst)) {
      // Dezelfde URL als in de uri-list: één sleep, één chip.
      if (!gezien.has(tekst)) {
        gezien.add(tekst);
        uit.push(maak('link', linkLabel(tekst), null, tekst));
      }
    } else {
      const eersteRegel = tekst.split(/\r?\n/)[0] ?? tekst;
      uit.push(maak('text', eersteRegel.length > 40 ? `${eersteRegel.slice(0, 40)}…` : eersteRegel, null, tekst));
    }
  }

  return uit.slice(0, MAX_PER_SLEEP);
}

/**
 * De items op een rij, per bakje, in een vaste volgorde.
 *
 * Lege bakjes komen er niet in: een kopje "Downloads" boven niets is ruis.
 */
export function groepeerSleep(items: GesleeptItem[]): { groep: GesleeptGroep; label: string; items: GesleeptItem[] }[] {
  return GROEP_VOLGORDE.map((groep) => ({
    groep,
    label: GROEP_LABEL[groep],
    items: items.filter((i) => i.groep === groep),
  })).filter((g) => g.items.length > 0);
}
