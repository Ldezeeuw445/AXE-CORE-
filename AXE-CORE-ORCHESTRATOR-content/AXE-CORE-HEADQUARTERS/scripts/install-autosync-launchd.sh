#!/usr/bin/env bash
# Registreert com.axe.autosync: elke 5 minuten scripts/axe-autosync.sh.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LABEL="com.axe.autosync"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"

cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$ROOT/scripts/axe-autosync.sh</string>
  </array>
  <key>StartInterval</key>
  <integer>300</integer>
  <key>RunAtLoad</key>
  <true/>
  <key>StandardOutPath</key>
  <string>$HOME/Library/Logs/axe-autosync.log</string>
  <key>StandardErrorPath</key>
  <string>$HOME/Library/Logs/axe-autosync.log</string>
</dict>
</plist>
PLIST

plutil -lint "$PLIST" >/dev/null
chmod 644 "$PLIST"
DOMAIN="gui/$(id -u)"
launchctl bootout "$DOMAIN/$LABEL" >/dev/null 2>&1 || true
sleep 1
launchctl bootstrap "$DOMAIN" "$PLIST"
echo "✓ $LABEL actief (elke 5 min) — log: ~/Library/Logs/axe-autosync.log"
