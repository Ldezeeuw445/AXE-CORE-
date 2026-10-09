/**
 * MobileNav — the phone's command menu, as a drawer from the left.
 *
 * Open only with the hamburger: edge swipes belong to the two operational AXE side
 * drawers (Tools left, Status right), so one gesture never opens two drawers.
 *
 * What is in it, top to bottom: a search box (matches the words the nav registry knows
 * for each tab), your pinned favourites in the order you set, every tab grouped by what
 * it is for, and below, the two things you can actually change about this phone:
 * Appearance (dark/light, wallpaper, glass) and Phone (what the lock screen shows).
 * Grouping, search and pinning are rules in `domain/mobileMenu.ts`, tested there.
 *
 * The drawer itself is dark glass in both modes, like the desktop Sidebar; only the
 * plate underneath changes.
 */
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useLocation } from 'react-router';
import {
  Home, Lightbulb, Brain, Database, Share2, BookMarked, Cable, Network,
  Workflow, Table2, Clock, Bot, Megaphone, CalendarDays, ListTodo, Wallet,
  LineChart, Globe, FileCode, Sparkles, Compass, Users, Terminal, Settings,
  Smartphone, Lock, LayoutGrid, TrendingUp, Menu, X, Search, Star, ChevronUp, ChevronDown,
  Palette, MonitorSmartphone, BookOpenCheck, type LucideIcon,
} from 'lucide-react';
import { getAllNavItems } from '@/domain/navRegistry';
import { useUIStore } from '@/presentation/store/uiStore';
import {
  groupMenu, searchMenu, menuTarget, toggleFavourite, moveFavourite, parseFavourites,
  type MenuItem,
} from '@/domain/mobileMenu';
import { AppearanceSheet, PhoneSheet } from './MobileMenuSheets';
import {
  phoneSettingsAvailable, nativeTabsAvailable, selectNativeTab, NATIVE_TABS,
} from '@/infrastructure/gateways/androidPhoneBridge';

const ROUTE_ICON: Record<string, LucideIcon> = {
  '/': Home, '/thinkthanks': Lightbulb, '/ai-core': Brain, '/memory': Database,
  '/memory/trading': TrendingUp, '/obsidian': Share2, '/knowledge': BookMarked,
  '/mcp': Cable, '/infrastructure': Network, '/control-plane': Workflow,
  '/table-editor': Table2, '/cron-manager': Clock, '/agents': Bot,
  '/crewai': Megaphone, '/calendar': CalendarDays, '/tasks': ListTodo,
  '/finance': Wallet, '/trading': LineChart, '/trading-intel': LineChart,
  '/maps-3d': Globe, '/code-editor': FileCode, '/eve': Sparkles,
  '/browser': Compass, '/organization': Users, '/terminal': Terminal, '/terminals': Terminal,
  '/developer': Terminal, '/settings': Settings, '/device': Smartphone, '/lock': Lock,
  '/ledger': BookOpenCheck,
};

const FAV_KEY = 'axe_menu_favourites';

function readFavs(): string[] {
  try { return parseFavourites(localStorage.getItem(FAV_KEY)); } catch { return parseFavourites(null); }
}
function writeFavs(f: string[]) {
  try { localStorage.setItem(FAV_KEY, JSON.stringify(f)); } catch { /* private mode: lives for this session */ }
}

interface RowProps {
  item: MenuItem;
  fav?: boolean;
  favs: string[];
  editing: boolean;
  active: boolean;
  onGo: (path: string) => void;
  onFavs: (next: string[]) => void;
}

function MenuRow({ item, fav, favs, editing, active, onGo, onFavs }: RowProps) {
  const Icon = ROUTE_ICON[item.path] ?? LayoutGrid;
  const pinned = favs.includes(item.path);
  const index = favs.indexOf(item.path);
  return (
    <div className="flex items-center">
      <button
        type="button"
        onClick={() => onGo(item.path)}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-[12px] px-2.5 py-2 text-left text-[13px] font-medium active:opacity-70"
        style={{ color: active ? '#67E8F9' : '#E5E7EB', fontWeight: active ? 650 : 500, background: active ? 'rgba(255,255,255,.07)' : undefined }}
      >
        <span
          className="flex size-[30px] flex-none items-center justify-center rounded-[9px]"
          style={{ background: active ? 'rgba(255,255,255,.12)' : 'rgba(255,255,255,.06)' }}
        >
          <Icon size={16} />
        </span>
        <span className="truncate">{item.label}</span>
      </button>
      {fav && editing ? (
        <span className="flex flex-none items-center">
          <button type="button" aria-label={`Move ${item.label} up`} disabled={index <= 0}
            onClick={() => onFavs(moveFavourite(favs, item.path, -1))} className="p-2 disabled:opacity-25" style={{ color: '#9CA3AF' }}>
            <ChevronUp size={16} />
          </button>
          <button type="button" aria-label={`Move ${item.label} down`} disabled={index >= favs.length - 1}
            onClick={() => onFavs(moveFavourite(favs, item.path, +1))} className="p-2 disabled:opacity-25" style={{ color: '#9CA3AF' }}>
            <ChevronDown size={16} />
          </button>
        </span>
      ) : (
        <button
          type="button"
          aria-label={pinned ? `Unpin ${item.label}` : `Pin ${item.label}`}
          aria-pressed={pinned}
          onClick={() => onFavs(toggleFavourite(favs, item.path))}
          className="flex-none p-2.5"
          style={{ color: pinned ? '#FBBF24' : '#4B5563' }}
        >
          <Star size={14} fill={pinned ? 'currentColor' : 'none'} />
        </button>
      )}
    </div>
  );
}

