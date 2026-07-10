import { Outlet, useLocation } from 'react-router';
import { TopNav } from './TopNav';
import { RightPanel } from './RightPanel';
import { BottomBar } from './BottomBar';
import { BottomNav } from './BottomNav';
import { useUIStore } from '@/store/uiStore';
import { useIsMobile } from '@/hooks/use-mobile';

export function AppShell() {
  const { rightPanelOpen } = useUIStore();
  const isMobile = useIsMobile();
  const location = useLocation();

  const rightPanelWidth = rightPanelOpen ? 320 : 0;

  return (
    <div
      className="min-h-[100dvh]"
      style={{ backgroundColor: '#000000' }}
    >
      <TopNav />
      {!isMobile && <RightPanel />}
      <BottomBar />
      <BottomNav />

      {/* Main Content Area */}
      <main
        className="fixed overflow-auto"
        style={{
          top: isMobile ? 'calc(48px + env(safe-area-inset-top, 0px))' : '48px',
          right: isMobile ? '0' : `${rightPanelWidth}px`,
          bottom: isMobile ? 'calc(88px + env(safe-area-inset-bottom, 0px))' : '72px',
          left: isMobile ? '0' : '0px',
          transition: 'right 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          backgroundColor: '#000000',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        <Outlet />
      </main>
    </div>
  );
}
