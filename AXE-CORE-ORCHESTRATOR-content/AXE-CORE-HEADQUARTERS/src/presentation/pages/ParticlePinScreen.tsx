/**
 * Particle PIN — bestaande FloatingParticleSphere, met cijferpad eroverheen.
 *
 * Alleen op Android na het lockscreen. Geen tweede authenticatie naar AXE:
 * de hash blijft op het toestel.
 */
import { lazy, Suspense, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { Delete } from 'lucide-react';
import {
  PIN_LENGTE, ontgrendel, pinIsGezet, pinKlopt, zetPin,
} from '@/domain/androidPin';
import { MobileGlass } from '@/presentation/components/layout/MobileGlass';

const FloatingParticleSphere = lazy(
  () => import('@/presentation/components/axe-core/FloatingParticleSphere').then(m => ({ default: m.FloatingParticleSphere })),
);

const TOETSEN = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'] as const;

export default function ParticlePinScreen() {
  const navigate = useNavigate();
  const setup = useMemo(() => !pinIsGezet(), []);
  const [pin, setPin] = useState('');
  const [bevestig, setBevestig] = useState<string | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const [bezig, setBezig] = useState(false);

  const titel = setup
    ? (bevestig == null ? 'Choose a PIN' : 'Confirm PIN')
    : 'Enter PIN';

  const tik = (t: (typeof TOETSEN)[number]) => {
    if (bezig) return;
    setFout(null);
    if (t === '') return;
    if (t === 'del') {
      setPin((p) => p.slice(0, -1));
      return;
    }
    const next = (pin + t).slice(0, PIN_LENGTE);
    setPin(next);
    if (next.length === PIN_LENGTE) void klaar(next);
  };

  const klaar = async (waarde: string) => {
    setBezig(true);
    try {
      if (setup) {
        if (bevestig == null) {
          setBevestig(waarde);
          setPin('');
          return;
        }
        if (waarde !== bevestig) {
          setFout('PINs did not match');
          setBevestig(null);
          setPin('');
          return;
        }
        const r = await zetPin(waarde);
        if (!r.ok) { setFout(r.fout); setPin(''); return; }
        ontgrendel();
        navigate('/devices', { replace: true });
        return;
      }
      if (!(await pinKlopt(waarde))) {
        setFout('Wrong PIN');
        setPin('');
        return;
      }
      ontgrendel();
      navigate('/devices', { replace: true });
    } finally {
      setBezig(false);
    }
  };

  return (
    <div className="relative flex h-full min-h-0 w-full flex-col overflow-hidden">
      <MobileGlass />
      <div className="pointer-events-none absolute inset-0 z-[1] opacity-80">
        <Suspense fallback={null}>
          <FloatingParticleSphere status={fout ? 'awaiting-approval' : 'idle'} />
        </Suspense>
      </div>
      <div
        className="relative z-[2] mx-auto flex h-full w-full max-w-sm flex-col px-6"
        style={{
          paddingTop: 'max(20px, env(safe-area-inset-top))',
          paddingBottom: 'max(16px, env(safe-area-inset-bottom))',
        }}
      >
        <img src="/axe-logo.png" alt="AXE CORE" className="ml-auto h-8 w-auto" />
        <div className="mt-6 text-center">
          <div className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>{titel}</div>
          <div className="mt-4 flex justify-center gap-3">
            {Array.from({ length: PIN_LENGTE }, (_, i) => (
              <span
                key={i}
                className="size-3 rounded-full"
                style={{
                  background: i < pin.length ? 'var(--text-primary)' : 'transparent',
                  border: '1px solid color-mix(in srgb, var(--text-primary) 45%, transparent)',
                }}
              />
            ))}
          </div>
          {fout && (
            <p className="mt-3 text-[12px]" style={{ color: 'var(--error, #EF4444)' }}>{fout}</p>
          )}
        </div>
        <div className="mt-auto grid grid-cols-3 gap-3 pb-4">
          {TOETSEN.map((t, i) => (
            <button
              key={`${t}-${i}`}
              type="button"
              disabled={t === '' || bezig}
              onClick={() => tik(t)}
              className="flex h-14 items-center justify-center rounded-full text-xl font-medium disabled:opacity-0"
              style={{
                color: 'var(--text-primary)',
                background: t === '' ? 'transparent' : 'color-mix(in srgb, var(--kaart, #111) 55%, transparent)',
                backdropFilter: t === '' ? undefined : 'blur(18px)',
              }}
              aria-label={t === 'del' ? 'Delete' : t}
            >
              {t === 'del' ? <Delete size={20} /> : t}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
