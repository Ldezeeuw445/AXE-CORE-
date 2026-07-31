/**
 * sphereDirector — application router for Living Display.
 *
 * Decides WHAT to project from attachments / chat intent.
 * Does not touch Three.js or React. Presentation only renders the payload.
 *
 * Flow: Memory → Router (this) → Workspace → Projection → Sphere
 */
import type { NormalizedAttachment } from '@/application/attachments/attachmentService';
import type { ProjectionPayload, ProjectionMode, ProjectionSource } from '@/domain/sphere/projectionTypes';

function id(): string {
  return `proj_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

/** Build a projection payload from a single attachment (drop or attach). */
export function projectionFromAttachment(
  att: NormalizedAttachment,
  source: ProjectionSource = 'drop',
): ProjectionPayload | null {
  if (att.kind === 'image' && att.previewUrl) {
    return {
      id: id(),
      mode: 'image',
      title: att.name,
      subtitle: att.mime,
      mediaUrl: att.previewUrl,
      mime: att.mime,
      source,
      createdAt: Date.now(),
    };
  }
  if ((att.kind === 'text' || att.kind === 'pdf' || att.kind === 'office') && att.text) {
    const mode: ProjectionMode = /\.(tsx?|jsx?|py|rs|go)$/i.test(att.name) ? 'code' : 'document';
    return {
      id: id(),
      mode,
      title: att.name,
      subtitle: att.kind.toUpperCase(),
      text: att.text,
      mime: att.mime,
      source,
      createdAt: Date.now(),
    };
  }
  // Binary / audio / video — still project a metadata card as document
  if (att.name) {
    return {
      id: id(),
      mode: 'document',
      title: att.name,
      subtitle: `${att.kind} · no text extract`,
      text: att.text || `File attached: ${att.name}\nType: ${att.mime}\nKind: ${att.kind}`,
      mime: att.mime,
      source,
      createdAt: Date.now(),
    };
  }
  return null;
}

/** Prefer the most visual attachment when several are dropped. */
export function projectionFromAttachments(
  attachments: NormalizedAttachment[],
  source: ProjectionSource = 'drop',
): ProjectionPayload | null {
  if (!attachments.length) return null;
  const image = attachments.find(a => a.kind === 'image' && a.previewUrl);
  if (image) return projectionFromAttachment(image, source);
  const doc = attachments.find(a => a.text && (a.kind === 'pdf' || a.kind === 'text' || a.kind === 'office'));
  if (doc) return projectionFromAttachment(doc, source);
  return projectionFromAttachment(attachments[0], source);
}

const SHOW_RE =
  /\b(laat\s+zien|toon|show|display|open\s+(dit|deze|the)|project|bekijk|view)\b/i;

/**
 * Lightweight intent router for chat text + optional attachments.
 * Returns null when the sphere should stay in pure status mode.
 */
export function directFromChat(input: {
  text: string;
  attachments?: NormalizedAttachment[];
}): ProjectionPayload | null {
  const { text, attachments = [] } = input;
  if (attachments.length && (SHOW_RE.test(text) || !text.trim())) {
    return projectionFromAttachments(attachments, text.trim() ? 'chat' : 'drop');
  }
  if (attachments.length === 1 && !text.trim()) {
    return projectionFromAttachments(attachments, 'drop');
  }
  // Explicit show without files — no data to project (Memory must supply later)
  return null;
}

export function shouldDismissProjection(text: string): boolean {
  return /^(klaar|done|close|sluit|terug|back|dismiss)[.!\s]*$/i.test(text.trim());
}
