import { Outlet } from 'react-router';
import { TopNav } from './TopNav';
import { Sidebar } from './Sidebar';
import { RightPanel } from './RightPanel';
import { BottomBar } from './BottomBar';
import { BottomNav } from './BottomNav';
import { useIsMobile } from '@/hooks/use-mobile';

export function AppShell() {
  const isMobile = useIsMobile();

  return (
    <div className="min-h-[100dvh] flex flex-col bg-black" style={{ background: '#000000' }}>
      {/* Top Navigation — 48px */}
      <TopNav />

      {/* Main layout area — fills remaining space */}
      <div className="flex-1 flex overflow-hidden relative" style={{ background: '#000000' }}>
        {/* Sidebar — MOBILE ONLY (Sheet drawer for left widgets) */}
        {isMobile && <Sidebar />}

        {/* Main Content — full width */}
        <main
          className="flex-1 flex flex-col overflow-hidden relative bg-black"
          style={{ background: '#000000' }}
        >
          <Outlet />
        </main>

        {/* RightPanel — DESKTOP + TABLET ONLY */}
        {!isMobile && <RightPanel />}
      </div>

      {/* BottomBar — AXE Core model selector + composer (all devices) */}
      <BottomBar />

      {/* BottomNav — navigation tabs on ALL devices */}
      <BottomNav />
    </div>
  );
}
