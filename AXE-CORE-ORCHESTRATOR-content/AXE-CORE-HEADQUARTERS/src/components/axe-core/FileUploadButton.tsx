import { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Paperclip, X, FileText, Image, FileCode, File } from 'lucide-react';

export interface ChatAttachment {
  id: string;
  name: string;
  type: string;
  size: number;
  content?: string; // base64 for images/text
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

const getFileIcon = (type: string) => {
  if (type.startsWith('image/')) return Image;
  if (type.includes('pdf') || type.includes('document')) return FileText;
  if (type.includes('code') || type.includes('javascript') || type.includes('typescript') || type.includes('json') || type.includes('html') || type.includes('css')) return FileCode;
  return File;
};

export function FileUploadButton({ attachments, onAttachmentsChange }: FileUploadButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFiles = async (files: FileList | null) => {
    if (!files) return;
    const newAttachments: ChatAttachment[] = [];
    for (const file of Array.from(files).slice(0, 5)) {
      if (file.size > 10 * 1024 * 1024) continue; // 10MB max
      const att: ChatAttachment = {
        id: Math.random().toString(36).slice(2),
        name: file.name,
        type: file.type,
        size: file.size,
        file,
      };
      // Read content for images and text files
      if (file.type.startsWith('image/') || file.type.includes('text') || file.type.includes('json') || file.type.includes('javascript')) {
        att.content = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          if (file.type.startsWith('image/')) reader.readAsDataURL(file);
          else reader.readAsText(file);
        });
      }
      newAttachments.push(att);
    }
    onAttachmentsChange([...attachments, ...newAttachments].slice(0, 5));
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
        accept="image/*,.pdf,.txt,.md,.json,.js,.ts,.tsx,.jsx,.html,.css,.py,.doc,.docx"
        onChange={e => handleFiles(e.target.files)}
        className="hidden"
      />
      <button
        onClick={() => inputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
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

      {/* Attachment preview */}
      <AnimatePresence>
        {attachments.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            className="absolute bottom-full left-0 mb-1 flex flex-col gap-1"
          >
            {attachments.map(att => {
              const Icon = getFileIcon(att.type);
              return (
                <div key={att.id} className="flex items-center gap-1.5 rounded px-2 py-1 text-[9px]" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)', minWidth: 140 }}>
                  <Icon size={10} style={{ color: 'var(--accent-cyan)' }} />
                  <span className="flex-1 truncate">{att.name}</span>
                  <span style={{ color: 'var(--text-muted)' }}>{formatSize(att.size)}</span>
                  <button onClick={() => removeAttachment(att.id)} className="ml-1"><X size={9} style={{ color: 'var(--text-muted)' }} /></button>
                </div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
