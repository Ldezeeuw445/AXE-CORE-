import { Outlet, useLocation } from 'react-router';
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
  const location = useLocation();

  const rightPanelWidth = rightPanelOpen ? (isTablet ? 260 : 320) : 0;
  const showRightPanel = !isMobile; /* iPad shows sidebars like desktop */

  return (
    <div
      className="w-full h-full"
      style={{ backgroundColor: '#000000', touchAction: 'none' }}
    >
      <TopNav />
      {showRightPanel && <RightPanel />}
      <BottomBar />
      <BottomNav />

      {/* Main Content Area */}
      <main
        className="fixed scrollable"
        style={{
          top: isMobile ? 'calc(48px + env(safe-area-inset-top, 0px))' : '48px',
          right: isMobile ? '0' : `${rightPanelWidth}px`,
          bottom: isMobile ? 'calc(88px + env(safe-area-inset-bottom, 0px))' : '88px',
          left: '0px',
          transition: 'right 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          backgroundColor: '#000000',
        }}
      >
        <Outlet />
      </main>
    </div>
  );
}
