/**
 * Trading tab — professional desk.
 * Primary surface is Trading Intel (chart, agent, research, MetaAPI).
 */
import { useState } from 'react';
import { ExternalLink } from 'lucide-react';
import TradingIntel from '@/presentation/pages/TradingIntel';
import { AxeButton } from '@/presentation/components/ui/AxeUI';

const EXTERNAL = [
  { id: 'tradingos', label: 'TradingOS', url: 'https://tradingosapp.com', color: '#22D3EE' },
  { id: 'krypt', label: 'Krypt.cc', url: 'https://krypt.cc', color: '#F59E0B' },
] as const;

export default function Trading() {
  const [showLinks, setShowLinks] = useState(false);

  return (
    <div className="h-full flex flex-col" style={{ background: 'var(--bg-base)' }}>
      <div
        className="hidden sm:flex items-center gap-2 px-4 py-2 flex-shrink-0"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
      >
        <div className="min-w-0 mr-2">
          <div className="text-[9px] font-mono tracking-[0.2em] uppercase" style={{ color: 'var(--accent-cyan)' }}>
            Markets
          </div>
          <div className="hidden sm:block text-[12px] font-medium" style={{ color: '#F5F0E6' }}>
            Trading desk · Agent · Chart · MetaAPI
          </div>
        </div>
        <div className="flex-1" />
        <AxeButton size="sm" variant="ghost" onClick={() => setShowLinks(v => !v)}>
          {showLinks ? 'Hide external' : 'External apps'}
        </AxeButton>
        {EXTERNAL.map(e => (
          <a
            key={e.id}
            href={e.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium"
            style={{ color: e.color, border: `1px solid ${e.color}33`, background: `${e.color}10` }}
          >
            {e.label} <ExternalLink size={11} />
          </a>
        ))}
      </div>
      {showLinks && (
        <div className="px-4 py-2 text-[11px]" style={{ color: 'var(--text-secondary)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
          External sites open in the browser. The native desk below stays in-app — same stack as Architecture → Trading OS.
        </div>
      )}
      <div className="flex-1 min-h-0">
        <TradingIntel />
      </div>
    </div>
  );
}
