import { Outlet } from 'react-router';
import { TopNav } from '@/presentation/components/layout/TopNav';
import { Sidebar } from '@/presentation/components/layout/Sidebar';
import { RightPanel } from '@/presentation/components/layout/RightPanel';
import { BottomBar } from '@/presentation/components/layout/BottomBar';
import { BottomNav } from '@/presentation/components/layout/BottomNav';
import { GlobalCommandPalette } from '@/presentation/components/layout/GlobalCommandPalette';
import { useIsMobile } from '@/presentation/hooks/use-mobile';

export function AppShell() {
  const isMobile = useIsMobile();

  return (
    <div className="min-h-[100dvh] flex flex-col bg-black" style={{ background: '#000000' }}>
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
          <Outlet />
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
