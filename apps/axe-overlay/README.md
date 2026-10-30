# AXE Overlay

Standalone macOS floating notch + expandable chat (Tauri 2). Always-on-top, launch at login, talks to the AXE backend (`api.axecompanion.com`). UI inspired by the louis_rlee-style notch bar.

## Why this app

HQ already has an in-web `AxeOverlayNotch`. This package is the **real** desktop shell: its own `.app`, Login Items, transparent always-on-top window under the menu bar / notch.

## Security

- **No API keys in the bundle or git.** Put your key in:
  `~/Library/Application Support/nl.axe.overlay/config.json`
  ```json
  { "apiOrigin": "https://api.axecompanion.com", "apiKey": "…" }
  ```
- Chat uses `POST /proxy/ai`. Health uses `GET /health`.

## Dev (any OS for frontend; native shell needs macOS)

```bash
cd apps/axe-overlay
npm install
npm run dev          # Vite only (transparent UI in browser)
# on macOS with Rust + Xcode CLT:
npm run tauri:dev
```

## Build & install (macOS / iMac)

```bash
cd apps/axe-overlay
npm run build:macos
npm run install:macos
open -a "AXE Overlay"
```

Exact one-liners: see [INSTALL.md](./INSTALL.md).

## Linux / CI note

This repo’s Linux box **cannot** produce `.app` / `.dmg`. `scripts/build-macos.sh` exits with a clear message off-Darwin; CI should treat macOS bundle as a Mac-only job.
