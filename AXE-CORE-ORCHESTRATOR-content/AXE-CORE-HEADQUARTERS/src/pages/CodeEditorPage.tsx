/**
 * CodeEditorPage.tsx
 * ------------------------------------------------------------------
 * Full-page code editor with file tree, Monaco editor, integrated
 * terminal, and AI chat assistant. GitHub repo integration.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Code2, Play, Save, FilePlus, FolderPlus, Trash2,
  GitBranch, Terminal, ChevronRight, FileCode, Folder,
  X, Copy, Check, Download, Search, Bot, Send, Mic,
  FolderOpen, RefreshCw, Plus, Settings,
} from 'lucide-react';
import { useVoiceStore } from '@/store/voiceStore';
import Editor from '@monaco-editor/react';

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

/* ─── File Tree Item ───────────────────────────────────────────────────── */
function FileTreeItem({
  node, depth, selectedId, onSelect, onToggleFolder, onDelete,
}: {
  node: FileNode;
  depth: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onToggleFolder: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const isSelected = selectedId === node.id;

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
        {node.type === 'folder'
          ? <Folder size={10} style={{ color: node.expanded ? 'var(--accent-cyan)' : 'rgba(255,255,255,0.4)' }} />
          : <FileCode size={10} style={{ color: isSelected ? 'var(--accent-cyan)' : 'rgba(255,255,255,0.5)' }} />
        }
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

/* ─── Helper: find/update/remove file nodes ────────────────────────────── */
function findFile(nodes: FileNode[], id: string | null): FileNode | null {
  if (!id) return null;
  for (const n of nodes) {
    if (n.id === id) return n;
    if (n.children) { const f = findFile(n.children, id); if (f) return f; }
  }
  return null;
}

function updateNode(nodes: FileNode[], id: string, content: string): FileNode[] {
  return nodes.map(n => {
    if (n.id === id) return { ...n, content, isModified: true };
    if (n.children) return { ...n, children: updateNode(n.children, id, content) };
    return n;
  });
}

function toggleNode(nodes: FileNode[], id: string): FileNode[] {
  return nodes.map(n => {
    if (n.id === id) return { ...n, expanded: !n.expanded };
    if (n.children) return { ...n, children: toggleNode(n.children, id) };
    return n;
  });
}

function removeNode(nodes: FileNode[], id: string): FileNode[] {
  return nodes.filter(n => n.id !== id).map(n =>
    n.children ? { ...n, children: removeNode(n.children, id) } : n
  );
}

function addToRoot(nodes: FileNode[], file: FileNode): FileNode[] {
  return nodes.map(n => {
    if (n.type === 'folder' && n.expanded && n.children) {
      return { ...n, children: [...n.children, file] };
    }
    if (n.children) return { ...n, children: addToRoot(n.children, file) };
    return n;
  });
}

/* ══════════════════════════════════════════════════════════════════════════
   CODE EDITOR PAGE
   ══════════════════════════════════════════════════════════════════════════ */
export default function CodeEditorPage() {
  const voice = useVoiceStore();

  const [files, setFiles] = useState<FileNode[]>([
    {
      id: 'root', name: 'axe-core', type: 'folder', expanded: true,
      children: [
        {
          id: 'src', name: 'src', type: 'folder', expanded: true,
          children: [
            { id: 'f1', name: 'App.tsx', type: 'file', content: `import { Routes, Route } from 'react-router';\nimport { AppShell } from '@/components/layout/AppShell';\n\nexport default function App() {\n  return (\n    <AppShell>\n      <Routes>\n        <Route path="/" element={<Home />} />\n      </Routes>\n    </AppShell>\n  );\n}`, language: 'tsx' },
            { id: 'f2', name: 'main.tsx', type: 'file', content: `import React from 'react';\nimport ReactDOM from 'react-dom/client';\nimport App from './App';\n\nReactDOM.createRoot(document.getElementById('root')!).render(\n  <React.StrictMode>\n    <App />\n  </React.StrictMode>\n);`, language: 'tsx' },
          ],
        },
        { id: 'f3', name: 'package.json', type: 'file', content: '{\n  "name": "axe-core",\n  "version": "5.0.0",\n  "type": "module"\n}', language: 'json' },
        { id: 'f4', name: 'README.md', type: 'file', content: '# AXE CORE OS\n\nJarvis-style AI operating system.\n\n## Features\n- Multi-provider LLM routing\n- Voice interface\n- Code agent\n- Browser control\n- EVE Framework', language: 'markdown' },
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
  const [showAiChat, setShowAiChat] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<Array<{ role: 'user' | 'ai'; text: string }>>([]);
  const [chatBusy, setChatBusy] = useState(false);

  const selectedFile = findFile(files, selectedId);

  const updateFile = useCallback((id: string, content: string) => {
    setFiles(prev => updateNode(prev, id, content));
  }, []);

  const toggleFolder = useCallback((id: string) => {
    setFiles(prev => toggleNode(prev, id));
  }, []);

  const deleteNode = useCallback((id: string) => {
    setFiles(prev => removeNode(prev, id));
    if (selectedId === id) setSelectedId(null);
  }, [selectedId]);

  const addFile = useCallback(() => {
    const name = prompt('File name:');
    if (!name) return;
    const newFile: FileNode = {
      id: Date.now().toString(), name, type: 'file',
      content: '', language: detectLanguage(name),
    };
    setFiles(prev => addToRoot(prev, newFile));
    setSelectedId(newFile.id);
  }, []);

  const addFolder = useCallback(() => {
    const name = prompt('Folder name:');
    if (!name) return;
    const newFolder: FileNode = {
      id: Date.now().toString(), name, type: 'folder',
      expanded: true, children: [],
    };
    setFiles(prev => addToRoot(prev, newFolder));
  }, []);

  const handleTermCommand = useCallback((cmd: string) => {
    setTermLines(prev => [...prev, { id: Date.now().toString(), type: 'input', text: cmd, timestamp: '' }]);

    const cmd_lower = cmd.trim().toLowerCase();
    let output = '';

    if (cmd_lower === 'help') {
      output = 'Commands: help, ls, clear, echo [text], cat [file], git [cmd], npm [cmd], mkdir [name], touch [name]';
    } else if (cmd_lower === 'ls') {
      const listFiles = (nodes: FileNode[], prefix = ''): string[] => {
        return nodes.flatMap(n => {
          const line = `${prefix}${n.name}${n.type === 'folder' ? '/' : ''}`;
          return n.children ? [line, ...listFiles(n.children, prefix + '  ')] : line;
        });
      };
      output = listFiles(files).join('\n') || '(empty)';
    } else if (cmd_lower === 'clear') {
      setTermLines([{ id: 'clear', type: 'output', text: '', timestamp: '' }]);
      return;
    } else if (cmd_lower.startsWith('echo ')) {
      output = cmd.slice(5);
    } else if (cmd_lower.startsWith('cat ') && selectedFile) {
      output = selectedFile.content || '(empty)';
    } else if (cmd_lower.startsWith('git ')) {
      const gitCmd = cmd.slice(4);
      if (gitCmd.startsWith('status')) output = 'On branch orchestrator\nnothing to commit, working tree clean';
      else if (gitCmd.startsWith('log')) output = '8251bd5 HEAD -> orchestrator Initial commit';
      else output = `[git] Simulated: git ${gitCmd}`;
    } else if (cmd_lower.startsWith('npm ')) {
      output = `[npm] Simulated: ${cmd}`;
    } else if (cmd_lower.startsWith('mkdir ')) {
      const name = cmd.slice(6);
      const newFolder: FileNode = { id: Date.now().toString(), name, type: 'folder', expanded: true, children: [] };
      setFiles(prev => addToRoot(prev, newFolder));
      output = `Created directory: ${name}`;
    } else if (cmd_lower.startsWith('touch ')) {
      const name = cmd.slice(6);
      const newFile: FileNode = { id: Date.now().toString(), name, type: 'file', content: '', language: detectLanguage(name) };
      setFiles(prev => addToRoot(prev, newFile));
      output = `Created file: ${name}`;
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

  const handleAiChat = async () => {
    const text = chatInput.trim();
    if (!text || chatBusy) return;
    setChatMessages(prev => [...prev, { role: 'user', text }]);
    setChatInput('');
    setChatBusy(true);
    try {
      await voice.sendMessage(`[CODE] ${text}`);
      const last = voice.conversation[voice.conversation.length - 1];
      if (last?.role === 'axe') {
        setChatMessages(prev => [...prev, { role: 'ai', text: last.text }]);
      }
    } catch {
      setChatMessages(prev => [...prev, { role: 'ai', text: 'Error processing request.' }]);
    }
    setChatBusy(false);
  };

  return (
    <motion.div className="h-full flex flex-col" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-3 py-1.5 flex-shrink-0" style={{ borderBottom: '1px solid rgba(34,211,238,0.07)', background: '#03090b' }}>
        <Code2 size={12} style={{ color: 'var(--accent-cyan)' }} />
        <span className="text-[11px] font-mono-data" style={{ color: 'var(--accent-cyan)' }}>CODE EDITOR</span>
        <div className="w-px h-4 mx-2" style={{ background: 'rgba(255,255,255,0.08)' }} />
        <button onClick={addFile} className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px]" style={{ color: 'rgba(255,255,255,0.5)' }} title="New file"><FilePlus size={10} /> New File</button>
        <button onClick={addFolder} className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px]" style={{ color: 'rgba(255,255,255,0.5)' }} title="New folder"><FolderPlus size={10} /> Folder</button>
        <button onClick={copyCode} className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px]" style={{ color: 'rgba(255,255,255,0.5)' }} title="Copy">{copied ? <><Check size={10} style={{ color: 'var(--success)' }} /> Copied</> : <><Copy size={10} /> Copy</>}</button>
        <div className="flex-1" />
        <button onClick={() => setShowAiChat(v => !v)} className="flex items-center gap-1 px-2 py-0.5 rounded text-[9px]" style={{ background: showAiChat ? 'rgba(34,211,238,0.1)' : 'transparent', border: showAiChat ? '1px solid rgba(34,211,238,0.25)' : '1px solid transparent', color: 'var(--accent-cyan)' }}><Bot size={10} /> AI</button>
        <button onClick={() => setShowTerminal(v => !v)} className="flex items-center gap-1 px-2 py-0.5 rounded text-[9px]" style={{ color: showTerminal ? 'var(--accent-cyan)' : 'rgba(255,255,255,0.5)' }}><Terminal size={10} /> Terminal</button>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* File Tree */}
        <div className="w-[180px] flex-shrink-0 overflow-y-auto py-1" style={{ borderRight: '1px solid rgba(255,255,255,0.06)', background: '#050505' }}>
          {files.map(node => (
            <FileTreeItem
              key={node.id} node={node} depth={0}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onToggleFolder={toggleFolder}
              onDelete={deleteNode}
            />
          ))}
        </div>

        {/* Editor */}
        <div className="flex-1 flex flex-col min-w-0" style={{ background: '#0a0a0a' }}>
          {selectedFile ? (
            <>
              <div className="flex items-center gap-1 px-3 py-1 flex-shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <FileCode size={9} style={{ color: 'var(--accent-cyan)' }} />
                <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.6)' }}>{selectedFile.name}</span>
                {selectedFile.isModified && <span style={{ color: '#F59E0B', fontSize: 10 }}>*</span>}
                <span className="text-[8px] ml-1 px-1 rounded" style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.3)' }}>{selectedFile.language}</span>
              </div>
              <div className="flex-1 min-h-0">
                <Editor
                  language={selectedFile.language || 'typescript'}
                  theme="vs-dark"
                  value={selectedFile.content || ''}
                  onChange={(v) => updateFile(selectedFile.id, v || '')}
                  options={{ minimap: { enabled: false }, fontSize: 13, lineNumbers: 'on', wordWrap: 'on', automaticLayout: true, scrollBeyondLastLine: false }}
                  height="100%"
                  loading={<div className="flex items-center justify-center h-full text-[10px]" style={{ color: 'var(--text-muted)' }}>Loading editor...</div>}
                />
              </div>

              {/* Terminal */}
              <AnimatePresence>
                {showTerminal && (
                  <motion.div
                    initial={{ height: 0 }} animate={{ height: 140 }} exit={{ height: 0 }}
                    className="flex-shrink-0 overflow-hidden"
                    style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}
                  >
                    <TerminalPanel lines={termLines} onCommand={handleTermCommand} />
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center flex-col gap-3">
              <FolderOpen size={32} style={{ color: 'rgba(255,255,255,0.1)' }} />
              <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.25)' }}>Select a file or create a new one</span>
            </div>
          )}
        </div>

        {/* AI Chat Panel */}
        <AnimatePresence>
          {showAiChat && (
            <motion.div
              initial={{ width: 0, opacity: 0 }} animate={{ width: 280, opacity: 1 }} exit={{ width: 0, opacity: 0 }}
              className="flex-shrink-0 overflow-hidden flex flex-col"
              style={{ borderLeft: '1px solid rgba(255,255,255,0.06)', background: '#050505' }}
            >
              <div className="px-3 py-2 flex-shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <div className="flex items-center gap-1.5">
                  <Bot size={10} style={{ color: 'var(--accent-cyan)' }} />
                  <span className="text-[10px] font-medium" style={{ color: 'var(--text-secondary)' }}>CODE ASSISTANT</span>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
                {chatMessages.length === 0 && (
                  <div className="text-[9px] text-center py-4" style={{ color: 'var(--text-muted)' }}>
                    Ask AXE to help with code, debug, or explain
                  </div>
                )}
                {chatMessages.map((m, i) => (
                  <div key={i} className={`flex gap-1.5 ${m.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                    <div className="mt-0.5 flex-shrink-0 text-[8px] w-4 h-4 rounded-full flex items-center justify-center" style={{ background: m.role === 'user' ? 'rgba(255,255,255,0.1)' : 'rgba(34,211,238,0.15)', color: m.role === 'user' ? 'var(--text-muted)' : 'var(--accent-cyan)' }}>
                      {m.role === 'user' ? 'U' : <Bot size={8} />}
                    </div>
                    <div className="max-w-[85%] rounded px-2 py-1 text-[10px] leading-snug" style={{ background: m.role === 'user' ? 'rgba(34,211,238,0.12)' : 'rgba(255,255,255,0.04)', color: m.role === 'user' ? 'var(--text-primary)' : 'rgba(165,243,252,0.8)' }}>{m.text}</div>
                  </div>
                ))}
                {chatBusy && <div className="text-[10px] flex items-center gap-1" style={{ color: 'var(--text-muted)' }}><RefreshCw size={8} className="animate-spin" /> Thinking...</div>}
              </div>
              <div className="p-2 flex-shrink-0" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                <div className="flex gap-1">
                  <input value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void handleAiChat(); }} placeholder="Ask about code..." className="flex-1 text-[10px] px-2 py-1 rounded" style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }} />
                  <button onClick={handleAiChat} disabled={chatBusy} className="px-2 py-1 rounded" style={{ background: 'var(--accent-cyan)', color: '#000' }}><Send size={10} /></button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
