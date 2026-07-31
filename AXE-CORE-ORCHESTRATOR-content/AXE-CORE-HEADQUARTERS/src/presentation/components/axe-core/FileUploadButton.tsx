import { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Paperclip, X, FileText, Image, FileCode, File } from 'lucide-react';

export interface ChatAttachment {
  id: string;
  name: string;
  type: string;
  size: number;
  content?: string; // base64 for images, text for documents/PDFs
  file?: File;
}

interface FileUploadButtonProps {
  attachments: ChatAttachment[];
  onAttachmentsChange: (attachments: ChatAttachment[]) => void;
}

const formatSize = (bytes: number) => {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
};

const getFileIcon = (type: string, name: string) => {
  if (type.startsWith('image/')) return Image;
  if (type.includes('pdf') || type.includes('document') || /\.(md|pdf)$/i.test(name)) return FileText;
  if (
    type.includes('code') ||
    type.includes('javascript') ||
    type.includes('typescript') ||
    type.includes('json') ||
    type.includes('html') ||
    type.includes('css') ||
    /\.(tsx?|jsx?|py|rs|go|java|css|html|json|yml|yaml|toml|sh)$/i.test(name)
  ) return FileCode;
  return File;
};

const TEXT_EXT = /\.(txt|md|markdown|json|js|ts|tsx|jsx|html|css|scss|py|rs|go|java|yml|yaml|toml|csv|tsv|xml|svg|sh|env|log|sql)$/i;

/** Extract readable text from a PDF (first 30 pages, ~20k chars). */
async function extractPdfText(file: File): Promise<string> {
  try {
    const pdfjs = await import('pdfjs-dist');
    // Vite-friendly worker
    try {
      const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    } catch {
      // Fallback CDN worker if local resolve fails
      pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;
    }

    const data = new Uint8Array(await file.arrayBuffer());
    const doc = await pdfjs.getDocument({ data }).promise;
    const maxPages = Math.min(doc.numPages, 30);
    const chunks: string[] = [];
    let total = 0;
    const LIMIT = 20_000;

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
      if (total >= LIMIT) {
        chunks.push('…[PDF truncated]');
        break;
      }
    }

    return chunks.join('\n\n').trim();
  } catch (err) {
    console.warn('[pdf] extract failed', err);
    return '';
  }
}

/** Read a FileList into ChatAttachment[] (shared by paperclip + drop zone). */
export async function filesToAttachments(files: FileList | File[], existing: ChatAttachment[] = []): Promise<ChatAttachment[]> {
  const list = Array.from(files).slice(0, 5);
  const newAttachments: ChatAttachment[] = [];

  for (const file of list) {
    if (file.size > 12 * 1024 * 1024) continue; // 12MB max
    const att: ChatAttachment = {
      id: Math.random().toString(36).slice(2),
      name: file.name,
      type: file.type || 'application/octet-stream',
      size: file.size,
      file,
    };

    const isImage = file.type.startsWith('image/');
    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
    const isText =
      file.type.startsWith('text/') ||
      file.type.includes('json') ||
      file.type.includes('javascript') ||
      file.type.includes('typescript') ||
      file.type.includes('xml') ||
      TEXT_EXT.test(file.name);

    if (isImage) {
      att.content = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ''));
        reader.onerror = () => resolve('');
        reader.readAsDataURL(file);
      });
    } else if (isPdf) {
      const text = await extractPdfText(file);
      att.content = text || undefined;
      if (!text) {
        att.content = `[PDF "${file.name}" could not be parsed for text — scanned/image PDF or protected. Ask user to paste key sections.]`;
      }
    } else if (isText) {
      att.content = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ''));
        reader.onerror = () => resolve('');
        reader.readAsText(file);
      });
    }

    newAttachments.push(att);
  }

  return [...existing, ...newAttachments].slice(0, 5);
}

