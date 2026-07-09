import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router';
import {
  Home, Network, Brain, Bot, CheckSquare, Calendar, Database,
  BookOpen, TrendingUp, Wallet, Plug, Network as Infra, Settings, Code, TerminalSquare, Workflow, Globe, Megaphone,
  Table2, Clock,
} from 'lucide-react';

const navItems = [
  { icon: Home, label: 'Home', path: '/' },
  { icon: Network, label: 'Org', path: '/organization' },
  { icon: Brain, label: 'AI Core', path: '/ai-core' },
  { icon: Bot, label: 'Agents', path: '/agents' },
  { icon: CheckSquare, label: 'Tasks', path: '/tasks' },
  { icon: Calendar, label: 'Cal', path: '/calendar' },
  { icon: Database, label: 'Memory', path: '/memory' },
  { icon: BookOpen, label: 'KB', path: '/knowledge' },
  { icon: TrendingUp, label: 'Trading', path: '/trading' },
  { icon: Wallet, label: 'Finance', path: '/finance' },
  { icon: Plug, label: 'MCP', path: '/mcp' },
  { icon: Infra, label: 'Infra', path: '/infrastructure' },
  { icon: Workflow, label: 'Control', path: '/control-plane' },
  { icon: Globe, label: '3D', path: '/maps-3d' },
  { icon: Megaphone, label: 'CrewAI', path: '/crewai' },
  { icon: Table2, label: 'Tables', path: '/table-editor' },
  { icon: Clock, label: 'Cron', path: '/cron-manager' },
  { icon: Settings, label: 'Settings', path: '/settings' },
  { icon: TerminalSquare, label: 'Terminal', path: '/command' },
  { icon: Code, label: 'Dev', path: '/developer' },
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
      <span className="text-[10px] font-mono-data">{time}</span>
      <span className="text-[9px]">{date}</span>
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
        height: 72,
        backgroundColor: '#000000',
        borderTop: '1px solid rgba(255,255,255,0.04)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      <div className="flex items-center h-full px-2 gap-1 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
        {navItems.map((item) => {
          const isActive = activePath === item.path;
          const Icon = item.icon;
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className="flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-lg transition-all flex-shrink-0"
              style={{
                minWidth: 56,
                background: isActive ? '#0A0A0A' : 'transparent',
                border: isActive ? '1px solid rgba(34,211,238,0.18)' : '1px solid transparent',
              }}
            >
              <Icon size={16} style={{ color: isActive ? 'var(--accent-cyan)' : 'var(--text-muted)' }} />
              <span className="text-[8px] truncate w-full text-center" style={{ color: isActive ? 'var(--accent-cyan)' : 'var(--text-muted)' }}>{item.label}</span>
            </button>
          );
        })}
        <div className="w-px h-8 mx-1" style={{ background: 'rgba(255,255,255,0.06)' }} />
        <WeatherTime />
      </div>
    </div>
  );
}
