import { useEffect, useState } from 'react';
import { Search, LayoutGrid, Settings, Key, Mic, Menu } from 'lucide-react';
import { useUIStore } from '@/store/uiStore';
import { useVoiceStore } from '@/store/voiceStore';
import { IconButton } from '@/components/shared/IconButton';
import { LiveIndicator } from '@/components/shared/LiveIndicator';
import { NotificationBell } from '@/components/axe-core/NotificationBell';
import { useIsMobile } from '@/hooks/use-mobile';
export function TopNav() {
  const { setCommandPaletteOpen, setMobileNavOpen } = useUIStore();
  const voice = useVoiceStore();
  const isMobile = useIsMobile();
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const timeStr = time.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const dateStr = time.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <header
      className="flex-shrink-0 w-full z-fixed flex items-center justify-between px-3 md:px-4"
      style={{
        height: '48px',
        minHeight: '48px',
        backgroundColor: '#000000',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
      }}
    >
      {/* Left — Logo + hamburger on mobile */}
      <div className="flex items-center gap-2 md:gap-3 min-w-0">
        {isMobile && (
          <button
            onClick={() => setMobileNavOpen(true)}
            className="flex items-center justify-center rounded-md p-1.5"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
            aria-label="Open navigation"
          >
            <Menu size={18} style={{ color: 'var(--text-secondary)' }} />
          </button>
        )}
        <div className="flex items-center gap-2 md:gap-2.5 min-w-0">
          <img src="/axe-logo.png" alt="AXE" className="w-6 h-6 object-contain" style={{ filter: 'drop-shadow(0 0 6px rgba(34,211,238,0.4))' }} />
          <div className="flex flex-col leading-none min-w-0">
            <span className="text-sm md:text-base font-bold tracking-tight truncate" style={{ color: '#FFFFFF' }}>AXE</span>
            <span className="text-[8px] md:text-[9px] uppercase tracking-[0.15em] truncate" style={{ color: 'var(--text-muted)' }}>
              COMMAND CENTER
            </span>
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-1.5 ml-2 md:ml-3">
          <LiveIndicator size={6} color="var(--success)" />
          <span className="text-xs-custom" style={{ color: 'var(--success)' }}>OPTIMAL</span>
        </div>
      </div>

      {/* Center — Clock */}
      <div className="hidden md:flex flex-col items-center">
        <span className="font-mono-data text-mono-custom" style={{ color: '#FFFFFF' }}>{timeStr}</span>
        <span className="text-xs-custom" style={{ color: 'var(--text-secondary)' }}>{dateStr}</span>
      </div>

      {/* Right */}
      <div className="flex items-center gap-1">
        {voice.voiceStatus !== 'idle' && (
          <div className="hidden sm:flex items-center gap-1.5 px-2 py-0.5 rounded-md mr-1" style={{ backgroundColor: voice.voiceStatus === 'listening' ? 'rgba(34,211,238,0.1)' : voice.voiceStatus === 'processing' ? 'rgba(245,158,11,0.1)' : 'rgba(59,130,246,0.1)', border: `1px solid ${voice.voiceStatus === 'listening' ? 'rgba(34,211,238,0.2)' : voice.voiceStatus === 'processing' ? 'rgba(245,158,11,0.2)' : 'rgba(59,130,246,0.2)'}` }}>
            <Mic size={12} style={{ color: 'var(--accent-cyan)' }} />
            <span className="text-xs-custom font-medium" style={{ color: voice.voiceStatus === 'listening' ? 'var(--accent-cyan)' : voice.voiceStatus === 'processing' ? 'var(--warning)' : 'var(--accent-blue)' }}>
              {voice.voiceStatus === 'listening' ? 'LISTENING' : voice.voiceStatus === 'processing' ? 'THINKING' : 'SPEAKING'}
            </span>
          </div>
        )}
        <IconButton title={voice.apiKey ? 'API Key OK' : 'No API key'} className="hidden sm:inline-flex">
          <Key size={14} style={{ color: voice.apiKey ? 'var(--success)' : 'var(--text-muted)' }} />
        </IconButton>
        <IconButton onClick={() => setCommandPaletteOpen(true)} aria-label="Search"><Search size={16} /></IconButton>
        <IconButton className="relative hidden sm:inline-flex" aria-label="Overview">
          <LayoutGrid size={16} />
        </IconButton>
        <NotificationBell />
        <div className="hidden sm:flex rounded-full ml-1 items-center justify-center text-[11px] font-semibold text-white" style={{ width: '32px', height: '32px', border: '2px solid rgba(255,255,255,0.06)', background: 'linear-gradient(135deg, #22D3EE, #3B82F6)' }}>U</div>
        <IconButton aria-label="Settings"><Settings size={16} /></IconButton>
      </div>
    </header>
  );
}
