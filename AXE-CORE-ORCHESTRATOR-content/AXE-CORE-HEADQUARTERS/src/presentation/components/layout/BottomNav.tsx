import { useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { useIsMobile } from '@/presentation/hooks/use-mobile';
import {
  Home, Database, BookMarked, Cable, Network as Infra, Settings,
  Bot, Megaphone, CalendarDays, ListTodo, Wallet, Globe, Workflow, Table2, Clock,
  Sparkles, FileCode, LayoutGrid, Share2, Compass, Brain, LineChart, Lightbulb, type LucideIcon,
} from 'lucide-react';
import { findNavItemByPath } from '@/domain/navRegistry';
import { useVoiceStore, type VoiceStatus } from '@/presentation/store/voiceStore';

const navLabel = (path: string) => findNavItemByPath(path)?.label ?? path;

type NavItem = {
  icon?: LucideIcon;
  label: string;
  path: string;
};

const leftItems: NavItem[] = [
  { icon: Home, label: navLabel('/'), path: '/' },
  { icon: Lightbulb, label: navLabel('/thinkthanks'), path: '/thinkthanks' },
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
  { icon: Bot, label: navLabel('/agents'), path: '/agents' },
  { icon: Megaphone, label: navLabel('/crewai'), path: '/crewai' },
  { icon: CalendarDays, label: navLabel('/calendar'), path: '/calendar' },
  { icon: ListTodo, label: navLabel('/tasks'), path: '/tasks' },
  { icon: Wallet, label: navLabel('/finance'), path: '/finance' },
  { icon: LineChart, label: navLabel('/trading-intel'), path: '/trading-intel' },
  { icon: Globe, label: navLabel('/maps-3d'), path: '/maps-3d' },
  { icon: FileCode, label: navLabel('/code-editor'), path: '/code-editor' },
  { icon: Sparkles, label: navLabel('/eve'), path: '/eve' },
  { icon: Settings, label: navLabel('/settings'), path: '/settings' },
];

/**
 * What comes first on a phone.
 *
 * The strip holds 23 destinations and about seven fit on the Samsung, so
 * position is not decoration — it decides what exists. Browser sat at index
 * 13 (first of rightItems, behind all twelve on the left), which is why it
 * read as missing from the app entirely rather than as something to scroll
 * for. The fade hints added earlier say "there is more"; they cannot say
 * "the thing you wanted is eleven icons that way".
 *
 * Desktop is untouched — everything fits there, and the left/right split
 * around the voice orb is deliberate.
 */
const MOBILE_FIRST = ['/', '/browser', '/ai-core', '/thinkthanks', '/agents', '/tasks', '/trading-intel'];

function orderForMobile(items: NavItem[]): NavItem[] {
  const rank = (p: string) => {
    const i = MOBILE_FIRST.indexOf(p);
    return i === -1 ? MOBILE_FIRST.length : i;
  };
  // Stable: everything not promoted keeps the order it was written in.
  return [...items].sort((a, b) => rank(a.path) - rank(b.path));
}

/**
 * Hex on purpose, not tokens.
 *
 * These feed a <canvas>: the values are concatenated with hex alpha
 * (`color + 'cc'`) and handed to addColorStop/strokeStyle. 'var(--x)cc' is not
 * a colour — addColorStop throws on it outright, which took the whole app down
 * behind the error boundary, and strokeStyle would have failed silently.
 *
 * Canvas cannot resolve CSS variables. Anything that reaches a 2D context
 * stays a literal; the values mirror --accent-cyan / --success / --warning.
 */
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
  const size = isMobile ? 46 : 54;
  const iconPx = isMobile ? 22 : 26;
  const Icon = item.icon;

  // Same near-black as a card, so the nav does not end up being the brightest
  // surface on a matte screen — it was #0d0d0d, two steps lighter than
  // everything it sits under.
  const tileBg = 'var(--bg-elevated)';
  const tileBorder = isActive
    ? '1px solid rgba(34,211,238,0.35)'
    : '1px solid rgba(255,255,255,0.05)';
  // The active halo carried a second, purple light source alongside the cyan.
  // Nothing else in the app is purple, so it read as a stray glow rather than
  // as "this tab is selected".
  const tileShadow = isActive
    ? '0 0 18px rgba(34,211,238,0.28), inset 0 1px 0 rgba(255,255,255,0.04)'
    : '0 2px 6px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.03)';

  // Inactive was the LIGHTER cyan (#67e8f9 against #22d3ee), so every tab you
  // were not on glowed harder than the one you were. Selected keeps the accent;
  // the rest step back to muted text.
  const strokeColor = isActive ? 'var(--accent-cyan)' : 'var(--text-muted)';

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
      className="axe-bottomnav flex-shrink-0 w-full overflow-hidden"
      style={{
        // Explicitly stacked, because in normal flow this sat at level 0 and
        // any in-page overlay covered it. ChartToolsDrawer's invisible
        // full-viewport backdrop (z-60) swallowed every nav click, which is
        // why the Trading tab appeared to freeze and only unmounting the
        // drawer — by switching sub-tabs via Intel — freed the nav again.
        //
        // An earlier attempt lowered that backdrop from 10050 to 60 believing
        // the nav sat at 100. It does not: that referred to `footer.z-fixed`,
        // a different element, whose CSS rule only sets overflow. The nav had
        // no z-index at all, so the fix could not work.
        //
        // 100 keeps navigation above page content while staying below real
        // modals like ChartOrderConfirm (z-120), which should cover the nav.
        position: 'relative',
        zIndex: 100,
        height: 'calc(76px + env(safe-area-inset-bottom, 0px))',
        backgroundColor: 'var(--bg-base)',
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
          {(isMobile ? orderForMobile([...leftItems, ...rightItems]) : leftItems).map((item) => (
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
          <AxeVoiceOrb />
        </div>

        {/* Mobile renders one merged, re-ordered strip above, so this second
            group would repeat every destination. */}
        <div className="flex items-center gap-1.5 sm:gap-2 justify-start flex-shrink-0">
          {(isMobile ? [] : rightItems).map((item) => (
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

      {/* This row holds 23 destinations in a horizontally scrolling strip —
          on mobile only ~7 fit in view, and nothing about a plain edge said
          "there's more, swipe". These fades are the only signal; without them
          the row read as complete and the rest was simply invisible. */}
      {isMobile && (
        <>
          <div
            className="pointer-events-none absolute left-0 top-0"
            style={{ width: 20, height: 76, background: 'linear-gradient(to right, #000000, transparent)' }}
          />
          <div
            className="pointer-events-none absolute right-0 top-0"
            style={{ width: 20, height: 76, background: 'linear-gradient(to left, #000000, transparent)' }}
          />
        </>
      )}
    </div>
  );
}
