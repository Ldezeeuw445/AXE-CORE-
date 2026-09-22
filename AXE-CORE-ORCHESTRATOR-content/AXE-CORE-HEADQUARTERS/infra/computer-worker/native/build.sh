#!/usr/bin/env bash
set -euo pipefail
trap 'rc=$?; printf "\n✖ AXE Computer Use helper build stopte bij regel %s: %s (exit %s)\n" "$LINENO" "$BASH_COMMAND" "$rc" >&2' ERR

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP="$HERE/AXE Computer Use.app"
MACOS="$APP/Contents/MacOS"

rm -rf "$APP"
mkdir -p "$MACOS"
cp "$HERE/Info.plist" "$APP/Contents/Info.plist"

swiftc "$HERE/main.swift" \
  -parse-as-library \
  -O \
  -framework AppKit \
  -framework ApplicationServices \
  -framework CoreGraphics \
  -framework ScreenCaptureKit \
  -o "$MACOS/AXE Computer Use"

if [[ -n "${APPLE_SIGNING_IDENTITY:-}" ]]; then
  codesign --force --deep --sign "$APPLE_SIGNING_IDENTITY" "$APP"
else
  codesign --force --deep --sign - "$APP"
fi

echo "$APP"
