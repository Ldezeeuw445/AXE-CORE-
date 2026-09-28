#!/usr/bin/env bash
set -euo pipefail
trap 'rc=$?; printf "\n✖ AXE Camera helper build stopte bij regel %s: %s (exit %s)\n" "$LINENO" "$BASH_COMMAND" "$rc" >&2' ERR

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP="$HERE/AXE Camera.app"
MACOS="$APP/Contents/MacOS"

rm -rf "$APP"
mkdir -p "$MACOS"
cp "$HERE/Info.plist" "$APP/Contents/Info.plist"

swiftc "$HERE/main.swift" \
  -O \
  -framework AVFoundation \
  -framework AppKit \
  -framework CoreMedia \
  -framework CoreVideo \
  -o "$MACOS/AXE Camera"

if [[ -n "${APPLE_SIGNING_IDENTITY:-}" ]]; then
  codesign --force --deep --sign "$APPLE_SIGNING_IDENTITY" "$APP"
else
  codesign --force --deep --sign - "$APP"
fi

echo "$APP"
