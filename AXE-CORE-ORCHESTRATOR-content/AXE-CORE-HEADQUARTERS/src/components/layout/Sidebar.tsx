import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router';
import {
  Home, Brain, Bot, CheckSquare, Calendar, Database,
  BookOpen, TrendingUp, Wallet, Plug, Network, Settings, Code, TerminalSquare, Workflow, Globe, Megaphone,
  Table2, Clock, Network as Infra, Menu, Sparkles,
  FileCode,
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
import { WidgetCard } from '@/components/widgets/WidgetCard';
import { Activity, Cpu, MemoryStick, HardDrive, Mic, Zap, Terminal } from 'lucide-react';
import { loadSetting } from '@/services/userSettingsService';

const navItems = [
  { icon: Home, label: 'Home', path: '/' },
  { icon: Network, label: 'Organization', path: '/organization' },
  { icon: Brain, label: 'AI Core', path: '/ai-core' },
  { icon: Database, label: 'Memory', path: '/memory' },
  { icon: BookOpen, label: 'Knowledge Base', path: '/knowledge' },
  { icon: Plug, label: 'MCP', path: '/mcp' },
  { icon: Infra, label: 'Infrastructure', path: '/infrastructure' },
  { icon: Workflow, label: 'Control Plane', path: '/control-plane' },
  { icon: Table2, label: 'Table Editor', path: '/table-editor' },
  { icon: Clock, label: 'Cron Manager', path: '/cron-manager' },
  { icon: Bot, label: 'Agents', path: '/agents' },
  { icon: Megaphone, label: 'CrewAI Bridge', path: '/crewai' },
  { icon: Calendar, label: 'Calendar', path: '/calendar' },
  { icon: CheckSquare, label: 'Tasks', path: '/tasks' },
  { icon: Wallet, label: 'Finance', path: '/finance' },
  { icon: TrendingUp, label: 'Trading', path: '/trading' },
  { icon: Globe, label: '3D Maps', path: '/maps-3d' },
  { icon: TerminalSquare, label: 'Terminal', path: '/command' },
  { icon: Code, label: 'Developer', path: '/developer' },
  { icon: FileCode, label: 'Code Editor', path: '/code-editor' },
  { icon: Sparkles, label: 'EVE Framework', path: '/eve' },
  { icon: Settings, label: 'Settings', path: '/settings' },
];

function SystemMonitor() {
  const [sys, setSys] = useState({ cores: 4, heapMB: 128, totalMB: 512, online: true });
  useEffect(() => {
    const t = setInterval(() => {
      setSys({ cores: 4, heapMB: 128 + Math.floor(Math.random() * 20), totalMB: 512, online: true });
    }, 4000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="grid grid-cols-3 gap-1">
      {[
        { icon: Cpu, label: 'Cores', val: String(sys.cores) },
        { icon: MemoryStick, label: 'Heap', val: `${sys.heapMB}MB` },
        { icon: HardDrive, label: 'Total', val: `${sys.totalMB}MB` },
      ].map(({ icon: Icon, label, val }) => (
        <div key={label} className="flex flex-col items-center gap-0.5 p-1.5 rounded" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
          <Icon size={12} style={{ color: 'var(--accent-cyan)' }} />
          <span className="font-mono-data text-[11px]" style={{ color: 'var(--text-primary)' }}>{val}</span>
          <span className="text-[8px]" style={{ color: 'var(--text-muted)' }}>{label}</span>
        </div>
      ))}
    </div>
  );
}

function AICoreSystem() {
  const [supaConnected, setSupaConnected] = useState(false);
  useEffect(() => {
    const check = async () => {
      try {
        const url = await loadSetting<string>('axe_supa_url', '');
        setSupaConnected(!!url);
      } catch { /* ignore */ }
    };
    void check();
  }, []);
  return (
    <WidgetCard title="AI CORE SYSTEM" headerAction={
      <button onClick={() => {}} style={{ color: 'var(--text-muted)' }}><Terminal size={13} /></button>
    }>
      <div className="space-y-1.5">
        {[
          { icon: Activity, label: 'Status', val: 'Online', ok: true },
          { icon: Cpu, label: 'Models', val: '4 active', ok: true },
          { icon: Mic, label: 'Voice', val: 'Piper TTS', ok: true },
          { icon: Zap, label: 'Memory', val: supaConnected ? 'Linked' : '—', ok: supaConnected },
        ].map(({ icon: Icon, label, val, ok }) => (
          <div key={label} className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Icon size={11} style={{ color: ok ? 'var(--accent-cyan)' : 'var(--text-muted)' }} />
              <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>{label}</span>
            </div>
            <span className="text-[11px] font-mono-data" style={{ color: ok ? 'var(--text-primary)' : 'var(--text-muted)' }}>{val}</span>
          </div>
        ))}
      </div>
    </WidgetCard>
  );
}

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
          style={{ backgroundColor: '#000000' }}
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
      className="fixed left-0 z-fixed flex flex-col transition-all duration-normal overflow-hidden"
      style={{
        top: '48px',
        bottom: '80px',
        width: '240px',
        backgroundColor: '#000000',
        borderRight: '1px solid rgba(255,255,255,0.04)',
      }}
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
                'px-3 justify-start',
                isActive
                  ? 'text-[var(--accent-cyan)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
              )}
              style={{
                height: '48px',
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
                    height: '24px',
                    backgroundColor: 'var(--accent-cyan)',
                  }}
                />
              )}
              <Icon size={22} style={isActive ? { color: 'var(--accent-cyan)' } : {}} />
              <span className="text-[13px] truncate">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Bottom section: AI Core System, Mission Timeline, Chat */}
      <div className="flex-shrink-0 p-2 space-y-2 overflow-y-auto" style={{ borderTop: '1px solid rgba(255,255,255,0.04)', maxHeight: '40vh' }}>
        <AICoreSystem />
        <WidgetCard title="MISSION TIMELINE">
          <div className="space-y-1 max-h-24 overflow-y-auto">
            {[1,2,3].map(i => (
              <div key={i} className="flex items-center gap-1.5">
                <span className="font-mono-data text-[8px]" style={{ color: 'var(--text-muted)' }}>10:{i}0</span>
                <span className="block rounded-full" style={{ width: 4, height: 4, background: 'var(--accent-cyan)', boxShadow: '0 0 4px var(--accent-cyan)' }} />
                <span className="flex-1 text-[10px] truncate" style={{ color: 'var(--text-primary)' }}>Mission event {i}</span>
              </div>
            ))}
          </div>
        </WidgetCard>
        <div className="rounded-lg overflow-hidden" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', minHeight: 160 }}>
          <div className="flex items-center gap-2 px-3 py-2" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
            <Bot size={12} style={{ color: 'var(--accent-cyan)' }} />
            <span className="text-[10px] font-medium tracking-wide" style={{ color: 'var(--text-secondary)' }}>AXE CORE CHAT</span>
            <span className="ml-auto rounded-full" style={{ width: 6, height: 6, background: 'var(--success)', display: 'inline-block' }} />
          </div>
          <SidebarChat />
        </div>
      </div>
    </aside>
  );
}
