/**
 * Particle-gesture PIN — recovered from AxeGestureLock / GestureLockScreen.
 *
 * Lockscreen → circular particle field → four unistroke inputs → unlock.
 * No keypad. The field is the PIN.
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  CODE_LENGTE, ontgrendel, pinIsGezet, verifieerCode, zetPin, codeLengte, OPSLAG_DICHT,
  naOntgrendelenPad,
} from '@/domain/androidPin';
import { lockAlphabet } from '@/domain/gestureTemplates';
import { UnistrokeRecognizer, isClearWinner } from '@/domain/unistrokeRecognizer';
import type { GesturePoint } from '@/domain/gestureTemplates';
import { ParticleGestureField } from '@/presentation/components/android/ParticleGestureField';
import { LookToggle } from '@/presentation/components/layout/LookToggle';
import { MobileGlass } from '@/presentation/components/layout/MobileGlass';
import { useLook } from '@/presentation/hooks/useLook';

export default function ParticlePinScreen() {
  const navigate = useNavigate();
  const [look] = useLook();
  const [modus, setModus] = useState<'laden' | 'setup' | 'unlock' | 'dicht'>('laden');
  const [nodig, setNodig] = useState(CODE_LENGTE);
  const herkenner = useMemo(() => new UnistrokeRecognizer(lockAlphabet()), []);
  const [ingevoerd, setIngevoerd] = useState<string[]>([]);
  const [bevestig, setBevestig] = useState<string[] | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const [bezig, setBezig] = useState(false);
  const glas = look === 'glass';
  const plaatTekst = glas ? 'rgba(12, 20, 34, 0.92)' : 'var(--text-primary)';
  const plaatGedempt = glas ? 'rgba(12, 20, 34, 0.55)' : 'var(--text-muted)';

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const gezet = await pinIsGezet();
        const n = gezet ? await codeLengte() : CODE_LENGTE;
        if (!alive) return;
        setNodig(n);
        setModus(gezet ? 'unlock' : 'setup');
      } catch {
        if (alive) {
          setModus('dicht');
          setFout(OPSLAG_DICHT);
        }
      }
    })();
    return () => { alive = false; };
  }, []);

  const setup = modus === 'setup';
  const titel = setup
    ? (bevestig == null ? 'Draw your code' : 'Draw it again')
    : 'Draw your code';

  const naarSchil = () => {
    ontgrendel();
    navigate(naOntgrendelenPad(), { replace: true });
  };

  const klaar = async (reeks: string[]) => {
    if (modus !== 'setup' && modus !== 'unlock') return;
    setBezig(true);
    try {
      if (setup) {
        if (bevestig == null) {
          setBevestig(reeks);
          setIngevoerd([]);
          return;
        }
        if (reeks.length !== bevestig.length || reeks.some((g, i) => g !== bevestig[i])) {
          setFout('Codes did not match');
          setBevestig(null);
          setIngevoerd([]);
          return;
        }
        const r = await zetPin(reeks);
        if (!r.ok) { setFout(r.fout); setIngevoerd([]); return; }
        naarSchil();
        return;
      }
      const r = await verifieerCode(reeks);
      if (!r.ok) {
        setFout(r.fout);
        setIngevoerd([]);
        return;
      }
      naarSchil();
    } finally {
      setBezig(false);
    }
  };

  const slag = (points: GesturePoint[]) => {
    if (bezig || modus === 'laden' || modus === 'dicht') return;
    const result = herkenner.recognize(points);
    if (!isClearWinner(result) || !result) {
      setFout('Not clear enough — try again');
      return;
    }
    setFout(null);
    const next = [...ingevoerd, result.name];
    setIngevoerd(next);
    if (next.length >= nodig) void klaar(next);
  };

  return (
    <div className="relative flex h-full min-h-0 w-full flex-col overflow-hidden">
      <MobileGlass />
      <div className="absolute inset-0 z-[1]">
        <ParticleGestureField onStroke={slag} disabled={bezig || modus === 'laden' || modus === 'dicht'} />
      </div>
      <div
        className="pointer-events-none relative z-[2] mx-auto flex h-full w-full max-w-sm flex-col px-6"
        style={{
          paddingTop: 'max(20px, env(safe-area-inset-top))',
          paddingBottom: 'max(16px, env(safe-area-inset-bottom))',
        }}
      >
        <div className="axe-lock-look pointer-events-auto flex items-center justify-between gap-3">
          <LookToggle />
          <img src="/axe-logo.png" alt="AXE CORE" className="h-8 w-auto" />
        </div>
        <div className="mt-4 text-center">
          <div className="text-lg font-semibold" style={{ color: plaatTekst }}>{titel}</div>
          <div className="mt-4 flex justify-center gap-3">
            {Array.from({ length: nodig }, (_, i) => (
              <span
                key={i}
                className="size-3 rounded-full"
                style={{
                  background: i < ingevoerd.length ? plaatTekst : 'transparent',
                  border: `1px solid color-mix(in srgb, ${plaatTekst} 45%, transparent)`,
                }}
              />
            ))}
          </div>
          {fout && (
            <p className="mt-3 text-[12px]" style={{ color: 'var(--error, #EF4444)' }}>{fout}</p>
          )}
        </div>
        <button
          type="button"
          className="pointer-events-auto mt-auto mb-2 self-center text-[12px]"
          style={{ color: plaatGedempt }}
          onClick={() => { setIngevoerd([]); setFout(modus === 'dicht' ? OPSLAG_DICHT : null); }}
        >
          Clear
        </button>
      </div>
    </div>
  );
}
