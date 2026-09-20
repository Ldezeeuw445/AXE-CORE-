/**
 * MobileGlass — de AXE-plaat op een telefoon.
 *
 * Op de Mac is de lichte stand native macOS-glas; `--bg-base` is daar
 * transparent. Android heeft dat glas niet. Deze plaat tekent dezelfde
 * licht/donker-ruit als de desktop-look, alléén waar `hasNativeGlass()`
 * onwaar is, zodat de Mac onaangeroerd blijft.
 *
 * Licht: grijs matglas, geen witte plaat. Zwart: gerookt glas, geen dichte #000.
 * Geen bollen achter het slot — de ruit is het materiaal.
 */
import { useLook } from '@/presentation/hooks/useLook';
import { hasNativeGlass } from '@/infrastructure/config/apiUrl';

const LICHT_HEMEL =
  'radial-gradient(120% 90% at 16% -12%, rgba(255,255,255,0.35), rgba(255,255,255,0) 48%),' +
  'linear-gradient(180deg, #b4b8c0 0%, #8e949e 42%, #6f7580 78%, #5a606a 100%)';

const ZWART_HEMEL =
  'radial-gradient(1100px 620px at 22% -8%, rgba(168,196,255,0.10), rgba(168,196,255,0) 52%),' +
  'radial-gradient(70% 50% at 48% 28%, #12141a 0%, #08090c 100%)';

const LICHT_RUIT =
  'radial-gradient(80% 55% at 18% 0%, rgba(255,255,255,0.28), rgba(255,255,255,0) 58%),' +
  'linear-gradient(180deg, rgba(210,214,220,0.38) 0%, rgba(150,156,166,0.22) 100%)';

const ZWART_RUIT =
  'radial-gradient(80% 50% at 20% 0%, rgba(255,255,255,0.06), rgba(255,255,255,0) 52%),' +
  'linear-gradient(155deg, rgba(0,0,0,0.50) 0%, rgba(0,0,0,0.64) 100%)';

const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E\")";

export function MobileGlass() {
  const [look] = useLook();
  if (hasNativeGlass()) return null;
  const glass = look === 'glass';
  return (
    <div aria-hidden style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none' }}>
      <div style={{ position: 'absolute', inset: 0, background: glass ? LICHT_HEMEL : ZWART_HEMEL }} />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: glass ? LICHT_RUIT : ZWART_RUIT,
          backdropFilter: 'blur(28px) saturate(140%)',
          WebkitBackdropFilter: 'blur(28px) saturate(140%)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: GRAIN,
          backgroundRepeat: 'repeat',
          opacity: glass ? 0.04 : 0.045,
          mixBlendMode: glass ? 'multiply' : 'screen',
        }}
      />
    </div>
  );
}
