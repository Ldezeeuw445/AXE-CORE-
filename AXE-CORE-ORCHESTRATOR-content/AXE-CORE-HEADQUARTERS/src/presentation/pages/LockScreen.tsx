/**
 * AXE lockscreen — Samsung, na inloggen, vóór de particle-gesture PIN.
 *
 * Glasplaat + echte glance. Swipe omhoog opent het particle-veld
 * (AxeLockLanding: "SWIPE UP TO UNLOCK").
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Clock, ListChecks, CheckCircle2 } from 'lucide-react';
import { getAwarenessSnapshot, type AwarenessSnapshot } from '@/application/awareness/axeAwareness';
import { LookToggle } from '@/presentation/components/layout/LookToggle';
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

const FROSTED = {
  background: 'color-mix(in srgb, var(--kaart, rgba(14,17,23,0.74)) 82%, transparent)',
  backdropFilter: 'blur(26px) saturate(160%)',
  WebkitBackdropFilter: 'blur(26px) saturate(160%)',
  border: '1px solid var(--kaart-rand, rgba(255,255,255,0.10))',
} as const;

export default function LockScreen() {
  const navigate = useNavigate();
  const [look] = useLook();
  const now = useClock();
  const [aware, setAware] = useState<AwarenessSnapshot | null>(null);
  const [gezet, setGezet] = useState<boolean | null>(null);
  const glas = look === 'glass';
  const plaatTekst = glas ? 'rgba(12, 20, 34, 0.92)' : 'var(--text-primary)';
  const plaatGedempt = glas ? 'rgba(12, 20, 34, 0.55)' : 'var(--text-muted)';

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
  const allClear = aware != null && waiting === 0;

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
      <div
        className="relative z-[1] mx-auto flex h-full w-full max-w-md flex-col px-5"
        style={{
          paddingTop: 'max(12px, env(safe-area-inset-top))',
          paddingBottom: 'max(16px, env(safe-area-inset-bottom))',
        }}
      >
        <div className="axe-lock-look flex items-center justify-between gap-3">
          <LookToggle />
          <img src="/axe-logo.png" alt="AXE CORE" className="h-8 w-auto" />
        </div>

        <button
          type="button"
          onClick={openPin}
          className="mt-8 flex flex-1 flex-col items-center text-center"
          aria-label={gezet === false ? 'Swipe up to set your particle code' : 'Swipe up to unlock AXE'}
        >
          <div
            className="text-7xl font-semibold tabular-nums leading-none tracking-tight"
            style={{ color: plaatTekst }}
          >
            {TIME_FMT.format(now)}
          </div>
          <div className="mt-2 text-sm capitalize" style={{ color: plaatGedempt }}>
            {DATE_FMT.format(now)}
          </div>
          <div className="mt-2 inline-flex items-center gap-1.5 text-[12px]" style={{ color: plaatGedempt }}>
            <Clock size={13} />
            {aware?.alerts?.[0] ?? 'Nothing urgent'}
          </div>
        </button>

        <div
          className="mb-4 rounded-[18px] p-4"
          style={{ ...FROSTED, boxShadow: glas ? 'var(--axe-lift, 0 10px 30px rgba(12,20,34,0.22))' : '0 8px 30px rgba(0,0,0,0.18)' }}
        >
          <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[.1em]" style={{ color: 'var(--text-muted)' }}>
            <ListChecks size={14} /> Waiting
          </div>
          {allClear ? (
            <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--success)' }}>
              <CheckCircle2 size={16} /> All quiet
            </div>
          ) : (
            <div className="flex flex-wrap gap-x-6 gap-y-1.5 text-sm" style={{ color: 'var(--text-primary)' }}>
              <span><b className="tabular-nums">{aware?.openTasks ?? '—'}</b> <span style={{ color: 'var(--text-muted)' }}>open tasks</span></span>
              <span style={{ color: (aware?.overdueTasks ?? 0) > 0 ? 'var(--warning)' : undefined }}>
                <b className="tabular-nums">{aware?.overdueTasks ?? 0}</b> overdue
              </span>
              <span><b className="tabular-nums">{aware?.followUps ?? 0}</b> <span style={{ color: 'var(--text-muted)' }}>follow-ups</span></span>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={openPin}
          className="mb-2 py-3 text-[13px] font-semibold tracking-[0.14em]"
          style={{ color: plaatGedempt }}
        >
          {gezet === false ? '^  SWIPE UP TO SET CODE' : '^  SWIPE UP TO UNLOCK'}
        </button>
      </div>
    </div>
  );
}
