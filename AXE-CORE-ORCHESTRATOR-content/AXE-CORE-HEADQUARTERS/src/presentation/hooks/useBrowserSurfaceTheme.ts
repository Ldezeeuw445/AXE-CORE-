import { useCallback, useEffect, useState } from 'react';

/** Only the browser chrome background — panels/composers stay the same. */
export type BrowserSurfaceTheme = 'axe' | 'glass';

const STORAGE_KEY = 'axe-browser-surface-theme';

export function useBrowserSurfaceTheme() {
  const [theme, setThemeState] = useState<BrowserSurfaceTheme>(() => {
    if (typeof window === 'undefined') return 'axe';
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === 'glass' ? 'glass' : 'axe';
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setThemeState(t => (t === 'axe' ? 'glass' : 'axe'));
  }, []);

  const setTheme = useCallback((next: BrowserSurfaceTheme) => {
    setThemeState(next);
  }, []);

  return { theme, toggleTheme, setTheme, isGlass: theme === 'glass' };
}
