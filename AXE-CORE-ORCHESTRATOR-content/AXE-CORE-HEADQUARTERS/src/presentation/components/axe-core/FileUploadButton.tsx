import { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Paperclip, X, FileText, Image, FileCode, File } from 'lucide-react';

export interface ChatAttachment {
  id: string;
  name: string;
  type: string;
  size: number;
  content?: string; // base64 for images, text for documents
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
  if (type.includes('pdf') || type.includes('document') || /\.md$/i.test(name)) return FileText;
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
    const isText =
      file.type.startsWith('text/') ||
      file.type.includes('json') ||
      file.type.includes('javascript') ||
      file.type.includes('typescript') ||
      file.type.includes('xml') ||
      TEXT_EXT.test(file.name);

    if (isImage || isText) {
      att.content = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ''));
        reader.onerror = () => resolve('');
        if (isImage) reader.readAsDataURL(file);
        else reader.readAsText(file);
      });
    }

    newAttachments.push(att);
  }

  return [...existing, ...newAttachments].slice(0, 5);
}

/** Build a prompt block so AXE can actually use the attached files. */
export function formatAttachmentsForPrompt(attachments: ChatAttachment[]): string {
  if (!attachments.length) return '';
  const parts: string[] = ['\n\n---\n## Attached files (use this content in your answer)'];

  for (const att of attachments) {
    parts.push(`\n### ${att.name} (${formatSize(att.size)}, ${att.type || 'unknown'})`);
    if (!att.content) {
      parts.push('_Binary/unsupported preview — filename only. Ask user to paste text if needed._');
      continue;
    }
    if (att.type.startsWith('image/') || att.content.startsWith('data:image')) {
      parts.push('_Image attached as data URL. Describe / reason about what is visible if the model supports vision; otherwise acknowledge the image by name._');
      // Keep a short prefix only — full base64 would blow context
      parts.push(att.content.slice(0, 120) + '…[image data truncated for context]');
    } else {
      const body = att.content.length > 12000
        ? att.content.slice(0, 12000) + '\n…[truncated]'
        : att.content;
      parts.push('```\n' + body + '\n```');
    }
  }

  parts.push('---\n');
  return parts.join('\n');
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
        onDrop={e => { e.preventDefault(); setDragOver(false); void handleFiles(e.dataTransfer.files); }}
        className="flex-shrink-0 rounded-md p-1.5 transition-all"
        style={{
          background: dragOver ? 'rgba(34,211,238,0.2)' : 'rgba(255,255,255,0.05)',
          color: 'var(--text-muted)',
          border: dragOver ? '1px dashed var(--accent-cyan)' : '1px solid transparent',
        }}
        title="Attach file"
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
              return (
                <div
                  key={att.id}
                  className="flex items-center gap-1.5 rounded px-2 py-1 text-[9px]"
                  style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)', minWidth: 160 }}
                >
                  <Icon size={10} style={{ color: 'var(--accent-cyan)' }} />
                  <span className="flex-1 truncate">{att.name}</span>
                  <span style={{ color: 'var(--text-muted)' }}>{formatSize(att.size)}</span>
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
}
