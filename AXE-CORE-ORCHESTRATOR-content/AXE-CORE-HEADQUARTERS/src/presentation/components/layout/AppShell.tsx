import { Outlet, useLocation, useNavigate } from 'react-router';
import { TopNav } from '@/presentation/components/layout/TopNav';
import { Sidebar } from '@/presentation/components/layout/Sidebar';
import { RightPanel } from '@/presentation/components/layout/RightPanel';
import { BottomBar } from '@/presentation/components/layout/BottomBar';
import { isAndroidShellRuntime } from '@/infrastructure/config/apiUrl';
import { BottomNav } from '@/presentation/components/layout/BottomNav';
import { GlobalCommandPalette } from '@/presentation/components/layout/GlobalCommandPalette';
import { ErrorBoundary } from '@/presentation/components/shared/ErrorBoundary';
import { useKeyboardInset } from '@/presentation/hooks/useKeyboardInset';
import { SplitWorkspace } from '@/presentation/components/layout/SplitWorkspace';
import { AxeAlgoFloatingChat } from '@/presentation/components/global/AxeAlgoFloatingChat';

/** Contained page-crash fallback: keeps the nav/sidebars usable so a single
 *  bad page (e.g. Maps without a Google key) no longer forces a full reload. */
function PageError() {
  const navigate = useNavigate();
  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="text-center max-w-sm">
        <div className="text-3xl mb-3" style={{ color: 'var(--accent-cyan)' }}>◆</div>
        <h2 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Deze pagina liep vast</h2>
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
  // The Android shell draws its own top bar, tab bar and composer natively, so
  // the web chrome would be a second copy of all three stacked on a 384px-wide
  // screen. Treat "inside the shell" exactly like the /mobile surface: hide
  // TopNav, Sidebar, RightPanel, BottomBar and BottomNav, and let the page
  // itself have the whole viewport.
  const mobileCommandSurface =
    location.pathname === '/mobile' || isAndroidShellRuntime();
  // On an installed iOS PWA the keyboard overlays the fixed 100dvh layout,
  // hiding the composer + bottom nav. Pad the shell by the measured keyboard
  // height so the bottom chrome rises above it while typing.
  const keyboardInset = useKeyboardInset();

  // Fixed to the dynamic viewport height (not min-h) so the shell never grows
  // past the visible area and pushes the BottomNav below the fold — the reason
  // the nav "fell away" in the installed PWA. Pages scroll inside the flex-1
  // content area, not the shell.
  return (
    <div
      className="h-[100dvh] flex flex-col bg-black overflow-hidden"
      style={{ background: 'var(--bg-base)', paddingBottom: keyboardInset || undefined, transition: 'padding-bottom 0.18s ease-out' }}
    >
      {/* Top Navigation */}
      {!mobileCommandSurface && <TopNav />}

      {/* Main layout area — fills remaining space */}
      <div className="flex-1 flex overflow-hidden relative" style={{ background: 'var(--bg-base)' }}>
        {/* Left Sidebar — renders on all devices, handles mobile/desktop internally */}
        {!mobileCommandSurface && <Sidebar />}

        {/* Main Content */}
        <main
          className="flex-1 flex flex-col overflow-hidden relative bg-black"
          style={{ background: 'var(--bg-base)' }}
        >
          {/* Per-route boundary: a crash in one page is contained here (and
              resets on navigation via the key) instead of taking down the
              whole app and forcing a reload. */}
          <ErrorBoundary key={location.pathname} fallback={<PageError />}>
            <Outlet />
          </ErrorBoundary>
        </main>

        {/* Right Sidebar — renders on all devices, handles mobile/desktop internally */}
        {!mobileCommandSurface && <RightPanel />}
      </div>

      {/* BottomBar — AXE Core model selector + composer (all devices) */}
      {!mobileCommandSurface && <BottomBar />}

      {/* BottomNav — navigation tabs on ALL devices. Hidden while the keyboard
          is up so the composer sits directly above the keyboard instead of the
          tab bar wedging in between. */}
      {!mobileCommandSurface && keyboardInset === 0 && <BottomNav />}

      {/* Command palette — opened via the TopNav search icon or Cmd/Ctrl+K */}
      <GlobalCommandPalette />
      <SplitWorkspace />

      {/* AXE ALGO's floating chat — survives navigation, same pattern as RightPanel */}
      {!mobileCommandSurface && <AxeAlgoFloatingChat />}
    </div>
  );
}
