/**
 * MobileGlass — de AXE-plaat op een telefoon.
 *
 * Op de Mac is de lichte stand native macOS-glas; `--bg-base` is daar
 * transparent. Android heeft dat glas niet. Deze plaat tekent dezelfde
 * licht/donker-ruit als de desktop-look, alléén waar `hasNativeGlass()`
 * onwaar is, zodat de Mac onaangeroerd blijft.
 *
 * Licht: lumineus matglas (koelgrijs, hoogtepunt linksboven) — de stand-in
 * voor NSVisualEffect Sidebar light. Zwart: gerookt glas over een zwakke
 * hemel, geen dichte #000. Kaarten op het slot vervaagden anders een gat.
 */
import { useLook } from '@/presentation/hooks/useLook';
import { hasNativeGlass } from '@/infrastructure/config/apiUrl';

/** Hemel achter de ruit — wat op de Mac het bureaublad is. */
const LICHT_HEMEL =
  'radial-gradient(120% 90% at 16% -12%, rgba(255,255,255,0.95), rgba(255,255,255,0) 48%),' +
  'radial-gradient(90% 70% at 92% 108%, rgba(158,182,206,0.55), rgba(158,182,206,0) 52%),' +
  'linear-gradient(180deg, #e4edf6 0%, #c5d4e4 38%, #9aafc6 72%, #7d93ad 100%)';

const ZWART_HEMEL =
  'radial-gradient(1100px 620px at 22% -8%, rgba(168,196,255,0.22), rgba(168,196,255,0) 52%),' +
  'radial-gradient(900px 520px at 78% 108%, rgba(90,110,170,0.16), rgba(90,110,170,0) 54%),' +
  'radial-gradient(70% 50% at 48% 28%, #1a2030 0%, #0b0d12 62%, #05060a 100%)';

/**
 * De ruit zelf. Licht volgt --axe-bar / native Sidebar. Zwart volgt
 * --axe-plaat (0.50–0.64), zodat het gerookt glas is en geen doek.
 */
const LICHT_RUIT =
  'radial-gradient(80% 55% at 18% 0%, rgba(255,255,255,0.55), rgba(255,255,255,0) 58%),' +
  'linear-gradient(180deg, rgba(248,250,253,0.42) 0%, rgba(236,240,246,0.26) 44%, rgba(210,222,236,0.16) 100%)';

const ZWART_RUIT =
  'radial-gradient(80% 50% at 20% 0%, rgba(255,255,255,0.07), rgba(255,255,255,0) 52%),' +
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
          backdropFilter: 'blur(28px) saturate(150%)',
          WebkitBackdropFilter: 'blur(28px) saturate(150%)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: GRAIN,
          backgroundRepeat: 'repeat',
          opacity: glass ? 0.035 : 0.045,
          mixBlendMode: glass ? 'multiply' : 'screen',
        }}
      />
    </div>
  );
}
