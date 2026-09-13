/**
 * useWallpaper — de foto achter het glas op de telefoon, instelbaar.
 *
 * Op de Mac toont het native glas je bureaubladwallpaper; een telefoon heeft dat
 * niet. Hier kies je zelf een afbeelding: die wordt als data-URL in localStorage
 * bewaard (per toestel) en meteen de plaat. Niets gekozen → de gebundelde
 * standaard (`/mobile-wallpaper.jpg`), en faalt die ook, dan valt MobileGlass
 * terug op de kleur-gradiënt. Zo is er altijd iets, en kun je het altijd wisselen.
 */
import { useEffect, useState } from 'react';

const KEY = 'axe_mobile_wallpaper';
const EVT = 'axe-wallpaper-changed';

/** Gebundelde standaard. Zet je eigen foto op deze plek in `public/` voor een
 *  vaste default; anders kiest de gebruiker er zelf een in de app. */
const DEFAULT_WALLPAPER = '/mobile-wallpaper.jpg';

function read(): string {
  try {
    return localStorage.getItem(KEY) || DEFAULT_WALLPAPER;
  } catch {
    return DEFAULT_WALLPAPER;
  }
}

export function useWallpaper(): string {
  const [wp, setWp] = useState<string>(read);
  useEffect(() => {
    const on = () => setWp(read());
    window.addEventListener(EVT, on);
    window.addEventListener('storage', on);
    return () => {
      window.removeEventListener(EVT, on);
      window.removeEventListener('storage', on);
    };
  }, []);
  return wp;
}

/** Zet een gekozen afbeelding (data-URL) als wallpaper en laat iedereen bijwerken. */
export function setMobileWallpaper(dataUrl: string): void {
  try { localStorage.setItem(KEY, dataUrl); } catch { /* private mode */ }
  try { window.dispatchEvent(new CustomEvent(EVT)); } catch { /* */ }
}
