/**
 * attachmentService — application layer.
 * Owns file reading/normalization. Presentation only displays results.
 */

export type AttachmentKind =
  | 'text'
  | 'image'
  | 'pdf'
  | 'office'
  | 'audio'
  | 'video'
  | 'binary';

export interface NormalizedAttachment {
  id: string;
  name: string;
  mime: string;
  size: number;
  kind: AttachmentKind;
  /** Extracted text when available (never required). */
  text?: string;
  /** data-URL for images (and small previews). */
  previewUrl?: string;
  /** True when binary could not yield text. */
  textUnavailable?: boolean;
}

const TEXT_EXT =
  /\.(txt|md|markdown|json|js|ts|tsx|jsx|html|css|scss|py|rs|go|java|yml|yaml|toml|csv|tsv|xml|svg|sh|env|log|sql|rtf)$/i;

const MAX_BYTES = 20 * 1024 * 1024; // 20MB
const MAX_FILES = 8;
const TEXT_LIMIT = 20_000;

function uid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function classify(file: File): AttachmentKind {
  const t = file.type || '';
  const n = file.name;
  if (t.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(n)) return 'image';
  if (t === 'application/pdf' || /\.pdf$/i.test(n)) return 'pdf';
  if (
    t.includes('word') ||
    t.includes('officedocument') ||
    /\.(docx?|odt|rtf)$/i.test(n)
  ) return 'office';
  if (t.startsWith('audio/') || /\.(mp3|wav|m4a|ogg|flac)$/i.test(n)) return 'audio';
  if (t.startsWith('video/') || /\.(mp4|webm|mov|mkv)$/i.test(n)) return 'video';
  if (
    t.startsWith('text/') ||
    t.includes('json') ||
    t.includes('javascript') ||
    t.includes('typescript') ||
    t.includes('xml') ||
    TEXT_EXT.test(n)
  ) return 'text';
  return 'binary';
}

async function readAsText(file: File): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const s = String(reader.result ?? '');
      resolve(s.length > TEXT_LIMIT ? s.slice(0, TEXT_LIMIT) + '\n…[truncated]' : s);
    };
    reader.onerror = () => resolve('');
    reader.readAsText(file);
  });
}

async function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => resolve('');
    reader.readAsDataURL(file);
  });
}

async function extractPdfText(file: File): Promise<string> {
  try {
    const pdfjs = await import('pdfjs-dist');
    try {
      const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    } catch {
      pdfjs.GlobalWorkerOptions.workerSrc =
        `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;
    }
    const data = new Uint8Array(await file.arrayBuffer());
    const doc = await pdfjs.getDocument({ data }).promise;
    const maxPages = Math.min(doc.numPages, 30);
    const chunks: string[] = [];
    let total = 0;
    for (let i = 1; i <= maxPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const line = content.items
        .map((it) => ('str' in it ? String((it as { str: string }).str) : ''))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (!line) continue;
      chunks.push(`--- page ${i} ---\n${line}`);
      total += line.length;
      if (total >= TEXT_LIMIT) {
        chunks.push('…[PDF truncated]');
        break;
      }
    }
    return chunks.join('\n\n').trim();
  } catch (err) {
    console.warn('[attachment] pdf extract failed', err);
    return '';
  }
}

/** Normalize a browser FileList into application attachments. */
export async function normalizeFiles(
  files: FileList | File[],
  existing: NormalizedAttachment[] = [],
): Promise<NormalizedAttachment[]> {
  const list = Array.from(files).slice(0, MAX_FILES);
  const out: NormalizedAttachment[] = [];

  for (const file of list) {
    if (file.size > MAX_BYTES) continue;
    const kind = classify(file);
    const base: NormalizedAttachment = {
      id: uid(),
      name: file.name,
      mime: file.type || 'application/octet-stream',
      size: file.size,
      kind,
    };

    if (kind === 'image') {
      base.previewUrl = await readAsDataUrl(file);
    } else if (kind === 'pdf') {
      const text = await extractPdfText(file);
      if (text) base.text = text;
      else {
        base.textUnavailable = true;
        base.text = `[PDF "${file.name}" has no extractable text — scanned or protected.]`;
      }
    } else if (kind === 'text') {
      base.text = await readAsText(file);
    } else if (kind === 'office') {
      // Best-effort plain read; real DOCX needs a dedicated parser later
      const raw = await readAsText(file);
      if (raw && raw.replace(/\s/g, '').length > 40 && !raw.includes('\x00')) {
        base.text = raw.slice(0, TEXT_LIMIT);
      } else {
        base.textUnavailable = true;
        base.text = `[Office file "${file.name}" — binary format; paste text or export PDF for full extract.]`;
      }
    } else {
      base.textUnavailable = true;
      base.text = `[${kind} file "${file.name}" (${formatSize(file.size)}) — metadata only; no text extract.]`;
    }

    out.push(base);
  }

  return [...existing, ...out].slice(0, MAX_FILES);
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

/** Prompt block for LLM — application concern, not UI. */
export function formatAttachmentsForPrompt(attachments: NormalizedAttachment[]): string {
  if (!attachments.length) return '';
  const parts: string[] = ['\n\n---\n## Attached files (use this content in your answer / as the brief)'];
  for (const att of attachments) {
    parts.push(`\n### ${att.name} (${formatSize(att.size)}, ${att.kind}, ${att.mime})`);
    if (att.kind === 'image' && att.previewUrl) {
      parts.push('_Image attached. Describe if vision is available; otherwise acknowledge by name._');
      parts.push(att.previewUrl.slice(0, 80) + '…[image truncated]');
    } else if (att.text) {
      const body = att.text.length > 16000 ? att.text.slice(0, 16000) + '\n…[truncated]' : att.text;
      parts.push('```\n' + body + '\n```');
    } else {
      parts.push('_No text extract — filename/metadata only._');
    }
  }
  parts.push('---\n');
  return parts.join('\n');
}

export function buildCrewLaunchPrompt(
  userText: string,
  attachments: NormalizedAttachment[],
): string {
  const fileBlock = formatAttachmentsForPrompt(attachments);
  const base = (userText.trim() || (attachments.length ? 'Execute the attached brief.' : '')) + fileBlock;
  const wantsCrew =
    /\b(crew\s*ai|crewai|launch\s+crew|start\s+crew|run\s+crew|laat\s+crew|start\s+de\s+crew)\b/i.test(userText) ||
    (/\bcrew\b/i.test(userText) && attachments.length > 0);
  if (!wantsCrew || !attachments.length) return base;
  return (
    'LAUNCH CREWAI NOW.\n' +
    'You MUST call the CREW tool. Put the full document brief (attached below) into the CREW task field.\n' +
    'Execute the instructions in the attachment as literally as possible.\n\n' +
    `User note: ${userText.trim() || '(none)'}\n` +
    fileBlock
  );
}
