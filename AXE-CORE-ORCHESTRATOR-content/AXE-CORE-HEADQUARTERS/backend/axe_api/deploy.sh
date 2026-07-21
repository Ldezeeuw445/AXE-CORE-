#!/bin/bash
# AXE Core API — VPS Deploy Script
# Run on VPS: bash deploy.sh
# Requires: Python 3.10+, nginx, certbot

set -euo pipefail

INSTALL_DIR="/opt/axe-core-api"
REPO="https://github.com/Ldezeeuw445/AXE-CORE-.git"
BRANCH="orchestrator"
SERVICE="axe-core-api"

echo "╔══════════════════════════════════════╗"
echo "║   AXE Core API — Deploy              ║"
echo "╚══════════════════════════════════════╝"

# 1. Create install dir + clone/pull
if [ -d "$INSTALL_DIR/.git" ]; then
  echo "→ Pulling latest code..."
  cd "$INSTALL_DIR"
  git pull origin "$BRANCH"
else
  echo "→ Cloning repo..."
  git clone --branch "$BRANCH" --depth 1 "$REPO" "$INSTALL_DIR"
  cd "$INSTALL_DIR"
fi

# 2. Copy API files
cp -r AXE-CORE-ORCHESTRATOR-content/AXE-CORE-HEADQUARTERS/backend/axe_api/* "$INSTALL_DIR/"
cd "$INSTALL_DIR"

# 3. Python venv + install deps
echo "→ Installing Python dependencies..."
python3 -m venv venv
./venv/bin/pip install --quiet --upgrade pip
./venv/bin/pip install --quiet -r requirements.txt

# 4. .env setup
if [ ! -f .env ]; then
  cp .env.example .env
  echo ""
  echo "⚠️  IMPORTANT: Edit $INSTALL_DIR/.env with your secrets before starting!"
  echo "   nano $INSTALL_DIR/.env"
  echo ""
fi

# Keep the service file path stable even if the working tree moves.
ln -sf "$INSTALL_DIR/.env" "$INSTALL_DIR/AXE-CORE-ORCHESTRATOR-content/AXE-CORE-HEADQUARTERS/backend/axe_api/.env"

# 5. Systemd service
echo "→ Installing systemd service..."
cp axe_api.service /etc/systemd/system/axe-core-api.service
systemctl daemon-reload
systemctl enable "$SERVICE"
systemctl restart "$SERVICE"

# 6. Nginx
echo "→ Setting up nginx..."
cp nginx_api.conf /etc/nginx/sites-available/api.axecompanion.com
ln -sf /etc/nginx/sites-available/api.axecompanion.com /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx

# 7. SSL cert
if [ ! -d /etc/letsencrypt/live/api.axecompanion.com ]; then
  echo "→ Getting SSL certificate..."
  certbot --nginx -d api.axecompanion.com --non-interactive --agree-tos -m admin@axecompanion.com
fi

echo ""
echo "✓ Deploy complete!"
echo "  Service: systemctl status axe-core-api"
echo "  Logs:    journalctl -u axe-core-api -f"
echo "  Health:  curl https://api.axecompanion.com/health"
echo ""
echo "Add to Vercel project settings -> Environment Variables (server-side, NOT VITE_-prefixed —"
echo "a VITE_ var ships to the browser bundle, defeating the point of this proxy):"
echo "  AXE_CORE_API_URL = https://api.axecompanion.com"
echo "  AXE_CORE_API_KEY = <your AXE_API_KEY from .env>"
