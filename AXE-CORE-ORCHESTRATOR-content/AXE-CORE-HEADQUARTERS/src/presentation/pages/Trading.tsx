import { useState } from 'react';
import { motion } from 'framer-motion';
import { ExternalLink, RefreshCw, Maximize2 } from 'lucide-react';

interface TradingTab { id: string; label: string; url: string; description: string; color: string; }

const TABS: TradingTab[] = [
  { id: 'tradingos', label: 'TradingOS', url: 'https://tradingosapp.com', description: 'Your trading execution platform', color: '#22D3EE' },
  { id: 'krypt',     label: 'Krypt.cc',  url: 'https://krypt.cc',         description: 'Crypto market intelligence',   color: '#F59E0B' },
];

export default function Trading() {
  const [activeTab, setActiveTab] = useState('tradingos');
  const [reloadKey, setReloadKey] = useState<Record<string, number>>({});

  const tab = TABS.find(t => t.id === activeTab)!;
  const reload = () => setReloadKey(k => ({ ...k, [activeTab]: (k[activeTab] ?? 0) + 1 }));

  return (
    <div className="h-full flex flex-col">
      {/* Tab bar */}
      <div className="flex items-center gap-0 flex-shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', backgroundColor: '#000' }}>
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className="flex items-center gap-2 px-5 py-3 text-small transition-all relative"
            style={{
              color: activeTab === t.id ? t.color : 'var(--text-muted)',
              borderBottom: activeTab === t.id ? `2px solid ${t.color}` : '2px solid transparent',
              marginBottom: '-1px',
            }}
          >
            <span className="rounded-full" style={{ width: 6, height: 6, background: activeTab === t.id ? t.color : 'var(--text-muted)', display: 'inline-block', opacity: activeTab === t.id ? 1 : 0.4 }} />
            {t.label}
          </button>
        ))}
        <div className="flex-1" />
        {/* Controls */}
        <div className="flex items-center gap-1 px-3">
          <button onClick={reload} className="p-1.5 rounded" style={{ color: 'var(--text-muted)' }} title="Reload">
            <RefreshCw size={13} />
          </button>
          <a href={tab.url} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded" style={{ color: 'var(--text-muted)' }} title="Open in new tab">
            <ExternalLink size={13} />
          </a>
          <span className="text-xs-custom font-mono-data px-2" style={{ color: 'var(--text-muted)' }}>{tab.url}</span>
        </div>
      </div>

      {/* iFrame area */}
      <div className="flex-1 relative">
        {TABS.map(t => (
          <motion.div
            key={t.id}
            initial={false}
            animate={{ opacity: activeTab === t.id ? 1 : 0, pointerEvents: activeTab === t.id ? 'auto' : 'none' }}
            transition={{ duration: 0.15 }}
            className="absolute inset-0"
          >
            <iframe
              key={`${t.id}-${reloadKey[t.id] ?? 0}`}
              src={t.url}
              title={t.label}
              width="100%"
              height="100%"
              style={{ border: 'none', display: 'block' }}
              sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-presentation"
              referrerPolicy="no-referrer"
              onError={() => {/* handled by fallback below */}}
            />
            {/* Fallback overlay if iframe is blocked */}
            <noscript>
              <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ background: '#000' }}>
                <p style={{ color: 'var(--text-muted)' }}>Content blocked by browser policy.</p>
                <a href={t.url} target="_blank" rel="noopener noreferrer" style={{ color: t.color }}>Open {t.label} ↗</a>
              </div>
            </noscript>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
