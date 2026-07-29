import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { useIsMobile } from '@/presentation/hooks/use-mobile';
import {
  Home, Database, BookOpen, Plug, Network as Infra, Settings,
  Bot, Megaphone, Calendar, CheckSquare, Wallet, Globe, Workflow, Table2, Clock,
  Sparkles, FileCode, LayoutGrid, Share2, Compass, type LucideIcon,
} from 'lucide-react';
import { findNavItemByPath } from '@/domain/navRegistry';

// Labels come from the shared nav registry — used for accessibility tooltips only.
// Visual chrome is icon-only app tiles matching the AXE brain app-icon style:
// matte-black rounded square + neon yellow→purple gradient marks.
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

/** Same spectrum as the AXE brain app icon: yellow → green → cyan → blue → purple */
const BRAIN_GRADIENT_ID = 'axe-brain-nav-gradient';

function BrainGradientDefs() {
  return (
    <svg width={0} height={0} aria-hidden style={{ position: 'absolute' }}>
      <defs>
        <linearGradient id={BRAIN_GRADIENT_ID} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#facc15" />
          <stop offset="25%" stopColor="#22c55e" />
          <stop offset="50%" stopColor="#22d3ee" />
          <stop offset="75%" stopColor="#3b82f6" />
          <stop offset="100%" stopColor="#a855f7" />
        </linearGradient>
      </defs>
    </svg>
  );
}

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

  // Matte-black rounded square — same language as the iOS-style app icon
  const tileBg = '#0d0d0d';
  const tileBorder = isActive
    ? '1px solid rgba(34,211,238,0.35)'
    : '1px solid rgba(255,255,255,0.06)';
  const tileShadow = isActive
    ? '0 0 18px rgba(34,211,238,0.28), 0 0 6px rgba(168,85,247,0.18), inset 0 1px 0 rgba(255,255,255,0.04)'
    : '0 2px 6px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.03)';

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
      {item.imgSrc ? (
        <img
          src={item.imgSrc}
          alt=""
          width={iconPx + 6}
          height={iconPx + 6}
          style={{
            width: iconPx + 6,
            height: iconPx + 6,
            objectFit: 'contain',
            borderRadius: 10,
            filter: isActive
              ? 'drop-shadow(0 0 8px rgba(34,211,238,0.55)) drop-shadow(0 0 4px rgba(168,85,247,0.35))'
              : 'none',
          }}
          draggable={false}
        />
      ) : Icon ? (
        <Icon
          size={iconPx}
          strokeWidth={isActive ? 2.15 : 1.9}
          // Stroke uses the shared brain spectrum gradient
          style={{
            stroke: `url(#${BRAIN_GRADIENT_ID})`,
            color: 'transparent',
            filter: isActive
              ? 'drop-shadow(0 0 6px rgba(34,211,238,0.45)) drop-shadow(0 0 3px rgba(168,85,247,0.3))'
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
      <BrainGradientDefs />
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
