/**
 * Trading tab — professional desk.
 * Primary surface is Trading Intel (chart, agent, research, MetaAPI).
 * External product links remain available as a secondary strip.
 */
import { useState } from 'react';
import { ExternalLink } from 'lucide-react';
import TradingIntel from '@/presentation/pages/TradingIntel';

const EXTERNAL = [
  { id: 'tradingos', label: 'TradingOS', url: 'https://tradingosapp.com', color: '#22D3EE' },
  { id: 'krypt', label: 'Krypt.cc', url: 'https://krypt.cc', color: '#F59E0B' },
] as const;

export default function Trading() {
  const [showLinks, setShowLinks] = useState(false);

  return (
    <div className="h-full flex flex-col" style={{ background: '#050505' }}>
      <div
        className="flex items-center gap-2 px-3 py-1.5 flex-shrink-0 text-[11px]"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
      >
        <span style={{ color: 'rgba(255,255,255,0.35)' }}>Desk</span>
        <span style={{ color: '#a78bfa' }}>Trading Intel · Agent · Chart</span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => setShowLinks(v => !v)}
          className="px-2 py-0.5 rounded"
          style={{ color: 'rgba(255,255,255,0.45)', background: 'rgba(255,255,255,0.04)' }}
        >
          {showLinks ? 'Hide external' : 'External apps'}
        </button>
        {EXTERNAL.map(e => (
          <a
            key={e.id}
            href={e.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded"
            style={{ color: e.color, border: `1px solid ${e.color}33` }}
          >
            {e.label} <ExternalLink size={11} />
          </a>
        ))}
      </div>
      {showLinks && (
        <div className="px-3 py-2 text-[11px]" style={{ color: 'rgba(255,255,255,0.4)' }}>
          External sites open in the browser. The native desk (chart, agent, MetaAPI demo) stays below —
          same stack as Architecture → Trading OS.
        </div>
      )}
      <div className="flex-1 min-h-0">
        <TradingIntel />
      </div>
    </div>
  );
}
