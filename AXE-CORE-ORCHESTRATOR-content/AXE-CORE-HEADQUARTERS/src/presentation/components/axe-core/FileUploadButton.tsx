import { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Paperclip, X, FileText, Image, FileCode, File } from 'lucide-react';
import {
  normalizeFiles,
  formatSize,
  type NormalizedAttachment,
} from '@/application/attachments/attachmentService';

export type ChatAttachment = NormalizedAttachment;

interface FileUploadButtonProps {
  attachments: NormalizedAttachment[];
  onAttachmentsChange: (attachments: NormalizedAttachment[]) => void;
}

const getFileIcon = (kind: string, name: string) => {
  if (kind === 'image') return Image;
  if (kind === 'pdf' || kind === 'office' || /\.md$/i.test(name)) return FileText;
  if (kind === 'text' && /\.(tsx?|jsx?|py|json)$/i.test(name)) return FileCode;
  return File;
};

export async function filesToAttachments(
  files: FileList | File[],
  existing: NormalizedAttachment[] = [],
): Promise<NormalizedAttachment[]> {
  return normalizeFiles(files, existing);
}

export {
  formatAttachmentsForPrompt,
  buildCrewLaunchPrompt,
  type NormalizedAttachment,
} from '@/application/attachments/attachmentService';

export function FileUploadButton({ attachments, onAttachmentsChange }: FileUploadButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    onAttachmentsChange(await normalizeFiles(files, attachments));
  };

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="*/*"
        onChange={e => { void handleFiles(e.target.files); e.target.value = ''; }}
        className="hidden"
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => {
          e.preventDefault();
          setDragOver(false);
          void handleFiles(e.dataTransfer.files);
        }}
        className="flex-shrink-0 rounded-md p-1.5 transition-all"
        style={{
          background: dragOver ? 'rgba(34,211,238,0.2)' : 'rgba(255,255,255,0.05)',
          color: 'var(--text-muted)',
          border: dragOver ? '1px dashed var(--accent-cyan)' : '1px solid transparent',
        }}
        title="Attach any file"
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
              const Icon = getFileIcon(att.kind, att.name);
              const ok = !!att.text || !!att.previewUrl;
              return (
                <div
                  key={att.id}
                  className="flex items-center gap-1.5 rounded px-2 py-1 text-[9px]"
                  style={{
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-primary)',
                    minWidth: 160,
                  }}
                >
                  <Icon size={10} style={{ color: 'var(--accent-cyan)' }} />
                  <span className="flex-1 truncate">{att.name}</span>
                  <span style={{ color: 'var(--text-muted)' }}>{formatSize(att.size)}</span>
                  <span style={{ color: ok ? 'rgba(16,185,129,0.8)' : 'rgba(251,146,60,0.8)' }}>
                    {ok ? '✓' : '!'}
                  </span>
                  <button
                    type="button"
                    onClick={() => onAttachmentsChange(attachments.filter(a => a.id !== att.id))}
                    className="ml-1"
                  >
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
