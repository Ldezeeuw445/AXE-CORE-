/**
 * The picture behind the glass plate, and how strongly it shows through.
 *
 * On the Mac the plate is native vibrancy: macOS blurs *your desktop picture* through
 * the window. A phone has no such thing, so the app paints its own: a wallpaper behind
 * the plate, and a blurred copy of it inside the plate's outline. This file is only the
 * data: what can be chosen, how it is stored, and which values are allowed. Painting is
 * in MobileGlass.tsx.
 *
 * ## Storage
 *
 * One localStorage string, because that is what the first version stored (a bare
 * data-URL) and phones that already picked a photo must keep it:
 *
 *   ""                    nothing chosen: the plain plate (black / blue-grey gradient)
 *   "preset:<id>"         one of [WALLPAPER_PRESETS]
 *   "data:image/..."      a photo from the library, downscaled by [downscaleToDataUrl]
 *
 * Presets are CSS gradients, not image files: nothing to download, nothing to cache,
 * identical on every device, and sharp at any resolution.
 */

export interface WallpaperPreset {
  id: string;
  label: string;
  /** A CSS `background` value. */
  css: string;
  /**
   * The picture file under `public/wallpapers/`, for photo presets. The Android lock screen
   * cannot render CSS, so it reads this same file out of the bundled web assets: one picture,
   * one place, on both sides.
   */
  file?: string;
}

