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

// LICHT — een kleur-gradient met dezelfde kleur-flow als Luka's bureaubladfoto
// (Moraine Lake): blauwe lucht → witte wolken → grijze bergen → groene bossen →
// donker naar onder, eindigend in ZWART (zodat de onderkant, waar de Samsung-
// systeembalk zit, zwart is). De frosted plaat (backdrop-blur, axe-look.css)
// vervaagt dit tot matglas — geen foto, wel dezelfde kleur-flow.
const LICHT =
  'linear-gradient(180deg,' +
  ' #9cc4e6 0%,' +   /* blauwe lucht */
  ' #bcd8ec 12%,' +  /* lichtere lucht */
  ' #d9e7f1 22%,' +  /* witte wolken */
  ' #a8c3db 33%,' +  /* lucht weer */
  ' #8b93a1 46%,' +  /* grijze berg */
  ' #6f7680 58%,' +  /* donkerder grijs */
  ' #5f6f5a 68%,' +  /* grijs-groen (scree) */
  ' #47643f 78%,' +  /* groen bos */
  ' #2b4030 87%,' +  /* donkergroen */
  ' #132018 93%,' +  /* bijna zwart */
  ' #000000 100%)';  /* zwart onder (systeembalk) */

// NU / ZWART — puur mat zwart, met heel subtiel licht dat schuin ónder de
// glasplaat langs strijkt: van boven-midden/links naar onder-midden/rechts.
// Verder zwart, zodat het licht juist opvalt.
const ZWART =
  'radial-gradient(1200px 680px at 30% 4%, rgba(128,140,178,0.11), rgba(128,140,178,0) 50%),' +
  'radial-gradient(1000px 560px at 74% 99%, rgba(96,106,142,0.06), rgba(96,106,142,0) 54%),' +
  '#000000';

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
      {/* De grond: licht-blauw→grijs in de lichte stand, puur mat zwart met een
          subtiele schuine lichtstreep in de donkere. */}
      <div style={{ position: 'absolute', inset: 0, background: glass ? LICHT : ZWART }} />
      {/* Fijne korrel, zodat het glas niet als plat karton leest. Op de lichte
          grond met 'multiply' zodat de korrel juist donkert i.p.v. oplicht. */}
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
