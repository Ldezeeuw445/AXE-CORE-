/**
 * TerminalPage.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Full xterm.js terminal powered by the real-shell WebSocket backend.
 * Replaces the old <pre>+<input> implementation with proper ANSI rendering,
 * scrollback, clickable URLs, and full command-history navigation.
 */
import { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Terminal, Trash2, RefreshCw } from 'lucide-react';
import { XtermTerminal, type XtermHandle } from '@/components/axe-core/XtermTerminal';

const QUICK = [
  { label: '🤖 Jarvis',   cmd: 'jarvis\n',                                          color: '#A78BFA', title: 'Start OpenJarvis server' },
  { label: '🦙 Ollama',   cmd: 'ollama serve\n',                                     color: '#10B981', title: 'Start Ollama daemon' },
  { label: '📦 llama3.2', cmd: 'ollama pull llama3.2\n',                             color: '#10B981', title: 'Download llama3.2 model' },
  { label: '🔍 ps',       cmd: 'ps aux | grep -E "jarvis|ollama" | grep -v grep\n', color: '#F59E0B', title: 'Show running AI processes' },
  { label: '📁 ls ~',     cmd: 'ls --color=auto ~\n',                               color: '#3B82F6', title: 'Home directory' },
  { label: '🎨 colors',   cmd: 'ls --color=auto .\n',                               color: '#22D3EE', title: 'Test ANSI colours' },
  { label: '🧹 clear',    cmd: '__clear__',                                          color: '#6B7280', title: 'Clear terminal' },
];

export default function TerminalPage() {
  const termRef   = useRef<XtermHandle>(null);
  const [connected, setConnected] = useState(false);

  const quickAction = (q: typeof QUICK[0]) => {
    if (q.cmd === '__clear__') { termRef.current?.clear(); return; }
    termRef.current?.send(q.cmd);
  };

  return (
    <motion.div className="h-full flex flex-col" style={{ background: '#02080a' }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }}>

      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-4 py-2.5 flex-shrink-0 flex-wrap"
        style={{ borderBottom: '1px solid rgba(34,211,238,0.07)', background: '#03090b' }}>

        {/* macOS traffic lights */}
        <div className="flex gap-1.5 mr-1">
          {(['rgba(255,59,48,.7)', 'rgba(255,196,0,.7)', 'rgba(50,215,75,.7)'] as const).map((c, i) => (
            <span key={i} style={{ width: 10, height: 10, borderRadius: '50%', background: c, display: 'inline-block' }} />
          ))}
        </div>

        <Terminal size={12} color="var(--accent-cyan)" />
        <span className="text-[11px] font-mono-data" style={{ color: 'var(--accent-cyan)' }}>AXE TERMINAL</span>

        {/* Connection indicator */}
        <span style={{
          width: 5, height: 5, borderRadius: '50%', display: 'inline-block',
          background: connected ? '#10B981' : '#ef4444',
          boxShadow: connected ? '0 0 6px #10B981' : 'none',
        }} />
        <span className="text-[10px] font-mono-data" style={{ color: connected ? '#10B981' : '#ef4444' }}>
          {connected ? 'LIVE' : 'OFFLINE'}
        </span>

        <div className="w-px h-4 mx-1" style={{ background: 'rgba(255,255,255,0.06)' }} />

        {/* Quick-launch buttons */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {QUICK.map(q => (
            <button
              key={q.label}
              onClick={() => quickAction(q)}
              className="px-2 py-1 rounded text-[10px] font-medium transition-all hover:brightness-125"
              style={{
                background: `${q.color}15`, border: `1px solid ${q.color}28`, color: q.color,
              }}
              title={q.title}
            >
              {q.label}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        <button onClick={() => termRef.current?.clear()} className="p-1.5 rounded transition-colors hover:brightness-125"
          style={{ color: 'var(--text-muted)' }} title="Clear screen">
          <Trash2 size={12} />
        </button>
        <button onClick={() => termRef.current?.reconnect()} className="p-1.5 rounded transition-colors hover:brightness-125"
          style={{ color: 'var(--text-muted)' }} title="New session">
          <RefreshCw size={12} />
        </button>
      </div>

      {/* ── xterm.js viewport ───────────────────────────────────────── */}
      <div className="flex-1 min-h-0 p-2">
        <XtermTerminal
          ref={termRef}
          onConnectionChange={setConnected}
          style={{ height: '100%' }}
        />
      </div>
    </motion.div>
  );
}
