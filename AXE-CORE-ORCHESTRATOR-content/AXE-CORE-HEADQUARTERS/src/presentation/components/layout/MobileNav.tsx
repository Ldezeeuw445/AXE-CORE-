/**
 * MobileNav — de navigatie voor de telefoon, als lade van links.
 *
 * Op de Samsung nam de vaste onderbalk hoogte in en toonde dezelfde tabs die
 * ook al in de app-grid stonden: dubbel, en het kostte ruimte die de composer
 * en de inhoud beter kunnen gebruiken. Dit vervangt die balk door één lade die
 * van links over de volle hoogte inschuift — dicht als je hem niet nodig hebt,
 * open met de knop of een veeg vanaf de linkerrand.
 *
 * De lade zelf is donker glas (net als de Sidebar op de desktop): in beide
 * standen hetzelfde materiaal, lichte inkt. Alleen de plaat eronder wisselt.
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useLocation } from 'react-router';
import {
  Home, Lightbulb, Brain, Database, Share2, BookMarked, Cable, Network,
  Workflow, Table2, Clock, Bot, Megaphone, CalendarDays, ListTodo, Wallet,
  LineChart, Globe, FileCode, Sparkles, Compass, Users, Terminal, Settings,
  Smartphone, Lock, LayoutGrid, TrendingUp, Menu, X, type LucideIcon,
} from 'lucide-react';
import { BOTTOM_NAV_ITEMS } from '@/presentation/components/layout/BottomNav';
import { setMobileWallpaper } from '@/presentation/hooks/useWallpaper';
import { Image as ImageIcon } from 'lucide-react';

const ROUTE_ICON: Record<string, LucideIcon> = {
  '/': Home, '/thinkthanks': Lightbulb, '/ai-core': Brain, '/memory': Database,
  '/memory/trading': TrendingUp, '/obsidian': Share2, '/knowledge': BookMarked,
  '/mcp': Cable, '/infrastructure': Network, '/control-plane': Workflow,
  '/table-editor': Table2, '/cron-manager': Clock, '/agents': Bot,
  '/crewai': Megaphone, '/calendar': CalendarDays, '/tasks': ListTodo,
  '/finance': Wallet, '/trading': LineChart, '/trading-intel': LineChart,
  '/maps-3d': Globe, '/code-editor': FileCode, '/eve': Sparkles,
  '/browser': Compass, '/organization': Users, '/terminal': Terminal,
  '/developer': Terminal, '/settings': Settings, '/device': Smartphone, '/lock': Lock,
};

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const items = BOTTOM_NAV_ITEMS;
  const startX = useRef<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const onPickWallpaper = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => { if (typeof r.result === 'string') setMobileWallpaper(r.result); };
    r.readAsDataURL(f);
    e.target.value = '';
  };

  // Veeg vanaf de linkerrand opent de lade. Sluiten gebeurt in go()/backdrop/X,
  // dus geen effect dat op de route reageert (dat zou set-state-in-effect zijn).
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

  // Home is `/` — de échte glasplaat-home (sphere + AXE CORE-composer), net als
  // de Tauri-app. (Vroeger stuurde dit naar `/mobile`, maar dat is nu de aparte
  // Device Manager; Home hoort gewoon Home te zijn.)
  const go = (path: string) => { navigate(path); setOpen(false); };
  const isActive = (path: string) => {
    const here = location.pathname;
    if (path === '/') return here === '/';
    return here === path || here.startsWith(path);
  };

  if (typeof document === 'undefined') return null;
  // Portal naar body: buiten .axe-shell, dus de shell-regel die elke directe
  // div op transparant zet (panelen laten zweven op de plaat) raakt de lade en
  // de verduistering niet. Een overlay hoort sowieso in een portal.
  return createPortal(
    <>
      {/* Openknop — klein, linksboven, met veilige marge. Verborgen als open. */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Menu openen"
          className="fixed z-[70] flex size-9 items-center justify-center rounded-full active:scale-95"
          style={{
            // Op de glasplaat-home netjes binnen de rand, precies zoals de
            // licht/donker-knop rechtsboven (AppShell): zelfde hoogte, zelfde
            // marge. Buiten de home in de schermhoek.
            top: location.pathname === '/'
              ? 'calc(env(safe-area-inset-top, 0px) + 22px)'
              : 'calc(env(safe-area-inset-top, 0px) + 10px)',
            left: location.pathname === '/' ? 24 : 12,
            background: 'var(--surface-bg)',
            border: '1px solid var(--border-subtle)',
            color: 'var(--text-primary)',
          }}
        >
          <Menu size={16} />
        </button>
      )}

      {/* Verduistering achter de lade */}
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

      {/* De lade zelf. Bewust een <div role="navigation"> en geen <nav>: de
          shell-stijl (axe-look.css) dwingt `:root[data-look] .axe-shell nav`
          op transparant met !important — bedoeld voor de desktop-balken — en
          dat zou de inhoud er weer doorheen laten schemeren. */}
      <div
        role="navigation"
        aria-label="AXE navigatie"
        className="fixed left-0 top-0 z-[90] flex h-[100dvh] w-[82%] max-w-[320px] flex-col transition-transform duration-200 ease-out"
        style={{
          transform: open ? 'translateX(0)' : 'translateX(-100%)',
          // Dekkend, niet de translucente --surface-bg: een lade waar de inhoud
          // doorheen schemert is onleesbaar. Donker in beide standen, zoals de
          // Sidebar op de desktop — alleen de plaat eronder wisselt van kleur.
          background: '#0c0f15',
          borderRight: '1px solid var(--border-subtle)',
          boxShadow: '2px 0 24px rgba(0,0,0,0.45)',
          paddingTop: 'env(safe-area-inset-top, 0px)',
        }}
      >
        <div className="flex flex-none items-center justify-between px-4 pb-2 pt-4">
          <span className="text-sm font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>AXE CORE</span>
          <button type="button" onClick={() => setOpen(false)} aria-label="Menu sluiten" className="flex size-8 items-center justify-center rounded-full" style={{ color: 'var(--text-muted)' }}>
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
        {/* Voettekst: wallpaper kiezen. Op de telefoon opent dit je fotobibliotheek. */}
        <div className="flex-none border-t px-2 py-3" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPickWallpaper} />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex w-full items-center gap-3 rounded-[12px] px-3 py-2.5 text-left text-[13px] font-medium active:opacity-70"
            style={{ color: 'var(--text-primary)' }}
          >
            <ImageIcon size={17} className="flex-none" />
            <span>Wallpaper wijzigen</span>
          </button>
        </div>
      </div>
    </>,
    document.body,
  );
}
