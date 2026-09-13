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
import { useState } from 'react';
import { useLook } from '@/presentation/hooks/useLook';
import { useLookValue } from '@/presentation/hooks/usePlaatInk';
import { useWallpaper } from '@/presentation/hooks/useWallpaper';
import { isTauriRuntime } from '@/infrastructure/config/apiUrl';
import { Sun, Moon } from 'lucide-react';

// Zachte gekleurde vlekken geven het glas iets om te vervagen — zonder textuur
// erachter is backdrop-filter onzichtbaar. Licht: koele lucht met een warme en
// een cyaan gloed; donker: dezelfde vlekken, gedempt op bijna-zwart.
const GLASS_LIGHT =
  'radial-gradient(560px 460px at 12% 6%, rgba(120,162,236,0.30), rgba(120,162,236,0) 60%),' +
  'radial-gradient(640px 520px at 94% 10%, rgba(190,150,236,0.24), rgba(190,150,236,0) 60%),' +
  'radial-gradient(720px 620px at 72% 104%, rgba(110,205,214,0.22), rgba(110,205,214,0) 62%),' +
  'radial-gradient(1100px 800px at 20% -10%, rgba(255,255,255,0.85), rgba(255,255,255,0) 58%),' +
  'linear-gradient(180deg, #eef1f7 0%, #e0e6f0 52%, #ccd4e2 100%)';

const GLASS_DARK =
  'radial-gradient(560px 460px at 12% 4%, rgba(64,96,196,0.26), rgba(64,96,196,0) 60%),' +
  'radial-gradient(640px 520px at 94% 8%, rgba(128,74,196,0.22), rgba(128,74,196,0) 60%),' +
  'radial-gradient(720px 620px at 76% 104%, rgba(38,150,162,0.18), rgba(38,150,162,0) 62%),' +
  'radial-gradient(1000px 760px at 22% -8%, rgba(90,104,140,0.24), rgba(90,104,140,0) 56%),' +
  'linear-gradient(180deg, #0a0d12 0%, #070a0e 60%, #04060a 100%)';

// Heel fijne korrel, zodat het glas niet als plat karton leest. Eén kleine SVG
// als data-URI, laag in dekking — kost niets en tilt de vlakken net op.
const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E\")";

// Sluier over de foto: net genoeg dat de kaarten en tekst leesbaar blijven,
// weinig genoeg dat de foto er doorheen komt. Licht een lichte waas, donker een
// donkere — zoals het Tauri-glas de plaat licht of gerookt maakt.
const VEIL_LIGHT = 'linear-gradient(180deg, rgba(236,240,247,0.52) 0%, rgba(222,229,241,0.58) 60%, rgba(206,215,229,0.66) 100%)';
const VEIL_DARK = 'linear-gradient(180deg, rgba(8,11,16,0.62) 0%, rgba(5,8,12,0.70) 60%, rgba(3,5,9,0.78) 100%)';

/** Volvlakse achtergrondlaag achter de mobiele surfaces: foto → sluier → korrel. */
export function MobileGlass() {
  const look = useLookValue();
  const wallpaper = useWallpaper();
  // We onthouden wélke URL faalde, niet een boolean: wisselt de wallpaper naar
  // een andere URL, dan probeert hij vanzelf opnieuw (geen set-state-in-effect,
  // en een gefaalde standaard blokkeert een later gekozen foto niet).
  const [failed, setFailed] = useState<string | null>(null);
  if (isTauriRuntime()) return null; // op de Mac doet het native glas dit al
  return (
    <div aria-hidden style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none' }}>
      {/* Kleur-gradiënt als bodem: zichtbaar zolang (of als) de foto niet laadt. */}
      <div style={{ position: 'absolute', inset: 0, background: look === 'glass' ? GLASS_LIGHT : GLASS_DARK }} />
      {/* De wallpaper zelf, zacht wazig zodat hij als plaat leest en niet met de
          inhoud vecht. Faalt hij, dan blijft de gradiënt eronder staan. */}
      {wallpaper !== failed && (
        <img
          src={wallpaper}
          alt=""
          onError={() => setFailed(wallpaper)}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', filter: 'blur(2px)', transform: 'scale(1.05)' }}
        />
      )}
      {/* Sluier voor leesbaarheid */}
      <div style={{ position: 'absolute', inset: 0, background: look === 'glass' ? VEIL_LIGHT : VEIL_DARK }} />
      {/* Fijne korrel */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: GRAIN,
          backgroundRepeat: 'repeat',
          opacity: look === 'glass' ? 0.05 : 0.08,
          mixBlendMode: look === 'glass' ? 'multiply' : 'screen',
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
