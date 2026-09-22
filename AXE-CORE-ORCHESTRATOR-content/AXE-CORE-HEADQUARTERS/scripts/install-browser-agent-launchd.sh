#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LABEL="com.axe.browser-agent"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
PY="$ROOT/backend/axe_api/.venv-local/bin/python"

[[ -x "$PY" ]] || {
  echo "Browser-agent venv missing: $PY" >&2
  echo "Run the canonical updater; it prepares backend/axe_api/.venv-local before installing this agent." >&2
  exit 1
}
[[ -f "$ROOT/backend/axe_api/browser_agent_app.py" ]] || { echo "browser_agent_app.py missing" >&2; exit 1; }

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
    <string>$PY</string>
    <string>-m</string>
    <string>uvicorn</string>
    <string>browser_agent_app:app</string>
    <string>--host</string>
    <string>127.0.0.1</string>
    <string>--port</string>
    <string>8002</string>
    <string>--workers</string>
    <string>1</string>
  </array>
  <key>WorkingDirectory</key>
  <string>$ROOT/backend/axe_api</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>ThrottleInterval</key>
  <integer>5</integer>
  <key>StandardOutPath</key>
  <string>$HOME/Library/Logs/axe-browser-agent.log</string>
  <key>StandardErrorPath</key>
  <string>$HOME/Library/Logs/axe-browser-agent.err.log</string>
</dict>
</plist>
PLIST

plutil -lint "$PLIST" >/dev/null
DOMAIN="gui/$(id -u)"
launchctl bootout "$DOMAIN/$LABEL" >/dev/null 2>&1 || true
launchctl bootstrap "$DOMAIN" "$PLIST"
launchctl enable "$DOMAIN/$LABEL" >/dev/null 2>&1 || true
launchctl kickstart -k "$DOMAIN/$LABEL"

for _ in 1 2 3 4 5; do
  STATE="$(launchctl print "$DOMAIN/$LABEL" 2>/dev/null || true)"
  [[ "$STATE" == *"state = running"* ]] && {
    echo "$LABEL -> $ROOT/backend/axe_api/browser_agent_app.py"
    exit 0
  }
  sleep 1
done

echo "$LABEL failed to reach running state. See ~/Library/Logs/axe-browser-agent.err.log" >&2
exit 1
