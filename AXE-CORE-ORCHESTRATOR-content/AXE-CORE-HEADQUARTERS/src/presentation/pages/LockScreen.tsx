/**
 * AXE lockscreen — glance-dashboard vóór de particle-PIN.
 *
 * Frosted blokken zweven op de plaat. Geen bollen. Kleur alleen in accent
 * (cyaan merkteken, groen/rood betekenis). Licht is dezelfde indeling in
 * grijs matglas, geen wit.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import {
  MessageSquare, Smartphone, Anchor, Users, LayoutGrid, ListChecks,
  CalendarDays, FileText, Monitor, Cloud, Server, Database, Hexagon,
  Radio, Bell, Mic,
} from 'lucide-react';
import { getAwarenessSnapshot, type AwarenessSnapshot } from '@/application/awareness/axeAwareness';
import { getSystemState, type ServiceState } from '@/application/system/systemService';
import { laadDevices } from '@/infrastructure/gateways/axeDeviceService';
import { isOnline, type AxeDevice } from '@/domain/axeDevices';
import { bewaarTerugPad, pinIsGezet } from '@/domain/androidPin';
import { LockChrome } from '@/presentation/components/android/LockChrome';
import { lockMateriaal } from '@/presentation/components/android/lockMateriaal';
import { MobileGlass } from '@/presentation/components/layout/MobileGlass';
import { useLook } from '@/presentation/hooks/useLook';
import { useAuth } from '@/presentation/contexts/AuthContext';

function useClock(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

const TIME_FMT = new Intl.DateTimeFormat('nl-NL', { hour: '2-digit', minute: '2-digit' });
const DATE_FMT = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: '2-digit', month: 'short' });

const MARKTEN = ['XAUUSD', 'US500', 'NAS100', 'BTCUSD'] as const;

const KERN: Array<{ keys: string[]; label: string; icoon: typeof Database }> = [
  { keys: ['axe_core_api'], label: 'AXE API', icoon: Radio },
  { keys: [], label: 'NorthSea', icoon: Anchor },
  { keys: ['supabase'], label: 'Database', icoon: Database },
  { keys: [], label: 'Caddy', icoon: Hexagon },
  { keys: ['terminal'], label: 'Workers', icoon: Server },
  { keys: ['mcp'], label: 'MCP', icoon: Hexagon },
];

const TEGELS: Array<{ pad: string; label: string; sub: string; icoon: typeof MessageSquare }> = [
  { pad: '/', label: 'AXE', sub: 'Ask or command', icoon: MessageSquare },
  { pad: '/devices', label: 'Device Manager', sub: 'Systems & services', icoon: Smartphone },
  { pad: '/maps-3d', label: 'NorthSea Desk', sub: 'Deals & Chase', icoon: Anchor },
  { pad: '/agents', label: 'Agents', sub: 'Crew & Tasks', icoon: Users },
  { pad: '/apps', label: 'Apps', sub: 'Open workspace', icoon: LayoutGrid },
  { pad: '/tasks', label: 'Tasks', sub: 'Active jobs', icoon: ListChecks },
  { pad: '/calendar', label: 'Calendar', sub: 'Today / Week', icoon: CalendarDays },
  { pad: '/memory', label: 'Notes', sub: 'Quick capture', icoon: FileText },
];

function voornaam(email: string | null | undefined): string {
  const local = (email ?? '').split('@')[0].toLowerCase();
  if (local.includes('luka')) return 'Luka';
  if (!local) return 'Luka';
  return local.charAt(0).toUpperCase() + local.slice(1);
}

function dienstStatus(rows: ServiceState[], keys: string[]): 'online' | 'offline' | 'unknown' {
  if (keys.length === 0) return 'unknown';
  const hit = rows.find((r) => keys.includes(r.service));
  if (!hit) return 'unknown';
  if (hit.status === 'online') return 'online';
  if (hit.status === 'unknown') return 'unknown';
  return 'offline';
}

function systeemIcoon(d: AxeDevice) {
  if (d.device_type === 'server') return Cloud;
  if (d.device_type === 'mobile') return Smartphone;
  return Monitor;
}

function kiesSystemen(devices: AxeDevice[]): AxeDevice[] {
  const voorkeur = ['mac mini', 'imac', 'vps'];
  const gekozen: AxeDevice[] = [];
  for (const naam of voorkeur) {
    const hit = devices.find((d) => d.device_name.toLowerCase().includes(naam) && !gekozen.includes(d));
    if (hit) gekozen.push(hit);
  }
  for (const d of devices) {
    if (gekozen.length >= 3) break;
    if (!gekozen.includes(d) && d.device_type !== 'mobile') gekozen.push(d);
  }
  return gekozen.slice(0, 3);
}

function Dot({ tone }: { tone: 'ok' | 'err' | 'muted' }) {
  const kleur = tone === 'ok' ? 'var(--success)' : tone === 'err' ? 'var(--error)' : 'var(--text-muted)';
  return <span className="inline-block size-1.5 rounded-full" style={{ background: kleur }} />;
}

function Kaart({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <section className={`axe-lock-kaart rounded-[20px] p-3.5 ${className}`.trim()}>
      {children}
    </section>
  );
}

export default function LockScreen() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [look] = useLook();
  const mat = lockMateriaal(look);
  const now = useClock();
  const [aware, setAware] = useState<AwarenessSnapshot | null>(null);
  const [diensten, setDiensten] = useState<ServiceState[]>([]);
  const [devices, setDevices] = useState<AxeDevice[]>([]);
  const [gezet, setGezet] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () => {
      void getAwarenessSnapshot().then((s) => { if (alive) setAware(s); }).catch(() => {});
      void getSystemState().then((s) => { if (alive) setDiensten(s); }).catch(() => {});
      void laadDevices().then((o) => { if (alive) setDevices(o.devices); }).catch(() => {});
    };
    load();
    const id = setInterval(load, 30_000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  useEffect(() => {
    let alive = true;
    void pinIsGezet()
      .then((v) => { if (alive) setGezet(v); })
      .catch(() => { if (alive) setGezet(true); });
    return () => { alive = false; };
  }, []);

  const naarPin = (pad = '/') => {
    bewaarTerugPad(pad);
    navigate('/lock/pin');
  };

  const systemen = kiesSystemen(devices);
  const onlineN = systemen.filter((d) => isOnline(d.last_seen)).length;
  const kern = KERN.map((k) => ({ ...k, status: dienstStatus(diensten, k.keys) }));
  const kernOk = kern.filter((k) => k.status === 'online').length;
  const alerts = aware?.alerts ?? [];
  const aandacht = [
    ...alerts,
    ...(aware?.nextItem && !alerts.includes(aware.nextItem) ? [aware.nextItem] : []),
  ].slice(0, 3);

  return (
    <div className="relative flex h-full min-h-0 w-full flex-col overflow-hidden">
      <MobileGlass />
      <div
        className="relative z-[1] mx-auto flex h-full w-full max-w-md flex-col px-4"
        style={{
          paddingTop: 'max(10px, env(safe-area-inset-top))',
          paddingBottom: 'max(10px, env(safe-area-inset-bottom))',
        }}
      >
        <LockChrome />

        <div className="mt-3 min-h-0 flex-1 overflow-y-auto pb-2" style={{ scrollbarWidth: 'none' }}>
          <div className="flex items-end justify-between gap-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: mat.gedempt }}>
                {DATE_FMT.format(now)}
              </div>
              <div className="mt-1 text-[56px] font-semibold leading-none tracking-tight tabular-nums" style={{ color: mat.tekst }}>
                {TIME_FMT.format(now)}
              </div>
              <div className="mt-2 text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: mat.gedempt }}>
                Discipline compounds
              </div>
            </div>
            <div className="mb-1 text-right">
              <div className="inline-flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--success)' }}>
                <Dot tone="ok" />
                I'm right here, {voornaam(user?.email)}
              </div>
              <div className="mt-1.5 text-[9px] uppercase tracking-[0.16em]" style={{ color: mat.gedempt }}>
                Plan · Execute · Evolve
              </div>
            </div>
          </div>

          <Kaart className="mt-4">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: 'var(--text-muted)' }}>
              Markets
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {MARKTEN.map((sym) => (
                <div key={sym} className="axe-lock-binnen rounded-[12px] px-1.5 py-2">
                  <div className="text-[9px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>{sym}</div>
                  <div className="mt-1 text-[13px] font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>—</div>
                </div>
              ))}
            </div>
          </Kaart>

          <Kaart className="mt-2.5">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: 'var(--text-muted)' }}>Your systems</span>
              <span className="text-[10px] font-semibold" style={{ color: 'var(--success)' }}>
                {systemen.length ? `${onlineN}/${systemen.length} online` : '—'}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {(systemen.length ? systemen : [null, null, null]).map((d, i) => {
                const Ico = d ? systeemIcoon(d) : Monitor;
                const on = d ? isOnline(d.last_seen) : false;
                return (
                  <div key={d?.device_id ?? i} className="axe-lock-binnen rounded-[12px] px-2 py-2">
                    <div className="flex items-center gap-1.5">
                      <Ico size={13} style={{ color: 'var(--text-muted)' }} />
                      <span className="truncate text-[11px] font-medium" style={{ color: 'var(--text-primary)' }}>
                        {d?.device_name ?? '—'}
                      </span>
                    </div>
                    <div className="mt-1.5 text-[10px] font-semibold" style={{ color: d ? (on ? 'var(--success)' : 'var(--error)') : 'var(--text-muted)' }}>
                      {d ? (on ? 'Online' : 'Offline') : '—'}
                    </div>
                  </div>
                );
              })}
            </div>
          </Kaart>

          <Kaart className="mt-2.5">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: 'var(--text-muted)' }}>Core services</span>
              <span className="text-[10px] font-semibold" style={{ color: kernOk ? 'var(--success)' : 'var(--text-muted)' }}>
                {kernOk}/{kern.length} healthy
              </span>
            </div>
            <div className="grid grid-cols-6 gap-1">
              {kern.map((k) => {
                const Ico = k.icoon;
                const tone = k.status === 'online' ? 'ok' : k.status === 'offline' ? 'err' : 'muted';
                return (
                  <div key={k.label} className="axe-lock-binnen flex flex-col items-center gap-1 rounded-[12px] px-1 py-2">
                    <Dot tone={tone} />
                    <Ico size={14} style={{ color: 'var(--text-muted)' }} />
                    <span className="text-center text-[8px] leading-tight" style={{ color: 'var(--text-muted)' }}>{k.label}</span>
                  </div>
                );
              })}
            </div>
          </Kaart>

          <Kaart className="mt-2.5">
            <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: aandacht.length ? 'var(--error)' : 'var(--text-muted)' }}>
              <Bell size={12} />
              Attention {aware ? `(${aandacht.length})` : ''}
            </div>
            {aandacht.length === 0 ? (
              <div className="text-[12px]" style={{ color: 'var(--success)' }}>All quiet</div>
            ) : (
              <div className="space-y-1.5">
                {aandacht.map((a) => (
                  <div key={a} className="axe-lock-binnen rounded-[12px] px-2.5 py-2 text-[12px] leading-snug" style={{ color: 'var(--text-primary)' }}>
                    {a}
                  </div>
                ))}
              </div>
            )}
          </Kaart>

          <div className="mt-2.5 grid grid-cols-4 gap-2">
            {TEGELS.map((t) => {
              const Ico = t.icoon;
              return (
                <button
                  key={t.pad}
                  type="button"
                  onClick={() => naarPin(t.pad)}
                  className="axe-lock-kaart flex flex-col items-start rounded-[16px] px-2.5 py-2.5 text-left"
                >
                  <Ico size={15} style={{ color: 'var(--accent)' }} />
                  <span className="mt-2 text-[11px] font-semibold leading-tight" style={{ color: 'var(--text-primary)' }}>{t.label}</span>
                  <span className="mt-0.5 text-[9px] leading-tight" style={{ color: 'var(--text-muted)' }}>{t.sub}</span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => naarPin('/')}
            className="axe-lock-kaart mt-3 flex w-full items-center gap-2 rounded-full px-3.5 py-2.5"
          >
            <Mic size={14} style={{ color: 'var(--accent)' }} />
            <span className="flex-1 text-left text-[12px]" style={{ color: 'var(--text-muted)' }}>Ask AXE anything…</span>
          </button>
        </div>

        <button
          type="button"
          onClick={() => naarPin('/')}
          className="py-2.5 text-[12px] font-semibold tracking-[0.14em]"
          style={{ color: mat.gedempt }}
        >
          {gezet === false ? '^  SWIPE UP TO SET CODE' : '^  SWIPE UP TO UNLOCK'}
        </button>
      </div>
    </div>
  );
}
