/**
 * MobileNav — lade van links, alleen op Android Tauri.
 *
 * Vervangt de desktop-onderbalk op de Samsung. Desktop ongewijzigd.
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useLocation } from 'react-router';
import {
  Home, Lightbulb, Brain, Database, Share2, BookMarked, Cable, Network,
  Workflow, Table2, Clock, Bot, Megaphone, CalendarDays, ListTodo, Wallet,
  LineChart, Globe, FileCode, Sparkles, Compass, Users, Terminal, Settings,
  Smartphone, Lock, LayoutGrid, TrendingUp, Menu, X, LogOut, type LucideIcon,
} from 'lucide-react';
import { getAllNavItems } from '@/domain/navRegistry';
import { useAuth } from '@/presentation/contexts/AuthContext';
import { vergrendel } from '@/domain/androidPin';

const ROUTE_ICON: Record<string, LucideIcon> = {
  '/': Home, '/thinkthanks': Lightbulb, '/ai-core': Brain, '/memory': Database,
  '/memory/trading': TrendingUp, '/obsidian': Share2, '/knowledge': BookMarked,
  '/mcp': Cable, '/infrastructure': Network, '/control-plane': Workflow,
  '/table-editor': Table2, '/cron-manager': Clock, '/agents': Bot,
  '/crewai': Megaphone, '/calendar': CalendarDays, '/tasks': ListTodo,
  '/finance': Wallet, '/trading': LineChart, '/trading-intel': LineChart,
  '/maps-3d': Globe, '/code-editor': FileCode, '/eve': Sparkles,
  '/browser': Compass, '/organization': Users, '/terminal': Terminal,
  '/developer': Terminal, '/settings': Settings, '/devices': Smartphone,
  '/lock': Lock, '/apps': LayoutGrid, '/ledger': BookMarked, '/terminals': Terminal,
};

const EERST = ['/devices', '/maps-3d', '/tasks', '/calendar', '/terminals', '/ai-core', '/browser'];

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { signOut } = useAuth();
  const startX = useRef<number | null>(null);
  const items = [...getAllNavItems()].sort((a, b) => {
    const ia = EERST.indexOf(a.path);
    const ib = EERST.indexOf(b.path);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });

  useEffect(() => {
    const onStart = (e: TouchEvent) => {
      const x = e.touches[0]?.clientX ?? 999;
      startX.current = x <= 24 ? x : null;
    };
    const onMove = (e: TouchEvent) => {
      if (startX.current == null) return;
      const dx = (e.touches[0]?.clientX ?? 0) - startX.current;
      if (dx > 40) { setOpen(true); startX.current = null; }
    };
    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: true });
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchmove', onMove);
    };
  }, []);

  const go = (path: string) => {
    navigate(path === '/' ? '/devices' : path);
    setOpen(false);
  };
  const isActive = (path: string) => {
    const here = location.pathname;
    if (path === '/' || path === '/devices') return here === '/devices' || here === '/';
    return here === path || here.startsWith(`${path}/`);
  };

  if (typeof document === 'undefined') return null;
  return createPortal(
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          className="fixed z-[70] flex size-9 items-center justify-center rounded-full active:scale-95"
          style={{
            top: 'calc(env(safe-area-inset-top, 0px) + 10px)',
            left: 12,
            background: 'var(--surface-bg, #12141a)',
            border: '1px solid var(--border-subtle, rgba(255,255,255,0.12))',
            color: 'var(--text-primary)',
          }}
        >
          <Menu size={16} />
        </button>
      )}
      <div
        onClick={() => setOpen(false)}
        aria-hidden
        className="fixed inset-0 z-[80] transition-opacity duration-200"
        style={{
          background: 'rgba(0,0,0,0.5)',
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
        }}
      />
      <div
        role="navigation"
        aria-label="AXE navigation"
        className="fixed left-0 top-0 z-[90] flex h-[100dvh] w-[82%] max-w-[320px] flex-col transition-transform duration-200 ease-out"
        style={{
          transform: open ? 'translateX(0)' : 'translateX(-100%)',
          background: '#0c0f15',
          borderRight: '1px solid var(--border-subtle, rgba(255,255,255,0.1))',
          boxShadow: '2px 0 24px rgba(0,0,0,0.45)',
          paddingTop: 'env(safe-area-inset-top, 0px)',
        }}
      >
        <div className="flex flex-none items-center justify-between px-4 pb-2 pt-4">
          <span className="flex items-center gap-2">
            <img src="/axe-logo.png" alt="" className="h-6 w-auto" />
            <span className="text-sm font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>AXE CORE</span>
          </span>
          <button type="button" onClick={() => setOpen(false)} aria-label="Close menu" className="flex size-8 items-center justify-center rounded-full" style={{ color: 'var(--text-muted)' }}>
            <X size={18} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
          {items.map((item) => {
            const Icon = ROUTE_ICON[item.path] ?? LayoutGrid;
            const active = isActive(item.path);
            return (
              <button
                key={item.path}
                type="button"
                onClick={() => go(item.path)}
                className="flex w-full items-center gap-3 rounded-[12px] px-3 py-2.5 text-left text-[13px] font-medium active:opacity-70"
                style={{ color: active ? 'var(--accent, #38bdf8)' : 'var(--text-primary)' }}
              >
                <Icon size={17} className="flex-none" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </div>
        <div className="flex-none border-t px-2 py-3" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
          <button
            type="button"
            onClick={() => { vergrendel(); setOpen(false); navigate('/lock'); }}
            className="flex w-full items-center gap-3 rounded-[12px] px-3 py-2.5 text-left text-[13px] font-medium"
            style={{ color: 'var(--text-primary)' }}
          >
            <Lock size={17} className="flex-none" />
            Lock
          </button>
          <button
            type="button"
            onClick={() => { vergrendel(); void signOut(); setOpen(false); }}
            className="flex w-full items-center gap-3 rounded-[12px] px-3 py-2.5 text-left text-[13px] font-medium"
            style={{ color: 'var(--text-primary)' }}
          >
            <LogOut size={17} className="flex-none" />
            Sign out
          </button>
        </div>
      </div>
    </>,
    document.body,
  );
}
