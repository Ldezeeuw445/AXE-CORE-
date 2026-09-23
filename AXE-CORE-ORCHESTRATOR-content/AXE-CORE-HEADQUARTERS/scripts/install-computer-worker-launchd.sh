#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LABEL="com.axe.computer-worker"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
NODE_BIN="$(command -v node || true)"

[[ -n "$NODE_BIN" ]] || { echo "node not found" >&2; exit 1; }
[[ -f "$ROOT/infra/computer-worker/worker.mjs" ]] || { echo "worker.mjs missing" >&2; exit 1; }

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
    <string>$NODE_BIN</string>
    <string>$ROOT/infra/computer-worker/worker.mjs</string>
  </array>
  <key>WorkingDirectory</key>
  <string>$ROOT</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>ThrottleInterval</key>
  <integer>5</integer>
  <key>StandardOutPath</key>
  <string>$HOME/Library/Logs/axe-computer-worker.log</string>
  <key>StandardErrorPath</key>
  <string>$HOME/Library/Logs/axe-computer-worker.err.log</string>
</dict>
</plist>
PLIST

plutil -lint "$PLIST" >/dev/null
chmod 644 "$PLIST"
DOMAIN="gui/$(id -u)"

# Remove every stale registration form first. A previous AXE worktree can leave
# the same label cached in launchd even after its plist was replaced, which
# makes a fresh bootstrap fail with macOS' unhelpful "Bootstrap failed: 5".
launchctl bootout "$DOMAIN/$LABEL" >/dev/null 2>&1 || true
launchctl bootout "$DOMAIN" "$PLIST" >/dev/null 2>&1 || true
launchctl remove "$LABEL" >/dev/null 2>&1 || true
launchctl enable "$DOMAIN/$LABEL" >/dev/null 2>&1 || true
sleep 1

BOOTSTRAPPED=0
for poging in 1 2 3; do
  if launchctl bootstrap "$DOMAIN" "$PLIST"; then
    BOOTSTRAPPED=1
    break
  fi
  echo "bootstrap attempt $poging failed for $LABEL; clearing stale launchd state and retrying..." >&2
  launchctl bootout "$DOMAIN/$LABEL" >/dev/null 2>&1 || true
  launchctl bootout "$DOMAIN" "$PLIST" >/dev/null 2>&1 || true
  launchctl remove "$LABEL" >/dev/null 2>&1 || true
  launchctl enable "$DOMAIN/$LABEL" >/dev/null 2>&1 || true
  sleep "$poging"
done

[[ "$BOOTSTRAPPED" == "1" ]] || {
  echo "$LABEL could not be registered after 3 attempts." >&2
  echo "plist: $PLIST" >&2
  plutil -p "$PLIST" >&2 || true
  exit 5
}

launchctl kickstart -k "$DOMAIN/$LABEL"

sleep 1
STATE="$(launchctl print "$DOMAIN/$LABEL" 2>/dev/null || true)"
[[ "$STATE" == *"state = running"* ]] || {
  echo "$LABEL failed to reach running state. See ~/Library/Logs/axe-computer-worker.err.log" >&2
  tail -n 40 "$HOME/Library/Logs/axe-computer-worker.err.log" >&2 2>/dev/null || true
  exit 1
}

echo "$LABEL -> $ROOT/infra/computer-worker/worker.mjs"
