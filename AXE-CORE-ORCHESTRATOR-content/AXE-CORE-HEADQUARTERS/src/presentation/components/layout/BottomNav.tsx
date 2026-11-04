import { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { useIsMobile } from '@/presentation/hooks/use-mobile';
import {
  Home, Bot, CalendarDays, Code2, ListTodo, Settings,
  Anchor, LineChart, LayoutGrid, type LucideIcon,
} from 'lucide-react';
import { useVoiceStore, type VoiceStatus } from '@/presentation/store/voiceStore';
import { useHeeftPlaat } from '@/presentation/components/axe-core/sceneBackdrop';
import { PRIMARY_NAV_PATHS } from '@/domain/navRegistry';
import { MeerAppsSheet } from '@/presentation/components/layout/MeerAppsSheet';

type NavItem = {
  icon?: LucideIcon;
  label: string;
  path: string;
};

/** Primary shell: Home · NorthSea · Trading · Managers | orb | Taken · Code · Calendar · Settings · Meer */
const leftItems: NavItem[] = [
  { icon: Home, label: 'Home', path: '/' },
  { icon: Anchor, label: 'NorthSea', path: '/northsea' },
  { icon: LineChart, label: 'Trading', path: '/trading' },
  { icon: Bot, label: 'Managers', path: '/managers' },
];

const rightItems: NavItem[] = [
  { icon: ListTodo, label: 'Taken', path: '/tasks' },
  { icon: Code2, label: 'Code', path: '/code-editor' },
  { icon: CalendarDays, label: 'Calendar', path: '/calendar' },
  { icon: Settings, label: 'Settings', path: '/settings' },
];

const MEER_ITEM: NavItem = { icon: LayoutGrid, label: 'Meer', path: '__meer__' };

/** Keep PRIMARY_NAV_PATHS and BottomNav in lockstep (tested). */
void PRIMARY_NAV_PATHS;

const MOBILE_FIRST = [
  '/', '/northsea', '/trading', '/managers',
  '/tasks', '/code-editor', '/calendar', '/settings',
];

function orderForMobile(items: NavItem[]): NavItem[] {
  const rank = (p: string) => {
    const i = MOBILE_FIRST.indexOf(p);
    return i === -1 ? MOBILE_FIRST.length : i;
  };
  return [...items].sort((a, b) => rank(a.path) - rank(b.path));
}

const STATUS_COLOR: Record<VoiceStatus, string> = {
  idle: '#22D3EE',
  listening: '#10B981',
  processing: '#a855f7',
  speaking: '#F59E0B',
};

const STATUS_LABEL: Record<VoiceStatus, string> = {
  idle: 'Ready',
  listening: 'Listening',
  processing: 'Thinking',
  speaking: 'Speaking',
};

function AxeVoiceOrb() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const opPlaat = useHeeftPlaat();
  const status = useVoiceStore(s => s.voiceStatus);
  const statusRef = useRef(status);
  statusRef.current = status;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let raf = 0;
    let t = 0;

    const draw = () => {
      t += 0.04;
      const dpr = window.devicePixelRatio || 1;
      const w = 88;
      const h = 56;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const st = statusRef.current;
      const color = STATUS_COLOR[st] || '#22D3EE';
      const cx = w / 2;
      const cy = h / 2 - 4;

      const ringCount = st === 'idle' ? 2 : 3;
      for (let i = 0; i < ringCount; i++) {
        const pulse =
          st === 'processing'
            ? 1 + Math.sin(t * 3 + i) * 0.08
            : st === 'speaking'
            ? 1 + Math.sin(t * 6 + i * 1.2) * 0.12
            : st === 'listening'
            ? 1 + Math.sin(t * 4 + i) * 0.1
            : 1 + Math.sin(t * 1.2 + i) * 0.03;
        const r = (10 + i * 7) * pulse;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.strokeStyle = color + (i === 0 ? '99' : i === 1 ? '55' : '33');
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }

      const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, 14);
      grd.addColorStop(0, color + 'cc');
      grd.addColorStop(0.5, color + '44');
      grd.addColorStop(1, 'transparent');
      ctx.beginPath();
      ctx.arc(cx, cy, 14, 0, Math.PI * 2);
      ctx.fillStyle = grd;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(cx, cy, st === 'processing' ? 4 + Math.sin(t * 5) * 1.5 : 4, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 12;
      ctx.fill();
      ctx.shadowBlur = 0;

      if (st === 'processing') {
        ctx.beginPath();
        ctx.arc(cx, cy, 18, t * 2, t * 2 + Math.PI * 0.7);
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.stroke();
      }

      raf = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(raf);
  }, []);

  if (opPlaat) {
    return (
      <div className="axe-voice-orb" title="AXE presence is beside the composer">
        <span className="text-[9px] font-mono tracking-[0.18em] uppercase" style={{ color: 'var(--text-muted)' }}>AXE</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center gap-0.5" title={STATUS_LABEL[status]}>
      <canvas ref={canvasRef} />
      <span
        className="text-[9px] font-mono tracking-wide uppercase"
        style={{ color: STATUS_COLOR[status], opacity: 0.9 }}
      >
        {STATUS_LABEL[status]}
      </span>
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
  const Icon = item.icon;
  const activeWash = isActive
    ? {
        color: 'var(--accent-cyan)',
        background: 'rgba(255,255,255,0.05)',
        boxShadow: 'inset 0 0 0 1px rgba(34,211,238,0.28)',
        fontWeight: 600,
      }
    : {
        color: 'var(--text-muted)',
        background: 'transparent',
        boxShadow: 'none',
      };

  return (
    <button
      type="button"
      onClick={onClick}
      title={item.label}
      aria-label={item.label}
      aria-current={isActive ? 'page' : undefined}
      data-axe-doel={item.path}
      className="flex flex-col items-center justify-center gap-1 rounded-[14px] transition-all flex-shrink-0 active:scale-95"
      style={{
        minWidth: isMobile ? 52 : 64,
        padding: isMobile ? '6px 6px' : '8px 10px',
        border: 0,
        ...activeWash,
      }}
    >
      {Icon ? (
        <Icon size={isMobile ? 17 : 19} strokeWidth={1.7} color="currentColor" />
      ) : null}
      <span
        className="leading-none"
        style={{
          fontSize: isMobile ? 9 : 10,
          fontWeight: 550,
          letterSpacing: '0.02em',
          color: 'currentColor',
        }}
      >
        {item.label}
      </span>
    </button>
  );
}

export function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();
  const activePath = location.pathname;
  const [meerOpen, setMeerOpen] = useState(false);

  const meerActive = meerOpen || activePath === '/dax'
    || (!!meerNavActive(activePath));

  return (
    <div
      className="axe-bottomnav flex-shrink-0 w-full overflow-hidden"
      data-axe-doel="axe-bottom-nav"
      style={{
        position: 'relative',
        zIndex: 100,
        height: 'calc(72px + var(--axe-sab))',
        backgroundColor: 'var(--bg-base)',
        borderTop: '1px solid rgba(255,255,255,0.06)',
        paddingBottom: 'var(--axe-sab)',
        boxSizing: 'border-box',
      }}
    >
      <div
        className="flex items-center px-2 gap-1.5"
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
        <div className="flex items-center gap-1 sm:gap-1.5 justify-end flex-shrink-0">
          {(isMobile ? orderForMobile([...leftItems, ...rightItems]) : leftItems).map((item) => (
            <NavTile
              key={item.path}
              item={item}
              isActive={activePath === item.path || (item.path !== '/' && activePath.startsWith(item.path + '/'))}
              isMobile={isMobile}
              onClick={() => navigate(item.path)}
            />
          ))}
          {isMobile && (
            <NavTile
              item={MEER_ITEM}
              isActive={meerActive}
              isMobile={isMobile}
              onClick={() => setMeerOpen(true)}
            />
          )}
        </div>

        <div
          className="hidden sm:flex flex-shrink-0 w-24 h-full items-center justify-center"
          data-axe-doel="axe-voice-orb-anchor"
          style={{
            borderLeft: '1px solid rgba(255,255,255,0.05)',
            borderRight: '1px solid rgba(255,255,255,0.05)',
          }}
        >
          <AxeVoiceOrb />
        </div>

        <div className="flex items-center gap-1 sm:gap-1.5 justify-start flex-shrink-0">
          {(isMobile ? [] : rightItems).map((item) => (
            <NavTile
              key={item.path}
              item={item}
              isActive={activePath === item.path || (item.path !== '/' && activePath.startsWith(item.path + '/'))}
              isMobile={isMobile}
              onClick={() => navigate(item.path)}
            />
          ))}
          {!isMobile && (
            <NavTile
              item={MEER_ITEM}
              isActive={meerActive}
              isMobile={isMobile}
              onClick={() => setMeerOpen(true)}
            />
          )}
        </div>
      </div>

      {isMobile && (
        <>
          <div
            className="pointer-events-none absolute left-0 top-0"
            style={{ width: 20, height: 72, background: 'linear-gradient(to right, #000000, transparent)' }}
          />
          <div
            className="pointer-events-none absolute right-0 top-0"
            style={{ width: 20, height: 72, background: 'linear-gradient(to left, #000000, transparent)' }}
          />
        </>
      )}

      <MeerAppsSheet open={meerOpen} onClose={() => setMeerOpen(false)} />
    </div>
  );
}

/** Highlight Meer when the current route is only reachable via Meer. */
function meerNavActive(path: string): boolean {
  const primary = new Set([
    '/', '/northsea', '/trading', '/managers',
    '/tasks', '/code-editor', '/calendar', '/settings',
  ]);
  if (primary.has(path)) return false;
  // Deep primary children still count as primary.
  for (const p of primary) {
    if (p !== '/' && path.startsWith(`${p}/`)) return false;
  }
  return true;
}
