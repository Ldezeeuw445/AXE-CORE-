import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router';
import {
  Home, Network, Brain, Database, BookOpen, Plug, Network as Infra, Settings, Code, TerminalSquare,
  Bot, Megaphone, Calendar, CheckSquare, Wallet, TrendingUp, Globe, Workflow, Table2, Clock,
} from 'lucide-react';

const leftItems = [
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
];

const rightItems = [
  { icon: Bot, label: 'Agents', path: '/agents' },
  { icon: Megaphone, label: 'CrewAI Bridge', path: '/crewai' },
  { icon: Calendar, label: 'Calendar', path: '/calendar' },
  { icon: CheckSquare, label: 'Tasks', path: '/tasks' },
  { icon: Wallet, label: 'Finance', path: '/finance' },
  { icon: TrendingUp, label: 'Trading', path: '/trading' },
  { icon: Globe, label: '3D Maps', path: '/maps-3d' },
  { icon: TerminalSquare, label: 'Terminal', path: '/command' },
  { icon: Code, label: 'Developer', path: '/developer' },
  { icon: Settings, label: 'Settings', path: '/settings' },
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
  const activePath = location.pathname;

  return (
    <div
      className="fixed left-0 right-0 z-fixed"
      style={{
        bottom: 0,
        height: 88,
        backgroundColor: '#000000',
        borderTop: '1px solid rgba(255,255,255,0.08)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      <div className="flex items-center h-full px-3 gap-2 overflow-x-auto">
        {/* Left 10 items */}
        <div className="flex items-center gap-2 flex-1 justify-end">
          {leftItems.map((item) => {
            const isActive = activePath === item.path;
            const Icon = item.icon;
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className="flex flex-col items-center justify-center gap-1 rounded-xl transition-all flex-shrink-0"
                style={{
                  minWidth: 64,
                  height: 64,
                  background: isActive ? 'rgba(34,211,238,0.1)' : 'rgba(255,255,255,0.03)',
                  border: isActive ? '1px solid rgba(34,211,238,0.35)' : '1px solid rgba(255,255,255,0.06)',
                }}
              >
                <Icon size={22} style={{ color: isActive ? 'var(--accent-cyan)' : 'var(--text-muted)' }} />
                <span className="text-[10px] font-medium truncate w-full text-center" style={{ color: isActive ? 'var(--accent-cyan)' : 'var(--text-muted)' }}>{item.label}</span>
              </button>
            );
          })}
        </div>

        {/* Center spacer with weather/time */}
        <div className="flex-shrink-0 w-40 h-full flex items-center justify-center" style={{ borderLeft: '1px solid rgba(255,255,255,0.06)', borderRight: '1px solid rgba(255,255,255,0.06)' }}>
          <WeatherTime />
        </div>

        {/* Right 10 items */}
        <div className="flex items-center gap-2 flex-1 justify-start">
          {rightItems.map((item) => {
            const isActive = activePath === item.path;
            const Icon = item.icon;
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className="flex flex-col items-center justify-center gap-1 rounded-xl transition-all flex-shrink-0"
                style={{
                  minWidth: 64,
                  height: 64,
                  background: isActive ? 'rgba(34,211,238,0.1)' : 'rgba(255,255,255,0.03)',
                  border: isActive ? '1px solid rgba(34,211,238,0.35)' : '1px solid rgba(255,255,255,0.06)',
                }}
              >
                <Icon size={22} style={{ color: isActive ? 'var(--accent-cyan)' : 'var(--text-muted)' }} />
                <span className="text-[10px] font-medium truncate w-full text-center" style={{ color: isActive ? 'var(--accent-cyan)' : 'var(--text-muted)' }}>{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
