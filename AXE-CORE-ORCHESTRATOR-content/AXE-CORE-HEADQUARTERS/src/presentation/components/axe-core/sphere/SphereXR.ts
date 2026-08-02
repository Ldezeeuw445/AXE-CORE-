/**
 * SphereXR — WebXR entry for AXE CORE sphere on Home.
 * Never navigates to another route; living display stays on the sphere.
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

export function installSphereXR() {
  window.addEventListener('axe-enter-xr', async (e: Event) => {
    const detail = (e as CustomEvent).detail as {
      lat?: number;
      lng?: number;
      label?: string;
      title?: string;
      mode?: string;
    } | undefined;
    console.log('[SphereXR] Enter XR requested (stay on Home)', detail);

    const supported = await checkXRSupport();
    if (!supported) {
      // Desktop / no headset: keep user on Home sphere — map is already projected
      console.info('[SphereXR] No WebXR device — living map stays on Home sphere');
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
      console.warn('[SphereXR] Failed to start VR session — stay on Home', err);
    }
  });
}
