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
}

export const WALLPAPER_PRESETS: readonly WallpaperPreset[] = [
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

/** What is stored -> what is shown. Anything unrecognised is "none", never a broken image. */
export function parseWallpaper(raw: string | null | undefined): Wallpaper {
  if (!raw) return { kind: 'none' };
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

export const DEFAULT_TUNING: GlassTuning = { dim: 0.35, blur: 36 };

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
