import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router';
import {
  Home, Network, Brain, Bot, CheckSquare, Calendar, Database,
  BookOpen, TrendingUp, Wallet, Plug, Network as Infra, Settings, Code, TerminalSquare, Workflow, Globe, Megaphone,
  Table2, Clock,
} from 'lucide-react';
import { SidebarChat } from '@/components/axe-core/SidebarChat';

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
      className="fixed left-0 top-[48px] bottom-0 z-fixed flex flex-col"
      style={{
        width: 240,
        backgroundColor: '#000000',
        borderRight: '1px solid rgba(255,255,255,0.04)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      <div className="flex-1 overflow-y-auto py-3 px-2 space-y-1">
        {navItems.map((item) => {
          const isActive = activePath === item.path;
          const Icon = item.icon;
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className="w-full flex items-center gap-3 rounded-lg transition-all px-3 py-2.5 text-left"
              style={{
                height: '40px',
                background: isActive ? '#0A0A0A' : 'transparent',
                border: isActive ? '1px solid rgba(34,211,238,0.18)' : '1px solid transparent',
                color: isActive ? 'var(--accent-cyan)' : 'var(--text-muted)',
              }}
            >
              <Icon size={18} style={isActive ? { color: 'var(--accent-cyan)' } : {}} />
              <span className="text-[11px] truncate">{item.label}</span>
            </button>
          );
        })}
      </div>
      <div className="p-3" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
        <WeatherTime />
      </div>
      <div className="flex-1 min-h-0 px-2 pb-2">
        <SidebarChat />
      </div>
    </div>
  );
}
