#!/usr/bin/env bash
# Install and start Camofox browser server on the VPS.
# Usage: bash infra/scripts/install-camofox.sh
set -euo pipefail

echo "==> Installing Camofox browser server globally..."
npm install -g @askjo/camofox-browser

echo "==> Creating systemd unit..."
sudo tee /etc/systemd/system/camofox-browser.service > /dev/null <<'UNIT'
[Unit]
Description=Camofox anti-detection browser server for AXE CORE
After=network.target

[Service]
Type=simple
User=root
Environment=CAMOFOX_PORT=9377
Environment=CAMOFOX_AUTH_MODE=disabled
ExecStart=/usr/bin/npx @askjo/camofox-browser
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT

sudo systemctl daemon-reload
sudo systemctl enable camofox-browser
sudo systemctl restart camofox-browser

echo "==> Camofox health check..."
sleep 3
curl -sf http://127.0.0.1:9377/health && echo " OK" || echo " WARN: health check failed — check journalctl -u camofox-browser"

echo "Done. Set CAMOFOX_SERVER_URL=http://127.0.0.1:9377 in axe-api env."
