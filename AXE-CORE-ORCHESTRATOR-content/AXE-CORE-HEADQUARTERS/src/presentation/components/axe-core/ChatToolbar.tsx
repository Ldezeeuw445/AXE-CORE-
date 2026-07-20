import { motion } from 'framer-motion';
import { Globe, Code2, FileText, Bot } from 'lucide-react';

export type ChatMode = 'default' | 'kimiclaw' | 'kimicode' | 'kimiwork';

interface ChatToolbarProps {
  mode: ChatMode;
  onModeChange: (mode: ChatMode) => void;
}

const MODES: { id: ChatMode; label: string; icon: typeof Globe; desc: string; accent: string; bg: string }[] = [
  { id: 'default',  label: 'AXE',       icon: Bot,     desc: 'General AI assistant',       accent: '#22D3EE', bg: 'rgba(34,211,238,0.08)' },
  { id: 'kimiclaw', label: 'KimiClaw',  icon: Globe,   desc: 'Web search & research',    accent: '#F59E0B', bg: 'rgba(245,158,11,0.08)' },
  { id: 'kimicode', label: 'KimiCode',  icon: Code2,   desc: 'Code & development',       accent: '#10B981', bg: 'rgba(16,185,129,0.08)' },
  { id: 'kimiwork', label: 'KimiWork',  icon: FileText, desc: 'Documents & analysis',    accent: '#8B5CF6', bg: 'rgba(139,92,246,0.08)' },
];

export function ChatToolbar({ mode, onModeChange }: ChatToolbarProps) {
  return (
    <div className="flex items-center gap-1 pb-1.5" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
      {MODES.map((m) => {
        const Icon = m.icon;
        const active = mode === m.id;
        return (
          <motion.button
            key={m.id}
            onClick={() => onModeChange(active ? 'default' : m.id)}
            whileTap={{ scale: 0.95 }}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium transition-all"
            style={{
              background: active ? m.bg : 'transparent',
              border: `1px solid ${active ? m.accent + '40' : 'transparent'}`,
              color: active ? m.accent : 'var(--text-muted)',
            }}
            title={m.desc}
          >
            <Icon size={12} />
            <span>{m.label}</span>
          </motion.button>
        );
      })}
    </div>
  );
}
