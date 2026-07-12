import { Outlet } from 'react-router';
import { TopNav } from './TopNav';
import { RightPanel } from './RightPanel';
import { BottomBar } from './BottomBar';
import { BottomNav } from './BottomNav';
import { useIsMobile } from '@/hooks/use-mobile';

export function AppShell() {
  const isMobile = useIsMobile();

  // Tablet (iPad) should show desktop layout: right panel visible, no BottomNav
  const showRightPanel = !isMobile;

  return (
    <div className="min-h-[100dvh] flex flex-col bg-black" style={{ background: '#000000' }}>
      {/* Top Navigation — 48px */}
      <TopNav />

      {/* Right Panel (desktop + tablet) */}
      {showRightPanel && <RightPanel />}

      {/* Main Content — fills all remaining space */}
      <main
        className="flex-1 flex flex-col overflow-hidden relative bg-black"
        style={{ background: '#000000' }}
      >
        <Outlet />
      </main>

      {/* BottomBar — AXE Core model selector + composer */}
      <BottomBar />

      {/* BottomNav — navigation tabs on ALL devices */}
      <BottomNav />
    </div>
  );
}
