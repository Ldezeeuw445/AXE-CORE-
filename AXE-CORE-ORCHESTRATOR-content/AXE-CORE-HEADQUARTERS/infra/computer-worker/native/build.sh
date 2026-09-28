#!/usr/bin/env bash
set -euo pipefail
trap 'rc=$?; printf "\n✖ AXE Computer Use helper build stopte bij regel %s: %s (exit %s)\n" "$LINENO" "$BASH_COMMAND" "$rc" >&2' ERR

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP="$HERE/AXE Computer Use.app"
MACOS="$APP/Contents/MacOS"

rm -rf "$APP"
mkdir -p "$MACOS"
cp "$HERE/Info.plist" "$APP/Contents/Info.plist"

# Without an explicit -target, swiftc defaults to whatever macOS version the
# INSTALLED Xcode/Command Line Tools SDK happens to target -- not the actual
# running OS. That silently drifted to macosx28.0 on this machine (Xcode/CLT
# updated ahead of the OS itself), producing a binary the real OS (27.0)
# refused to open at all ("You can't use this version of the app... with
# this version of macOS", with no Gatekeeper dialog to even get past). Pinned
# explicitly so the build target never again floats above whatever OS this
# actually has to run on. 14.0 is comfortably above ScreenCaptureKit's own
# floor (12.3) and below both machines' installed OS.
swiftc "$HERE/main.swift" \
  -parse-as-library \
  -O \
  -target arm64-apple-macosx14.0 \
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