function GroupTitle({ children, action }: { children: string; action?: React.ReactNode }) {
  return (
    <div className="mb-1 mt-4 flex items-center justify-between px-2.5">
      <span className="text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: '#6B7280' }}>{children}</span>
      {action}
    </div>
  );
}

export function MobileNav() {
  const open = useUIStore(s => s.mobileNavOpen);
  const setOpen = useUIStore(s => s.setMobileNavOpen);
  const navigate = useNavigate();
  const location = useLocation();
  const items: MenuItem[] = getAllNavItems();
  const opPlaat = !['/lock', '/maps-3d'].includes(location.pathname);

  const [query, setQuery] = useState('');
  const [favs, setFavs] = useState<string[]>(readFavs);
  const [editing, setEditing] = useState(false);
  const [sheet, setSheet] = useState<null | 'appearance' | 'phone'>(null);

  const updateFavs = (next: string[]) => { setFavs(next); writeFavs(next); };

  // The Android shell's Apps surface is native and has no menu of its own: its hamburger opens
  // Home and asks this one to open (event `axe-open-menu`, sent once `__axeMenuReady` is true).
  useEffect(() => {
    const openIt = () => setOpen(true);
    window.addEventListener('axe-open-menu', openIt);
    (window as unknown as { __axeMenuReady?: boolean }).__axeMenuReady = true;
    return () => window.removeEventListener('axe-open-menu', openIt);
  }, [setOpen]);

  // Home (`/`) is empty on a phone: the real home is `/mobile`.
  const go = (path: string) => { navigate(menuTarget(path)); setOpen(false); setQuery(''); };
  const isActive = (path: string) => {
    const here = location.pathname;
    if (path === '/') return here === '/mobile' || here === '/';
    return here === path || here.startsWith(path + '/') || here === path;
  };

  const searching = query.trim().length > 0;
  const results = useMemo(() => searchMenu(items, query), [items, query]);
  const grouped = useMemo(() => groupMenu(items, favs), [items, favs]);

  if (typeof document === 'undefined') return null;

  const rowProps = (i: MenuItem) => ({
    favs, editing, active: isActive(i.path), onGo: go, onFavs: updateFavs,
  });

  return createPortal(
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Menu openen"
          className="axe-mobile-nav-trigger fixed z-[70] flex size-9 items-center justify-center rounded-full active:scale-95"
          style={{
            top: opPlaat
              ? 'calc(var(--axe-sat) + var(--axe-plaat-boven, 2px) + 10px)'
              : 'calc(var(--axe-sat) + 10px)',
            left: opPlaat ? 18 : 12,
            background: 'linear-gradient(180deg, rgba(20,20,24,.99), rgba(8,8,10,.995))',
            border: '1px solid rgba(255,255,255,.09)',
            color: '#EEF3FA',
            boxShadow: '0 10px 26px rgba(0,0,0,.32), inset 0 1px 0 rgba(255,255,255,.05)',
          }}
        >
          <Menu size={16} />
        </button>
      )}

      <div
        onClick={() => setOpen(false)}
        aria-hidden
        className="fixed inset-0 z-[80] transition-opacity duration-200"
        style={{ background: 'rgba(0,0,0,0.5)', opacity: open ? 1 : 0, pointerEvents: open ? 'auto' : 'none' }}
      />

      {/* A <div role="navigation">, not a <nav>: the shell stylesheet forces every `nav`
          inside .axe-shell transparent with !important, which would let the content show
          through the drawer. `inset-y-0` and not a `100dvh` height: this WebView once
          resolved every viewport-height unit to 0 and the drawer opened empty. */}
      <div
        role="navigation"
        aria-label="AXE navigatie"
        className="fixed inset-y-0 left-0 z-[90] flex w-[84%] max-w-[330px] flex-col transition-transform duration-200 ease-out"
        style={{
          transform: open ? 'translateX(0)' : 'translateX(-100%)',
          background: 'linear-gradient(180deg, #11131a 0%, #0a0c11 100%)',
          borderRight: '1px solid rgba(255,255,255,.08)',
          boxShadow: '2px 0 24px rgba(0,0,0,0.45)',
          paddingTop: 'var(--axe-sat)',
        }}
      >
        <div className="flex flex-none items-center justify-between px-4 pb-2 pt-4">
          <span className="text-[15px] font-semibold tracking-tight" style={{ color: '#EEF3FA' }}>AXE CORE</span>
          <button type="button" onClick={() => setOpen(false)} aria-label="Menu sluiten" className="flex size-8 items-center justify-center rounded-full" style={{ color: '#9CA3AF', background: 'rgba(255,255,255,.06)' }}>
            <X size={17} />
          </button>
        </div>

        <div className="flex-none px-3 pb-1">
          <label
            className="flex items-center gap-2 rounded-[13px] px-3 py-2"
            style={{ background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.07)' }}
          >
            <Search size={15} style={{ color: '#6B7280' }} />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search tabs…"
              aria-label="Search tabs"
              className="min-w-0 flex-1 bg-transparent text-[13px] outline-none"
              style={{ color: '#EEF3FA' }}
            />
            {searching && (
              <button type="button" onClick={() => setQuery('')} aria-label="Clear search" style={{ color: '#6B7280' }}><X size={14} /></button>
            )}
          </label>
        </div>

        {/* The Android shell has no bottom bar any more: the tabs it used to hold are here. */}
        {nativeTabsAvailable() && !searching && (
          <div className="flex flex-none flex-wrap gap-1.5 px-3 pb-2 pt-1" role="group" aria-label="Phone tabs">
            {NATIVE_TABS.map(t => (
              <button
                key={t.id} type="button"
                onClick={() => { selectNativeTab(t.id); setOpen(false); }}
                className="rounded-[11px] px-3 py-1.5 text-[12px] font-medium active:opacity-70"
                style={{ background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.08)', color: '#EEF3FA' }}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
          {searching ? (
            <>
              <GroupTitle>{`${results.length} found`}</GroupTitle>
              {results.map(i => <MenuRow key={i.path} item={i} {...rowProps(i)} />)}
              {results.length === 0 && (
                <div className="px-3 py-6 text-center text-[12px]" style={{ color: '#6B7280' }}>Nothing matches “{query}”.</div>
              )}
            </>
          ) : (
            <>
              {grouped.favourites.length > 0 && (
                <>
                  <GroupTitle
                    action={
                      <button type="button" onClick={() => setEditing(e => !e)} className="text-[11px] font-medium" style={{ color: '#22D3EE' }}>
                        {editing ? 'Done' : 'Reorder'}
                      </button>
                    }
                  >Favourites</GroupTitle>
                  {grouped.favourites.map(i => <MenuRow key={`f${i.path}`} item={i} fav {...rowProps(i)} />)}
                </>
              )}
              {grouped.groups.map(g => (
                <div key={g.id}>
                  <GroupTitle>{g.title}</GroupTitle>
                  {g.items.map(i => <MenuRow key={i.path} item={i} {...rowProps(i)} />)}
                </div>
              ))}
              {grouped.favourites.length === 0 && (
                <div className="mt-4 px-3 text-[11px] leading-snug" style={{ color: '#6B7280' }}>
                  Tap the star next to a tab to keep it at the top.
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex-none border-t px-3 py-3" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
          <div className={`grid gap-2 ${phoneSettingsAvailable() ? 'grid-cols-2' : 'grid-cols-1'}`}>
            <button
              type="button" onClick={() => { setSheet('appearance'); setOpen(false); }}
              className="flex items-center justify-center gap-2 rounded-[13px] py-2.5 text-[13px] font-medium active:opacity-70"
              style={{ background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.08)', color: '#EEF3FA' }}
            >
              <Palette size={15} /> Appearance
            </button>
            {phoneSettingsAvailable() && (
              <button
                type="button" onClick={() => { setSheet('phone'); setOpen(false); }}
                className="flex items-center justify-center gap-2 rounded-[13px] py-2.5 text-[13px] font-medium active:opacity-70"
                style={{ background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.08)', color: '#EEF3FA' }}
              >
                <MonitorSmartphone size={15} /> Phone
              </button>
            )}
          </div>
        </div>
      </div>

      {sheet === 'appearance' && <AppearanceSheet onClose={() => setSheet(null)} />}
      {sheet === 'phone' && (
        <PhoneSheet
          onClose={() => setSheet(null)}
          onOpenDevice={() => { navigate('/device'); setOpen(false); }}
        />
      )}
    </>,
    document.body,
  );
}
