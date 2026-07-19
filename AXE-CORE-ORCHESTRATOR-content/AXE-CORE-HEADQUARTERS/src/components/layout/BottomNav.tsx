import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  Home, Brain, Database, BookOpen, Plug, Network as Infra, Settings, Code, TerminalSquare,
  Bot, Megaphone, Calendar, CheckSquare, Wallet, TrendingUp, Globe, Workflow, Table2, Clock,
  Sparkles, FileCode, LayoutGrid,
} from 'lucide-react';
import { findNavItemByPath } from '@/lib/navRegistry';

// Labels come from the shared nav registry (`@/lib/navRegistry`) — the single
// source of truth for tab names — so chat-driven navigation always matches
// what's shown here. Icons/ordering stay local to this component.
const navLabel = (path: string) => findNavItemByPath(path)?.label ?? path;

const leftItems = [
  { icon: Home, label: navLabel('/'), path: '/' },
  { icon: LayoutGrid, label: 'Apps', path: '/apps' },
  { icon: Brain, label: navLabel('/ai-core'), path: '/ai-core' },
  { icon: Database, label: navLabel('/memory'), path: '/memory' },
  { icon: BookOpen, label: navLabel('/knowledge'), path: '/knowledge' },
  { icon: Plug, label: navLabel('/mcp'), path: '/mcp' },
  { icon: Infra, label: navLabel('/infrastructure'), path: '/infrastructure' },
  { icon: Workflow, label: navLabel('/control-plane'), path: '/control-plane' },
  { icon: Table2, label: navLabel('/table-editor'), path: '/table-editor' },
  { icon: Clock, label: navLabel('/cron-manager'), path: '/cron-manager' },
];

const rightItems = [
  { icon: Bot, label: navLabel('/agents'), path: '/agents' },
  { icon: Megaphone, label: navLabel('/crewai'), path: '/crewai' },
  { icon: Calendar, label: navLabel('/calendar'), path: '/calendar' },
  { icon: CheckSquare, label: navLabel('/tasks'), path: '/tasks' },
  { icon: Wallet, label: navLabel('/finance'), path: '/finance' },
  { icon: Globe, label: navLabel('/maps-3d'), path: '/maps-3d' },
  { icon: FileCode, label: navLabel('/code-editor'), path: '/code-editor' },
  { icon: Sparkles, label: navLabel('/eve'), path: '/eve' },
  { icon: Settings, label: navLabel('/settings'), path: '/settings' },
];

function WeatherTime() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(t);
  }, []);
  const time = now.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
  const date = now.toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' });
  return (
    <div className="flex flex-col items-center gap-0.5" style={{ color: 'var(--text-muted)' }}>
      <span className="text-[11px] font-mono-data">{time}</span>
      <span className="text-[10px]">{date}</span>
    </div>
  );
}

export function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();
  const activePath = location.pathname;

  return (
    <div
      className="flex-shrink-0 w-full overflow-hidden"
      style={{
        height: 80,
        backgroundColor: '#000000',
        borderTop: '1px solid rgba(255,255,255,0.08)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      <div
        className="flex items-center px-3 gap-2"
        style={{
          height: 80,
          overflowX: 'auto',
          overflowY: 'hidden',
          touchAction: 'pan-x',
          scrollbarWidth: 'none',
          WebkitOverflowScrolling: 'touch',
          msOverflowStyle: 'none',
        }}
      >
        {/* Left items */}
        <div className="flex items-center gap-1 sm:gap-2 justify-end flex-shrink-0">
          {leftItems.map((item) => {
            const isActive = activePath === item.path;
            const Icon = item.icon;
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className="flex flex-col items-center justify-center gap-0.5 sm:gap-1 rounded-xl transition-all flex-shrink-0"
                style={{
                  minWidth: isMobile ? 44 : 64,
                  height: isMobile ? 52 : 64,
                  padding: isMobile ? '4px' : '8px',
                  background: isActive ? 'rgba(34,211,238,0.1)' : 'rgba(255,255,255,0.03)',
                  border: isActive ? '1px solid rgba(34,211,238,0.35)' : '1px solid rgba(255,255,255,0.06)',
                }}
              >
                <Icon size={isMobile ? 18 : 22} style={{ color: isActive ? 'var(--accent-cyan)' : 'var(--text-muted)' }} />
                <span className="text-[9px] sm:text-[10px] font-medium truncate w-full text-center" style={{ color: isActive ? 'var(--accent-cyan)' : 'var(--text-muted)' }}>{item.label}</span>
              </button>
            );
          })}
        </div>

        {/* Center spacer with weather/time */}
        <div className="hidden sm:flex flex-shrink-0 w-40 h-full items-center justify-center" style={{ borderLeft: '1px solid rgba(255,255,255,0.06)', borderRight: '1px solid rgba(255,255,255,0.06)' }}>
          <WeatherTime />
        </div>

        {/* Right items */}
        <div className="flex items-center gap-1 sm:gap-2 justify-start flex-shrink-0">
          {rightItems.map((item) => {
            const isActive = activePath === item.path;
            const Icon = item.icon;
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className="flex flex-col items-center justify-center gap-0.5 sm:gap-1 rounded-xl transition-all flex-shrink-0"
                style={{
                  minWidth: isMobile ? 44 : 64,
                  height: isMobile ? 52 : 64,
                  padding: isMobile ? '4px' : '8px',
                  background: isActive ? 'rgba(34,211,238,0.1)' : 'rgba(255,255,255,0.03)',
                  border: isActive ? '1px solid rgba(34,211,238,0.35)' : '1px solid rgba(255,255,255,0.06)',
                }}
              >
                <Icon size={isMobile ? 18 : 22} style={{ color: isActive ? 'var(--accent-cyan)' : 'var(--text-muted)' }} />
                <span className="text-[9px] sm:text-[10px] font-medium truncate w-full text-center" style={{ color: isActive ? 'var(--accent-cyan)' : 'var(--text-muted)' }}>{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
