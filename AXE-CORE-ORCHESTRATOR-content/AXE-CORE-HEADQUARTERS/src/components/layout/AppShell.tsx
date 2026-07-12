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

  const rightPanelWidth = rightPanelOpen ? (isTablet ? 260 : 320) : 0;
  const showRightPanel = !isMobile;

  return (
    <div className="min-h-[100dvh] flex flex-col" style={{ backgroundColor: '#000000' }}>
      <TopNav />
      {showRightPanel && <RightPanel />}

      {/* Main Content Area — on mobile: exact fit, no scroll. Only chat scrolls internally. */}
      <main
        className={isMobile ? 'flex-1 overflow-hidden' : 'flex-1 scrollable'}
        style={{
          marginTop: '48px',
          marginRight: isMobile ? '0' : `${rightPanelWidth}px`,
          marginBottom: '88px',
          transition: 'margin-right 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          backgroundColor: '#000000',
          minHeight: isMobile ? 'calc(100dvh - 48px - 88px)' : undefined,
        }}
      >
        <Outlet />
      </main>

      <BottomBar />
      <BottomNav />
    </div>
  );
}
