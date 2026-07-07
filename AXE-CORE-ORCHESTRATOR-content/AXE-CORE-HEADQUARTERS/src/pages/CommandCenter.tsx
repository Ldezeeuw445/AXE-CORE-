import { motion } from 'framer-motion';
import { Terminal, Cpu, Globe, MessageSquare, TrendingUp, Wallet, Database, Settings } from 'lucide-react';

const commands = [
  { label: 'Open AI Core', icon: Cpu, shortcut: '⌘1', path: '/ai-core' },
  { label: 'Open Agents', icon: Globe, shortcut: '⌘2', path: '/agents' },
  { label: 'Open Memory', icon: Database, shortcut: '⌘3', path: '/memory' },
  { label: 'Open Trading', icon: TrendingUp, shortcut: '⌘4', path: '/trading' },
  { label: 'Open Finance', icon: Wallet, shortcut: '⌘5', path: '/finance' },
  { label: 'Open MCP', icon: Terminal, shortcut: '⌘6', path: '/mcp' },
  { label: 'Open Settings', icon: Settings, shortcut: '⌘7', path: '/settings' },
  { label: 'Voice Chat', icon: MessageSquare, shortcut: '⌘⇧A', path: '' },
];

export default function CommandCenter() {
  return (
    <motion.div
      className="p-6 h-full overflow-y-auto flex flex-col items-center"
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] }}
    >
      <div className="w-full max-w-2xl">
        <div
          className="flex items-center gap-3 px-4 mb-6 rounded-xl"
          style={{
            height: '56px',
            backgroundColor: 'var(--bg-elevated)',
            border: '1px solid var(--border-subtle)',
          }}
        >
          <Terminal size={20} style={{ color: 'var(--text-muted)' }} />
          <input
            type="text"
            placeholder="Type a command or search..."
            className="flex-1 bg-transparent outline-none text-body"
            style={{ color: 'var(--text-primary)' }}
            autoFocus
          />
          <span
            className="text-xs-custom px-2 py-0.5 rounded"
            style={{ backgroundColor: 'var(--bg-hover)', color: 'var(--text-muted)' }}
          >
            ESC to close
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {commands.map((cmd, i) => {
            const Icon = cmd.icon;
            return (
              <motion.button
                key={cmd.label}
                className="flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-fast text-left"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                }}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--bg-hover)';
                  e.currentTarget.style.borderColor = 'var(--border-active)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--bg-surface)';
                  e.currentTarget.style.borderColor = 'var(--border-subtle)';
                }}
              >
                <Icon size={18} style={{ color: 'var(--text-secondary)' }} />
                <span className="text-body flex-1" style={{ color: 'var(--text-primary)' }}>
                  {cmd.label}
                </span>
                <span
                  className="text-xs-custom px-1.5 py-0.5 rounded"
                  style={{ backgroundColor: 'var(--bg-hover)', color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace' }}
                >
                  {cmd.shortcut}
                </span>
              </motion.button>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}
