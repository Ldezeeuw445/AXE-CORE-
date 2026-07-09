import { Outlet, useLocation } from 'react-router';
import { TopNav } from './TopNav';
import { Sidebar } from './Sidebar';
import { RightPanel } from './RightPanel';
import { BottomBar } from './BottomBar';
import { BottomNav } from './BottomNav';
import { useUIStore } from '@/store/uiStore';
import { useIsMobile } from '@/hooks/use-mobile';

export function AppShell() {
  const { sidebarExpanded, rightPanelOpen } = useUIStore();
  const isMobile = useIsMobile();
  const location = useLocation();
  const isHome = location.pathname === '/';

  const sidebarWidth = sidebarExpanded ? 240 : 64;
  const rightPanelWidth = rightPanelOpen ? 320 : 0;

  return (
    <div
      className="min-h-[100dvh]"
      style={{ backgroundColor: '#000000' }}
    >
      <TopNav />
      {!isHome && <Sidebar />}
      {!isMobile && !isHome && <RightPanel />}
      {!isHome && <BottomBar />}

      {/* Main Content Area */}
      <main
        className="fixed overflow-auto"
        style={{
          top: isMobile ? 'calc(48px + env(safe-area-inset-top, 0px))' : '48px',
          left: isHome ? '0' : (isMobile ? '0' : `${sidebarWidth}px`),
          right: isHome ? '0' : (isMobile ? '0' : `${rightPanelWidth}px`),
          bottom: isHome ? '72px' : (isMobile ? 'calc(88px + env(safe-area-inset-bottom, 0px))' : '72px'),
          transition: 'left 0.25s cubic-bezier(0.4, 0, 0.2, 1), right 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          backgroundColor: '#000000',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        <Outlet />
      </main>

      {isHome && <BottomNav />}
    </div>
  );
}
