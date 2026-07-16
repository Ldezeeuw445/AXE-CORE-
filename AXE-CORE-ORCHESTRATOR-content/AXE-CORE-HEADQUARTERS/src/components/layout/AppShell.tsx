import { Outlet, useLocation } from 'react-router';
import { TopNav } from './TopNav';
import { Sidebar } from './Sidebar';
import { RightPanel } from './RightPanel';
import { BottomBar } from './BottomBar';
import { BottomNav } from './BottomNav';
import { GlobalCommandPalette } from './GlobalCommandPalette';
import { useIsMobile } from '@/hooks/use-mobile';

export function AppShell() {
  const isMobile = useIsMobile();
  const location = useLocation();

  const isBrowserPage = location.pathname === '/browser';
  const isMaps3DPage = location.pathname === '/maps-3d';
  const isFullScreenPage = isBrowserPage || isMaps3DPage;

  return (
    <div className="min-h-[100dvh] flex flex-col bg-black" style={{ background: '#000000' }}>
      {/* Top Navigation */}
      <TopNav />

      {/* Main layout area — fills remaining space */}
      <div className="flex-1 flex overflow-hidden relative" style={{ background: '#000000' }}>
        {/* Left Sidebar — hidden on full-screen pages */}
        {!isFullScreenPage && <Sidebar />}

        {/* Main Content */}
        <main
          className="flex-1 flex flex-col overflow-hidden relative bg-black"
          style={{ background: '#000000' }}
        >
          <Outlet />
        </main>

        {/* Right Sidebar — hidden on full-screen pages */}
        {!isFullScreenPage && <RightPanel />}
      </div>

      {/* BottomBar — hidden on full-screen pages */}
      {!isFullScreenPage && <BottomBar />}

      {/* BottomNav — navigation tabs on ALL devices */}
      <BottomNav />

      {/* Command palette — opened via the TopNav search icon or Cmd/Ctrl+K */}
      <GlobalCommandPalette />
    </div>
  );
}
