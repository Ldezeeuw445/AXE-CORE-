import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router';
import {
  Home, Brain, Database, BookOpen, Plug, Network as Infra, Settings, Code, TerminalSquare,
  Bot, Megaphone, Calendar, CheckSquare, Wallet, TrendingUp, Globe, Workflow, Table2, Clock,
  Sparkles, FileCode,
} from 'lucide-react';

const leftItems = [
  { icon: Home, label: 'Home', path: '/' },
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
  { icon: Megaphone, label: 'CrewAI', path: '/crewai' },
  { icon: Calendar, label: 'Calendar', path: '/calendar' },
  { icon: CheckSquare, label: 'Tasks', path: '/tasks' },
  { icon: Wallet, label: 'Finance', path: '/finance' },
  { icon: TrendingUp, label: 'Trading', path: '/trading' },
  { icon: Globe, label: '3D Maps', path: '/maps-3d' },
  { icon: FileCode, label: 'Code Editor', path: '/code-editor' },
  { icon: Sparkles, label: 'EVE', path: '/eve' },
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
        {/* Left 10 items */}
        <div className="flex items-center gap-2 justify-end flex-shrink-0">
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
        <div className="flex items-center gap-2 justify-start flex-shrink-0">
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
