# AXE Overlay (macOS notch)

Always-on-top floating notch for AXE Core — chat, file drop, push-to-talk, live
computer/browser-use tasks, approvals, and a one-click HQ shell open.

## Character

The notch mascot is **AXE-own SVG** (charcoal / cyan→violet TriangleLogo palette).
It is **not** Mochi artwork. Mochi assets are reserved under LICENSE-ASSETS and
must not be shipped here.

Island FSM / drag-drop / expand patterns were studied from
[Coucou](https://github.com/louis_rlee/Coucou) (MIT, Louis Raillé). Implementation
in this repo is original AXE code.

## Features

- **Shell-aware**: notch appears only when AXE CORE is minimized/hidden/closed
  (“AXE always on your side”), with emerge/retract animation; click reopens the shell
- Top-center pill with animated idle / thinking / working / done states
- Expand panel: chat → HQ `/chat` with `computer_use` + `browser_use` hints
- Drag-and-drop files into AXE (context attached to next message)
- Push-to-talk (Web Speech API, `nl-NL`)
- Live tasks + pending approvals polled from the API
- “Open shell” → HQ in the default browser / Tauri shell plugin

## Dev

```bash
cd apps/axe-overlay
cp .env.example .env   # AXE_CORE_API_KEY + optional AXE_CORE_API_ORIGIN
npm install
npm run tauri dev
```

## Release (Mac)

```bash
npm run tauri build
# Install .app / .dmg on iMac (preferred) or Mac mini when idle
```

Never put secrets, trades, payments, or mailbox credentials in the overlay UI.
