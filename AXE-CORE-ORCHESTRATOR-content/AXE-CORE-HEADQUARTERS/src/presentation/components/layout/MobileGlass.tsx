/**
 * MobileGlass — de plaat, voor een telefoon.
 *
 * Op de Mac is de lichte stand het native macOS-glas (NSVisualEffectMaterial),
 * en `--bg-base` is daarom `transparent`: de plaat zit ónder de webview. Een
 * telefoon (Safari, de PWA, de Android-shell) heeft dat glas niet, dus daar
 * bleef alles zwart — ook in de lichte stand.
 *
 * Dit legt die plaat alsnog neer, maar alléén waar geen native glas is
 * (`!isTauriRuntime()`), zodat de Mac onaangeroerd blijft. Zoals de demo:
 * alleen de PLAAT keert om (licht in `glass`, donker in `black`); de kaarten,
 * chat en composer erbovenop houden hun donkere materiaal en lichte inkt. Zo
 * ziet de telefoon er in beide standen uit als de Tauri-app.
 */
import { useLook } from '@/presentation/hooks/useLook';
import { useLookValue } from '@/presentation/hooks/usePlaatInk';
import { hasNativeGlass } from '@/infrastructure/config/apiUrl';
import { Sun, Moon } from 'lucide-react';

/*
 * De achtergrond van de Tauri-home ("AXE Glass Plate"), voor de telefoon.
 *
 * De Mac heeft het native macOS-glas; een telefoon niet. Vroeger legde dit een
 * foto-wallpaper met een sluier neer, maar de echte Tauri-plaat is geen foto —
 * het is een GRADIËNT-plaat. Luka koos twee van de drie standen uit die
 * mockup en koppelde ze aan de licht/donker-knop:
 *
 *   • donker  ("black") = NU / ZWART   → een vlakke, bijna zwarte plaat.
 *   • licht   ("glass") = GLAS DONKER  → een diep indigo/violet glas.
 *
 * (GLAS LICHT — de pastel-variant — gebruikt hij niet.) Beide standen zijn dus
 * donker met lichte inkt; alleen de achtergrond verschilt. De frosted plates
 * (chat, cijferregel) liggen hier bovenop en vervagen deze grond.
 */

// GLAS DONKER — diep indigo glas: een violette gloed bovenin, koel blauw links,
// een zweem paars rechts, wegzakkend naar bijna-zwart onderin. Dit is de LICHTE
// stand ('glass'), precies zoals de mockup: donker glas, geen wit.
const GLAS_DONKER =
  'radial-gradient(1100px 720px at 50% -6%, rgba(96,86,190,0.34), rgba(96,86,190,0) 55%),' +
  'radial-gradient(680px 560px at 10% 8%, rgba(60,96,200,0.26), rgba(60,96,200,0) 60%),' +
  'radial-gradient(760px 640px at 92% 26%, rgba(132,92,204,0.22), rgba(132,92,204,0) 60%),' +
  'radial-gradient(900px 760px at 74% 108%, rgba(46,120,168,0.16), rgba(46,120,168,0) 62%),' +
  'linear-gradient(180deg, #17182e 0%, #101124 46%, #090a13 100%)';

// NU / ZWART — donker, maar niet dood-vlak zwart: een zweem blauw-paars (de
// Tauri-look is nooit zuiver zwart). Een zachte indigo/violette gloed bovenin
// over een heel donkere blauw-zwarte grond; nog steeds duidelijk "donker", maar
// met leven erin.
const ZWART =
  'radial-gradient(1000px 780px at 50% 0%, rgba(58,54,104,0.42), rgba(58,54,104,0) 58%),' +
  'radial-gradient(760px 620px at 88% 14%, rgba(70,58,120,0.22), rgba(70,58,120,0) 60%),' +
  'linear-gradient(180deg, #0b0c18 0%, #08080f 55%, #050509 100%)';

// Heel fijne korrel, zodat het glas niet als plat karton leest. Eén kleine SVG
// als data-URI, laag in dekking — kost niets en tilt de vlakken net op.
const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E\")";

/** Volvlakse achtergrond-plaat achter de mobiele surfaces (gradiënt + korrel). */
export function MobileGlass() {
  const look = useLookValue();
  if (hasNativeGlass()) return null; // alleen op de macOS-desktop doet het native glas dit al
  const glass = look === 'glass';
  return (
    <div aria-hidden style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none' }}>
      {/* De plaat zelf: het indigo glas in de lichte stand, vlak zwart in de
          donkere. Geen foto meer — dit is de gradiënt-plaat uit de mockup. */}
      <div style={{ position: 'absolute', inset: 0, background: glass ? GLAS_DONKER : ZWART }} />
      {/* Fijne korrel, zodat het glas niet als plat karton leest. */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: GRAIN,
          backgroundRepeat: 'repeat',
          opacity: glass ? 0.06 : 0.05,
          mixBlendMode: 'screen',
        }}
      />
    </div>
  );
}

/** Zon/maan-knop: op mobiel is er geen topbalk, dus de look-wissel woont hier. */
export function LookToggle({ className = '' }: { className?: string }) {
  const [, setLook] = useLook();
  const look = useLookValue(); // volgt de stand ook als hij elders wisselt
  const next = look === 'glass' ? 'black' : 'glass';
  return (
    <button
      type="button"
      onClick={() => setLook(next)}
      aria-label={look === 'glass' ? 'Naar donker' : 'Naar licht'}
      className={`flex size-9 flex-none items-center justify-center rounded-full ${className}`}
      style={{ background: 'var(--surface-bg)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
    >
      {look === 'glass' ? <Moon size={16} /> : <Sun size={16} />}
    </button>
  );
}
