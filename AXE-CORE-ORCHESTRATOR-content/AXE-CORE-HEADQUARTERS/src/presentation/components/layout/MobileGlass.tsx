/**
 * MobileGlass — de AXE-plaat op een telefoon.
 *
 * Mac: native glas, deze component tekent niets. Android: gerookt zwart of
 * grijs matglas — geen witte plaat, geen bollen.
 */
import { useLook } from '@/presentation/hooks/useLook';
import { hasNativeGlass } from '@/infrastructure/config/apiUrl';

const LICHT_HEMEL =
  'radial-gradient(90% 60% at 18% 0%, rgba(255,255,255,0.22), rgba(255,255,255,0) 55%),' +
  'linear-gradient(180deg, #9aa0a8 0%, #7e848e 48%, #656b74 100%)';

const ZWART_HEMEL =
  'radial-gradient(80% 50% at 20% 0%, rgba(255,255,255,0.05), rgba(255,255,255,0) 50%),' +
  'linear-gradient(180deg, #0c0d10 0%, #050608 100%)';

const LICHT_RUIT =
  'linear-gradient(180deg, rgba(170,176,184,0.40) 0%, rgba(110,116,124,0.28) 100%)';

const ZWART_RUIT =
  'linear-gradient(155deg, rgba(0,0,0,0.42) 0%, rgba(0,0,0,0.58) 100%)';

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
          opacity: glass ? 0.04 : 0.05,
          mixBlendMode: glass ? 'multiply' : 'screen',
        }}
      />
    </div>
  );
}
