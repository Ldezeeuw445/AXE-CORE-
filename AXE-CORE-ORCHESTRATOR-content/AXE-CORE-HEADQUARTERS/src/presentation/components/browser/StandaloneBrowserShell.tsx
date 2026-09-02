import { ReactNode } from 'react';
import { ExternalLink, Globe, Plus, Settings, User } from 'lucide-react';
import { Panel, IconButton } from '@/presentation/components/surface/Surface';
import { BrowserSurfaceBackground } from '@/presentation/components/browser/BrowserSurfaceBackground';
import type { BrowserSurfaceTheme } from '@/presentation/hooks/useBrowserSurfaceTheme';

import { multiMonitorAvailable, openStandaloneBrowser } from '@/infrastructure/gateways/windowManagerService';

interface StandaloneBrowserShellProps {
  children: ReactNode;
  onOpenInApp?: () => void;
  surfaceTheme: BrowserSurfaceTheme;
}

const RAIL_SHORTCUTS = [
  { label: 'GitHub', url: 'https://github.com', color: '#fff' },
  { label: 'Google', url: 'https://google.com', color: '#4285F4' },
  { label: 'YouTube', url: 'https://youtube.com', color: '#FF0000' },
  { label: 'Vercel', url: 'https://vercel.com', color: '#fff' },
  { label: 'Supabase', url: 'https://supabase.com', color: '#3ECF8E' },
  { label: 'DeepSeek', url: 'https://chat.deepseek.com', color: '#4D6BFE' },
];

/** Arc / Comet-style shell — background follows surface theme toggle. */
export function StandaloneBrowserShell({ children, onOpenInApp, surfaceTheme }: StandaloneBrowserShellProps) {
  return (
    <div className="h-[100dvh] w-full flex overflow-hidden relative">
      <BrowserSurfaceBackground theme={surfaceTheme} />

      {/* Left rail — window dots + vertical shortcuts (not 2×3 grid) */}
      <aside className="w-[56px] flex-shrink-0 flex flex-col items-center py-3 gap-2 z-10">
        <div className="flex flex-col gap-1.5 mb-1 self-start px-2">
          <div className="w-2.5 h-2.5 rounded-full bg-red-500/80" />
          <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/80" />
          <div className="w-2.5 h-2.5 rounded-full bg-green-500/80" />
        </div>

        <Panel inset className="flex flex-col items-center gap-1 p-1.5 w-[44px]">
          {RAIL_SHORTCUTS.map((s) => (
            <a
              key={s.label}
              href={s.url}
              target="_blank"
              rel="noopener noreferrer"
              title={s.label}
              className="w-8 h-8 rounded-button flex items-center justify-center text-[10px] font-bold transition-transform hover:scale-105"
              style={{ background: `${s.color}18`, color: s.color, border: `1px solid ${s.color}30` }}
            >
              {s.label[0]}
            </a>
          ))}
        </Panel>

        <div className="flex-1" />

        <IconButton title="New tab" aria-label="New tab">
          <Plus className="w-4 h-4" />
        </IconButton>
        {onOpenInApp && (
          <IconButton onClick={onOpenInApp} title="Open in AXE CORE app" aria-label="Open in app">
            <ExternalLink className="w-4 h-4" />
          </IconButton>
        )}
        <IconButton title="Settings" aria-label="Settings">
          <Settings className="w-4 h-4" />
        </IconButton>
        <div className="w-8 h-8 rounded-full bg-[rgba(34,211,238,.14)] flex items-center justify-center">
          <User className="w-4 h-4 text-axe-accent-ice" />
        </div>
      </aside>

      {/* Main pane — content chrome unchanged; only outer background toggles */}
      <main className="flex-1 m-2 ml-0 min-w-0 relative z-10">
        <Panel focus className="h-full overflow-hidden">
          {children}
        </Panel>
      </main>

      {/* Right rail — address + stacked app icons (Comet-style) */}
      <aside className="w-[200px] flex-shrink-0 hidden xl:flex flex-col gap-2 py-3 pr-2 z-10">
        <Panel inset className="px-3 py-2 flex items-center gap-2">
          <Globe className="w-3.5 h-3.5 text-axe-accent-cyan shrink-0" />
          <span className="text-axe-meta text-axe-text-muted truncate">axe browser</span>
        </Panel>

        <Panel inset className="p-2 flex flex-col gap-1">
          {['Drive', 'Notion', 'Outlook', 'Settings', 'Web', '+'].map((label) => (
            <button
              key={label}
              type="button"
              className="axe-row !py-1.5 !px-2"
            >
              <span className="axe-glyph text-[10px]">{label[0]}</span>
              <span className="axe-row__text">
                <b className="!text-axe-meta">{label}</b>
              </span>
            </button>
          ))}
        </Panel>

        <Panel inset className="p-2 flex-1 min-h-0 overflow-y-auto scrollbar-thin">
          <span className="axe-label block px-1 mb-1">Media</span>
          {['YouTube', 'YouTube Music', 'Apple TV'].map((label) => (
            <button key={label} type="button" className="axe-row !py-1.5 !px-2">
              <span className="axe-row__text"><b className="!text-axe-meta">{label}</b></span>
            </button>
          ))}
          <span className="axe-label block px-1 mt-3 mb-1">G-Suite</span>
          {['Drive', 'Docs', 'Sheets'].map((label) => (
            <button key={label} type="button" className="axe-row !py-1.5 !px-2">
              <span className="axe-row__text"><b className="!text-axe-meta">{label}</b></span>
            </button>
          ))}
        </Panel>
      </aside>
    </div>
  );
}

export function OpenStandaloneBrowserButton({ className }: { className?: string }) {
  if (!multiMonitorAvailable()) return null;

  return (
    <button
      onClick={() => openStandaloneBrowser().catch(console.error)}
      className={`p-1.5 rounded-lg hover:bg-white/10 text-white/60 transition-colors cursor-pointer ${className ?? ''}`}
      title="Open browser in separate window"
    >
      <ExternalLink className="w-4 h-4" />
    </button>
  );
}
