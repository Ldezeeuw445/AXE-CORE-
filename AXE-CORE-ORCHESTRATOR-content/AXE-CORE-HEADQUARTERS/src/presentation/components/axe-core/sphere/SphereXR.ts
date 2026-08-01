/**
 * SphereXR — minimal WebXR entry point for AXE CORE sphere.
 * Listens for 'axe-enter-xr' and starts an immersive VR session when possible.
 * On desktop (no XR) falls back to the Maps3D route with the requested location.
 */

let xrSupported: boolean | null = null;

export async function checkXRSupport(): Promise<boolean> {
  if (xrSupported !== null) return xrSupported;
  if (!navigator.xr) {
    xrSupported = false;
    return false;
  }
  try {
    xrSupported = await navigator.xr.isSessionSupported('immersive-vr');
  } catch {
    xrSupported = false;
  }
  return xrSupported;
}

function maps3dHash(lat: number, lng: number, label: string): string {
  // HashRouter: path is after #
  const q = new URLSearchParams({
    lat: String(lat),
    lng: String(lng),
    label,
  });
  return `#/maps-3d?${q.toString()}`;
}

export function installSphereXR() {
  window.addEventListener('axe-enter-xr', async (e: Event) => {
    const detail = (e as CustomEvent).detail as {
      lat?: number;
      lng?: number;
      label?: string;
      title?: string;
      mode?: string;
    } | undefined;
    console.log('[SphereXR] Enter XR requested', detail);

    const lat = detail?.lat ?? 40.7128;
    const lng = detail?.lng ?? -74.006;
    const label = detail?.label ?? detail?.title ?? 'Location';

    const supported = await checkXRSupport();
    if (!supported) {
      window.location.hash = maps3dHash(lat, lng, label).replace(/^#/, '#');
      // Ensure navigation even if already on a hash route
      if (!window.location.hash.includes('maps-3d')) {
        window.location.href = maps3dHash(lat, lng, label);
      }
      return;
    }

    try {
      const session = await navigator.xr!.requestSession('immersive-vr', {
        requiredFeatures: ['local-floor'],
        optionalFeatures: ['hand-tracking', 'layers'],
      });
      console.log('[SphereXR] Immersive VR session started', session);
      // TODO: attach to HolographicSphere renderer + load map scene
      session.addEventListener('end', () => {
        console.log('[SphereXR] Session ended');
      });
    } catch (err) {
      console.warn('[SphereXR] Failed to start VR session', err);
      window.location.href = maps3dHash(lat, lng, label);
    }
  });
}
