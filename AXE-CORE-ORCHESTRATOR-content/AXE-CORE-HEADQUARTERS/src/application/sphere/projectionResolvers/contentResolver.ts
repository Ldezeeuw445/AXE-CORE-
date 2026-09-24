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

export function wantsShownContent(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  return SHOW_RE.test(t) || NEWS_RE.test(t);
}

/** Haal het onderwerp uit "laat X zien" / "show me X". */
export function subjectOfShow(text: string): string {
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
