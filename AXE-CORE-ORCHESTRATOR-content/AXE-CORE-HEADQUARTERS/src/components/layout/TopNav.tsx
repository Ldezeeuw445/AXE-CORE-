import { useEffect, useState } from 'react';
import { Search, LayoutGrid, Settings, Key, Mic, PanelLeft, PanelRight, Globe } from 'lucide-react';
import { useUIStore } from '@/store/uiStore';
import { useVoiceStore } from '@/store/voiceStore';
import { IconButton } from '@/components/shared/IconButton';
import { LiveIndicator } from '@/components/shared/LiveIndicator';
import { NotificationBell } from '@/components/axe-core/NotificationBell';
import { useIsMobile } from '@/hooks/use-mobile';
import { useIsTablet } from '@/hooks/use-tablet';

export function TopNav() {
  const { setCommandPaletteOpen, setLeftDrawerOpen, setRightDrawerOpen, rightDrawerOpen } = useUIStore();
  const voice = useVoiceStore();
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  // Sidebar/RightPanel become overlay drawers below 1024px, so the toggle
  // buttons need to appear for tablet widths too, not just phone widths.
  const isCompact = isMobile || isTablet;
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
        height: 'calc(48px + env(safe-area-inset-top))',
        minHeight: 'calc(48px + env(safe-area-inset-top))',
        paddingTop: 'env(safe-area-inset-top)',
        paddingLeft: 'calc(12px + env(safe-area-inset-left))',
        paddingRight: 'calc(12px + env(safe-area-inset-right))',
        backgroundColor: '#000000',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
      }}
    >
      {/* Left — Logo + mobile drawer toggles */}
      <div className="flex items-center gap-2 md:gap-3 min-w-0">
        {isCompact && (
          <button
            onClick={() => setLeftDrawerOpen(true)}
            className="flex items-center justify-center rounded-lg"
            style={{
              width: 32,
              height: 32,
              background: 'rgba(34,211,238,0.08)',
              border: '1px solid rgba(34,211,238,0.2)',
            }}
          >
            <PanelLeft size={16} style={{ color: 'var(--accent-cyan)' }} />
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
        <IconButton onClick={() => window.open('/browser', '_self')} aria-label="Browser" title="Browser">
          <Globe size={16} />
        </IconButton>
        <IconButton onClick={() => setCommandPaletteOpen(true)} aria-label="Search">
          <Search size={16} />
        </IconButton>
        <IconButton className="relative hidden sm:inline-flex" aria-label="Overview">
          <LayoutGrid size={16} />
        </IconButton>
        <NotificationBell />
        <div className="hidden sm:flex rounded-full ml-1 items-center justify-center text-[11px] font-semibold text-white" style={{ width: '32px', height: '32px', border: '2px solid rgba(255,255,255,0.06)', background: 'linear-gradient(135deg, #22D3EE, #3B82F6)' }}>U</div>
        <IconButton aria-label="Settings">
          <Settings size={16} />
        </IconButton>

        {isCompact && (
          <button
            onClick={() => setRightDrawerOpen(true)}
            className="flex items-center justify-center rounded-lg ml-1 transition-all duration-200"
            style={{
              width: 32,
              height: 32,
              background: rightDrawerOpen ? 'rgba(34,211,238,0.25)' : 'rgba(34,211,238,0.08)',
              border: rightDrawerOpen ? '1px solid rgba(34,211,238,0.6)' : '1px solid rgba(34,211,238,0.2)',
              boxShadow: rightDrawerOpen ? '0 0 10px rgba(34,211,238,0.3)' : 'none',
            }}
          >
            <PanelRight size={16} style={{ color: rightDrawerOpen ? '#22D3EE' : 'var(--accent-cyan)' }} />
          </button>
        )}
      </div>
    </header>
  );
}
