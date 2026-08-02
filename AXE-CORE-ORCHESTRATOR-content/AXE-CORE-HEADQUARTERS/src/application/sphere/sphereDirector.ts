/**
 * sphereDirector — application router for Living Display.
 * Flow: Memory → Router (this) → Workspace → Projection → Sphere
 */
import type { NormalizedAttachment } from '@/application/attachments/attachmentService';
import type { ProjectionPayload, ProjectionMode, ProjectionSource } from '@/domain/sphere/projectionTypes';
import { resolveChart } from '@/application/sphere/projectionResolvers/chartResolver';
import { resolveMap } from '@/application/sphere/projectionResolvers/mapResolver';

function id(): string {
  return `proj_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function base(
  partial: Omit<ProjectionPayload, 'id' | 'createdAt'>,
): ProjectionPayload {
  return { ...partial, id: id(), createdAt: Date.now() };
}

export function projectionFromAttachment(
  att: NormalizedAttachment,
  source: ProjectionSource = 'drop',
): ProjectionPayload | null {
  if (att.kind === 'image' && att.previewUrl) {
    return base({
      mode: 'image',
      title: att.name,
      subtitle: att.mime,
      mediaUrl: att.previewUrl,
      mime: att.mime,
      source,
    });
  }
  if ((att.kind === 'text' || att.kind === 'pdf' || att.kind === 'office') && att.text) {
    const mode: ProjectionMode = /\.(tsx?|jsx?|py|rs|go|java|css|html)$/i.test(att.name)
      ? 'code'
      : 'document';
    return base({
      mode,
      title: att.name,
      subtitle: att.kind.toUpperCase(),
      text: att.text,
      mime: att.mime,
      source,
    });
  }
  if (att.name) {
    return base({
      mode: 'document',
      title: att.name,
      subtitle: `${att.kind} · no text extract`,
      text: att.text || `File attached: ${att.name}\nType: ${att.mime}\nKind: ${att.kind}`,
      mime: att.mime,
      source,
    });
  }
  return null;
}

export function projectionFromAttachments(
  attachments: NormalizedAttachment[],
  source: ProjectionSource = 'drop',
): ProjectionPayload | null {
  if (!attachments.length) return null;
  const image = attachments.find(a => a.kind === 'image' && a.previewUrl);
  if (image) return projectionFromAttachment(image, source);
  const code = attachments.find(a => a.text && /\.(tsx?|jsx?|py|rs|go)$/i.test(a.name));
  if (code) return projectionFromAttachment(code, source);
  const doc = attachments.find(a => a.text && (a.kind === 'pdf' || a.kind === 'text' || a.kind === 'office'));
  if (doc) return projectionFromAttachment(doc, source);
  return projectionFromAttachment(attachments[0], source);
}

export function projectionFromResolved(input: {
  mode: ProjectionMode;
  title: string;
  subtitle?: string;
  text?: string;
  mediaUrl?: string;
  mime?: string;
  data?: Record<string, unknown>;
  source?: ProjectionSource;
}): ProjectionPayload {
  return base({
    mode: input.mode,
    title: input.title,
    subtitle: input.subtitle,
    text: input.text,
    mediaUrl: input.mediaUrl,
    mime: input.mime,
    data: input.data,
    source: input.source ?? 'director',
  });
}

export function parseProjectMarker(text: string): ProjectionPayload | null {
  const m = text.match(/\[PROJECT:\s*(\{[\s\S]*?\})\s*\]/i);
  if (!m) return null;
  try {
    const raw = JSON.parse(m[1]) as Record<string, unknown>;
    const mode = String(raw.mode || 'document') as ProjectionMode;
    const allowed: ProjectionMode[] = ['document', 'image', 'chart', 'map', 'code', 'media'];
    if (!allowed.includes(mode)) return null;
    return base({
      mode,
      title: String(raw.title || 'Projection'),
      subtitle: raw.subtitle != null ? String(raw.subtitle) : undefined,
      text: raw.text != null ? String(raw.text) : undefined,
      mediaUrl: raw.mediaUrl != null ? String(raw.mediaUrl) : undefined,
      mime: raw.mime != null ? String(raw.mime) : undefined,
      data: typeof raw.data === 'object' && raw.data ? (raw.data as Record<string, unknown>) : undefined,
      source: 'tool',
    });
  } catch {
    return null;
  }
}

function extractCodeFence(text: string): { lang: string; body: string } | null {
  const m = text.match(/```([a-zA-Z0-9_+-]*)\n([\s\S]{40,}?)```/);
  if (!m) return null;
  return { lang: (m[1] || 'code').toLowerCase(), body: m[2].trim() };
}

function extractSeries(text: string): { label: string; value: number }[] | null {
  const rows: { label: string; value: number }[] = [];
  const tableRe = /^\|\s*([^|]+?)\s*\|\s*([-+]?\d+[.,]?\d*)\s*\|/gm;
  let tm: RegExpExecArray | null;
  while ((tm = tableRe.exec(text)) !== null) {
    const label = tm[1].trim();
    if (/^[-:]+$/.test(label) || /label|name|source/i.test(label)) continue;
    const value = Number(tm[2].replace(',', '.'));
    if (!Number.isFinite(value)) continue;
    rows.push({ label: label.slice(0, 24), value });
  }
  if (rows.length >= 2) return rows.slice(0, 16);

  const lineRe = /^\s*([A-Za-z][\w\s/%.-]{1,28})\s*[:—-]\s*€?\$?([-+]?\d+[.,]?\d*)\s*%?\s*$/gm;
  let lm: RegExpExecArray | null;
  while ((lm = lineRe.exec(text)) !== null) {
    const value = Number(lm[2].replace(',', '.'));
    if (!Number.isFinite(value)) continue;
    rows.push({ label: lm[1].trim().slice(0, 24), value });
  }
  if (rows.length >= 2) return rows.slice(0, 16);
  return null;
}

function extractCoords(text: string): { lat: number; lng: number; label?: string } | null {
  const m = text.match(/(-?\d{1,2}\.\d{2,})\s*[,\s]\s*(-?\d{1,3}\.\d{2,})/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng, label: 'Pinned' };
}

/** "laat X zien" with anything between laat and zien */
const SHOW_FLEX_RE =
  /\b(laat(\s+\S+){0,6}\s+zien|toon|show(\s+me)?|display|projecteer|bekijk|view)\b/i;
const MAP_RE =
  /\b(kaart|map|maps|locatie|location|route|navigatie|coordinates?|\blat\b|\blng\b|city|stad|plaats)\b/i;
const CHART_RE =
  /\b(chart|grafiek|graph|plot|trading|candles?|price\s+action|koers|income|inkomen)\b/i;
const CODE_RE =
  /\b(code|snippet|diff|function|component|source)\b/i;

/** Well-known places — if user says "laat New York zien" without the word map */
const PLACE_HINT_RE =
  /\b(new\s*york|nyc|los\s*angeles|la\b|chicago|miami|toronto|tokyo|seoul|shanghai|hong\s*kong|singapore|sydney|melbourne|berlin|munich|madrid|barcelona|rome|milan|lisbon|stockholm|oslo|copenhagen|vienna|zurich|brussels|istanbul|moscow|dubai|abu\s*dhabi|tel\s*aviv|cairo|lagos|nairobi|johannesburg|s[aã]o\s*paulo|buenos\s*aires|mexico\s*city|mumbai|delhi|bangkok|jakarta|auckland|amsterdam|rotterdam|utrecht|den\s*haag|the\s*hague|paris|london|san\s*francisco|rio(\s*de\s*janeiro)?)\b/i;

/** Named landmarks, not just cities — "beweeg naar het Empire State
 *  Building" / "laat de Eiffeltoren zien" have no city name in them at
 *  all, so PLACE_HINT_RE alone would miss them. resolveMap()'s Nominatim
 *  fallback can already geocode any of these by name; this only decides
 *  whether to trigger it. */
const LANDMARK_HINT_RE =
  /\b(empire\s*state\s*(building)?|eiffel\s*tor+en|eiffel\s*tower|vrijheidsbeeld|statue\s*of\s*liberty|big\s*ben|colosseum|colosseo|vaticaan|vatican|taj\s*mahal|kremlin|acropolis|sagrada\s*fam[ií]lia|brandenburger\s*tor|brandenburg\s*gate|golden\s*gate(\s*bridge)?|times\s*square|central\s*park|buckingham\s*palace|louvre|witte\s*huis|white\s*house)\b/i;

function wantsSphereChart(text: string): boolean {
  const t = text.trim();
  if (CHART_RE.test(t)) return true;
  if (/^(toon|show|display)\s+(de\s+|het\s+)?(chart|grafiek)/i.test(t)) return true;
  if (/laat(\s+\S+){0,4}\s+zien/i.test(t) && CHART_RE.test(t)) return true;
  if (/^chart$/i.test(t) || /^grafiek$/i.test(t)) return true;
  return false;
}

function wantsSphereMap(text: string): boolean {
  const t = text.trim();
  if (MAP_RE.test(t)) return true;
  const isPlace = (s: string) => PLACE_HINT_RE.test(s) || LANDMARK_HINT_RE.test(s);
  // "laat new york zien" / "show me tokyo" / "beweeg naar de eiffeltoren"
  // without the word map
  if (SHOW_FLEX_RE.test(t) && isPlace(t)) return true;
  if (/laat(\s+\S+){0,6}\s+zien/i.test(t) && isPlace(t)) return true;
  if (/^(toon|show|display)\s+/i.test(t) && isPlace(t) && !CHART_RE.test(t) && !CODE_RE.test(t)) {
    return true;
  }
  return false;
}

function assistantWantsChart(text: string): boolean {
  if (/\[OPEN_WINDOW:[^\]]*trading/i.test(text)) return true;
  if (/chart_live_snapshots/i.test(text)) return true;
  if (/opening\s+(the\s+)?trading\s+chart/i.test(text)) return true;
  if (/trading\s+chart\s+view/i.test(text)) return true;
  if (/\[PROJECT:[^\]]*"mode"\s*:\s*"chart"/i.test(text)) return true;
  if (CHART_RE.test(text) && /(opening|toon|show|display|laat|project)/i.test(text)) return true;
  return false;
}

function assistantWantsMap(text: string): boolean {
  if (/\[OPEN_WINDOW:[^\]]*(maps?[-_]?3d|map)/i.test(text)) return true;
  if (/opening\s+(the\s+)?(3d\s+)?map/i.test(text)) return true;
  if (/\[PROJECT:[^\]]*"mode"\s*:\s*"map"/i.test(text)) return true;
  if (MAP_RE.test(text) && /(opening|toon|show|display|laat|project)/i.test(text)) return true;
  // A natural reply like "Ik laat je nu New York zien!" has a place name
  // but neither a MAP_RE keyword (kaart/stad/locatie) nor the old literal
  // "opening"/"map view"/"3d map" — so a perfectly good confirmation never
  // matched and nothing ever projected, while AXE's text claimed it did.
  // SHOW_FLEX_RE is the same broad verb set already used elsewhere here.
  if ((PLACE_HINT_RE.test(text) || LANDMARK_HINT_RE.test(text)) && (SHOW_FLEX_RE.test(text) || /(opening|map\s+view|3d\s+map)/i.test(text))) return true;
  return false;
}

/** Pull place name from user or assistant text for map resolver. */
function placeContextFromText(text: string): string {
  // Prefer last user-like place phrase
  const laat = text.match(/laat\s+(.+?)\s+zien/i);
  if (laat?.[1]) return laat[1].trim();
  const show = text.match(/(?:toon|show(?:\s+me)?|display)\s+(.+)/i);
  if (show?.[1]) return show[1].trim();
  return text;
}

export async function directFromChat(input: {
  text: string;
  attachments?: NormalizedAttachment[];
}): Promise<ProjectionPayload | null> {
  const text = input.text || '';
  const attachments = input.attachments ?? [];

  if (shouldDismissProjection(text)) return null;

  if (attachments.length && (SHOW_FLEX_RE.test(text) || !text.trim() || CHART_RE.test(text) || MAP_RE.test(text) || CODE_RE.test(text))) {
    return projectionFromAttachments(attachments, text.trim() ? 'chat' : 'drop');
  }
  if (attachments.length === 1 && !text.trim()) {
    return projectionFromAttachments(attachments, 'drop');
  }

  if (wantsSphereChart(text)) {
    return resolveChart(text);
  }
  if (wantsSphereMap(text)) {
    return resolveMap(placeContextFromText(text) || text);
  }

  // Flexible "laat X zien" that is not chart/code → try map geocode
  if (/laat(\s+\S+){1,6}\s+zien/i.test(text) && !CODE_RE.test(text)) {
    return resolveMap(placeContextFromText(text) || text);
  }

  if (!SHOW_FLEX_RE.test(text) && !CODE_RE.test(text)) return null;

  if (CODE_RE.test(text) && text.length > 40) {
    return projectionFromResolved({
      mode: 'code',
      title: 'Code',
      subtitle: 'from chat',
      text,
      source: 'chat',
    });
  }

  if (SHOW_FLEX_RE.test(text)) {
    return projectionFromResolved({
      mode: 'document',
      title: 'Request',
      subtitle: 'Awaiting resolved content',
      text:
        text +
        '\n\n—\nTip: “toon chart” · “laat New York zien” · drop a file · “klaar”.',
      source: 'chat',
    });
  }

  return null;
}

export function shouldDismissProjection(text: string): boolean {
  return /^(klaar|done|close|sluit|terug|back|dismiss)[.!\s]*$/i.test(text.trim());
}

export function directFromAssistantMessage(text: string): ProjectionPayload | null {
  if (!text || text.length < 12) return null;

  const marked = parseProjectMarker(text);
  if (marked) return marked;

  const fence = extractCodeFence(text);
  if (fence) {
    const lang = fence.lang;
    if (['json', 'csv', 'tsv'].includes(lang)) {
      const series = extractSeries(fence.body) || extractSeries(text);
      if (series) {
        return base({
          mode: 'chart',
          title: 'Series',
          subtitle: `from ${lang}`,
          text: text.slice(0, 400),
          data: { series, source: 'assistant' },
          source: 'tool',
        });
      }
    }
    return base({
      mode: 'code',
      title: lang && lang !== 'code' ? lang : 'Code',
      subtitle: 'from reply',
      text: fence.body.slice(0, 40_000),
      source: 'tool',
    });
  }

  if (CHART_RE.test(text) || /\|\s*\w+\s*\|\s*[-+]?\d/.test(text)) {
    const series = extractSeries(text);
    if (series) {
      return base({
        mode: 'chart',
        title: 'Chart',
        subtitle: 'from reply',
        text: text.slice(0, 400),
        data: { series, source: 'assistant' },
        source: 'tool',
      });
    }
  }

  if (MAP_RE.test(text)) {
    const coords = extractCoords(text);
    if (coords) {
      return base({
        mode: 'map',
        title: 'Map',
        subtitle: `${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`,
        text: text.slice(0, 400),
        data: { lat: coords.lat, lng: coords.lng, label: coords.label },
        source: 'tool',
      });
    }
  }

  const headingCount = (text.match(/^#{1,3}\s+.+$/gm) || []).length;
  if (text.length >= 600 && (headingCount >= 2 || /^\s*[-*]\s+/m.test(text))) {
    const titleLine = text.split('\n').find(l => l.trim().length > 3)?.replace(/^#+\s*/, '').slice(0, 48) || 'Brief';
    return base({
      mode: 'document',
      title: titleLine,
      subtitle: 'from AXE',
      text: text.slice(0, 24_000),
      source: 'tool',
    });
  }

  return null;
}

export async function directFromAssistantMessageAsync(
  text: string,
): Promise<ProjectionPayload | null> {
  const sync = directFromAssistantMessage(text);
  if (sync) return sync;

  if (assistantWantsChart(text)) {
    return resolveChart(text);
  }

  if (assistantWantsMap(text)) {
    // Try to recover place from assistant prose or markers
    const ctx = placeContextFromText(text);
    return resolveMap(ctx || text);
  }

  return null;
}
