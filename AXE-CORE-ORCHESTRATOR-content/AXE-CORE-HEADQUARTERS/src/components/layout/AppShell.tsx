import { Outlet } from 'react-router';
import { TopNav } from './TopNav';
import { Sidebar } from './Sidebar';
import { RightPanel } from './RightPanel';
import { BottomBar } from './BottomBar';
import { useUIStore } from '@/store/uiStore';

export function AppShell() {
  const { sidebarExpanded, rightPanelOpen } = useUIStore();

  const sidebarWidth = sidebarExpanded ? 240 : 64;
  const rightPanelWidth = rightPanelOpen ? 320 : 0;

  return (
    <div
      className="min-h-[100dvh]"
      style={{ backgroundColor: '#000000' }}
    >
      <TopNav />
      <Sidebar />
      <RightPanel />
      <BottomBar />

      {/* Main Content Area */}
      <main
        className="fixed overflow-auto"
        style={{
          top: '48px',
          left: `${sidebarWidth}px`,
          right: `${rightPanelWidth}px`,
          bottom: '72px',
          transition: 'left 0.25s cubic-bezier(0.4, 0, 0.2, 1), right 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          backgroundColor: '#000000',
        }}
      >
        <Outlet />
      </main>
    </div>
  );
}