/** Build a prompt block so AXE can actually use the attached files. */
export function formatAttachmentsForPrompt(attachments: ChatAttachment[]): string {
  if (!attachments.length) return '';
  const parts: string[] = ['\n\n---\n## Attached files (use this content in your answer / as the brief)'];

  for (const att of attachments) {
    parts.push(`\n### ${att.name} (${formatSize(att.size)}, ${att.type || 'unknown'})`);
    if (!att.content) {
      parts.push('_Binary/unsupported preview — filename only. Ask user to paste text if needed._');
      continue;
    }
    if (att.type.startsWith('image/') || att.content.startsWith('data:image')) {
      parts.push('_Image attached as data URL. Describe / reason about what is visible if the model supports vision; otherwise acknowledge the image by name._');
      parts.push(att.content.slice(0, 120) + '…[image data truncated for context]');
    } else {
      const body = att.content.length > 16000
        ? att.content.slice(0, 16000) + '\n…[truncated]'
        : att.content;
      parts.push('```\n' + body + '\n```');
    }
  }

  parts.push('---\n');
  return parts.join('\n');
}

/**
 * If the user asks to launch CrewAI on an attachment, tighten the instruction
 * so the model actually calls the CREW tool with the document as the task.
 */
export function buildCrewLaunchPrompt(userText: string, attachments: ChatAttachment[]): string {
  const fileBlock = formatAttachmentsForPrompt(attachments);
  const base = (userText.trim() || (attachments.length ? 'Execute the attached brief.' : '')) + fileBlock;
  const wantsCrew = /\b(crew\s*ai|crewai|launch\s+crew|start\s+crew|run\s+crew|laat\s+crew|start\s+de\s+crew)\b/i.test(userText)
    || (/\bcrew\b/i.test(userText) && attachments.length > 0);

  if (!wantsCrew || !attachments.length) return base;

  return (
    'LAUNCH CREWAI NOW.\n' +
    'You MUST call the CREW tool. Put the full document brief (attached below) into the CREW task field.\n' +
    'Execute the instructions in the attachment as literally as possible — do not summarize and stop; run the crew.\n' +
    'If the brief contains URLs, they will be prefetched for intel automatically.\n\n' +
    `User note: ${userText.trim() || '(none)'}\n` +
    fileBlock +
    '\nEmit a CREW tool call shaped like: [CREW:{"task":"<full brief from the PDF/document>"}]\n' +
    '(Use the exact marker format your tool catalog expects for CREW.)'
  );
}

export function FileUploadButton({ attachments, onAttachmentsChange }: FileUploadButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const next = await filesToAttachments(files, attachments);
    onAttachmentsChange(next);
  };

  const removeAttachment = (id: string) => {
    onAttachmentsChange(attachments.filter(a => a.id !== id));
  };

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/*,.pdf,.txt,.md,.json,.js,.ts,.tsx,.jsx,.html,.css,.py,.csv,.yml,.yaml,.xml,.svg,.log,.sql,.doc,.docx"
        onChange={e => { void handleFiles(e.target.files); e.target.value = ''; }}
        className="hidden"
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDropActiveSafe(e); void handleFiles(e.dataTransfer.files); }}
        className="flex-shrink-0 rounded-md p-1.5 transition-all"
        style={{
          background: dragOver ? 'rgba(34,211,238,0.2)' : 'rgba(255,255,255,0.05)',
          color: 'var(--text-muted)',
          border: dragOver ? '1px dashed var(--accent-cyan)' : '1px solid transparent',
        }}
        title="Attach file (PDF, text, code, images)"
      >
        <Paperclip size={13} />
      </button>

      <AnimatePresence>
        {attachments.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            className="absolute bottom-full left-0 mb-1 flex flex-col gap-1 z-20"
          >
            {attachments.map(att => {
              const Icon = getFileIcon(att.type, att.name);
              const parsed = !!att.content && !att.content.startsWith('[PDF');
              return (
                <div
                  key={att.id}
                  className="flex items-center gap-1.5 rounded px-2 py-1 text-[9px]"
                  style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)', minWidth: 160 }}
                >
                  <Icon size={10} style={{ color: 'var(--accent-cyan)' }} />
                  <span className="flex-1 truncate">{att.name}</span>
                  <span style={{ color: 'var(--text-muted)' }}>{formatSize(att.size)}</span>
                  {/\.pdf$/i.test(att.name) && (
                    <span style={{ color: parsed ? 'rgba(16,185,129,0.8)' : 'rgba(251,146,60,0.8)' }}>
                      {parsed ? 'text' : '!'}
                    </span>
                  )}
                  <button type="button" onClick={() => removeAttachment(att.id)} className="ml-1">
                    <X size={9} style={{ color: 'var(--text-muted)' }} />
                  </button>
                </div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );

  function setDropActiveSafe(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
  }
}
