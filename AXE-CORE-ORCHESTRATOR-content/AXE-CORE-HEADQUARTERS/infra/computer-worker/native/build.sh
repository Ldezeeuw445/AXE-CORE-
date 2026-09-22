#!/usr/bin/env bash
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP="$HERE/AXE Computer Use.app"
MACOS="$APP/Contents/MacOS"

rm -rf "$APP"
mkdir -p "$MACOS"
cp "$HERE/Info.plist" "$APP/Contents/Info.plist"

swiftc "$HERE/main.swift" \
  -O \
  -framework AppKit \
  -framework ApplicationServices \
  -framework CoreGraphics \
  -o "$MACOS/AXE Computer Use"

if [[ -n "${APPLE_SIGNING_IDENTITY:-}" ]]; then
  codesign --force --deep --options runtime --sign "$APPLE_SIGNING_IDENTITY" "$APP"
else
  codesign --force --deep --sign - "$APP"
fi

echo "$APP"
