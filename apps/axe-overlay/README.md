# AXE Overlay (always-on notch)

Lightweight always-on-top AXE chat for Mac mini + iMac. Visual language matches
louis_rlee notch refs: starry dark pill, white blob mascot, home / chat / + /
settings / volume; expands to attachment + Continue….

## Modes

1. **In-shell float** (already in HQ): `openZwevend('axe')` → `/float/axe`
   WebviewWindow, alwaysOnTop, transparent.
2. **Standalone** (this folder): separate Tauri binary that only shows the
   notch — for Login Items launch without opening the full HQ shell.

## Build standalone (on a Mac with Xcode + Rust)

```bash
cd apps/axe-overlay
npm install
npm run tauri build
# .app → dist/bundle/macos/AXE Overlay.app
```

## Install (manual — agent does not install on your Macs)

1. Copy `AXE Overlay.app` to `/Applications`.
2. System Settings → General → Login Items → `+` → AXE Overlay.
3. First launch: allow Accessibility if prompted; pin stays on by default.
4. Optional: keep HQ float as fallback via radial dock → AXE overlay.

## Dev

```bash
npm run tauri dev
```

Points at the same AxeOverlayNotch UI (copied or linked from HQ
`src/presentation/components/overlay`).
