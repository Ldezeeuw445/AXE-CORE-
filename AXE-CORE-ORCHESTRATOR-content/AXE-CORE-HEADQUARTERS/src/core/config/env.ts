/**
 * Runtime environment detection.
 * Single source of truth for "where is this app running?" — every other
 * module asks here instead of probing window/import.meta itself.
 */

export const isTauri = () => {
  return typeof window !== 'undefined' && (window as any).__TAURI__ !== undefined;
};

export const isDev = () => {
  return import.meta.env.DEV || import.meta.env.MODE === 'development';
};
