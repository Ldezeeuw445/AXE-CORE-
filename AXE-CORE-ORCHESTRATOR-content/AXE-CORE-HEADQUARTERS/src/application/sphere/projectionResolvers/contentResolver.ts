/**
 * Alles wat geen kaart en geen grafiek is, maar wel "laat dit zien":
 * een nieuwsbericht, een artikel, een onderwerp. De bol toont de tekst.
 *
 * Tavily is de live bron die de rest van AXE al gebruikt. Wikipedia is de
 * terugval als die zoekopdracht leeg of geweigerd is, zodat een vraag nooit
 * eindigt als een kaart van Amsterdam.
 */
import type { ProjectionPayload } from '@/domain/sphere/projectionTypes';
import { tavilySearch, type TavilyResult } from '@/infrastructure/gateways/tavilyService';

const SHOW_RE =
  /\b(laat(\s+\S+){0,8}\s+zien|toon|show(\s+me)?|display|projecteer|bekijk)\b/i;
const NEWS_RE = /\b(nieuws|news|artikel|article|headline|koppen|bericht|berichten)\b/i;
/** "open google en zoek X op", "google X", "look up X", "search for X" —
 *  opzoeken is ook laten zien: het resultaat hoort op de bol, niet alleen in tekst. */
const NIET_WEB_RE = /\b(mail|e-?mail|inbox|bestand\w*|files?|map(je)?\s+op|geheugen|memory|repo|code|agent|taak|task)\b/i;
const SEARCH_RE =
  /\b(zoek(\s+\S+){0,10}\s+op|opzoeken|googl\w*|look\s+up|search(\s+for)?|zoek\s+naar)\b/i;

export function wantsShownContent(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  // Zoeken in eigen spullen (mail, bestanden, geheugen) is geen webzoekopdracht.
  const zoektWeb = SEARCH_RE.test(t) && !NIET_WEB_RE.test(t);
  return SHOW_RE.test(t) || NEWS_RE.test(t) || zoektWeb;
}

function subjectOfSearch(text: string): string | null {
  const t = text.replace(/\b(kan|kun|wil)\s+je\b|\b(can|could|would)\s+you\b|\b(hey|hoi|yo)\s+axe\b|\balsjeblieft|\bplease\b/gi, ' ');
  return t.match(/(?:opzoeken|googlen|look\s+up)\s*[:,-]\s*(.+)/i)?.[1]
    ?? t.match(/zoek\s+(?:eens\s+|even\s+)?(.+?)\s+op\b/i)?.[1]
    ?? t.match(/zoek\s+naar\s+(.+)/i)?.[1]
    ?? t.match(/(?:look\s+up|search(?:\s+for)?|googl\w*(?:\s+(?:naar|for))?)\s+(?!en\b|and\b)(.+)/i)?.[1]
    ?? t.match(/(.+?)\s+(?:opzoeken|googlen)\b/i)?.[1]
    ?? null;
}

/** Haal het onderwerp uit "laat X zien" / "show me X". */
export function subjectOfShow(text: string): string {
  const zoek = subjectOfSearch(text);
  if (zoek) return zoek.replace(/^(open\s+)?google\s+(en|and)\s+/i, '').replace(/^(me|mij|even|de|het|een|the|a|an)\s+/i, '').replace(/[.!?]+$/g, '').trim();
  const laat = text.match(/laat\s+(.+?)\s+zien/i);
  const raw = laat?.[1]
    ?? text.match(/(?:toon|show(?:\s+me)?|display|projecteer|bekijk)\s+(.+)/i)?.[1]
    ?? text;
  return raw
    .replace(/^(me|mij|even|de|het|een|the|a|an)\s+/i, '')
    .replace(/[.!?]+$/g, '')
    .trim();
}

function pack(
  partial: Omit<ProjectionPayload, 'id' | 'createdAt'>,
): ProjectionPayload {
  return {
    ...partial,
    id: `proj_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    createdAt: Date.now(),
  };
}

function formatResults(results: TavilyResult[]): string {
  return results.slice(0, 5).map((item) => {
    const when = item.published_date ? ` (${item.published_date.slice(0, 10)})` : '';
    return `${item.title}${when}\n${item.content}\n${item.url}`;
  }).join('\n\n');
}

async function wikiSummary(subject: string): Promise<string | null> {
  const title = encodeURIComponent(subject.slice(0, 180));
  for (const host of ['nl.wikipedia.org', 'en.wikipedia.org']) {
    try {
      const res = await fetch(`https://${host}/api/rest_v1/page/summary/${title}`, {
        headers: { Accept: 'application/json', 'User-Agent': 'AXE-CORE/1.0 (home-sphere)' },
        signal: AbortSignal.timeout(8_000),
      });
      if (!res.ok) continue;
      const data = await res.json() as { extract?: string; title?: string; content_urls?: { desktop?: { page?: string } } };
      if (!data.extract) continue;
      const page = data.content_urls?.desktop?.page ?? `https://${host}/wiki/${title}`;
      return `${data.title || subject}\n${data.extract}\n${page}`;
    } catch {
      /* volgende taal */
    }
  }
  return null;
}

export async function resolveShownContent(
  text: string,
  search: typeof tavilySearch = tavilySearch,
): Promise<ProjectionPayload> {
  const subject = subjectOfShow(text) || text.trim();
  const query = NEWS_RE.test(text) && !NEWS_RE.test(subject) ? `${subject} nieuws` : subject;
  let body = '';
  let subtitle = 'Live web';

  try {
    const results = await search(query, { maxResults: 5 });
    if (results.length) {
      body = formatResults(results);
      try {
        subtitle = new URL(results[0].url).hostname;
      } catch {
        subtitle = 'Live web';
      }
    }
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'zoeken mislukt';
    subtitle = reason.slice(0, 80);
  }

  if (!body) {
    const wiki = await wikiSummary(subject);
    if (wiki) {
      body = wiki;
      subtitle = 'Wikipedia';
    }
  }

  if (!body) {
    body = `Geen bron gevonden voor “${subject}”.`;
    subtitle = 'Geen resultaat';
  }

  return pack({
    mode: 'document',
    title: subject.slice(0, 64) || 'Home',
    subtitle,
    text: body.slice(0, 12_000),
    source: 'director',
  });
}

/**
 * Een plaatje van iets ("laat een foto van de Eiffeltoren zien", of AXE die een
 * voorbeeld wil tonen): de hoofdafbeelding van het Wikipedia-artikel. Geen
 * zoekmachine voor plaatjes nodig, en de bron staat erbij.
 */
export async function resolveImage(query: string, title?: string): Promise<ProjectionPayload> {
  const onderwerp = query.trim();
  for (const host of ['en.wikipedia.org', 'nl.wikipedia.org']) {
    try {
      const res = await fetch(`https://${host}/api/rest_v1/page/summary/${encodeURIComponent(onderwerp.slice(0, 180))}`, {
        headers: { Accept: 'application/json', 'User-Agent': 'AXE-CORE/1.0 (home-sphere)' },
        signal: AbortSignal.timeout(8_000),
      });
      if (!res.ok) continue;
      const data = await res.json() as { title?: string; originalimage?: { source?: string }; thumbnail?: { source?: string } };
      const src = data.originalimage?.source || data.thumbnail?.source;
      if (!src) continue;
      return pack({ mode: 'image', title: title || data.title || onderwerp, subtitle: 'Wikipedia', mediaUrl: src, source: 'director' });
    } catch {
      /* volgende taal */
    }
  }
  // Geen plaatje: dan wat er over te lezen is, zodat Home niet leeg blijft.
  return resolveShownContent(`show ${onderwerp}`);
}
