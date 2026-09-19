/**
 * MobileGlass — de AXE-plaat op een telefoon.
 *
 * Op de Mac is de lichte stand native macOS-glas; `--bg-base` is daar
 * transparent. Android heeft dat glas niet. Deze plaat tekent dezelfde
 * licht/donker-gradiënt als de desktop-look, alléén waar `hasNativeGlass()`
 * onwaar is, zodat de Mac onaangeroerd blijft.
 */
import { useLook } from '@/presentation/hooks/useLook';
import { hasNativeGlass } from '@/infrastructure/config/apiUrl';

const LICHT =
  'linear-gradient(180deg,' +
  ' #bcd8ee 0%,' +
  ' #98bcdd 18%,' +
  ' #6d88a8 34%,' +
  ' #4e6788 46%,' +
  ' #3e5578 58%,' +
  ' #2c4160 72%,' +
  ' #1a2c46 84%,' +
  ' #0c1728 93%,' +
  ' #000000 100%)';

const ZWART =
  'radial-gradient(1200px 680px at 30% 4%, rgba(128,140,178,0.11), rgba(128,140,178,0) 50%),' +
  'radial-gradient(1000px 560px at 74% 99%, rgba(96,106,142,0.06), rgba(96,106,142,0) 54%),' +
  '#000000';

const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E\")";

export function MobileGlass() {
  const [look] = useLook();
  if (hasNativeGlass()) return null;
  const glass = look === 'glass';
  return (
    <div aria-hidden style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none' }}>
      <div style={{ position: 'absolute', inset: 0, background: glass ? LICHT : ZWART }} />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: GRAIN,
          backgroundRepeat: 'repeat',
          opacity: glass ? 0.04 : 0.05,
          mixBlendMode: glass ? 'multiply' : 'screen',
        }}
      />
    </div>
  );
}
