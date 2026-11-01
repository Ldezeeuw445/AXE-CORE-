/**
 * Cijfer-PIN — dormant. Geen particles, geen canvas, geen bol.
 *
 * Ontworpen pad: swipe op het native slot opent /mobile (TelefoonSphere).
 * Dit scherm bestaat alleen als er al een cijfer-PIN in de opslag staat.
 * Standaard is die er niet (`PIN_STANDAARD_UIT`). Geen setup hier — dat was
 * hoe Luka vastzat. Niet uitbreiden tot hij erom vraagt.
 */
import { useEffect, useState } from 'react';
import { Delete } from 'lucide-react';
import { useNavigate } from 'react-router';
import {
  PIN_LENGTE, ontgrendel, telefoonPinNodig, verifieerCijfers, codeLengte,
  OPSLAG_DICHT, naOntgrendelenPad,
} from '@/domain/androidPin';
import { PHONE_TIKMAAT } from '@/domain/phone/phoneChrome';
import { lockMateriaal } from '@/presentation/components/android/lockMateriaal';
import { LockChrome } from '@/presentation/components/android/LockChrome';
import { MobileGlass } from '@/presentation/components/layout/MobileGlass';
import { useLook } from '@/presentation/hooks/useLook';

const TOETSEN = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'] as const;

export default function PhonePinScreen() {
  const navigate = useNavigate();
  const [look] = useLook();
  const inkt = lockMateriaal(look);
  const [modus, setModus] = useState<'laden' | 'unlock' | 'overslaan'>('laden');
  const [nodig, setNodig] = useState(PIN_LENGTE);
  const [pin, setPin] = useState('');
  const [fout, setFout] = useState<string | null>(null);
  const [bezig, setBezig] = useState(false);

  const naarSchil = () => {
    ontgrendel();
    navigate(naOntgrendelenPad(), { replace: true });
  };

  useEffect(() => {
    let alive = true;
    const hang = window.setTimeout(() => {
      if (alive) setModus((m) => (m === 'laden' ? 'overslaan' : m));
    }, 2500);
    void (async () => {
      try {
        const nodigPin = await telefoonPinNodig();
        if (!alive) return;
        if (!nodigPin) {
          naarSchil();
          return;
        }
        const n = await codeLengte();
        if (!alive) return;
        setNodig(n >= PIN_LENGTE ? n : PIN_LENGTE);
        setModus('unlock');
      } catch {
        if (!alive) return;
        setModus('overslaan');
        setFout(null);
      }
    })();
    return () => { alive = false; window.clearTimeout(hang); };
    // naarSchil is expres niet in deps: één keer bij mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const klaar = async (reeks: string) => {
    if (bezig) return;
    setBezig(true);
    try {
      const r = await verifieerCijfers(reeks);
      if (!r.ok) {
        if (r.fout === OPSLAG_DICHT) {
          setModus('overslaan');
          setFout(null);
          setPin('');
          return;
        }
        setFout(r.fout);
        setPin('');
        return;
      }
      naarSchil();
    } catch {
      setModus('overslaan');
      setFout(null);
      setPin('');
    } finally {
      setBezig(false);
    }
  };

  const tik = (toets: string) => {
    if (bezig || modus !== 'unlock') return;
    if (toets === 'del') {
      setPin((p) => p.slice(0, -1));
      setFout(null);
      return;
    }
    if (!/^[0-9]$/.test(toets)) return;
    const next = (pin + toets).slice(0, nodig);
    setPin(next);
    setFout(null);
    if (next.length >= nodig) void klaar(next);
  };

  return (
    <div
      className="axe-lock-pin-v3 relative flex h-full min-h-0 w-full flex-col overflow-hidden"
      data-axe-lock-pin
      data-axe-lock-pin-v3="v3"
      data-axe-pin-soort="numeric"
    >
      <MobileGlass />
      <div
        className="relative z-[1] mx-auto flex h-full w-full max-w-sm flex-col px-6"
        style={{
          paddingTop: 'max(28px, env(safe-area-inset-top))',
          paddingBottom: 'max(20px, env(safe-area-inset-bottom))',
        }}
      >
        <LockChrome />
        <div className="mt-8 text-center">
          <div className="text-lg font-semibold" style={{ color: inkt.tekst }}>
            {modus === 'overslaan' ? 'Unlock AXE CORE' : 'Enter PIN'}
          </div>
          {modus === 'unlock' && (
            <div className="mt-6 flex justify-center gap-3" aria-label={`${pin.length} of ${nodig} digits`}>
              {Array.from({ length: nodig }, (_, i) => (
                <span
                  key={i}
                  className="size-3 rounded-full"
                  data-axe-pin-dot={i < pin.length ? 'vol' : 'leeg'}
                  style={{
                    background: i < pin.length ? inkt.tekst : 'transparent',
                    border: `1px solid color-mix(in srgb, ${inkt.tekst} 45%, transparent)`,
                  }}
                />
              ))}
            </div>
          )}
          {fout && fout !== OPSLAG_DICHT && (
            <p className="mt-3 text-[12px]" style={{ color: 'var(--error, #EF4444)' }}>{fout}</p>
          )}
        </div>

        {modus === 'unlock' && (
          <div
            className="mt-auto mb-4 grid grid-cols-3 gap-3"
            role="group"
            aria-label="PIN keypad"
            data-axe-pin-pad
          >
            {TOETSEN.map((toets, i) => {
              if (toets === '') return <span key={`leeg-${i}`} />;
              const del = toets === 'del';
              return (
                <button
                  key={toets}
                  type="button"
                  data-axe-pin-toets={toets}
                  aria-label={del ? 'Delete' : toets}
                  disabled={bezig}
                  onClick={() => tik(toets)}
                  className="flex items-center justify-center rounded-[18px] text-[22px] font-medium tabular-nums active:opacity-70 disabled:opacity-40"
                  style={{
                    minHeight: Math.max(PHONE_TIKMAAT + 12, 56),
                    background: 'var(--axe-kaart-vlak, rgba(14,17,23,0.74))',
                    border: '1px solid var(--axe-kaart-lijn, rgba(255,255,255,0.10))',
                    borderTopColor: 'var(--axe-kaart-lijn-boven, rgba(255,255,255,0.16))',
                    boxShadow: 'var(--axe-kaart-schaduw, 0 8px 30px rgba(0,0,0,0.18))',
                    color: inkt.tekst,
                  }}
                >
                  {del ? <Delete size={20} /> : toets}
                </button>
              );
            })}
          </div>
        )}

        {(modus === 'overslaan' || modus === 'laden') && (
          <div className="mt-auto mb-8 flex flex-col items-center gap-3">
            {modus === 'laden' && (
              <p className="text-[12px]" style={{ color: inkt.gedempt }}>Checking lock…</p>
            )}
            <button
              type="button"
              data-axe-pin-overslaan
              className="min-h-[44px] min-w-[160px] rounded-[14px] px-5 text-[14px] font-medium"
              style={{
                background: 'var(--axe-kaart-vlak, rgba(14,17,23,0.74))',
                border: '1px solid var(--axe-kaart-lijn, rgba(255,255,255,0.10))',
                color: inkt.tekst,
              }}
              onClick={naarSchil}
            >
              Continue
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
