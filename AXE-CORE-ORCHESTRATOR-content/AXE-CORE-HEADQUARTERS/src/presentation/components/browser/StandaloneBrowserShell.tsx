import { ReactNode } from 'react';
import { ExternalLink, Plus, Settings, User } from 'lucide-react';
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

/** Comet-style shell — one left rail; theme toggle changes background only. */
export function StandaloneBrowserShell({ children, onOpenInApp, surfaceTheme }: StandaloneBrowserShellProps) {
  return (
    <div className="h-[100dvh] w-full flex overflow-hidden relative">
      <BrowserSurfaceBackground theme={surfaceTheme} />

      {/* Single left rail — vertical shortcuts */}
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

      {/* Main pane — no extra panel chrome; browser fills the space */}
      <main className="flex-1 min-w-0 relative z-10 overflow-hidden">
        {children}
      </main>
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
