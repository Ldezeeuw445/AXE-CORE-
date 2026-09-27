import { useEffect, useState } from 'react';

/** In de geïnstalleerde iPhone-PWA kan de layoutviewport korter blijven dan
 * het scherm. Een bottom-inset houdt dan de hele plaat én composer te hoog.
 * Alleen daar gebruiken we de schermhoogte; Safari-tabs en desktop houden dvh.
 */
export function mobileViewportHeight(): string {
  if (typeof window === 'undefined') return '100dvh';
  const standalone = (window.navigator as Navigator & { standalone?: boolean }).standalone
    || window.matchMedia('(display-mode: standalone)').matches;
  if (!standalone || !/iPhone|iPad|iPod/.test(window.navigator.userAgent)
    || window.self !== window.top) return '100dvh';

  const { width, height } = window.screen;
  if (!width || !height) return '100dvh';
  const landscape = window.matchMedia('(orientation: landscape)').matches;
  return `${landscape ? Math.min(width, height) : Math.max(width, height)}px`;
}

export function useMobileViewportHeight(): string {
  const [height, setHeight] = useState(mobileViewportHeight);
  useEffect(() => {
    const update = () => setHeight(mobileViewportHeight());
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    window.addEventListener('pageshow', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
      window.removeEventListener('pageshow', update);
    };
  }, []);
  return height;
}
