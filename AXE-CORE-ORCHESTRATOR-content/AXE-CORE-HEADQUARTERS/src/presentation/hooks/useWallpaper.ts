/**
 * useWallpaper — the picture behind the glass, and how it shows through.
 *
 * On the Mac the plate is native glass over *your* desktop picture. A phone has no
 * desktop to look through, so you choose one here: a preset, or a photo from the
 * library (downscaled, see `fitWithin`). Stored per device in localStorage; the look
 * (dark/light) is the thing that syncs between devices, a photo is too big for that.
 *
 * Nothing chosen is a valid, designed state: the plain plate that was there before.
 */
import { useEffect, useState } from 'react';
import {
  type Wallpaper, type GlassTuning, type PlaatLook, parseWallpaper,
  parseTuning, fitWithin, WALLPAPER_PRESETS, PRESET_PREFIX, DEFAULT_TUNINGS,
} from '@/domain/wallpaper';
import { useLookValue } from '@/presentation/hooks/usePlaatInk';

const KEY = 'axe_mobile_wallpaper';
/* Per look apart (7 okt 2026). De oude gedeelde sleutels (`axe_wp_dim`/`axe_wp_blur`)
   waren in de praktijk de donkere stand -- licht deed er niets mee -- dus die zijn de
   startwaarde voor donker, niet voor licht. */
const OUD_DIM = 'axe_wp_dim';
const OUD_BLUR = 'axe_wp_blur';
const keyDim = (l: PlaatLook) => `axe_wp_dim_${l}`;
const keyBlur = (l: PlaatLook) => `axe_wp_blur_${l}`;
const EVT = 'axe-wallpaper-changed';

function get(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

function set(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* private mode / quota: keep what is on screen */ }
}

function notify() {
  try { window.dispatchEvent(new CustomEvent(EVT)); } catch { /* */ }
}

function readWallpaper(): Wallpaper { return parseWallpaper(get(KEY)); }
function readTuningFor(look: PlaatLook): GlassTuning {
  const dim = get(keyDim(look));
  const blur = get(keyBlur(look));
  // Donker zonder eigen waarde: neem wat er vóór de splitsing stond -- behalve de oude
  // standaard (0.66/30), want die was te grijs; dan geldt de nieuwe matte standaard.
  if (look === 'black' && dim == null && blur == null) {
    const oudDim = get(OUD_DIM);
    if (oudDim != null && oudDim !== '0.66') return parseTuning(oudDim, get(OUD_BLUR), DEFAULT_TUNINGS.black);
  }
  return parseTuning(dim, blur, DEFAULT_TUNINGS[look]);
}
const readTunings = (): Record<PlaatLook, GlassTuning> => ({ black: readTuningFor('black'), glass: readTuningFor('glass') });

function useStored<T>(read: () => T): T {
  const [v, setV] = useState<T>(read);
  useEffect(() => {
    const on = () => setV(read());
    window.addEventListener(EVT, on);
    window.addEventListener('storage', on);
    return () => {
      window.removeEventListener(EVT, on);
      window.removeEventListener('storage', on);
    };
    // `read` is a module-level function: stable by construction.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return v;
}

export function useWallpaper(): Wallpaper { return useStored(readWallpaper); }
/** De glas-instelling van de stand die nu aan staat. */
export function useGlassTuning(): GlassTuning {
  const look = useLookValue() === 'glass' ? 'glass' : 'black';
  const alle = useStored(readTunings);
  return alle[look];
}

export function clearWallpaper(): void { set(KEY, ''); notify(); }

export function setWallpaperPreset(id: string): void {
  if (!WALLPAPER_PRESETS.some(p => p.id === id)) return;
  set(KEY, PRESET_PREFIX + id);
  notify();
}

/** Alleen de glas-instelling van `look`; de andere stand blijft zoals hij was. */
export function setGlassTuning(look: PlaatLook, t: Partial<GlassTuning>): void {
  const cur = readTuningFor(look);
  const next = parseTuning(String(t.dim ?? cur.dim), String(t.blur ?? cur.blur), DEFAULT_TUNINGS[look]);
  set(keyDim(look), String(next.dim));
  set(keyBlur(look), String(next.blur));
  notify();
}

/**
 * A photo from the library -> stored wallpaper.
 *
 * Re-encoded as JPEG at screen size first: an original is several MB and would either
 * throw on save or push the rest of the origin's localStorage out. Rejects with a
 * readable message instead of leaving the old wallpaper silently in place.
 */
export async function setWallpaperFromFile(file: File): Promise<void> {
  if (!file.type.startsWith('image/')) throw new Error('That file is not an image.');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('The photo could not be read.'));
      i.src = url;
    });
    const { width, height } = fitWithin(img.naturalWidth, img.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not prepare the photo.');
    ctx.drawImage(img, 0, 0, width, height);

    // Step the quality down until it fits comfortably: a stored wallpaper has to leave
    // room for everything else the app keeps in localStorage.
    let out = '';
    for (const q of [0.82, 0.7, 0.55, 0.4]) {
      out = canvas.toDataURL('image/jpeg', q);
      if (out.length < 1_800_000) break;
    }
    if (out.length >= 1_800_000) throw new Error('That photo is too detailed to store; pick a simpler one.');
    try {
      localStorage.setItem(KEY, out);
    } catch {
      throw new Error('There is not enough room on this device to keep that photo.');
    }
    notify();
  } finally {
    URL.revokeObjectURL(url);
  }
}
