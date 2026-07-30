import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { useIsMobile } from '@/presentation/hooks/use-mobile';
import {
  Home, Database, BookMarked, Cable, Network as Infra, Settings,
  Bot, Megaphone, CalendarDays, ListTodo, Wallet, Globe, Workflow, Table2, Clock,
  Sparkles, FileCode, LayoutGrid, Share2, Compass, Brain, type LucideIcon,
} from 'lucide-react';
import { findNavItemByPath } from '@/domain/navRegistry';

const navLabel = (path: string) => findNavItemByPath(path)?.label ?? path;

type NavItem = {
  icon?: LucideIcon;
  label: string;
  path: string;
};

const leftItems: NavItem[] = [
  { icon: Home, label: navLabel('/'), path: '/' },
  { icon: LayoutGrid, label: 'Apps', path: '/apps' },
  { icon: Brain, label: navLabel('/ai-core'), path: '/ai-core' },
  { icon: Database, label: navLabel('/memory'), path: '/memory' },
  { icon: Share2, label: navLabel('/obsidian'), path: '/obsidian' },
  { icon: BookMarked, label: navLabel('/knowledge'), path: '/knowledge' },
  { icon: Cable, label: navLabel('/mcp'), path: '/mcp' },
  { icon: Infra, label: navLabel('/infrastructure'), path: '/infrastructure' },
  { icon: Workflow, label: navLabel('/control-plane'), path: '/control-plane' },
  { icon: Table2, label: navLabel('/table-editor'), path: '/table-editor' },
  { icon: Clock, label: navLabel('/cron-manager'), path: '/cron-manager' },
];

const rightItems: NavItem[] = [
  { icon: Compass, label: navLabel('/browser'), path: '/browser' },
  // Bot with solid stroke reads as full "agent" mark; gradient stroke dropped mid-paths
  { icon: Bot, label: navLabel('/agents'), path: '/agents' },
  { icon: Megaphone, label: navLabel('/crewai'), path: '/crewai' },
  // CalendarDays has day grid lines — complete silhouette vs bare Calendar under thin stroke
  { icon: CalendarDays, label: navLabel('/calendar'), path: '/calendar' },
  { icon: ListTodo, label: navLabel('/tasks'), path: '/tasks' },
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

function NavTile({
  item,
  isActive,
  isMobile,
  onClick,
}: {
  item: NavItem;
  isActive: boolean;
  isMobile: boolean;
  onClick: () => void;
}) {
  const size = isMobile ? 46 : 54;
  const iconPx = isMobile ? 22 : 26;
  const Icon = item.icon;

  const tileBg = '#0d0d0d';
  const tileBorder = isActive
    ? '1px solid rgba(34,211,238,0.35)'
    : '1px solid rgba(255,255,255,0.06)';
  const tileShadow = isActive
    ? '0 0 18px rgba(34,211,238,0.28), 0 0 6px rgba(168,85,247,0.18), inset 0 1px 0 rgba(255,255,255,0.04)'
    : '0 2px 6px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.03)';

  // Solid cyan/purple — gradient stroke via url(#id) drops mid-paths on multi-path icons
  // (Calendar, Bot, Book) so they looked incomplete. Solid stroke keeps full geometry.
  const strokeColor = isActive ? '#22d3ee' : '#67e8f9';

  return (
    <button
      type="button"
      onClick={onClick}
      title={item.label}
      aria-label={item.label}
      aria-current={isActive ? 'page' : undefined}
      className="flex items-center justify-center rounded-[16px] transition-all flex-shrink-0 active:scale-95"
      style={{
        width: size,
        height: size,
        background: tileBg,
        border: tileBorder,
        boxShadow: tileShadow,
      }}
    >
      {Icon ? (
        <Icon
          size={iconPx}
          strokeWidth={2.1}
          color={strokeColor}
          style={{
            filter: isActive
              ? 'drop-shadow(0 0 6px rgba(34,211,238,0.5))'
              : 'drop-shadow(0 0 2px rgba(0,0,0,0.4))',
          }}
        />
      ) : null}
    </button>
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
        height: 'calc(76px + env(safe-area-inset-bottom, 0px))',
        backgroundColor: '#000000',
        borderTop: '1px solid rgba(255,255,255,0.06)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        boxSizing: 'border-box',
      }}
    >
      <div
        className="flex items-center px-3 gap-2"
        style={{
          height: 76,
          justifyContent: 'safe center',
          overflowX: 'auto',
          overflowY: 'hidden',
          touchAction: 'pan-x',
          scrollbarWidth: 'none',
          WebkitOverflowScrolling: 'touch',
          msOverflowStyle: 'none',
        }}
      >
        <div className="flex items-center gap-1.5 sm:gap-2 justify-end flex-shrink-0">
          {leftItems.map((item) => (
            <NavTile
              key={item.path}
              item={item}
              isActive={activePath === item.path || (item.path !== '/' && activePath.startsWith(item.path))}
              isMobile={isMobile}
              onClick={() => navigate(item.path)}
            />
          ))}
        </div>

        <div
          className="hidden sm:flex flex-shrink-0 w-28 h-full items-center justify-center"
          style={{
            borderLeft: '1px solid rgba(255,255,255,0.05)',
            borderRight: '1px solid rgba(255,255,255,0.05)',
          }}
        >
          <WeatherTime />
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 justify-start flex-shrink-0">
          {rightItems.map((item) => (
            <NavTile
              key={item.path}
              item={item}
              isActive={activePath === item.path || (item.path !== '/' && activePath.startsWith(item.path))}
              isMobile={isMobile}
              onClick={() => navigate(item.path)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
