import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { useIsMobile } from '@/presentation/hooks/use-mobile';
import {
  Home, Database, BookOpen, Plug, Network as Infra, Settings, TerminalSquare,
  Bot, Megaphone, Calendar, CheckSquare, Wallet, Globe, Workflow, Table2, Clock,
  Sparkles, FileCode, LayoutGrid, Share2, Compass, type LucideIcon,
} from 'lucide-react';
import { findNavItemByPath } from '@/domain/navRegistry';

// Labels come from the shared nav registry — used for accessibility tooltips only.
// Visual chrome is icon-only app tiles (same style for every tab).
const navLabel = (path: string) => findNavItemByPath(path)?.label ?? path;

type NavItem = {
  icon?: LucideIcon;
  /** Optional image asset (e.g. neural-brain for AI Core) */
  imgSrc?: string;
  label: string;
  path: string;
};

const leftItems: NavItem[] = [
  { icon: Home, label: navLabel('/'), path: '/' },
  { icon: LayoutGrid, label: 'Apps', path: '/apps' },
  // AI Core uses the same neural-brain mark as the app icon
  { imgSrc: '/icon-192.png', label: navLabel('/ai-core'), path: '/ai-core' },
  { icon: Database, label: navLabel('/memory'), path: '/memory' },
  { icon: Share2, label: navLabel('/obsidian'), path: '/obsidian' },
  { icon: BookOpen, label: navLabel('/knowledge'), path: '/knowledge' },
  { icon: Plug, label: navLabel('/mcp'), path: '/mcp' },
  { icon: Infra, label: navLabel('/infrastructure'), path: '/infrastructure' },
  { icon: Workflow, label: navLabel('/control-plane'), path: '/control-plane' },
  { icon: Table2, label: navLabel('/table-editor'), path: '/table-editor' },
  { icon: Clock, label: navLabel('/cron-manager'), path: '/cron-manager' },
];

const rightItems: NavItem[] = [
  { icon: Compass, label: navLabel('/browser'), path: '/browser' },
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
  const size = isMobile ? 44 : 52;
  const iconPx = isMobile ? 20 : 24;
  const Icon = item.icon;

  return (
    <button
      type="button"
      onClick={onClick}
      title={item.label}
      aria-label={item.label}
      aria-current={isActive ? 'page' : undefined}
      className="flex items-center justify-center rounded-[14px] transition-all flex-shrink-0 active:scale-95"
      style={{
        width: size,
        height: size,
        background: isActive
          ? 'linear-gradient(145deg, rgba(34,211,238,0.18), rgba(139,92,246,0.12))'
          : 'rgba(255,255,255,0.04)',
        border: isActive
          ? '1px solid rgba(34,211,238,0.45)'
          : '1px solid rgba(255,255,255,0.08)',
        boxShadow: isActive
          ? '0 0 16px rgba(34,211,238,0.22), inset 0 0 12px rgba(34,211,238,0.06)'
          : '0 1px 2px rgba(0,0,0,0.35)',
      }}
    >
      {item.imgSrc ? (
        <img
          src={item.imgSrc}
          alt=""
          width={iconPx + 4}
          height={iconPx + 4}
          style={{
            width: iconPx + 4,
            height: iconPx + 4,
            objectFit: 'contain',
            borderRadius: 8,
            filter: isActive ? 'drop-shadow(0 0 6px rgba(34,211,238,0.55))' : 'none',
          }}
          draggable={false}
        />
      ) : Icon ? (
        <Icon
          size={iconPx}
          strokeWidth={isActive ? 2.25 : 1.85}
          style={{
            color: isActive ? 'var(--accent-cyan)' : 'var(--text-muted)',
            filter: isActive ? 'drop-shadow(0 0 5px rgba(34,211,238,0.45))' : 'none',
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
        height: 'calc(72px + env(safe-area-inset-bottom, 0px))',
        backgroundColor: '#000000',
        borderTop: '1px solid rgba(255,255,255,0.08)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        boxSizing: 'border-box',
      }}
    >
      <div
        className="flex items-center px-3 gap-2"
        style={{
          height: 72,
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
            borderLeft: '1px solid rgba(255,255,255,0.06)',
            borderRight: '1px solid rgba(255,255,255,0.06)',
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