/** Where the bundled photos live, relative to the app's base (the APK serves it under /web/). */
const BASE = (typeof import.meta !== 'undefined' && (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL) || '/';
const photo = (file: string) => `url("${BASE}wallpapers/${file}") center / cover no-repeat`;


/**
 * The dark mountain scene of the desktop, as a vector picture.
 *
 * Generated rather than shipped: no photo of it exists in the repo, an SVG is sharp on any
 * screen and weighs a few KB, and the same ridge formula is used by the Android lock screen
 * (NightPeaks.kt), so the lock screen and the app behind it are one scene. Stars come from a
 * fixed seed so the sky is the same on every launch.
 */
export function nightPeaksCss(): string {
  const W = 400, H = 800;
  const ridge = (seed: number, base: number, amp: number) => {
    const pts: string[] = [];
    for (let i = 0; i <= 64; i++) {
      const t = i / 64;
      const y = base - amp * (0.55 * Math.sin(t * 6.3 + seed) + 0.3 * Math.sin(t * 13.1 + seed * 1.7) + 0.15 * Math.sin(t * 27.5 + seed * 0.6));
      pts.push(`${(W * t).toFixed(1)},${y.toFixed(1)}`);
    }
    return pts;
  };
  let r = 42;
  const rnd = () => { r = (r * 1664525 + 1013904223) % 4294967296; return r / 4294967296; };
  const stars = Array.from({ length: 90 }, () =>
    `<circle cx="${(rnd() * W).toFixed(1)}" cy="${(rnd() * H * 0.46).toFixed(1)}" r="${(0.35 + rnd() * 0.8).toFixed(2)}" fill="#fff" opacity="${(0.12 + rnd() * 0.5).toFixed(2)}"/>`,
  ).join('');
  const layers = [
    { seed: 1.1, base: H * 0.4, amp: H * 0.075, fill: '#0D1B2E', rim: 'rgba(111,182,232,.3)' },
    { seed: 3.4, base: H * 0.46, amp: H * 0.085, fill: '#08121F', rim: 'rgba(111,182,232,.2)' },
    { seed: 5.9, base: H * 0.54, amp: H * 0.07, fill: '#050B14', rim: '' },
  ].map(l => {
    const pts = ridge(l.seed, l.base, l.amp);
    const fill = `<polygon points="0,${H} ${pts.join(' ')} ${W},${H}" fill="${l.fill}"/>`;
    const rim = l.rim ? `<polyline points="${pts.join(' ')}" fill="none" stroke="${l.rim}" stroke-width="0.8"/>` : '';
    return fill + rim;
  }).join('');
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#05080F"/><stop offset=".38" stop-color="#0A1424"/>` +
    `<stop offset=".62" stop-color="#0B1A2E"/><stop offset="1" stop-color="#03060B"/></linearGradient>` +
    `<radialGradient id="m" cx=".55" cy=".3" r=".9"><stop offset="0" stop-color="#20486E" stop-opacity=".2"/><stop offset="1" stop-color="#20486E" stop-opacity="0"/></radialGradient></defs>` +
    `<rect width="${W}" height="${H}" fill="url(#g)"/><rect width="${W}" height="${H}" fill="url(#m)"/>${stars}${layers}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") center / cover no-repeat`;
}

export const WALLPAPER_PRESETS: readonly WallpaperPreset[] = [
  // The desktop's own pictures, at phone size. Moraine Lake is the one the Tauri shell shows
  // through its frosted plate, and is therefore what a phone that never chose shows too.
  { id: 'moraine', label: 'Moraine Lake', css: photo('moraine.jpg'), file: 'moraine.jpg' },
  { id: 'valley', label: 'Valley of Fire', css: photo('valley.jpg'), file: 'valley.jpg' },
  { id: 'yosemite', label: 'Yosemite', css: photo('yosemite.jpg'), file: 'yosemite.jpg' },
  { id: 'sunrise', label: 'Sunrise', css: photo('sunrise.jpg'), file: 'sunrise.jpg' },
  { id: 'peaks', label: 'Night peaks', css: nightPeaksCss() },
  {
    id: 'aurora', label: 'Aurora',
    css: 'radial-gradient(90% 60% at 20% 15%, rgba(52,211,153,.75), transparent 60%),' +
      'radial-gradient(80% 60% at 85% 30%, rgba(139,92,246,.8), transparent 60%),' +
      'radial-gradient(100% 70% at 50% 100%, rgba(34,211,238,.5), transparent 65%), #060913',
  },
  {
    id: 'dusk', label: 'Dusk',
    css: 'radial-gradient(100% 60% at 50% 0%, rgba(251,146,60,.85), transparent 62%),' +
      'radial-gradient(90% 70% at 10% 80%, rgba(168,85,247,.7), transparent 60%),' +
      'radial-gradient(90% 70% at 100% 90%, rgba(59,130,246,.6), transparent 60%), #0b0716',
  },
  {
    id: 'ocean', label: 'Ocean',
    css: 'radial-gradient(110% 60% at 70% 0%, rgba(56,189,248,.8), transparent 60%),' +
      'radial-gradient(90% 70% at 0% 70%, rgba(37,99,235,.75), transparent 62%),' +
      'radial-gradient(90% 60% at 80% 100%, rgba(20,184,166,.55), transparent 62%), #04101f',
  },
  {
    id: 'mist', label: 'Mist',
    // The tonal blue-grey of the mountains behind the glass on the Mac.
    css: 'linear-gradient(180deg, #bcd8ee 0%, #98bcdd 18%, #6d88a8 34%, #4e6788 46%,' +
      '#3e5578 58%, #2c4160 72%, #1a2c46 84%, #0c1728 93%, #000 100%)',
  },
  {
    id: 'ember', label: 'Ember',
    css: 'radial-gradient(90% 60% at 80% 10%, rgba(244,63,94,.75), transparent 60%),' +
      'radial-gradient(90% 70% at 10% 90%, rgba(245,158,11,.6), transparent 62%), #12060a',
  },
  {
    id: 'graphite', label: 'Graphite',
    css: 'radial-gradient(100% 60% at 30% 0%, rgba(148,163,184,.55), transparent 62%),' +
      'radial-gradient(90% 60% at 90% 100%, rgba(100,116,139,.4), transparent 62%), #0a0b0e',
  },
] as const;

export type Wallpaper =
  | { kind: 'none' }
  | { kind: 'preset'; preset: WallpaperPreset }
  | { kind: 'photo'; dataUrl: string };

export const PRESET_PREFIX = 'preset:';

/** What a phone that never chose shows: the desktop's picture, behind the frosted plate. */
export const DEFAULT_WALLPAPER_ID = 'moraine';

/**
 * What is stored -> what is shown. Anything unrecognised is "none", never a broken image.
 *
 * Never chosen (null/undefined) is NOT the same as chosen "plain" (''): the first gets the
 * desktop's picture, the second respects that you asked for none. (For one afternoon the
 * default was a drawn night scene and the app stopped looking like the Tauri shell; the
 * default is now the very picture that shell shows.)
 */
export function parseWallpaper(raw: string | null | undefined): Wallpaper {
  if (raw == null) {
    const preset = WALLPAPER_PRESETS.find(p => p.id === DEFAULT_WALLPAPER_ID);
    return preset ? { kind: 'preset', preset } : { kind: 'none' };
  }
  if (raw === '') return { kind: 'none' };
  if (raw.startsWith(PRESET_PREFIX)) {
    const preset = WALLPAPER_PRESETS.find(p => p.id === raw.slice(PRESET_PREFIX.length));
    return preset ? { kind: 'preset', preset } : { kind: 'none' };
  }
  if (/^data:image\/(png|jpe?g|webp|gif);base64,/i.test(raw)) return { kind: 'photo', dataUrl: raw };
  return { kind: 'none' };
}

export function serializeWallpaper(w: Wallpaper): string {
  switch (w.kind) {
    case 'none': return '';
    case 'preset': return PRESET_PREFIX + w.preset.id;
    case 'photo': return w.dataUrl;
  }
}

/** The CSS `background` of the picture layer, or null when there is none. */
export function wallpaperCss(w: Wallpaper): string | null {
  switch (w.kind) {
    case 'none': return null;
    case 'preset': return w.preset.css;
    case 'photo': return `url("${w.dataUrl}") center / cover no-repeat`;
  }
}

/** How the picture is dimmed and how much the plate blurs it. */
export interface GlassTuning {
  /** 0..0.85: darkness laid over the picture, outside and inside the plate. */
  dim: number;
  /** 0..80px: blur of the picture seen through the plate. */
  blur: number;
}

/**
 * The Tauri dark plate: the picture blurred hard and darkened to about 70%. Measured on the
 * desktop shell over Moraine Lake: the bright sky comes out around #3c3c3c, the shadows near black.
 */
export const DEFAULT_TUNING: GlassTuning = { dim: 0.72, blur: 44 };

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Stored values are strings from localStorage; garbage falls back to the default, not to 0. */
export function parseTuning(dim: string | null | undefined, blur: string | null | undefined): GlassTuning {
  const d = dim == null || dim === '' ? NaN : Number(dim);
  const b = blur == null || blur === '' ? NaN : Number(blur);
  return {
    dim: Number.isFinite(d) ? clamp(d, 0, 0.85) : DEFAULT_TUNING.dim,
    blur: Number.isFinite(b) ? clamp(b, 0, 80) : DEFAULT_TUNING.blur,
  };
}

/**
 * Size a picked photo down before it is stored.
 *
 * A phone photo is 4-12 MB; localStorage holds about 5 MB for the whole origin, and a
 * full-size data-URL would either throw on save or push everything else out. A
 * wallpaper only has to cover a phone screen: 1440px on the long edge is sharper than
 * the display, and a JPEG at that size is a few hundred KB.
 */
export function fitWithin(width: number, height: number, longEdge = 1440): { width: number; height: number } {
  const scale = Math.min(1, longEdge / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}
