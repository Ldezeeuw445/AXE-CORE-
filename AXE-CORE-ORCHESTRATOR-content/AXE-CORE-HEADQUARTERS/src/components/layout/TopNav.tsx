import { useEffect, useState } from 'react';
import { Search, LayoutGrid, Bell, Settings, Key, Mic } from 'lucide-react';
import { useUIStore } from '@/store/uiStore';
import { useVoiceStore } from '@/store/voiceStore';
import { IconButton } from '@/components/shared/IconButton';
import { LiveIndicator } from '@/components/shared/LiveIndicator';

export function TopNav() {
  const { setCommandPaletteOpen } = useUIStore();
  const voice = useVoiceStore();
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const timeStr = time.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const dateStr = time.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <header className="fixed top-0 left-0 right-0 z-fixed flex items-center justify-between px-4" style={{ height: '48px', backgroundColor: '#000000', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      {/* Left — Cyan Triangle Logo */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2.5">
          <img src="/axe-logo.png" alt="AXE" className="w-6 h-6 object-contain" style={{ filter: 'drop-shadow(0 0 6px rgba(34,211,238,0.4))' }} />
          <div className="flex flex-col leading-none">
            <span className="text-base font-bold tracking-tight" style={{ color: '#FFFFFF' }}>AXE</span>
            <span className="text-[9px] uppercase tracking-[0.15em]" style={{ color: 'var(--text-muted)' }}>COMMAND CENTER</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 ml-3">
          <LiveIndicator size={6} color="var(--success)" />
          <span className="text-xs-custom" style={{ color: 'var(--success)' }}>OPTIMAL</span>
        </div>
      </div>

      {/* Center — Clock */}
      <div className="flex flex-col items-center">
        <span className="font-mono-data text-mono-custom" style={{ color: '#FFFFFF' }}>{timeStr}</span>
        <span className="text-xs-custom" style={{ color: 'var(--text-secondary)' }}>{dateStr}</span>
      </div>

      {/* Right */}
      <div className="flex items-center gap-1">
        {voice.voiceStatus !== 'idle' && (
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md mr-1" style={{ backgroundColor: voice.voiceStatus === 'listening' ? 'rgba(34,211,238,0.1)' : voice.voiceStatus === 'processing' ? 'rgba(245,158,11,0.1)' : 'rgba(59,130,246,0.1)', border: `1px solid ${voice.voiceStatus === 'listening' ? 'rgba(34,211,238,0.2)' : voice.voiceStatus === 'processing' ? 'rgba(245,158,11,0.2)' : 'rgba(59,130,246,0.2)'}` }}>
            <Mic size={12} style={{ color: 'var(--accent-cyan)' }} />
            <span className="text-xs-custom font-medium" style={{ color: voice.voiceStatus === 'listening' ? 'var(--accent-cyan)' : voice.voiceStatus === 'processing' ? 'var(--warning)' : 'var(--accent-blue)' }}>
              {voice.voiceStatus === 'listening' ? 'LISTENING' : voice.voiceStatus === 'processing' ? 'THINKING' : 'SPEAKING'}
            </span>
          </div>
        )}
        <IconButton title={voice.apiKey ? 'API Key OK' : 'No API key'}>
          <Key size={14} style={{ color: voice.apiKey ? 'var(--success)' : 'var(--text-muted)' }} />
        </IconButton>
        <IconButton onClick={() => setCommandPaletteOpen(true)}><Search size={16} /></IconButton>
        <IconButton><LayoutGrid size={16} /></IconButton>
        <IconButton className="relative">
          <Bell size={16} />
          <span className="absolute top-1.5 right-1.5 rounded-full" style={{ width: '6px', height: '6px', backgroundColor: 'var(--error)' }} />
        </IconButton>
        <div className="rounded-full ml-1 flex items-center justify-center text-[11px] font-semibold text-white" style={{ width: '32px', height: '32px', border: '2px solid rgba(255,255,255,0.06)', background: 'linear-gradient(135deg, #22D3EE, #3B82F6)' }}>U</div>
        <IconButton><Settings size={16} /></IconButton>
      </div>
    </header>
  );
}
