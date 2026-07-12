import { Outlet } from 'react-router';
import { TopNav } from './TopNav';
import { RightPanel } from './RightPanel';
import { BottomBar } from './BottomBar';
import { BottomNav } from './BottomNav';
import { useUIStore } from '@/store/uiStore';
import { useIsMobile } from '@/hooks/use-mobile';
import { useIsTablet } from '@/hooks/use-tablet';

export function AppShell() {
  const { rightPanelOpen } = useUIStore();
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();

  const rightPanelWidth = rightPanelOpen ? (isTablet ? 260 : 320) : 0;
  const showRightPanel = !isMobile && !isTablet;

  return (
    <div className="min-h-[100dvh] flex flex-col" style={{ background: '#000000' }}>
      {/* Top Navigation — 48px */}
      <TopNav />

      {/* Right Panel (desktop only, overlays content) */}
      {showRightPanel && <RightPanel />}

      {/* Main Content — fills all remaining space */}
      <main
        className="flex-1 flex flex-col overflow-hidden relative"
        style={{
          background: '#000000',
        }}
      >
        <Outlet />
      </main>

      {/* BottomBar — AXE Core model selector + composer */}
      <BottomBar />

      {/* BottomNav — navigation tabs */}
      <BottomNav />
    </div>
  );
}
