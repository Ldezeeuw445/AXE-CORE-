/**
 * Minimal loader for Google's Photorealistic 3D Maps (the `maps3d` library,
 * currently in the `alpha` release channel). Loads the official bootstrap
 * script once, then resolves the maps3d library via google.maps.importLibrary.
 *
 * Requires the API key behind VITE_GOOGLE_MAPS_API_KEY to have both the
 * "Maps JavaScript API" and "Map Tiles API" enabled with billing active on
 * its Google Cloud project — that's Google Cloud Console configuration we
 * can't do on your behalf. If either isn't enabled, this rejects and the
 * caller should fall back to the built-in Three.js globe.
 */

interface GoogleMapsNamespace {
  maps?: {
    importLibrary: (name: string) => Promise<unknown>;
  };
}

declare global {
  interface Window {
    google?: GoogleMapsNamespace;
  }
}

let loaderPromise: Promise<void> | null = null;

function loadBootstrapScript(apiKey: string): Promise<void> {
  if (loaderPromise) return loaderPromise;
  loaderPromise = new Promise((resolve, reject) => {
    if (window.google && window.google.maps && "importLibrary" in window.google.maps) { resolve(); return; }
    const params = new URLSearchParams({ key: apiKey, v: "alpha", callback: "__axeGMaps3DReady" });
    (window as unknown as Record<string, () => void>).__axeGMaps3DReady = () => resolve();
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
    script.async = true;
    script.onerror = () => reject(new Error("Failed to load Google Maps JS bootstrap script"));
    document.head.appendChild(script);
  });
  return loaderPromise;
}

export interface Maps3DLibrary {
  Map3DElement: new (opts: Record<string, unknown>) => HTMLElement & Record<string, unknown>;
  Marker3DElement: new (opts?: Record<string, unknown>) => HTMLElement & Record<string, unknown>;
}

export async function loadMaps3D(apiKey: string): Promise<Maps3DLibrary> {
  if (!apiKey) throw new Error("Google Maps API key not configured (VITE_GOOGLE_MAPS_API_KEY)");
  await loadBootstrapScript(apiKey);
  if (!window.google?.maps?.importLibrary) throw new Error("google.maps.importLibrary unavailable after script load");
  const lib = await window.google.maps.importLibrary("maps3d") as unknown as Maps3DLibrary;
  if (!lib?.Map3DElement) throw new Error("maps3d library did not expose Map3DElement — Map Tiles API may not be enabled");
  return lib;
}
