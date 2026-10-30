#!/usr/bin/env bash
# Installeer AXE Overlay naar /Applications en optioneel Login Items.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "FOUT: alleen macOS."
  exit 1
fi

APP_SRC="$(find src-tauri/target/release/bundle/macos -maxdepth 1 -name '*.app' 2>/dev/null | head -1 || true)"
if [[ -z "$APP_SRC" ]]; then
  echo "Geen .app gevonden. Bouw eerst:"
  echo "  npm run build:macos"
  exit 1
fi

DEST="/Applications/$(basename "$APP_SRC")"
echo "==> Kopieer naar $DEST"
rm -rf "$DEST"
cp -R "$APP_SRC" "$DEST"
xattr -cr "$DEST" 2>/dev/null || true

CONFIG_DIR="$HOME/Library/Application Support/nl.axe.overlay"
mkdir -p "$CONFIG_DIR"
if [[ ! -f "$CONFIG_DIR/config.json" ]]; then
  cat > "$CONFIG_DIR/config.json" <<'JSON'
{
  "apiOrigin": "https://api.axecompanion.com",
  "apiKey": ""
}
JSON
  echo "==> Lege config aangemaakt: $CONFIG_DIR/config.json"
  echo "    Vul apiKey in (AXE_CORE_API_KEY) — nooit committen."
else
  echo "==> Config bestaat al: $CONFIG_DIR/config.json"
fi

echo ""
echo "Start: open \"$DEST\""
echo "Of:   open -a \"AXE Overlay\""
echo "Login Items: zet aan in de notch-chat (checkbox) of System Settings → General → Login Items."
