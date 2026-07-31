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

const SHOW_RE =
  /\b(laat\s+zien|toon|show\s+me|show|display|open\s+(dit|deze|the)|projecteer|project|bekijk|view)\b/i;
const MAP_RE =
  /\b(kaart|map|maps|locatie|location|route|navigatie|coordinates?|lat\b|lng\b)\b/i;
const CHART_RE =
  /\b(chart|grafiek|graph|plot|trading|candles?|price\s+action|koers|income|inkomen)\b/i;
const CODE_RE =
  /\b(code|snippet|diff|function|component|source)\b/i;

/**
 * Chat intent router (async — chart may load income ledger).
 */
export async function directFromChat(input: {
  text: string;
  attachments?: NormalizedAttachment[];
}): Promise<ProjectionPayload | null> {
  const text = input.text || '';
  const attachments = input.attachments ?? [];

  if (shouldDismissProjection(text)) return null;

  if (attachments.length && (SHOW_RE.test(text) || !text.trim() || CHART_RE.test(text) || MAP_RE.test(text) || CODE_RE.test(text))) {
    return projectionFromAttachments(attachments, text.trim() ? 'chat' : 'drop');
  }
  if (attachments.length === 1 && !text.trim()) {
    return projectionFromAttachments(attachments, 'drop');
  }

  if (MAP_RE.test(text)) return resolveMap(text);
  if (CHART_RE.test(text)) return resolveChart(text);

  if (!SHOW_RE.test(text) && !CODE_RE.test(text)) return null;

  if (CODE_RE.test(text) && text.length > 40) {
    return projectionFromResolved({
      mode: 'code',
      title: 'Code',
      subtitle: 'from chat',
      text,
      source: 'chat',
    });
  }

  if (SHOW_RE.test(text)) {
    return projectionFromResolved({
      mode: 'document',
      title: 'Request',
      subtitle: 'Awaiting resolved content',
      text:
        text +
        '\n\n—\nTip: drop a file, or let a tool resolve data. The sphere only renders what Memory/Router supplies.',
      source: 'chat',
    });
  }

  return null;
}

export function shouldDismissProjection(text: string): boolean {
  return /^(klaar|done|close|sluit|terug|back|dismiss)[.!\s]*$/i.test(text.trim());
}

export function directFromAssistantMessage(text: string): ProjectionPayload | null {
  return parseProjectMarker(text);
}
