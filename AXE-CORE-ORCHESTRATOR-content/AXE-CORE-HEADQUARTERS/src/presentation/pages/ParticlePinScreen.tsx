/**
 * Particle-gesture PIN — recovered from AxeGestureLock / GestureLockScreen.
 *
 * Lockscreen → circular particle field → four unistroke inputs → unlock.
 * No keypad. The field is the PIN.
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  CODE_LENGTE, ontgrendel, pinIsGezet, verifieerCode, zetPin, codeLengte,
} from '@/domain/androidPin';
import { lockAlphabet } from '@/domain/gestureTemplates';
import { UnistrokeRecognizer, isClearWinner } from '@/domain/unistrokeRecognizer';
import type { GesturePoint } from '@/domain/gestureTemplates';
import { ParticleGestureField } from '@/presentation/components/android/ParticleGestureField';
import { MobileGlass } from '@/presentation/components/layout/MobileGlass';

export default function ParticlePinScreen() {
  const navigate = useNavigate();
  const setup = useMemo(() => !pinIsGezet(), []);
  const nodig = useMemo(() => (setup ? CODE_LENGTE : codeLengte()), [setup]);
  const herkenner = useMemo(() => new UnistrokeRecognizer(lockAlphabet()), []);
  const [ingevoerd, setIngevoerd] = useState<string[]>([]);
  const [bevestig, setBevestig] = useState<string[] | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const [bezig, setBezig] = useState(false);

  const titel = setup
    ? (bevestig == null ? 'Draw your code' : 'Draw it again')
    : 'Draw your code';

  const klaar = async (reeks: string[]) => {
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
        ontgrendel();
        navigate('/devices', { replace: true });
        return;
      }
      const r = await verifieerCode(reeks);
      if (!r.ok) {
        setFout(r.fout);
        setIngevoerd([]);
        return;
      }
      ontgrendel();
      navigate('/devices', { replace: true });
    } finally {
      setBezig(false);
    }
  };

  const slag = (points: GesturePoint[]) => {
    if (bezig) return;
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
        <ParticleGestureField onStroke={slag} disabled={bezig} />
      </div>
      <div
        className="pointer-events-none relative z-[2] mx-auto flex h-full w-full max-w-sm flex-col px-6"
        style={{
          paddingTop: 'max(20px, env(safe-area-inset-top))',
          paddingBottom: 'max(16px, env(safe-area-inset-bottom))',
        }}
      >
        <img src="/axe-logo.png" alt="AXE CORE" className="ml-auto h-8 w-auto" />
        <div className="mt-4 text-center">
          <div className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>{titel}</div>
          <div className="mt-4 flex justify-center gap-3">
            {Array.from({ length: nodig }, (_, i) => (
              <span
                key={i}
                className="size-3 rounded-full"
                style={{
                  background: i < ingevoerd.length ? 'var(--text-primary)' : 'transparent',
                  border: '1px solid color-mix(in srgb, var(--text-primary) 45%, transparent)',
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
          style={{ color: 'var(--text-muted)' }}
          onClick={() => { setIngevoerd([]); setFout(null); }}
        >
          Clear
        </button>
      </div>
    </div>
  );
}
