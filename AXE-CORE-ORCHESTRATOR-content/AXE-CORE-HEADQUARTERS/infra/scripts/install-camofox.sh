#!/usr/bin/env bash
# Install and start Camofox browser server on the VPS.
# Usage: bash infra/scripts/install-camofox.sh
set -euo pipefail

# CAMOFOX_AUTH_MODE does not exist in @askjo/camofox-browser's own config/auth
# code (lib/config.js, lib/auth.js) -- it was a no-op that silently did
# nothing. The real risk is CAMOFOX_BIND_HOST: server.js does
# `app.listen(PORT, CONFIG.bindHost || undefined, ...)`, and an unset
# bindHost binds every interface -- the public internet. There IS a
# CAMOFOX_ACCESS_KEY bearer-token gate in this version, but camofox_client.py
# (axe-core-api's caller) never sends an Authorization header, so turning
# that on would 401 every real call and break the feature. axe-core-api only
# ever needs this server on localhost (CAMOFOX_SERVER_URL=http://127.0.0.1:9377),
# so it never needs to leave the box at all -- binding to loopback closes the
# actual exposure without touching the client.
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
Environment=CAMOFOX_BIND_HOST=127.0.0.1
ExecStart=/usr/local/bin/npx @askjo/camofox-browser
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
