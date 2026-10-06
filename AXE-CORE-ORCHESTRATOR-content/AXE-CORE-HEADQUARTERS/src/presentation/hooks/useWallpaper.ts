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
  type Wallpaper, type GlassTuning, parseWallpaper,
  parseTuning, fitWithin, WALLPAPER_PRESETS, PRESET_PREFIX,
} from '@/domain/wallpaper';

const KEY = 'axe_mobile_wallpaper';
const KEY_DIM = 'axe_wp_dim';
const KEY_BLUR = 'axe_wp_blur';
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
function readTuning(): GlassTuning { return parseTuning(get(KEY_DIM), get(KEY_BLUR)); }

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
export function useGlassTuning(): GlassTuning { return useStored(readTuning); }

export function clearWallpaper(): void { set(KEY, ''); notify(); }

export function setWallpaperPreset(id: string): void {
  if (!WALLPAPER_PRESETS.some(p => p.id === id)) return;
  set(KEY, PRESET_PREFIX + id);
  notify();
}

export function setGlassTuning(t: Partial<GlassTuning>): void {
  const cur = readTuning();
  const next = parseTuning(String(t.dim ?? cur.dim), String(t.blur ?? cur.blur));
  set(KEY_DIM, String(next.dim));
  set(KEY_BLUR, String(next.blur));
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
