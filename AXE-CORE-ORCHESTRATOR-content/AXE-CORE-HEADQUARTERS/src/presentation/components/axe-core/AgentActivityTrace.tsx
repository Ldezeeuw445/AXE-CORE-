import { motion } from 'framer-motion';
import { FileCode, Terminal, Search, Loader2 } from 'lucide-react';
import type { AgentTurn } from '@/application/agents/localCodeAgent';

interface TraceMessage {
  role: 'user' | 'agent' | 'status' | 'plan';
  patches?: unknown[];
  filesRead?: string[];
  ranCommand?: AgentTurn['ranCommand'];
}

/** What actually happened in one agent turn — a real fact, not a guess. */
function stepKindOf(msg: TraceMessage): 'patch' | 'command' | 'read' | 'talk' {
  if (msg.ranCommand) return 'command';
  if (msg.patches && msg.patches.length > 0) return 'patch';
  if (msg.filesRead && msg.filesRead.length > 0) return 'read';
  return 'talk';
}

const KIND_STYLE = {
  patch:   { icon: FileCode, color: '#22D3EE', label: 'bestand aangepast' },
  command: { icon: Terminal, color: '#A78BFA', label: 'commando uitgevoerd' },
  read:    { icon: Search,   color: '#6EE7B7', label: 'bestand gelezen' },
  talk:    { icon: FileCode, color: 'rgba(255,255,255,0.3)', label: 'reactie' },
} as const;

/**
 * Compact visual trace of what the agent loop actually did, turn by turn —
 * a glance instead of scrolling text. Each node is a real fact (a patch
 * applied, a command run and its exit code, a file read), not decoration.
 */
export function AgentActivityTrace({
  messages, busy, onSelect,
}: {
  messages: TraceMessage[];
  busy: boolean;
  onSelect: (index: number) => void;
}) {
  const steps = messages
    .map((m, index) => ({ m, index }))
    .filter(({ m }) => m.role === 'agent');

  if (steps.length === 0 && !busy) return null;

  return (
    <div className="px-2 py-1.5 flex items-center gap-1 overflow-x-auto flex-shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      {steps.map(({ m, index }, i) => {
        const kind = stepKindOf(m);
        const style = KIND_STYLE[kind];
        const Icon = style.icon;
        const failed = kind === 'command' && m.ranCommand && m.ranCommand.exitCode !== 0 && m.ranCommand.exitCode != null;
        const color = failed ? '#f87171' : style.color;
        return (
          <div key={index} className="flex items-center gap-1 flex-shrink-0">
            {i > 0 && <div className="w-3 h-px" style={{ background: 'rgba(255,255,255,0.08)' }} />}
            <button
              onClick={() => onSelect(index)}
              title={`Turn ${i + 1}: ${style.label}${failed ? ' (mislukt)' : ''}`}
              className="w-5 h-5 rounded-full flex items-center justify-center"
              style={{ background: `${color}18`, border: `1px solid ${color}55` }}
            >
              <Icon size={9} style={{ color }} />
            </button>
          </div>
        );
      })}
      {busy && (
        <div className="flex items-center gap-1 flex-shrink-0">
          {steps.length > 0 && <div className="w-3 h-px" style={{ background: 'rgba(255,255,255,0.08)' }} />}
          <motion.div
            className="w-5 h-5 rounded-full flex items-center justify-center"
            style={{ background: 'rgba(34,211,238,0.1)', border: '1px solid rgba(34,211,238,0.4)' }}
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 1.1, repeat: Infinity, ease: 'easeInOut' }}
          >
            <Loader2 size={9} className="animate-spin" style={{ color: 'var(--accent-cyan)' }} />
          </motion.div>
        </div>
      )}
    </div>
  );
}
