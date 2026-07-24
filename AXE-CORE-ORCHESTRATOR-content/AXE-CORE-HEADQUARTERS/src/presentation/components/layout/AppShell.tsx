import { Outlet, useLocation, useNavigate } from 'react-router';
import { TopNav } from '@/presentation/components/layout/TopNav';
import { Sidebar } from '@/presentation/components/layout/Sidebar';
import { RightPanel } from '@/presentation/components/layout/RightPanel';
import { BottomBar } from '@/presentation/components/layout/BottomBar';
import { BottomNav } from '@/presentation/components/layout/BottomNav';
import { GlobalCommandPalette } from '@/presentation/components/layout/GlobalCommandPalette';
import { ErrorBoundary } from '@/presentation/components/shared/ErrorBoundary';

/** Contained page-crash fallback: keeps the nav/sidebars usable so a single
 *  bad page (e.g. Maps without a Google key) no longer forces a full reload. */
function PageError() {
  const navigate = useNavigate();
  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="text-center max-w-sm">
        <div className="text-3xl mb-3" style={{ color: 'var(--accent-cyan)' }}>◆</div>
        <h2 className="text-lg font-semibold mb-2" style={{ color: '#fff' }}>Deze pagina liep vast</h2>
        <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
          De rest van AXE werkt gewoon — ga naar een ander tabblad of terug naar Home.
        </p>
        <button
          onClick={() => navigate('/')}
          className="px-4 py-2 rounded-lg text-sm font-medium"
          style={{ backgroundColor: 'var(--bg-active)', border: '1px solid var(--border-active)', color: 'var(--accent-cyan)' }}
        >
          Naar Home
        </button>
      </div>
    </div>
  );
}

export function AppShell() {
  const location = useLocation();

  // Fixed to the dynamic viewport height (not min-h) so the shell never grows
  // past the visible area and pushes the BottomNav below the fold — the reason
  // the nav "fell away" in the installed PWA. Pages scroll inside the flex-1
  // content area, not the shell.
  return (
    <div className="h-[100dvh] flex flex-col bg-black overflow-hidden" style={{ background: '#000000' }}>
      {/* Top Navigation */}
      <TopNav />

      {/* Main layout area — fills remaining space */}
      <div className="flex-1 flex overflow-hidden relative" style={{ background: '#000000' }}>
        {/* Left Sidebar — renders on all devices, handles mobile/desktop internally */}
        <Sidebar />

        {/* Main Content */}
        <main
          className="flex-1 flex flex-col overflow-hidden relative bg-black"
          style={{ background: '#000000' }}
        >
          {/* Per-route boundary: a crash in one page is contained here (and
              resets on navigation via the key) instead of taking down the
              whole app and forcing a reload. */}
          <ErrorBoundary key={location.pathname} fallback={<PageError />}>
            <Outlet />
          </ErrorBoundary>
        </main>

        {/* Right Sidebar — renders on all devices, handles mobile/desktop internally */}
        <RightPanel />
      </div>

      {/* BottomBar — AXE Core model selector + composer (all devices) */}
      <BottomBar />

      {/* BottomNav — navigation tabs on ALL devices */}
      <BottomNav />

      {/* Command palette — opened via the TopNav search icon or Cmd/Ctrl+K */}
      <GlobalCommandPalette />
    </div>
  );
}
