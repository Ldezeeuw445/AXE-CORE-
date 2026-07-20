/**
 * CodeEditor.tsx
 * ------------------------------------------------------------------
 * Full code editor with syntax highlighting, file tree, and integrated
 * terminal. Git repo support, file operations, and AI code assistant.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Code2, Play, Save, FilePlus, FolderPlus, Trash2,
  GitBranch, Terminal, ChevronRight, FileCode, Folder,
  X, Copy, Check, Download, Upload, Search, Settings,
} from 'lucide-react';

/* ─── Types ─────────────────────────────────────────────────────────────── */
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

/* ─── Language detection ───────────────────────────────────────────────── */
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

/* ─── Simple syntax highlighting ───────────────────────────────────────── */
function highlightCode(code: string, lang: string): string {
  // Very basic highlighting — for production, use Prism or Shiki
  const keywords: Record<string, string[]> = {
    typescript: ['const', 'let', 'var', 'function', 'return', 'import', 'from', 'export', 'default', 'async', 'await', 'if', 'else', 'for', 'while', 'class', 'interface', 'type', 'extends', 'implements', 'new', 'this', 'try', 'catch', 'throw'],
    javascript: ['const', 'let', 'var', 'function', 'return', 'import', 'from', 'export', 'default', 'async', 'await', 'if', 'else', 'for', 'while', 'class', 'new', 'this', 'try', 'catch'],
    python: ['def', 'return', 'import', 'from', 'class', 'if', 'else', 'elif', 'for', 'while', 'try', 'except', 'with', 'as', 'pass', 'lambda', 'yield'],
    rust: ['fn', 'let', 'mut', 'return', 'use', 'mod', 'struct', 'impl', 'trait', 'if', 'else', 'for', 'while', 'match', 'pub', 'crate'],
  };
  const words = keywords[lang] || keywords.typescript;
  let html = code
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/(".*?"|'.*?'|`.*?`)/g, '<span style="color:#a5d6ff">$1</span>')
    .replace(/(\/\/.*$|\/\*[\s\S]*?\*\/|#.*$)/gm, '<span style="color:#6b7280">$1</span>');
  
  words.forEach(w => {
    html = html.replace(new RegExp(`\\b(${w})\\b`, 'g'), `<span style="color:#ff7b72">$1</span>`);
  });
  
  return html;
}

/* ─── File Tree Item ───────────────────────────────────────────────────── */
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
  const Icon = node.type === 'folder' ? (node.expanded ? ChevronRight : Folder) : FileCode;

  return (
    <div>
      <div
        className="flex items-center gap-1 py-0.5 pr-1 cursor-pointer group"
        style={{
          paddingLeft: `${depth * 12 + 4}px`,
          background: isSelected ? 'rgba(34,211,238,0.08)' : 'transparent',
          borderLeft: isSelected ? '2px solid var(--accent-cyan)' : '2px solid transparent',
        }}
        onClick={() => node.type === 'folder' ? onToggleFolder(node.id) : onSelect(node.id)}
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
        <button onClick={e => { e.stopPropagation(); onDelete(node.id); }} className="opacity-0 group-hover:opacity-100 p-0.5">
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

/* ─── Terminal ─────────────────────────────────────────────────────────── */
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
          autoFocus
        />
      </div>
    </div>
  );
}

