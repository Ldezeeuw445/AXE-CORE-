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
import { useEffect } from 'react';
import { useLook } from '@/presentation/hooks/useLook';
import { useLookValue } from '@/presentation/hooks/usePlaatInk';
import { hasNativeGlass } from '@/infrastructure/config/apiUrl';
import { Sun, Moon } from 'lucide-react';
import { useWallpaper, useGlassTuning } from '@/presentation/hooks/useWallpaper';
import { wallpaperCss } from '@/domain/wallpaper';
import { syncLockWallpaper } from '@/infrastructure/gateways/androidPhoneBridge';

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

// LICHT — de tonale flow van de Tauri-shell: licht-blauwe lucht bovenaan, maar
// in het MIDDEN (waar de sphere staat) een MIDDEN-tint blauw-grijs — net als de
// wazige bergen achter het glas op de Mac. Juist die midden-tint geeft de bleke
// deeltjes contrast (geen donkere lens nodig, zoals de Tauri-app die ook niet
// heeft). Naar onder verder donker → zwart bij de systeembalk. De frosted plaat
// (zware backdrop-blur, axe-look.css) vervaagt dit tot zacht matglas.
const LICHT =
  'linear-gradient(180deg,' +
  ' #bcd8ee 0%,' +   /* lichte lucht */
  ' #98bcdd 18%,' +  /* lichtblauw */
  ' #6d88a8 34%,' +  /* midden-slate (sphere-top) */
  ' #4e6788 46%,' +  /* midden blauw-grijs (bergen, sphere) */
  ' #3e5578 58%,' +  /* midden-donker (sphere-onder) */
  ' #2c4160 72%,' +  /* donkerblauw */
  ' #1a2c46 84%,' +  /* navy */
  ' #0c1728 93%,' +  /* bijna zwart */
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
/**
 * De omtrek van de glasplaat, als clip-path. Dezelfde getallen als de inline stijl van
 * de schil in AppShell (top/left/right/bottom/borderRadius): de vervaagde kopie van de
 * wallpaper moet er exact in passen, anders zie je een rand of een gat.
 */
const PLAAT_CLIP =
  'inset(calc(env(safe-area-inset-top, 0px) + var(--axe-plaat-boven, 2px)) 12px ' +
  'max(14px, calc(env(safe-area-inset-bottom, 0px) - 12px)) 12px round 28px)';

/** Volvlakse achtergrond-plaat achter de mobiele surfaces (gradiënt + korrel). */
export function MobileGlass() {
  const look = useLookValue();
  const wallpaper = useWallpaper();
  const { dim, blur } = useGlassTuning();
  // In de lichte stand blurt de plaat zelf (backdrop-filter, zie axe-look.css); de
  // schuif voor "vervaging" stuurt dan die waarde. 36 (standaard) komt zo op ~61px,
  // dicht bij de 64 die er altijd stond.
  useEffect(() => {
    document.documentElement.style.setProperty('--axe-glass-blur', `${Math.round(blur * 1.7)}px`);
  }, [blur]);
  // The Android lock screen is native and cannot read this app's storage: push the choice over, on
  // every change and once at start (a phone that never chose still has to tell it "Moraine Lake").
  // CSS needs to know a picture is behind the plate: the plate's own blue-grey tint (made for the
  // plain plate) then turns the picture into a flat haze (axe-look.css, [data-wp]).
  const heeftFoto = wallpaperCss(wallpaper) !== null;
  useEffect(() => {
    if (heeftFoto) document.documentElement.dataset.wp = '1'; else delete document.documentElement.dataset.wp;
  }, [heeftFoto]);
  useEffect(() => {
    syncLockWallpaper(
      wallpaper.kind,
      wallpaper.kind === 'preset' ? wallpaper.preset.id : wallpaper.kind === 'photo' ? wallpaper.dataUrl : '',
      dim, blur,
    );
  }, [wallpaper, dim, blur]);
  if (hasNativeGlass()) return null; // alleen op de macOS-desktop doet het native glas dit al
  const glass = look === 'glass';
  const foto = wallpaperCss(wallpaper);
  return (
    <div aria-hidden style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none' }}>
      {/* De grond: licht-blauw→grijs in de lichte stand, puur mat zwart met een
          subtiele schuine lichtstreep in de donkere. */}
      <div style={{ position: 'absolute', inset: 0, background: glass ? LICHT : ZWART }} />

      {foto && (
        <>
          {/* De gekozen wallpaper, scherp: dit zie je langs de rand van de plaat,
              zoals je op de Mac je bureaublad naast het venster ziet. */}
          {/* Donker: bijna grijs, zoals de Tauri-plaat (saturate 0 trekt de kleur uit het glas, zie axe-look.css);
              licht houdt de foto levendig. */}
          <div style={{ position: 'absolute', inset: 0, background: foto, filter: glass ? undefined : 'saturate(0.22)' }} />
          {/* Dezelfde wallpaper, vervaagd, alleen BINNEN de omtrek van de plaat: het
              doorzichtige glas van de Tauri-app. Geen backdrop-filter op de plaat
              zelf (die zou de matglas-lagen van chat en composer platslaan, zie
              axe-look.css); de vervaging zit in de afbeelding. In de lichte stand
              doet de plaat al een backdrop-blur, daar is dit dezelfde richting. */}
          {!glass && (
            <div
              style={{
                position: 'absolute', inset: 0, clipPath: PLAAT_CLIP, WebkitClipPath: PLAAT_CLIP,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  position: 'absolute', inset: -90, background: foto,
                  filter: `blur(${blur}px) saturate(0.2)`,
                }}
              />
            </div>
          )}
          {/* De sluier: in donker zwart (leesbaarheid), in licht een tikje wit. */}
          <div
            style={{
              position: 'absolute', inset: 0,
              // Dark: the Tauri dark plate (the picture darkened to ~30%). Light: the Tauri light plate keeps
              // the picture bright and saturated, with only a trace of milk over it.
              background: glass ? `rgba(255,255,255,${(dim * 0.1).toFixed(3)})` : `rgba(0,0,0,${dim})`,
            }}
          />
        </>
      )}

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
