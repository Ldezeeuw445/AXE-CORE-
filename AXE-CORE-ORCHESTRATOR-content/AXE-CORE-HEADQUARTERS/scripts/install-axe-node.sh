#!/usr/bin/env bash
# Zet axe node run --daemon klaar: launchd op macOS, systemd --user op Linux.
# Voert geen jobs uit (fase 2). Vereist: axe op PATH, config + pairing-token.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AXE="$ROOT/cli/axe"
LABEL="com.axe.node"
UNIT="axe-node.service"

[[ -x "$AXE" || -f "$AXE" ]] || { echo "cli/axe ontbreekt in $ROOT" >&2; exit 1; }
chmod +x "$AXE" 2>/dev/null || true

PY="$(command -v python3 || true)"
[[ -n "$PY" ]] || { echo "python3 not found" >&2; exit 1; }

if [[ -z "${AXE_API_KEY:-}" && ! -f "${HOME}/.config/axe/config.json" && ! -f "${HOME}/.axe.json" ]]; then
  echo "AXE_API_KEY ontbreekt en ~/.config/axe/config.json ook. Zie os3/SETUP.md" >&2
  exit 6
fi
if [[ ! -f "${HOME}/.config/axe/node.json" && -z "${AXE_NODE_TOKEN:-}" ]]; then
  echo "geen pairing: eerst 'axe node register --name <machine> --write'" >&2
  exit 6
fi

OS="$(uname -s)"
case "$OS" in
  Darwin)
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
    <string>$PY</string>
    <string>$AXE</string>
    <string>node</string>
    <string>run</string>
    <string>--daemon</string>
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
  <string>$HOME/Library/Logs/axe-node.log</string>
  <key>StandardErrorPath</key>
  <string>$HOME/Library/Logs/axe-node.err.log</string>
</dict>
</plist>
PLIST
    if command -v plutil >/dev/null 2>&1; then
      plutil -lint "$PLIST" >/dev/null
    fi
    chmod 644 "$PLIST"
    if command -v launchctl >/dev/null 2>&1; then
      DOMAIN="gui/$(id -u)"
      launchctl bootout "$DOMAIN/$LABEL" >/dev/null 2>&1 || true
      launchctl bootstrap "$DOMAIN" "$PLIST" || true
      launchctl kickstart -k "$DOMAIN/$LABEL" || true
    fi
    echo "$LABEL -> $AXE node run --daemon"
    ;;
  Linux)
    UNIT_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
    mkdir -p "$UNIT_DIR"
    cat > "$UNIT_DIR/$UNIT" <<UNIT
[Unit]
Description=AXE node agent (outbound heartbeat)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=$ROOT
ExecStart=$PY $AXE node run --daemon
Restart=always
RestartSec=5
Environment=PYTHONUNBUFFERED=1

[Install]
WantedBy=default.target
UNIT
    chmod 644 "$UNIT_DIR/$UNIT"
    if command -v systemctl >/dev/null 2>&1; then
      systemctl --user daemon-reload || true
      systemctl --user enable --now "$UNIT" || true
    fi
    echo "$UNIT -> $AXE node run --daemon"
    ;;
  *)
    echo "onbekend OS: $OS (verwacht Darwin of Linux)" >&2
    exit 1
    ;;
esac