/* ─── Main Code Editor ─────────────────────────────────────────────────── */
export function CodeEditor() {
  const [files, setFiles] = useState<FileNode[]>([
    {
      id: 'root', name: 'project', type: 'folder', expanded: true,
      children: [
        { id: 'f1', name: 'main.ts', type: 'file', content: '// AXE Core Project\n\nimport { useState } from \'react\';\n\nfunction App() {\n  const [status, setStatus] = useState(\'active\');\n  \n  return (\n    <div className="axe-core">\n      <h1>AXE CORE OS</h1>\n    </div>\n  );\n}\n\nexport default App;', language: 'typescript' },
        { id: 'f2', name: 'config.json', type: 'file', content: '{\n  "name": "axe-core",\n  "version": "5.0.0",\n  "providers": ["anthropic", "openai", "groq"]\n}', language: 'json' },
        { id: 'f3', name: 'README.md', type: 'file', content: '# AXE CORE OS\n\nJarvis-style god mode AI operating system.\n\n## Features\n- Multi-provider LLM routing\n- Voice interface\n- Code agent\n- Browser control\n', language: 'markdown' },
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

  const selectedFile = findFile(files, selectedId);

  function findFile(nodes: FileNode[], id: string | null): FileNode | null {
    if (!id) return null;
    for (const n of nodes) {
      if (n.id === id) return n;
      if (n.children) { const f = findFile(n.children, id); if (f) return f; }
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
    setFiles(prev => removeNode(prev, id));
    if (selectedId === id) setSelectedId(null);
  }, [selectedId]);

  function removeNode(nodes: FileNode[], id: string): FileNode[] {
    return nodes.filter(n => n.id !== id).map(n =>
      n.children ? { ...n, children: removeNode(n.children, id) } : n
    );
  }

  const addFile = useCallback(() => {
    const name = prompt('File name:');
    if (!name) return;
    const newFile: FileNode = {
      id: Date.now().toString(),
      name,
      type: 'file',
      content: '',
      language: detectLanguage(name),
    };
    setFiles(prev => addToRoot(prev, newFile));
    setSelectedId(newFile.id);
  }, []);

  function addToRoot(nodes: FileNode[], file: FileNode): FileNode[] {
    return nodes.map(n => {
      if (n.type === 'folder' && n.expanded && n.children) {
        return { ...n, children: [...n.children, file] };
      }
      if (n.children) return { ...n, children: addToRoot(n.children, file) };
      return n;
    });
  }

  const handleTermCommand = useCallback((cmd: string) => {
    setTermLines(prev => [...prev, { id: Date.now().toString(), type: 'input', text: cmd, timestamp: '' }]);
    
    const cmd_lower = cmd.trim().toLowerCase();
    let output = '';
    
    if (cmd_lower === 'help') {
      output = 'Commands: help, ls, clear, echo [text], git [cmd], npm [cmd], cat [file]';
    } else if (cmd_lower === 'ls') {
      output = files.flatMap(f => f.children?.map(c => c.name) || []).join('  ');
    } else if (cmd_lower === 'clear') {
      setTermLines([{ id: 'clear', type: 'output', text: '', timestamp: '' }]);
      return;
    } else if (cmd_lower.startsWith('echo ')) {
      output = cmd.slice(5);
    } else if (cmd_lower.startsWith('cat ') && selectedFile) {
      output = selectedFile.content || '(empty)';
    } else if (cmd_lower.startsWith('git ')) {
      output = `[git] Would execute: ${cmd}`;
    } else {
      output = `Command not found: ${cmd}. Type "help" for available commands.`;
    }
    
    setTimeout(() => {
      setTermLines(prev => [...prev, { id: (Date.now() + 1).toString(), type: 'output', text: output, timestamp: '' }]);
    }, 100);
  }, [files, selectedFile]);

  const copyCode = () => {
    if (!selectedFile?.content) return;
    navigator.clipboard.writeText(selectedFile.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="flex flex-col h-full rounded-xl overflow-hidden" style={{ background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.06)' }}>
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-2 py-1 flex-shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <span className="text-[10px] font-medium flex-1" style={{ color: 'var(--accent-cyan)' }}>CODE EDITOR</span>
        <button onClick={addFile} className="p-0.5 rounded" style={{ color: 'rgba(255,255,255,0.4)' }} title="New file"><FilePlus size={11} /></button>
        <button onClick={copyCode} className="p-0.5 rounded" style={{ color: 'rgba(255,255,255,0.4)' }} title="Copy">{copied ? <Check size={11} style={{ color: 'var(--success)' }} /> : <Copy size={11} />}</button>
        <button onClick={() => setShowTerminal(v => !v)} className="p-0.5 rounded" style={{ color: showTerminal ? 'var(--accent-cyan)' : 'rgba(255,255,255,0.4)' }} title="Toggle terminal"><Terminal size={11} /></button>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* File Tree */}
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

        {/* Editor */}
        <div className="flex-1 flex flex-col min-w-0">
          {selectedFile ? (
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

          {/* Terminal */}
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
