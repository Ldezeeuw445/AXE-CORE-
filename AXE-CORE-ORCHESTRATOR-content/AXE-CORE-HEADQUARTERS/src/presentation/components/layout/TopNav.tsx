import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Search, LayoutGrid, Settings, Key, Mic, PanelLeft, PanelRight, Globe } from 'lucide-react';
import { useUIStore } from '@/presentation/store/uiStore';
import { useVoiceStore } from '@/presentation/store/voiceStore';
import { IconButton } from '@/presentation/components/shared/IconButton';
import { LookToggle } from '@/presentation/components/layout/LookToggle';
import { LiveIndicator } from '@/presentation/components/shared/LiveIndicator';
import { NotificationBell } from '@/presentation/components/axe-core/NotificationBell';
import { useIsMobile } from '@/presentation/hooks/use-mobile';
import { useIsTablet } from '@/presentation/hooks/use-tablet';

/**
 * One row per voice state, instead of the same ternary written three times
 * for background, border and text. Two of those chains were already one edit
 * away from disagreeing with the third — which is the failure you never see,
 * because it only shows up in the state you weren't looking at.
 */
const VOICE_STATE = {
  listening:  { label: 'LISTENING', ink: 'var(--accent-cyan)' },
  processing: { label: 'THINKING',  ink: 'var(--warning)' },
  speaking:   { label: 'SPEAKING',  ink: 'var(--accent-blue)' },
} as const;

export function TopNav() {
  const navigate = useNavigate();
  const {
    setCommandPaletteOpen,
    setLeftDrawerOpen,
    setRightDrawerOpen,
    rightDrawerOpen,
    splitViewOpen,
    toggleSplitView,
  } = useUIStore();
  const voice = useVoiceStore();
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
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
        backgroundColor: 'var(--bg-base)',
        borderBottom: '1px solid var(--border-subtle)',
      }}
    >
      <div className="flex items-center gap-2 md:gap-3 min-w-0">
        {isCompact && (
          <button
            onClick={() => setLeftDrawerOpen(true)}
            className="flex items-center justify-center rounded-card transition-colors duration-150"
            style={{
              width: 32,
              height: 32,
              background: 'var(--tint)',
              border: '1px solid var(--tint-line)',
            }}
          >
            <PanelLeft size={16} style={{ color: 'var(--accent-cyan)' }} />
          </button>
        )}
        <button
          type="button"
          onClick={() => navigate('/')}
          className="flex items-center gap-2 md:gap-2.5 min-w-0 group"
        >
          <img
            src="/axe-logo.png"
            alt="AXE"
            className="w-6 h-6 object-contain transition-transform duration-300 group-hover:scale-110"
            style={{ filter: 'drop-shadow(0 0 6px rgba(34,211,238,0.4))' }}
          />
          <div className="flex flex-col leading-none min-w-0 text-left">
            <span className="text-sm md:text-base font-bold tracking-tight truncate" style={{ color: 'var(--text-primary)' }}>AXE</span>
            <span className="text-[8px] md:text-[9px] uppercase tracking-[0.15em] truncate" style={{ color: 'var(--text-muted)' }}>
              COMMAND CENTER
            </span>
          </div>
        </button>
        <div className="hidden sm:flex items-center gap-1.5 ml-2 md:ml-3">
          <LiveIndicator size={6} color="var(--success)" />
          <span className="text-xs-custom" style={{ color: 'var(--success)' }}>OPTIMAL</span>
        </div>
      </div>

      <div className="hidden md:flex flex-col items-center">
        <span className="font-mono-data text-mono-custom" style={{ color: 'var(--text-primary)' }}>{timeStr}</span>
        <span className="text-xs-custom" style={{ color: 'var(--text-secondary)' }}>{dateStr}</span>
      </div>

      <div className="flex items-center gap-0.5 sm:gap-1">
        {voice.voiceStatus !== 'idle' && (() => {
            const st = VOICE_STATE[voice.voiceStatus as keyof typeof VOICE_STATE]
              ?? VOICE_STATE.speaking;
            return (
              <div
                className="hidden sm:flex items-center gap-1.5 px-2 py-0.5 rounded-button mr-1"
                style={{
                  // Derived from the one colour, so tint and border can never
                  // drift from the text the way three ternaries could.
                  backgroundColor: `color-mix(in srgb, ${st.ink} 11%, transparent)`,
                  border: `1px solid color-mix(in srgb, ${st.ink} 30%, transparent)`,
                }}
              >
                <Mic size={12} style={{ color: st.ink }} />
                <span className="text-xs-custom font-medium" style={{ color: st.ink }}>
                  {st.label}
                </span>
              </div>
            );
        })()}

        <IconButton
          title={voice.apiKey ? 'API key OK — open AI settings' : 'No API key — open settings'}
          className="hidden sm:inline-flex"
          onClick={() => navigate('/settings')}
        >
          <Key size={14} style={{ color: voice.apiKey ? 'var(--success)' : 'var(--text-muted)' }} />
        </IconButton>

        <IconButton onClick={() => navigate('/browser')} aria-label="Browser" title="Browser">
          <Globe size={16} />
        </IconButton>

        <IconButton onClick={() => setCommandPaletteOpen(true)} aria-label="Search" title="Command palette (⌘K)">
          <Search size={16} />
        </IconButton>

        <IconButton
          className="relative hidden sm:inline-flex"
          aria-label="Split workspace"
          title={splitViewOpen ? 'Exit 4-pane split' : 'Split: Home · Trading · Browser · Code'}
          onClick={() => toggleSplitView()}
          style={
            splitViewOpen
              ? {
                  background: 'var(--tint)',
                  border: '1px solid var(--tint-line)',
                  borderRadius: 'var(--surface-radius-row)',
                }
              : undefined
          }
        >
          <LayoutGrid size={16} style={{ color: splitViewOpen ? 'var(--accent-cyan)' : undefined }} />
        </IconButton>

        <NotificationBell />

        <div
          className="hidden sm:flex rounded-full ml-1 items-center justify-center text-[11px] font-semibold"
          style={{
            width: 32,
            height: 32,
            border: '1px solid var(--border-default)',
            background: 'var(--tint)',
            color: 'var(--accent-cyan)',
          }}
        >
          U
        </div>

        <LookToggle />

        <IconButton onClick={() => navigate('/settings')} aria-label="Settings" title="Settings">
          <Settings size={16} />
        </IconButton>

        {isCompact && (
          <button
            onClick={() => setRightDrawerOpen(true)}
            className="flex items-center justify-center rounded-card ml-1 transition-colors duration-150"
            style={{
              width: 32,
              height: 32,
              background: rightDrawerOpen ? 'var(--tint-hi)' : 'var(--tint)',
              border: `1px solid var(--tint-line)`,
            }}
          >
            <PanelRight size={16} style={{ color: 'var(--accent-cyan)' }} />
          </button>
        )}
      </div>
    </header>
  );
}
