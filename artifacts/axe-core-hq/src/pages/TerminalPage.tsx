import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Terminal, Play, Trash2, RefreshCw } from 'lucide-react';
import { useRealTerminal } from '@/hooks/useRealTerminal';

const QUICK = [
  { label: '🤖 Jarvis',      cmd: 'jarvis\n',                    color: '#A78BFA', title: 'Start OpenJarvis server' },
  { label: '🦙 Ollama',      cmd: 'ollama serve\n',               color: '#10B981', title: 'Start Ollama daemon' },
  { label: '📦 llama3.2',    cmd: 'ollama pull llama3.2\n',       color: '#10B981', title: 'Download llama3.2 model' },
  { label: '🔍 ps',          cmd: 'ps aux | grep -E "jarvis|ollama" | grep -v grep\n', color: '#F59E0B', title: 'Show running AI processes' },
  { label: '📁 ~',           cmd: 'ls ~\n',                        color: '#3B82F6', title: 'Home directory' },
  { label: '🧹 cls',         cmd: '__clear__',                    color: '#6B7280', title: 'Clear terminal' },
];

export default function TerminalPage() {
  const { output, connected, send, clear, reconnect } = useRealTerminal('AXE Terminal — connecting…\r\n');
  const [input, setInput]   = useState('');
  const preRef     = useRef<HTMLPreElement>(null);
  const inputRef   = useRef<HTMLInputElement>(null);
  const historyRef = useRef<string[]>([]);
  const hIdxRef    = useRef(-1);

  useEffect(() => {
    if (preRef.current) preRef.current.scrollTop = preRef.current.scrollHeight;
  }, [output]);

  useEffect(() => {
    if (connected) setTimeout(() => inputRef.current?.focus(), 50);
  }, [connected]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    historyRef.current.unshift(input);
    hIdxRef.current = -1;
    send(input + '\n');
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const next = Math.min(hIdxRef.current + 1, historyRef.current.length - 1);
      hIdxRef.current = next;
      setInput(historyRef.current[next] ?? '');
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = Math.max(hIdxRef.current - 1, -1);
      hIdxRef.current = next;
      setInput(next === -1 ? '' : (historyRef.current[next] ?? ''));
    } else if (e.key === 'c' && e.ctrlKey) {
      send('\x03');
    } else if (e.key === 'l' && e.ctrlKey) {
      e.preventDefault();
      clear();
    }
  };

  const quickAction = (q: typeof QUICK[0]) => {
    if (q.cmd === '__clear__') { clear(); return; }
    if (!connected) return;
    send(q.cmd);
    inputRef.current?.focus();
  };

  return (
    <motion.div className="h-full flex flex-col" style={{ background: '#02080a' }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }}>

      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-4 py-2.5 flex-shrink-0"
        style={{ borderBottom: '1px solid rgba(34,211,238,0.07)', background: '#03090b' }}>

        {/* Traffic lights */}
        <div className="flex gap-1.5 mr-1">
          {['rgba(255,59,48,.7)','rgba(255,196,0,.7)','rgba(50,215,75,.7)'].map((c,i) => (
            <span key={i} style={{ width:10, height:10, borderRadius:'50%', background:c, display:'inline-block' }} />
          ))}
        </div>

        <Terminal size={12} color="var(--accent-cyan)" />
        <span className="text-[11px] font-mono-data" style={{ color: 'var(--accent-cyan)' }}>AXE TERMINAL</span>

        {/* Connection dot */}
        <span style={{ width:5, height:5, borderRadius:'50%', background: connected ? '#10B981' : '#ef4444',
          display:'inline-block', boxShadow: connected ? '0 0 6px #10B981' : 'none' }} />
        <span className="text-[10px] font-mono-data" style={{ color: connected ? '#10B981' : '#ef4444' }}>
          {connected ? 'LIVE' : 'OFFLINE'}
        </span>

        <div className="w-px h-4 mx-1" style={{ background: 'rgba(255,255,255,0.06)' }} />

        {/* Quick launch buttons */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {QUICK.map(q => (
            <button key={q.label} onClick={() => quickAction(q)}
              disabled={!connected && q.cmd !== '__clear__'}
              className="px-2 py-1 rounded text-[10px] font-medium transition-all hover:brightness-125"
              style={{ background:`${q.color}15`, border:`1px solid ${q.color}28`, color: q.color,
                opacity: (!connected && q.cmd !== '__clear__') ? 0.35 : 1 }}
              title={q.title}>
              {q.label}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        <button onClick={clear} className="p-1.5 rounded transition-colors hover:brightness-125"
          style={{ color: 'var(--text-muted)' }} title="Clear output">
          <Trash2 size={12} />
        </button>
        <button onClick={() => void reconnect()} className="p-1.5 rounded transition-colors hover:brightness-125"
          style={{ color: 'var(--text-muted)' }} title="Reconnect / new session">
          <RefreshCw size={12} />
        </button>
      </div>

      {/* ── Output ──────────────────────────────────────────────── */}
      <pre ref={preRef}
        className="flex-1 overflow-y-auto px-4 py-3 font-mono-data text-[12px] whitespace-pre-wrap break-words"
        style={{ lineHeight: 1.65, background: '#02080a', color: 'rgba(165,243,252,0.82)', cursor: 'text' }}
        onClick={() => inputRef.current?.focus()}>
        {output}
      </pre>

      {/* ── Input ───────────────────────────────────────────────── */}
      <form onSubmit={handleSubmit}
        className="flex items-center gap-2 px-4 py-2.5 flex-shrink-0"
        style={{ borderTop: '1px solid rgba(34,211,238,0.07)', background: '#03090b' }}>
        <span className="font-mono-data text-[13px] select-none" style={{ color: 'var(--accent-cyan)' }}>❯</span>
        <input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          className="flex-1 bg-transparent outline-none font-mono-data text-[12px]"
          style={{ color: 'rgba(255,255,255,0.92)', caretColor: 'var(--accent-cyan)' }}
          placeholder={connected ? 'Type a command  (↑↓ history · Ctrl+C · Ctrl+L clear)' : 'Server offline — click Reconnect'}
          autoFocus
        />
        <button type="submit" disabled={!input || !connected}
          className="p-1.5 rounded transition-all"
          style={{ color: (input && connected) ? 'var(--accent-cyan)' : 'var(--text-muted)', opacity: (input && connected) ? 1 : 0.4 }}>
          <Play size={12} />
        </button>
      </form>

    </motion.div>
  );
}
