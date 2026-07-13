---
name: Google Photorealistic 3D Tiles caveat
description: Constraints when building a Google Earth-style photorealistic 3D map feature.
---

Google's photorealistic 3D globe (the `maps3d` library, loaded via `google.maps.importLibrary("maps3d")` with `v=alpha` on the JS bootstrap loader) requires the Google Cloud project behind the API key to have **both** "Maps JavaScript API" and "Map Tiles API" enabled, with billing active — the free tier of a basic Maps key is not enough.

**Why:** This is Google Cloud Console configuration, not something settable via a Replit secret or from app code — we cannot enable it on the user's behalf, and there's no way to verify in advance whether it's already enabled.

**How to apply:** Always build a working fallback (e.g. a Three.js/WebGL globe) that activates automatically if `importLibrary` rejects or `Map3DElement` is missing, and surface a clear on-screen message naming the two APIs the user needs to enable, rather than silently failing or blocking the whole feature on Google Cloud setup.
