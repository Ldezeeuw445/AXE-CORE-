import { useState } from 'react';
import { motion } from 'framer-motion';
import { Play, Copy, Check, Code2, Terminal, Bug, Wand2 } from 'lucide-react';

interface CodeAction {
  id: string;
  label: string;
  icon: typeof Code2;
  prompt: string;
}

const CODE_ACTIONS: CodeAction[] = [
  { id: 'explain', label: 'Explain', icon: Code2, prompt: 'Explain this code in detail:' },
  { id: 'debug', label: 'Debug', icon: Bug, prompt: 'Find and fix bugs in this code:' },
  { id: 'optimize', label: 'Optimize', icon: Wand2, prompt: 'Optimize this code for performance:' },
  { id: 'test', label: 'Tests', icon: Terminal, prompt: 'Write unit tests for this code:' },
];

export function CodeAgentPanel() {
  const [code, setCode] = useState('');
  const [action, setAction] = useState<string>('explain');
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (!code) return;
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleAction = (actionId: string) => {
    setAction(actionId);
    const selected = CODE_ACTIONS.find(a => a.id === actionId);
    if (!selected || !code.trim()) return;
    // Dispatch event for the chat to pick up
    const event = new CustomEvent('axe-code-action', {
      detail: { prompt: `${selected.prompt}\n\n\`\`\`\n${code}\n\`\`\`` }
    });
    window.dispatchEvent(event);
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1 flex-wrap">
        {CODE_ACTIONS.map(a => {
          const Icon = a.icon;
          return (
            <button
              key={a.id}
              onClick={() => handleAction(a.id)}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] font-medium"
              style={{
                background: action === a.id ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${action === a.id ? 'rgba(16,185,129,0.3)' : 'rgba(255,255,255,0.06)'}`,
                color: action === a.id ? '#10B981' : 'var(--text-muted)',
              }}
            >
              <Icon size={9} />{a.label}
            </button>
          );
        })}
        <div className="flex-1" />
        <button onClick={handleCopy} className="p-0.5 rounded" style={{ color: 'var(--text-muted)' }}>{copied ? <Check size={9} style={{ color: 'var(--success)' }} /> : <Copy size={9} />}</button>
      </div>
      <textarea
        value={code}
        onChange={e => setCode(e.target.value)}
        placeholder="Paste code here..."
        className="w-full text-[9px] px-2 py-1.5 rounded font-mono-data resize-none outline-none"
        style={{ background: 'var(--bg-base)', border: '1px solid var(--border-active)', color: 'var(--text-primary)', minHeight: 60, maxHeight: 120 }}
        spellCheck={false}
      />
      <button
        onClick={() => handleAction(action)}
        disabled={!code.trim()}
        className="flex items-center justify-center gap-1 text-[9px] py-1 rounded font-medium disabled:opacity-30"
        style={{ background: '#10B981', color: '#000' }}
      >
        <Play size={9} /> Send to Code Agent
      </button>
    </div>
  );
}
