/**
 * Loader for Google's Photorealistic 3D Maps (the `maps3d` library, alpha channel).
 * - Does NOT cache failed attempts — retries cleanly on next call.
 * - Handles both constructor-options and property-setting initialization styles.
 */

interface GoogleMapsNamespace {
  maps?: {
    importLibrary?: (name: string) => Promise<unknown>;
  };
}

declare global {
  interface Window {
    google?: GoogleMapsNamespace;
    __axeGMaps3DReady?: () => void;
  }
}

export interface Maps3DLibrary {
  Map3DElement: new () => HTMLElement & Record<string, unknown>;
  Marker3DElement: new () => HTMLElement & Record<string, unknown>;
  AltitudeMode?: unknown;
}

/** Module-level bootstrap promise — only caches SUCCESS, cleared on failure. */
let bootstrapPromise: Promise<void> | null = null;

function loadBootstrapScript(apiKey: string): Promise<void> {
  // Already successfully loaded?
  if (typeof window.google?.maps?.importLibrary === 'function') return Promise.resolve();
  // Already loading?
  if (bootstrapPromise) return bootstrapPromise;

  bootstrapPromise = new Promise<void>((resolve, reject) => {
    const callbackName = '__axeGMaps3DReady';
    window[callbackName] = () => {
      delete window[callbackName];
      resolve();
    };
    const params = new URLSearchParams({
      key: apiKey,
      v: 'alpha',
      callback: callbackName,
      loading: 'async',
    });
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
    script.async = true;
    script.defer = true;
    script.onerror = () => {
      bootstrapPromise = null; // allow retry
      reject(new Error('Failed to load Google Maps JS bootstrap — check API key and network'));
    };
    document.head.appendChild(script);
  }).catch((err) => {
    bootstrapPromise = null; // clear cache so next call retries
    throw err;
  });

  return bootstrapPromise;
}

export async function loadMaps3D(apiKey: string): Promise<Maps3DLibrary> {
  if (!apiKey) throw new Error('VITE_GOOGLE_MAPS_API_KEY is not set');
  await loadBootstrapScript(apiKey);
  if (!window.google?.maps?.importLibrary) {
    throw new Error('google.maps.importLibrary unavailable after bootstrap');
  }
  const lib = (await window.google.maps.importLibrary('maps3d')) as unknown as Maps3DLibrary;
  if (!lib?.Map3DElement) {
    throw new Error(
      'maps3d library did not expose Map3DElement — ensure "Map Tiles API" is enabled with billing in Google Cloud Console'
    );
  }
  return lib;
}
