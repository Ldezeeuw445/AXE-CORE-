#!/usr/bin/env bash
# Houdt de omgekeerde SSH-tunnel naar de VPS open, zodat de telefoon NorthSea en de MCP-hub
# van deze Mac kan lezen. Zie backend/axe_api/agent_tunnel.py voor het waarom en voor wat er
# WEL en NIET doorheen gaat.
#
#   scripts/install-agent-tunnel-launchd.sh            installeren / bijwerken
#   scripts/install-agent-tunnel-launchd.sh uninstall  weghalen
#
# Er gaat niets naar binnen op deze Mac: hij belt uit, de VPS luistert alleen op 127.0.0.1.
set -euo pipefail

LABEL="com.axe.agent-tunnel"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
HOST="${AXE_TUNNEL_HOST:-api.axecompanion.com}"
REMOTE_PORT="${AXE_TUNNEL_REMOTE_PORT:-18001}"
LOCAL_PORT="${AXE_TUNNEL_LOCAL_PORT:-8001}"
LOG="$HOME/Library/Logs/axe-agent-tunnel.log"
DOMAIN="gui/$(id -u)"

if [[ "${1:-}" == "uninstall" ]]; then
  launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
  rm -f "$PLIST"
  echo "weggehaald: $LABEL"
  exit 0
fi

mkdir -p "$(dirname "$PLIST")" "$(dirname "$LOG")"
cat > "$PLIST" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array>
    <string>/usr/bin/ssh</string>
    <string>-N</string>
    <string>-o</string><string>BatchMode=yes</string>
    <string>-o</string><string>ExitOnForwardFailure=yes</string>
    <string>-o</string><string>ServerAliveInterval=30</string>
    <string>-o</string><string>ServerAliveCountMax=3</string>
    <string>-R</string><string>127.0.0.1:$REMOTE_PORT:127.0.0.1:$LOCAL_PORT</string>
    <string>$HOST</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>15</integer>
  <key>StandardErrorPath</key><string>$LOG</string>
  <key>StandardOutPath</key><string>$LOG</string>
</dict></plist>
PL

launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
launchctl bootstrap "$DOMAIN" "$PLIST"
echo "actief: $LABEL  (127.0.0.1:$REMOTE_PORT op $HOST -> 127.0.0.1:$LOCAL_PORT hier)"
