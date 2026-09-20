/**
 * AXE lockscreen — Samsung, na inloggen, vóór de particle-gesture PIN.
 *
 * Donkere glasplaat (zelfde ruit als de Tauri-schil) met blokken van wat
 * je snel moet zien. Swipe omhoog opent het particle-veld.
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { getAwarenessSnapshot, type AwarenessSnapshot } from '@/application/awareness/axeAwareness';
import { LockChrome } from '@/presentation/components/android/LockChrome';
import { MobileGlass } from '@/presentation/components/layout/MobileGlass';
import { useLook } from '@/presentation/hooks/useLook';
import { pinIsGezet } from '@/domain/androidPin';

function useClock(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

const TIME_FMT = new Intl.DateTimeFormat('nl-NL', { hour: '2-digit', minute: '2-digit' });
const DATE_FMT = new Intl.DateTimeFormat('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' });

const PLAAT = {
  background: 'linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0) 22%), rgba(10,11,14,0.55)',
  backdropFilter: 'blur(28px) saturate(140%)',
  WebkitBackdropFilter: 'blur(28px) saturate(140%)',
  border: '1px solid rgba(255,255,255,0.08)',
  boxShadow: '0 1px 0 rgba(255,255,255,0.10) inset, 0 24px 60px rgba(0,0,0,0.35)',
} as const;

const BLOK = {
  background: 'rgba(255,255,255,0.045)',
  border: '1px solid rgba(255,255,255,0.06)',
} as const;

const SFEREN: Array<{ size: number; top: string; left?: string; right?: string; opacity: number }> = [
  { size: 220, top: '6%', left: '-22%', opacity: 0.55 },
  { size: 190, top: '12%', right: '-18%', opacity: 0.42 },
  { size: 140, top: '58%', left: '-16%', opacity: 0.38 },
  { size: 170, top: '62%', right: '-20%', opacity: 0.48 },
  { size: 90, top: '78%', left: '18%', opacity: 0.32 },
  { size: 70, top: '8%', right: '22%', opacity: 0.28 },
];

function LockSpheres({ licht }: { licht: boolean }) {
  const tint = licht ? '210, 218, 228' : '28, 30, 36';
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {SFEREN.map((s, i) => (
        <span
          key={i}
          style={{
            position: 'absolute',
            top: s.top,
            left: s.left,
            right: s.right,
            width: s.size,
            height: s.size,
            borderRadius: '50%',
            opacity: s.opacity,
            background: `radial-gradient(circle at 32% 28%, rgba(${tint},0.95), rgba(${tint},0.35) 42%, rgba(${tint},0) 70%)`,
            filter: 'blur(2px)',
          }}
        />
      ))}
    </div>
  );
}

function Blok({
  waarde,
  label,
  kleur,
}: {
  waarde: string;
  label: string;
  kleur?: string;
}) {
  return (
    <div className="rounded-[16px] px-3 py-3" style={BLOK}>
      <div className="text-[22px] font-semibold tabular-nums leading-none" style={{ color: kleur ?? 'var(--text-primary)' }}>
        {waarde}
      </div>
      <div className="mt-1.5 text-[11px] uppercase tracking-[0.08em]" style={{ color: 'var(--text-muted)' }}>
        {label}
      </div>
    </div>
  );
}

export default function LockScreen() {
  const navigate = useNavigate();
  const [look] = useLook();
  const now = useClock();
  const [aware, setAware] = useState<AwarenessSnapshot | null>(null);
  const [gezet, setGezet] = useState<boolean | null>(null);
  const glas = look === 'glass';

  useEffect(() => {
    let alive = true;
    const load = () => {
      void getAwarenessSnapshot().then((s) => { if (alive) setAware(s); }).catch(() => {});
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

  const waiting = (aware?.openTasks ?? 0) + (aware?.followUps ?? 0);
  const allClear = aware != null && waiting === 0 && (aware.overdueTasks ?? 0) === 0;
  const overdue = aware?.overdueTasks ?? 0;

  const openPin = () => navigate('/lock/pin');
  const startY = useRef<number | null>(null);

  return (
    <div
      className="relative flex h-full min-h-0 w-full flex-col overflow-hidden"
      onPointerDown={(e) => { startY.current = e.clientY; }}
      onPointerUp={(e) => {
        if (startY.current != null && startY.current - e.clientY > 56) openPin();
        startY.current = null;
      }}
      onPointerCancel={() => { startY.current = null; }}
    >
      <MobileGlass />
      <LockSpheres licht={glas} />
      <div
        className="relative z-[1] mx-auto flex h-full w-full max-w-md flex-col px-4"
        style={{
          paddingTop: 'max(12px, env(safe-area-inset-top))',
          paddingBottom: 'max(16px, env(safe-area-inset-bottom))',
        }}
      >
        <LockChrome />

        <button
          type="button"
          onClick={openPin}
          className="mt-4 flex min-h-0 flex-1 flex-col overflow-hidden rounded-[28px] p-5 text-left"
          style={PLAAT}
          aria-label={gezet === false ? 'Swipe up to set your particle code' : 'Swipe up to unlock AXE'}
        >
          <div className="text-6xl font-semibold tabular-nums leading-none tracking-tight" style={{ color: 'var(--text-primary)' }}>
            {TIME_FMT.format(now)}
          </div>
          <div className="mt-2 text-sm capitalize" style={{ color: 'var(--text-muted)' }}>
            {DATE_FMT.format(now)}
          </div>

          <div className="mt-6 grid grid-cols-2 gap-2.5">
            <Blok waarde={aware ? String(aware.openTasks) : '—'} label="Open" />
            <Blok
              waarde={aware ? String(overdue) : '—'}
              label="Overdue"
              kleur={overdue > 0 ? 'var(--warning)' : undefined}
            />
            <Blok waarde={aware ? String(aware.followUps) : '—'} label="Follow-ups" />
            <Blok
              waarde={aware ? String(aware.alerts.length) : '—'}
              label="Alerts"
              kleur={allClear ? 'var(--success)' : overdue > 0 ? 'var(--warning)' : undefined}
            />
          </div>

          <div className="mt-3 rounded-[16px] px-3 py-3" style={BLOK}>
            <div className="text-[11px] uppercase tracking-[0.08em]" style={{ color: 'var(--text-muted)' }}>
              Next
            </div>
            <div className="mt-1.5 text-sm leading-snug" style={{ color: 'var(--text-primary)' }}>
              {aware?.nextItem ?? (allClear ? 'Nothing waiting' : (aware?.alerts?.[0] ?? '—'))}
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={openPin}
          className="mb-1 py-3 text-[13px] font-semibold tracking-[0.14em]"
          style={{ color: 'var(--text-muted)' }}
        >
          {gezet === false ? '^  SWIPE UP TO SET CODE' : '^  SWIPE UP TO UNLOCK'}
        </button>
      </div>
    </div>
  );
}
