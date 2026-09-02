import type { ReactNode } from 'react';
import { ExternalLink } from 'lucide-react';
import { BrowserSurfaceBackground } from '@/presentation/components/browser/BrowserSurfaceBackground';
import { BrowserUnifiedSidebar } from '@/presentation/components/browser/BrowserUnifiedSidebar';
import type { BrowserSurfaceTheme } from '@/presentation/hooks/useBrowserSurfaceTheme';

import { multiMonitorAvailable, openStandaloneBrowser } from '@/infrastructure/gateways/windowManagerService';

interface StandaloneBrowserShellProps {
  children: ReactNode;
  onOpenInApp?: () => void;
  surfaceTheme: BrowserSurfaceTheme;
  currentUrl?: string;
  onNavigate?: (url: string, title?: string) => void;
  demo?: boolean;
}

/** Comet/Zen-style shell — one unified sidebar panel, background-only theme toggle. */
export function StandaloneBrowserShell({
  children,
  onOpenInApp,
  surfaceTheme,
  currentUrl,
  onNavigate,
  demo = false,
}: StandaloneBrowserShellProps) {
  return (
    <div className="h-[100dvh] w-full flex overflow-hidden relative">
      <BrowserSurfaceBackground theme={surfaceTheme} />

      {demo && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-50 px-3 py-1 rounded-chip bg-axe-tint border border-axe-tint-line text-axe-meta text-axe-accent-ice pointer-events-none">
          AXE Browser Demo — mock AI, geen login
        </div>
      )}

      <BrowserUnifiedSidebar
        standalone
        currentUrl={currentUrl}
        onNavigate={onNavigate ?? (() => {})}
        onOpenInApp={onOpenInApp}
      />

      <main className="flex-1 min-w-0 relative z-10 overflow-hidden py-3 pr-3">
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
