import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Globe, Navigation, Search, ExternalLink, ArrowLeft, ArrowRight, RefreshCw, Eye } from 'lucide-react';

interface BrowserCommand {
  id: string;
  url: string;
  status: 'pending' | 'loading' | 'done' | 'error';
  title?: string;
  summary?: string;
}

export function BrowserControl() {
  const [url, setUrl] = useState('');
  const [commands, setCommands] = useState<BrowserCommand[]>([]);
  const [activeCommand, setActiveCommand] = useState<string | null>(null);

  const navigateTo = (targetUrl: string) => {
    if (!targetUrl.trim()) return;
    const fullUrl = targetUrl.startsWith('http') ? targetUrl : `https://${targetUrl}`;
    const cmd: BrowserCommand = {
      id: Date.now().toString(),
      url: fullUrl,
      status: 'loading',
    };
    setCommands(prev => [...prev.slice(-4), cmd]);
    setActiveCommand(cmd.id);
    setUrl('');

    // Simulate loading
    setTimeout(() => {
      setCommands(prev => prev.map(c =>
        c.id === cmd.id ? { ...c, status: 'done', title: new URL(fullUrl).hostname, summary: `Loaded content from ${fullUrl}` } : c
      ));
    }, 1500);
  };

  const quickSites = [
    { label: 'GitHub', url: 'github.com' },
    { label: 'Docs', url: 'docs.anthropic.com' },
    { label: 'Exa', url: 'exa.ai' },
  ];

  return (
    <div className="flex flex-col gap-1.5">
      {/* Address bar */}
      <div className="flex items-center gap-1">
        <div className="flex items-center gap-0.5 flex-1 min-w-0 rounded px-1.5 py-0.5" style={{ background: 'var(--bg-base)', border: '1px solid var(--border-active)' }}>
          <Globe size={9} style={{ color: 'var(--text-muted)' }} />
          <input
            value={url}
            onChange={e => setUrl(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') navigateTo(url); }}
            placeholder="Enter URL..."
            className="flex-1 min-w-0 text-[9px] bg-transparent outline-none"
            style={{ color: 'var(--text-primary)' }}
          />
        </div>
        <button onClick={() => navigateTo(url)} className="p-0.5 rounded" style={{ color: 'var(--accent-cyan)' }}><Navigation size={10} /></button>
      </div>

      {/* Quick sites */}
      <div className="flex gap-1">
        {quickSites.map(site => (
          <button
            key={site.url}
            onClick={() => navigateTo(site.url)}
            className="text-[8px] px-1.5 py-0.5 rounded"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: 'var(--text-muted)' }}
          >
            {site.label}
          </button>
        ))}
      </div>

      {/* Command history */}
      <div className="space-y-1 max-h-24 overflow-y-auto">
        <AnimatePresence>
          {commands.map(cmd => (
            <motion.div
              key={cmd.id}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-1.5 rounded px-1.5 py-1"
              style={{
                background: activeCommand === cmd.id ? 'rgba(34,211,238,0.05)' : 'transparent',
                border: `1px solid ${activeCommand === cmd.id ? 'rgba(34,211,238,0.15)' : 'transparent'}`,
              }}
            >
              {cmd.status === 'loading' ? <RefreshCw size={9} className="animate-spin" style={{ color: 'var(--accent-cyan)' }} /> :
               cmd.status === 'done' ? <Eye size={9} style={{ color: 'var(--success)' }} /> :
               <ExternalLink size={9} style={{ color: 'var(--text-muted)' }} />}
              <span className="text-[9px] flex-1 truncate" style={{ color: 'var(--text-primary)' }}>{cmd.title || cmd.url}</span>
              <a href={cmd.url} target="_blank" rel="noopener noreferrer" className="flex-shrink-0"><ExternalLink size={8} style={{ color: 'var(--text-muted)' }} /></a>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* AXE Browser Commands hint */}
      <div className="text-[8px] pt-1" style={{ color: 'var(--text-muted)', borderTop: '1px solid var(--border-subtle)' }}>
        Tip: Type &quot; browse [URL] &quot; in chat to let AXE visit a page.
      </div>
    </div>
  );
}
