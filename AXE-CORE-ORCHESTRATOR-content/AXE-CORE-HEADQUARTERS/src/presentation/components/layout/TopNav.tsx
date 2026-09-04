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

  /* Dezelfde vraag die Home stelde: is er íets dat kan antwoorden?
     Niet "staat er een Primary?" -- de hele zin van de fallback-keten is dat
     geen enkel slot in zijn eentje bepaalt of AXE werkt. */
  const heeftProvider = !!voice.primarySlot || !!voice.fallback1Slot
    || !!voice.fallback2Slot || !!voice.fallback3Slot || voice.routingLog.length > 0;
  const laatste = voice.conversation[voice.conversation.length - 1];
  const heeftFout = laatste?.role === 'axe' && laatste?.provider === 'error';
  const coreLabel = heeftFout ? 'Error' : heeftProvider ? 'Core Active' : 'No AI';

  const timeStr = time.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const dateStr = time.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <header
      data-tauri-drag-region
      className="axe-topbar flex-shrink-0 w-full z-fixed flex items-center justify-between px-3 md:px-4"
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
        {/* Eén regel, zoals de demo: het driehoekje, de plek, en of het werkt.
            Geen gestapelde woordmerk-en-ondertitel meer -- dat maakte er twee
            regels van, en dat is precies waarom de kopregel als een balk las in
            plaats van als een lijn op de plaat. */}
        <button
          type="button"
          onClick={() => navigate('/')}
          className="axe-tl axe-tl-cmd flex items-center gap-2 min-w-0 group"
          title="AXE — Home"
        >
          <img
            src="/axe-logo.png"
            alt="AXE"
            className="w-[15px] h-[15px] object-contain transition-transform duration-300 group-hover:scale-110"
            style={{ filter: 'drop-shadow(0 0 6px rgba(34,211,238,0.4))' }}
          />
          <span className="truncate">Command Center</span>
        </button>
        <div className="axe-tl axe-tl-ok hidden sm:flex items-center gap-2">
          <LiveIndicator size={7} color="var(--success)" />
          <span>Optimal</span>
        </div>
        {/* CORE ACTIVE stond op Home, op een eigen tweede regel onder de
            kopbalk. Het is app-brede status, geen Home-status, dus hij hoort
            hier -- en op de demo-plaat staat hij op dezelfde lijn. Home's kopie
            wordt verborgen zodra data-look aan staat. */}
        <div className="axe-tl axe-tl-core hidden md:flex items-center gap-2">
          <span>{coreLabel}</span>
        </div>
      </div>

      {/* Een lege plek voor de view-knoppen.
       *
       * Die staan `fixed` in het midden van het scherm (ze horen bij Home, dus
       * ze kunnen niet in deze balk staan), en `fixed` betekent buiten de flow:
       * de kopbalk hield er geen ruimte voor vrij en legde de klok er dwars
       * overheen. Dit blokje reserveert precies hun breedte, gemeten door
       * AxeShellChrome. Staan ze er niet, dan is het nul breed en verandert er
       * niets. */}
      <div className="axe-topbar-midden" aria-hidden="true" />

      <div className="flex items-center gap-0.5 sm:gap-1">
        {/* Tijd en datum staan in de demo rechts van de middenknoppen, naast
            elkaar in mono -- niet gestapeld in het midden. */}
        <div className="axe-tr-klok hidden md:flex items-center gap-2.5 mr-2.5 whitespace-nowrap">
          <b style={{ color: 'var(--text-primary)' }}>{timeStr}</b>
          <span style={{ color: 'var(--text-secondary)' }}>{dateStr}</span>
        </div>
        {voice.voiceStatus !== 'idle' && (() => {
            const st = VOICE_STATE[voice.voiceStatus as keyof typeof VOICE_STATE]
              ?? VOICE_STATE.speaking;
            return (
              /* Geen vlak eromheen: op de kopregel ligt alles rechtstreeks op
                 de plaat, en één gevuld doosje tussen losse letters trekt alle
                 aandacht naar de minst belangrijke mededeling. De kleur zegt al
                 wat er aan de hand is. */
              <div className="axe-tl hidden sm:flex items-center gap-2 mr-1" style={{ color: st.ink }}>
                <Mic size={12} />
                <span>{st.label}</span>
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
