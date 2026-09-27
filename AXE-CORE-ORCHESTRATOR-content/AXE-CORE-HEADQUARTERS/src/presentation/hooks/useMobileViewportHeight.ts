import { useEffect, useState } from 'react';

/** De mobiele shell moet aan de *zichtbare* viewport hangen, niet aan
 * window.screen. In een geïnstalleerde iPhone-PWA bevat screen.height ook het
 * gebied achter iOS-chrome/home-indicator. Dat maakte de vaste glasplaat hoger
 * dan wat werkelijk zichtbaar is en sneed precies de onderkant van de composer
 * af. visualViewport.height is de maat die iOS zelf voor het zichtbare vlak
 * rapporteert; dvh blijft de veilige fallback voor Safari/desktop. */
export function mobileViewportHeight(): string {
  if (typeof window === 'undefined') return '100dvh';
  const standalone = (window.navigator as Navigator & { standalone?: boolean }).standalone
    || window.matchMedia('(display-mode: standalone)').matches;
  if (!standalone || !/iPhone|iPad|iPod/.test(window.navigator.userAgent)
    || window.self !== window.top) return '100dvh';

  const visibleHeight = window.visualViewport?.height ?? window.innerHeight;
  return visibleHeight > 0 ? `${visibleHeight}px` : '100dvh';
}

export function useMobileViewportHeight(): string {
  const [height, setHeight] = useState(mobileViewportHeight);
  useEffect(() => {
    const update = () => setHeight(mobileViewportHeight());
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    window.addEventListener('pageshow', update);
    window.visualViewport?.addEventListener('resize', update);
    window.visualViewport?.addEventListener('scroll', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
      window.removeEventListener('pageshow', update);
      window.visualViewport?.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('scroll', update);
    };
  }, []);
  return height;
}
