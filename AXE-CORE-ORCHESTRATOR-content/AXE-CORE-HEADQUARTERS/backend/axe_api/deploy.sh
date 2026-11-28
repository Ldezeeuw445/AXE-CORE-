#!/bin/bash
# AXE Core API — VPS Deploy Script
# Run on VPS: bash deploy.sh
# Requires: Python 3.10+, nginx, certbot

set -euo pipefail

INSTALL_DIR="/opt/axe-core-api"
SERVICE="axe-core-api"

echo "╔══════════════════════════════════════╗"
echo "║   AXE Core API — Deploy              ║"
echo "╚══════════════════════════════════════╝"

# NOTE: this script does NOT clone or git-pull $INSTALL_DIR itself.
# It is meant to be run from inside an already-checked-out, already-current
# copy of the repo at $INSTALL_DIR (vps-bootstrap.sh does that step first).
# A script that git-pulls its own source file mid-execution is unsafe — bash
# doesn't re-read the file from the top after it changes on disk, so a
# self-update here silently ran stale code past that point on every prior
# run. Update by re-running vps-bootstrap.sh, not this file directly against
# a repo copy you haven't already pulled.
cd "$INSTALL_DIR"

# 1. Copy API files (trailing "/." on the source, not "/*", so dotfiles like
# .env.example are included — a bare "*" glob skips leading-dot files).
# A prior run's step below symlinks .../axe_api/.env -> $INSTALL_DIR/.env;
# if that symlink is still there, this cp tries to copy it onto the same
# file it points to and fails ("are the same file"). Drop it first — it's
# recreated at the end of this script either way.
rm -f AXE-CORE-ORCHESTRATOR-content/AXE-CORE-HEADQUARTERS/backend/axe_api/.env
cp -r AXE-CORE-ORCHESTRATOR-content/AXE-CORE-HEADQUARTERS/backend/axe_api/. "$INSTALL_DIR/"
cd "$INSTALL_DIR"

# 2. Python venv + install deps
echo "→ Installing Python dependencies..."
python3 -m venv venv
./venv/bin/pip install --quiet --upgrade pip
./venv/bin/pip install --quiet -r requirements.txt

# 3. .env setup
if [ ! -f .env ]; then
  cp .env.example .env
  echo ""
  echo "⚠️  IMPORTANT: Edit $INSTALL_DIR/.env with your secrets before starting!"
  echo "   nano $INSTALL_DIR/.env"
  echo ""
fi

# Keep the service file path stable even if the working tree moves.
ln -sf "$INSTALL_DIR/.env" "$INSTALL_DIR/AXE-CORE-ORCHESTRATOR-content/AXE-CORE-HEADQUARTERS/backend/axe_api/.env"

# 4. Systemd service
echo "→ Installing systemd service..."
# The unit file in the repo is axe-core-api.service; older trees may still
# ship axe_api.service. Copy whichever is present, fail clearly if neither is.
if [ -f axe-core-api.service ]; then
  UNIT_SRC=axe-core-api.service
elif [ -f axe_api.service ]; then
  UNIT_SRC=axe_api.service
else
  echo "✗ Missing systemd unit file: expected axe-core-api.service (or the older axe_api.service) in $INSTALL_DIR"
  exit 1
fi
cp "$UNIT_SRC" /etc/systemd/system/axe-core-api.service
systemctl daemon-reload
systemctl enable "$SERVICE"
systemctl restart "$SERVICE"

# 5. Nginx + SSL cert
# nginx_api.conf hardcodes ssl_certificate paths under /etc/letsencrypt/live/
# — those don't exist until certbot issues a cert, so loading that conf
# straight up fails nginx's config test before certbot ever gets to run.
# Bootstrap with a plain HTTP-only vhost first (same pattern already used
# for ollama.axecompanion.com below), let certbot obtain the cert, then swap
# in the real conf now that the paths it references actually exist.
echo "→ Setting up nginx (HTTP-only bootstrap vhost)..."
cat > /etc/nginx/sites-available/api.axecompanion.com <<'EOF'
server {
    listen 80;
    server_name api.axecompanion.com;
    location / {
        proxy_pass http://127.0.0.1:8001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
EOF
ln -sf /etc/nginx/sites-available/api.axecompanion.com /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx

if [ ! -d /etc/letsencrypt/live/api.axecompanion.com ]; then
  echo "→ Getting SSL certificate..."
  certbot --nginx -d api.axecompanion.com --non-interactive --agree-tos -m admin@axecompanion.com
fi

echo "→ Installing full nginx config (SSL + /terminal proxy + security headers)..."
cp nginx_api.conf /etc/nginx/sites-available/api.axecompanion.com
nginx -t && systemctl reload nginx

# 6. Terminal server (the in-app xterm shell) — WebSocket on :4022, proxied by
# nginx at /terminal. De unit stond hier, en zette alleen de poort en de
# werkmap: geen EnvironmentFile, terwijl terminal-server.cjs weigert te starten
# zonder SUPABASE_URL en een projectsleutel. Dan stopt het proces met exit 1 en
# herstart systemd hem eindeloos, terwijl dit script "Terminal server: ..." zei
# en verder ging. Nu staat de installatie in één script dat ook de modelbox
# gebruikt (ROL=ollama kreeg er namelijk helemaal geen), mét de omgeving en met
# een controle ná het starten.
TERM_DIR="$INSTALL_DIR/AXE-CORE-ORCHESTRATOR-content/AXE-CORE-HEADQUARTERS"
bash "$TERM_DIR/infra/terminal/install-axe-terminal.sh" \
  "$TERM_DIR" "$INSTALL_DIR/.env" "${WORKSPACE_DIR:-/opt/axe-workspace}"

# 7. Self-hosted scheduler crontab — ping /cron/tick every minute via the
# VPS wrapper so the secret never lands in crontab. This replaces n8n entirely.
# Does not read CRON_SECRET from $INSTALL_DIR/.env and does not create or
# change the wrapper or /etc/axe/cron.env. Idempotent: the helper removes any
# previous /cron/tick curl line or wrapper line, then adds the wrapper line once.
# If the wrapper or /etc/axe/cron.env is missing, it warns and leaves crontab
# unchanged — it never falls back to a plaintext secret.
bash "$INSTALL_DIR/install_cron_wrapper.sh"

echo ""
echo "✓ Deploy complete!"
echo "  Service: systemctl status axe-core-api"
echo "  Logs:    journalctl -u axe-core-api -f"
echo "  Health:  curl https://api.axecompanion.com/health"
echo ""
echo "Set on wherever the frontend actually runs (server-side, NOT VITE_-prefixed —"
echo "a VITE_ var ships to the browser bundle, defeating the point of this proxy). Never Vercel:"
echo "  AXE_CORE_API_URL = https://api.axecompanion.com"
echo "  AXE_CORE_API_KEY = <your AXE_API_KEY from .env>"
