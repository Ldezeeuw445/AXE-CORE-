import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router';
import {
  Home, Brain, Bot, CheckSquare, Calendar, Database,
  BookOpen, TrendingUp, Wallet, Plug, Network, Settings, Code, TerminalSquare, Workflow, Globe, Megaphone,
  Table2, Clock,
  Menu,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUIStore } from '@/store/uiStore';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { TriangleLogo } from '@/components/axe-core/TriangleLogo';
import { SidebarChat } from '@/components/axe-core/SidebarChat';

const navItems = [
  { icon: Home, label: 'Home', path: '/' },
  { icon: Network, label: 'Organization', path: '/organization' },
  { icon: Brain, label: 'AI Core', path: '/ai-core' },
  { icon: Bot, label: 'Agents', path: '/agents' },
  { icon: CheckSquare, label: 'Tasks', path: '/tasks' },
  { icon: Calendar, label: 'Calendar', path: '/calendar' },
  { icon: Database, label: 'Memory', path: '/memory' },
  { icon: BookOpen, label: 'Knowledge Base', path: '/knowledge' },
  { icon: TrendingUp, label: 'Trading', path: '/trading' },
  { icon: Wallet, label: 'Finance', path: '/finance' },
  { icon: Plug, label: 'MCP', path: '/mcp' },
  { icon: Network, label: 'Infrastructure', path: '/infrastructure' },
  { icon: Workflow, label: 'Control Plane', path: '/control-plane' },
  { icon: Globe, label: '3D Maps', path: '/maps-3d' },
  { icon: Megaphone, label: 'CrewAI Bridge', path: '/crewai' },
  { icon: Table2, label: 'Table Editor', path: '/table-editor' },
  { icon: Clock, label: 'Cron Manager', path: '/cron-manager' },
  { icon: Settings, label: 'Settings', path: '/settings' },
  { icon: TerminalSquare, label: 'Terminal', path: '/command' },
  { icon: Code, label: 'Developer', path: '/developer' },
];

export function Sidebar() {
  const { sidebarExpanded, setActiveModule, mobileNavOpen, setMobileNavOpen } = useUIStore();
  const [hovered, setHovered] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();

  const isExpanded = sidebarExpanded || hovered;
  const activePath = location.pathname;

  if (isMobile) {
    return (
      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent
          side="left"
          className="bg-black text-white border-r border-white/5 w-[20rem] max-w-[88vw] p-0"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>AXE Navigation</SheetTitle>
            <SheetDescription>Mobile navigation drawer for AXE Core.</SheetDescription>
          </SheetHeader>
          <div className="h-full flex flex-col">
            <div className="px-4 pt-5 pb-4 border-b border-white/5">
              <div className="flex items-center gap-3">
                <TriangleLogo size={28} animate />
                <div className="min-w-0">
                  <div className="text-sm font-semibold tracking-[0.16em]">AXE CORE</div>
                  <div className="text-[10px] uppercase tracking-[0.18em]" style={{ color: 'var(--text-muted)' }}>
                    Command Center
                  </div>
                </div>
              </div>
            </div>

            <nav className="flex-1 overflow-y-auto p-3 space-y-1">
              {navItems.map((item) => {
                const isActive = activePath === item.path;
                const Icon = item.icon;
                return (
                  <button
                    key={item.path}
                    onClick={() => {
                      navigate(item.path);
                      setActiveModule(item.label.toLowerCase());
                      setMobileNavOpen(false);
                    }}
                    className={cn(
                      'w-full flex items-center gap-3 rounded-xl transition-all px-3 py-3 text-left',
                      isActive ? 'text-[var(--accent-cyan)]' : 'text-[var(--text-muted)]'
                    )}
                    style={{
                      backgroundColor: isActive ? '#0A0A0A' : 'transparent',
                      border: isActive ? '1px solid rgba(34,211,238,0.18)' : '1px solid transparent',
                    }}
                  >
                    <Icon size={18} style={isActive ? { color: 'var(--accent-cyan)' } : {}} />
                    <span className="text-sm truncate">{item.label}</span>
                  </button>
                );
              })}
            </nav>

            <div className="p-3 border-t border-white/5">
              <button
                onClick={() => {
                  setMobileNavOpen(false);
                  navigate('/terminal');
                }}
                className="w-full flex items-center justify-between rounded-xl px-3 py-3 text-left"
                style={{ backgroundColor: '#0A0A0A', border: '1px solid rgba(255,255,255,0.04)' }}
              >
                <span className="text-sm">Open Terminal</span>
                <Menu size={16} />
              </button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <aside
      className="fixed left-0 z-fixed flex flex-col transition-all duration-normal overflow-hidden edge-glow"
      style={{
        top: '48px',
        bottom: '56px',
        width: isExpanded ? '240px' : '64px',
        backgroundColor: '#000000',
        borderRight: '1px solid rgba(255,255,255,0.04)',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <nav className="flex-1 py-3 px-2 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = activePath === item.path;
          const Icon = item.icon;
          return (
            <button
              key={item.path}
              onClick={() => {
                navigate(item.path);
                setActiveModule(item.label.toLowerCase());
              }}
              className={cn(
                'w-full flex items-center gap-3 rounded-lg transition-all duration-fast relative',
                isExpanded ? 'px-3' : 'justify-center px-0',
                isActive
                  ? 'text-[var(--accent-cyan)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
              )}
              style={{
                height: '44px',
                backgroundColor: isActive ? '#0A0A0A' : 'transparent',
              }}
              onMouseEnter={(e) => {
                if (!isActive) e.currentTarget.style.backgroundColor = '#111111';
              }}
              onMouseLeave={(e) => {
                if (!isActive) e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              {isActive && (
                <span
                  className="absolute left-0 top-1/2 -translate-y-1/2 rounded-r"
                  style={{
                    width: '3px',
                    height: '20px',
                    backgroundColor: 'var(--accent-cyan)',
                  }}
                />
              )}
              <Icon size={20} style={isActive ? { color: 'var(--accent-cyan)' } : {}} />
              {isExpanded && (
                <span className="text-body truncate">{item.label}</span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Chat — always visible in sidebar */}
      <div className="flex-1 min-h-0 px-2 pb-2">
        <SidebarChat />
      </div>

      {/* Bottom section */}
      <div
        className="p-2"
        style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}
      >
        {/* Voice status mini */}
        <div
          className={cn(
            'flex items-center gap-2 rounded-lg px-2 py-2',
            isExpanded ? '' : 'justify-center'
          )}
          style={{ backgroundColor: '#0A0A0A' }}
        >
          <div className="flex items-center gap-1">
            <span
              className="inline-block rounded-full animate-pulse-live"
              style={{
                width: '6px',
                height: '6px',
                backgroundColor: 'var(--accent-cyan)',
              }}
            />
            {isExpanded && (
              <span className="text-xs-custom" style={{ color: 'var(--text-muted)' }}>
                Voice Ready
              </span>
            )}
          </div>
        </div>

        {/* Focus mode toggle */}
        <button
          className={cn(
            'w-full flex items-center gap-2 rounded-lg mt-1 transition-all duration-fast',
            isExpanded ? 'px-3' : 'justify-center px-0',
            'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
          )}
          style={{ height: '36px' }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#1A1A1A';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
          }}
        >
          <span
            className="rounded-full"
            style={{
              width: '8px',
              height: '8px',
              backgroundColor: 'var(--text-muted)',
            }}
          />
          {isExpanded && (
            <span className="text-xs-custom">Focus Mode</span>
          )}
        </button>
      </div>
    </aside>
  );
}
