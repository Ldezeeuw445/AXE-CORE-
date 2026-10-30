#!/usr/bin/env bash
# Build AXE Overlay .app + .dmg on macOS (Apple Silicon or Intel).
# Run on Luka's iMac — the Linux box cannot produce macOS bundles.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> AXE Overlay macOS build"
echo "    cwd: $ROOT"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "FOUT: dit script moet op macOS draaien (nu: $(uname -s))."
  echo "Op de iMac:"
  echo "  cd /pad/naar/AXE-CORE/apps/axe-overlay && npm run build:macos"
  exit 1
fi

command -v npm >/dev/null || { echo "FOUT: npm ontbreekt"; exit 1; }
command -v rustc >/dev/null || {
  echo "Rust ontbreekt. Installeer eerst:"
  echo '  curl --proto "=https" --tlsv1.2 -sSf https://sh.rustup.rs | sh'
  exit 1
}

# Xcode CLT needed for linking
if ! xcode-select -p >/dev/null 2>&1; then
  echo "FOUT: Xcode Command Line Tools ontbreken. Draai: xcode-select --install"
  exit 1
fi

echo "==> npm ci / install"
if [[ -f package-lock.json ]]; then
  npm ci
else
  npm install
fi

echo "==> tauri build (app + dmg)"
npm run tauri build

APP="$(find src-tauri/target/release/bundle/macos -maxdepth 1 -name '*.app' 2>/dev/null | head -1 || true)"
DMG="$(find src-tauri/target/release/bundle/dmg -maxdepth 1 -name '*.dmg' 2>/dev/null | head -1 || true)"

echo ""
echo "==> Klaar"
[[ -n "$APP" ]] && echo "    .app: $APP"
[[ -n "$DMG" ]] && echo "    .dmg: $DMG"
if [[ -z "$APP" && -z "$DMG" ]]; then
  echo "    (geen bundle gevonden — check tauri build output hierboven)"
  exit 1
fi
