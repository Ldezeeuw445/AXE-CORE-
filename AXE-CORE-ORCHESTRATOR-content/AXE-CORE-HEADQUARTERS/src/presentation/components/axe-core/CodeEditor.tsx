/**
 * CodeEditor.tsx — file tree + editor + terminal.
 * New file/folder use an inline form (window.prompt is blocked in Tauri WebView).
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FilePlus, FolderPlus, Trash2,
  Terminal, ChevronRight, FileCode, Folder,
  Copy, Check,
} from 'lucide-react';

interface FileNode {
  id: string;
  name: string;
  type: 'file' | 'folder';
  content?: string;
  language?: string;
  children?: FileNode[];
  expanded?: boolean;
  isModified?: boolean;
}

interface TerminalLine {
  id: string;
  type: 'input' | 'output' | 'error';
  text: string;
  timestamp: string;
}

function detectLanguage(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx',
    py: 'python', rs: 'rust', go: 'go', java: 'java',
    cpp: 'cpp', c: 'c', h: 'c', hpp: 'cpp',
    json: 'json', md: 'markdown', html: 'html', css: 'css',
    scss: 'scss', sql: 'sql', sh: 'bash', yaml: 'yaml', yml: 'yaml',
    dockerfile: 'dockerfile', toml: 'toml',
  };
  return map[ext] || 'text';
}

function FileTreeItem({
  node,
  depth,
  selectedId,
  onSelect,
  onToggleFolder,
  onDelete,
}: {
  node: FileNode;
  depth: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onToggleFolder: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const isSelected = selectedId === node.id;
  const Icon = node.type === 'folder' ? Folder : FileCode;

  return (
    <div>
      <div
        className="flex items-center gap-1 py-0.5 pr-1 cursor-pointer group"
        style={{
          paddingLeft: `${depth * 12 + 4}px`,
          background: isSelected ? 'rgba(34,211,238,0.08)' : 'transparent',
          borderLeft: isSelected ? '2px solid var(--accent-cyan)' : '2px solid transparent',
        }}
        onClick={() => (node.type === 'folder' ? onToggleFolder(node.id) : onSelect(node.id))}
      >
        {node.type === 'folder' && (
          <ChevronRight
            size={9}
            style={{
              color: 'rgba(255,255,255,0.3)',
              transform: node.expanded ? 'rotate(90deg)' : 'rotate(0deg)',
              transition: 'transform 0.15s',
            }}
          />
        )}
        <Icon size={10} style={{ color: node.type === 'folder' ? 'rgba(255,255,255,0.4)' : 'var(--accent-cyan)' }} />
        <span className="text-[10px] flex-1 truncate" style={{ color: isSelected ? 'var(--accent-cyan)' : 'rgba(255,255,255,0.65)' }}>
          {node.name}
          {node.isModified && <span style={{ color: '#F59E0B' }}>*</span>}
        </span>
        <button type="button" onClick={e => { e.stopPropagation(); onDelete(node.id); }} className="opacity-0 group-hover:opacity-100 p-0.5">
          <Trash2 size={8} style={{ color: 'rgba(255,255,255,0.2)' }} />
        </button>
      </div>
      {node.type === 'folder' && node.expanded && node.children?.map(child => (
        <FileTreeItem
          key={child.id}
          node={child}
          depth={depth + 1}
          selectedId={selectedId}
          onSelect={onSelect}
          onToggleFolder={onToggleFolder}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}

function TerminalPanel({ lines, onCommand }: { lines: TerminalLine[]; onCommand: (cmd: string) => void }) {
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);

  return (
    <div className="flex flex-col h-full" style={{ background: '#000' }}>
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-2 py-1 space-y-0.5 font-mono-data">
        {lines.map(line => (
          <div key={line.id} className="text-[9px] leading-tight">
            {line.type === 'input' ? (
              <span><span style={{ color: '#10B981' }}>$</span> <span style={{ color: 'rgba(255,255,255,0.8)' }}>{line.text}</span></span>
            ) : line.type === 'error' ? (
              <span style={{ color: '#EF4444' }}>{line.text}</span>
            ) : (
              <span style={{ color: 'rgba(255,255,255,0.6)' }}>{line.text}</span>
            )}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-1 px-2 py-1 flex-shrink-0" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <span style={{ color: '#10B981', fontSize: 9 }}>$</span>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && input.trim()) { onCommand(input); setInput(''); } }}
          placeholder="type command..."
          className="flex-1 bg-transparent outline-none font-mono-data"
          style={{ color: 'rgba(255,255,255,0.8)', fontSize: 9 }}
        />
      </div>
    </div>
  );
}

function addUnderRoot(nodes: FileNode[], item: FileNode): FileNode[] {
  if (nodes.length === 0) return [item];
  return nodes.map((n, i) => {
    if (i === 0 && n.type === 'folder') {
      return {
        ...n,
        expanded: true,
        children: [...(n.children || []), item],
      };
    }
    return n;
  });
}

export function CodeEditor() {
  const [files, setFiles] = useState<FileNode[]>([
    {
      id: 'root',
      name: 'project',
      type: 'folder',
      expanded: true,
      children: [
        {
          id: 'f1',
          name: 'main.ts',
          type: 'file',
          content: '// AXE Core Project\n\nexport default function App() {\n  return <div>AXE CORE</div>;\n}\n',
          language: 'typescript',
        },
        {
          id: 'f2',
          name: 'config.json',
          type: 'file',
          content: '{\n  "name": "axe-core",\n  "version": "5.0.0"\n}\n',
          language: 'json',
        },
        {
          id: 'f3',
          name: 'README.md',
          type: 'file',
          content: '# AXE CORE OS\n\nJarvis-style AI operating system.\n',
          language: 'markdown',
        },
      ],
    },
  ]);
  const [selectedId, setSelectedId] = useState<string | null>('f1');
  const [termLines, setTermLines] = useState<TerminalLine[]>([
    { id: '1', type: 'output', text: 'AXE CORE Terminal v1.0', timestamp: '' },
    { id: '2', type: 'output', text: 'Type "help" for available commands', timestamp: '' },
  ]);
  const [showTerminal, setShowTerminal] = useState(true);
  const [copied, setCopied] = useState(false);
  /** Inline create — no window.prompt (broken in Tauri). */
  const [createMode, setCreateMode] = useState<'file' | 'folder' | null>(null);
  const [createName, setCreateName] = useState('');
  const createInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (createMode) createInputRef.current?.focus();
  }, [createMode]);

  const selectedFile = findFile(files, selectedId);

  function findFile(nodes: FileNode[], id: string | null): FileNode | null {
    if (!id) return null;
    for (const n of nodes) {
      if (n.id === id) return n;
      if (n.children) {
        const f = findFile(n.children, id);
        if (f) return f;
      }
    }
    return null;
  }

  const updateFile = useCallback((id: string, content: string) => {
    setFiles(prev => updateNode(prev, id, content));
  }, []);

  function updateNode(nodes: FileNode[], id: string, content: string): FileNode[] {
    return nodes.map(n => {
      if (n.id === id) return { ...n, content, isModified: true };
      if (n.children) return { ...n, children: updateNode(n.children, id, content) };
      return n;
    });
  }

  const toggleFolder = useCallback((id: string) => {
    setFiles(prev => toggleNode(prev, id));
  }, []);

  function toggleNode(nodes: FileNode[], id: string): FileNode[] {
    return nodes.map(n => {
      if (n.id === id) return { ...n, expanded: !n.expanded };
      if (n.children) return { ...n, children: toggleNode(n.children, id) };
      return n;
    });
  }

  const deleteNode = useCallback((id: string) => {
    if (id === 'root') return;
    setFiles(prev => removeNode(prev, id));
    if (selectedId === id) setSelectedId(null);
  }, [selectedId]);

  function removeNode(nodes: FileNode[], id: string): FileNode[] {
    return nodes.filter(n => n.id !== id).map(n =>
      n.children ? { ...n, children: removeNode(n.children, id) } : n,
    );
  }

  const confirmCreate = useCallback(() => {
    const name = createName.trim();
    if (!name || !createMode) {
      setCreateMode(null);
      setCreateName('');
      return;
    }
    const id = `${Date.now()}`;
    if (createMode === 'file') {
      const newFile: FileNode = {
        id,
        name,
        type: 'file',
        content: '',
        language: detectLanguage(name),
      };
      setFiles(prev => addUnderRoot(prev, newFile));
      setSelectedId(id);
    } else {
      const newFolder: FileNode = {
        id,
        name,
        type: 'folder',
        expanded: true,
        children: [],
      };
      setFiles(prev => addUnderRoot(prev, newFolder));
    }
    setCreateMode(null);
    setCreateName('');
  }, [createMode, createName]);

  const handleTermCommand = useCallback((cmd: string) => {
    setTermLines(prev => [...prev, { id: Date.now().toString(), type: 'input', text: cmd, timestamp: '' }]);

    const cmd_lower = cmd.trim().toLowerCase();
    let output = '';

    if (cmd_lower === 'help') {
      output = 'Commands: help, ls, clear, echo [text], cat [file]';
    } else if (cmd_lower === 'ls') {
      output = files.flatMap(f => f.children?.map(c => c.name) || []).join('  ');
    } else if (cmd_lower === 'clear') {
      setTermLines([{ id: 'clear', type: 'output', text: '', timestamp: '' }]);
      return;
    } else if (cmd_lower.startsWith('echo ')) {
      output = cmd.slice(5);
    } else if (cmd_lower.startsWith('cat ') && selectedFile) {
      output = selectedFile.content || '(empty)';
    } else {
      output = `Command not found: ${cmd}. Type "help".`;
    }

    setTimeout(() => {
      setTermLines(prev => [...prev, { id: (Date.now() + 1).toString(), type: 'output', text: output, timestamp: '' }]);
    }, 50);
  }, [files, selectedFile]);

  const copyCode = () => {
    if (!selectedFile?.content) return;
    void navigator.clipboard.writeText(selectedFile.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="flex flex-col h-full rounded-xl overflow-hidden" style={{ background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="flex items-center gap-1 px-2 py-1 flex-shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <span className="text-[10px] font-medium flex-1" style={{ color: 'var(--accent-cyan)' }}>CODE EDITOR</span>
        <button
          type="button"
          onClick={() => { setCreateMode('file'); setCreateName(''); }}
          className="p-0.5 rounded"
          style={{ color: createMode === 'file' ? 'var(--accent-cyan)' : 'rgba(255,255,255,0.4)' }}
          title="New file"
        >
          <FilePlus size={11} />
        </button>
        <button
          type="button"
          onClick={() => { setCreateMode('folder'); setCreateName(''); }}
          className="p-0.5 rounded"
          style={{ color: createMode === 'folder' ? 'var(--accent-cyan)' : 'rgba(255,255,255,0.4)' }}
          title="New folder"
        >
          <FolderPlus size={11} />
        </button>
        <button type="button" onClick={copyCode} className="p-0.5 rounded" style={{ color: 'rgba(255,255,255,0.4)' }} title="Copy">
          {copied ? <Check size={11} style={{ color: 'var(--success)' }} /> : <Copy size={11} />}
        </button>
        <button
          type="button"
          onClick={() => setShowTerminal(v => !v)}
          className="p-0.5 rounded"
          style={{ color: showTerminal ? 'var(--accent-cyan)' : 'rgba(255,255,255,0.4)' }}
          title="Toggle terminal"
        >
          <Terminal size={11} />
        </button>
      </div>

      {createMode && (
        <div className="flex items-center gap-1.5 px-2 py-1.5 flex-shrink-0" style={{ borderBottom: '1px solid rgba(34,211,238,0.2)', background: 'rgba(34,211,238,0.06)' }}>
          <span className="text-[9px] font-mono" style={{ color: 'var(--accent-cyan)' }}>
            {createMode === 'file' ? 'New file' : 'New folder'}:
          </span>
          <input
            ref={createInputRef}
            value={createName}
            onChange={e => setCreateName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') confirmCreate();
              if (e.key === 'Escape') { setCreateMode(null); setCreateName(''); }
            }}
            placeholder={createMode === 'file' ? 'e.g. utils.ts' : 'e.g. src'}
            className="flex-1 text-[10px] px-2 py-1 rounded outline-none"
            style={{ background: 'var(--bg-base)', border: '1px solid var(--border-active)', color: 'var(--text-primary)' }}
          />
          <button
            type="button"
            onClick={confirmCreate}
            className="text-[9px] px-2 py-1 rounded font-medium"
            style={{ background: 'var(--accent-cyan)', color: '#000' }}
          >
            Create
          </button>
          <button
            type="button"
            onClick={() => { setCreateMode(null); setCreateName(''); }}
            className="text-[9px] px-2 py-1"
            style={{ color: 'var(--text-muted)' }}
          >
            Cancel
          </button>
        </div>
      )}

      <div className="flex flex-1 min-h-0">
        <div className="w-[140px] flex-shrink-0 overflow-y-auto py-1" style={{ borderRight: '1px solid rgba(255,255,255,0.06)' }}>
          {files.map(node => (
            <FileTreeItem
              key={node.id}
              node={node}
              depth={0}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onToggleFolder={toggleFolder}
              onDelete={deleteNode}
            />
          ))}
        </div>

        <div className="flex-1 flex flex-col min-w-0">
          {selectedFile && selectedFile.type === 'file' ? (
            <>
              <div className="flex items-center gap-1 px-2 py-0.5 flex-shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <FileCode size={9} style={{ color: 'var(--accent-cyan)' }} />
                <span className="text-[9px]" style={{ color: 'rgba(255,255,255,0.6)' }}>{selectedFile.name}</span>
                {selectedFile.isModified && <span style={{ color: '#F59E0B', fontSize: 9 }}>*</span>}
                <span className="text-[8px] ml-1" style={{ color: 'rgba(255,255,255,0.25)' }}>{selectedFile.language}</span>
              </div>
              <textarea
                value={selectedFile.content || ''}
                onChange={e => updateFile(selectedFile.id, e.target.value)}
                className="flex-1 w-full bg-transparent outline-none resize-none font-mono-data p-2"
                style={{ color: 'rgba(255,255,255,0.8)', fontSize: 10, lineHeight: '1.5', tabSize: 2 }}
                spellCheck={false}
              />
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.25)' }}>Select a file to edit</span>
            </div>
          )}

          <AnimatePresence>
            {showTerminal && (
              <motion.div
                initial={{ height: 0 }}
                animate={{ height: 120 }}
                exit={{ height: 0 }}
                className="flex-shrink-0 overflow-hidden"
                style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}
              >
                <TerminalPanel lines={termLines} onCommand={handleTermCommand} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
